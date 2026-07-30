/**
 * LocalVault MV3 service worker — session + vault API bridge (S5).
 * DEK stays in memory only while unlocked (never chrome.storage).
 */
import { VaultClient } from "@localvault/api-client";
import {
  decryptItem,
  encryptItem,
  generatePassword,
  unlockWithPin,
  type VaultItemPlain,
  DEFAULT_POLICY,
} from "@localvault/crypto";
import type { ExtMessage, ExtResponse, SessionStatus } from "../shared/messages";

interface StoredConfig {
  baseUrl: string;
  username: string;
  token: string;
  deviceId: string;
}

let config: StoredConfig | null = null;
let dek: Uint8Array | null = null;
let cache: { id: string; item: VaultItemPlain }[] = [];

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "lv-generate-fill",
    title: "LocalVault: Generate password & fill",
    contexts: ["editable"],
  });
  chrome.contextMenus.create({
    id: "lv-autofill",
    title: "LocalVault: Autofill login",
    contexts: ["page", "editable", "frame"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;
  if (info.menuItemId === "lv-generate-fill") {
    const pw = generatePassword({ ...DEFAULT_POLICY, length: 20 });
    await chrome.tabs.sendMessage(tab.id, { type: "DO_GENERATE_FILL", password: pw });
  }
  if (info.menuItemId === "lv-autofill") {
    const origin = tab.url ? new URL(tab.url).origin : "";
    const matches = await matchItems(origin);
    await chrome.tabs.sendMessage(tab.id, {
      type: "DO_AUTOFILL",
      items: matches.map((m) => m.item),
    });
  }
});

chrome.runtime.onMessage.addListener((msg: ExtMessage, _sender, sendResponse) => {
  handle(msg)
    .then((r) => sendResponse(r))
    .catch((e: Error) => sendResponse({ ok: false, error: e.message || "error" }));
  return true; // async
});

async function handle(msg: ExtMessage): Promise<ExtResponse> {
  switch (msg.type) {
    case "PING":
      return { ok: true, data: { stage: "S5" } };
    case "GET_STATUS":
    case "GET_SESSION":
      return { ok: true, data: await status() };
    case "CONNECT": {
      const client = new VaultClient(msg.baseUrl);
      const info = await client.serverInfo();
      await chrome.storage.local.set({ baseUrl: msg.baseUrl });
      return { ok: true, data: info };
    }
    case "UNLOCK":
      return unlock(msg.username, msg.pin);
    case "LOCK":
      dek = null;
      cache = [];
      return { ok: true };
    case "LIST_ITEMS":
      if (!dek) return { ok: false, error: "locked" };
      return { ok: true, data: cache.map((c) => ({ id: c.id, ...c.item })) };
    case "MATCH_ITEMS": {
      if (!dek) return { ok: false, error: "locked" };
      const matches = await matchItems(msg.origin);
      return { ok: true, data: matches.map((m) => ({ id: m.id, ...m.item })) };
    }
    case "SAVE_ITEM":
      return saveItem(msg.item);
    case "GENERATE_PASSWORD": {
      const length = msg.length ?? 20;
      return { ok: true, data: { password: generatePassword({ ...DEFAULT_POLICY, length }) } };
    }
    case "CONTENT_AUTOSAVE_OFFER":
      // Surface badge; popup can confirm save
      await chrome.storage.session.set({ pendingSave: msg.candidate });
      await chrome.action.setBadgeText({ text: "1" });
      await chrome.action.setBadgeBackgroundColor({ color: "#2dd4bf" });
      return { ok: true };
    default:
      return { ok: false, error: "unknown_message" };
  }
}

async function status(): Promise<SessionStatus> {
  const stored = await chrome.storage.local.get(["baseUrl", "username", "token", "deviceId"]);
  if (stored.baseUrl && stored.token && stored.username) {
    config = {
      baseUrl: stored.baseUrl as string,
      username: stored.username as string,
      token: stored.token as string,
      deviceId: (stored.deviceId as string) || "",
    };
  }
  return {
    connected: Boolean(stored.baseUrl),
    baseUrl: (stored.baseUrl as string) || "",
    username: (stored.username as string) || null,
    unlocked: Boolean(dek),
    itemCount: cache.length,
  };
}

async function unlock(username: string, pin: string): Promise<ExtResponse> {
  const { baseUrl } = await chrome.storage.local.get("baseUrl");
  if (!baseUrl) return { ok: false, error: "not_connected" };

  // Reuse token if same user; else register is web-only — extension unlock expects prior web register + token in storage
  let token = (await chrome.storage.local.get("token")).token as string | undefined;
  let deviceId = (await chrome.storage.local.get("deviceId")).deviceId as string | undefined;

  // If no token, try session from storage set by popup after register/login flow
  if (!token) {
    return {
      ok: false,
      error: "no_session",
    };
  }

  const client = new VaultClient(baseUrl as string, token);
  const meta = await client.getVaultMeta();
  const key = await unlockWithPin(pin, meta.kdf_params_json, meta.wrapped_dek_pin);
  dek = key;
  config = {
    baseUrl: baseUrl as string,
    username,
    token,
    deviceId: deviceId || "",
  };
  await chrome.storage.local.set({ username });
  await refreshCache(client, key);
  await chrome.action.setBadgeText({ text: "" });
  return { ok: true, data: await status() };
}

async function refreshCache(client: VaultClient, key: Uint8Array) {
  const raw = await client.listItems();
  const out: { id: string; item: VaultItemPlain }[] = [];
  for (const it of raw) {
    try {
      const plain = await decryptItem(key, it.ciphertext, it.nonce, it.aad || "item");
      out.push({ id: it.id, item: JSON.parse(plain) as VaultItemPlain });
    } catch {
      /* skip */
    }
  }
  cache = out;
}

async function matchItems(origin: string) {
  if (!dek) return [];
  return cache.filter((c) => {
    if (!c.item.url) return false;
    try {
      return new URL(c.item.url).origin === origin || c.item.url.includes(origin.replace(/^https?:\/\//, ""));
    } catch {
      return c.item.url.includes(origin);
    }
  });
}

async function saveItem(item: VaultItemPlain): Promise<ExtResponse> {
  if (!dek || !config) return { ok: false, error: "locked" };
  const client = new VaultClient(config.baseUrl, config.token);
  const enc = await encryptItem(dek, JSON.stringify(item), "item");
  const { id } = await client.createItem(enc.ciphertext, enc.nonce, enc.aad);
  cache.push({ id, item });
  await chrome.storage.session.remove("pendingSave");
  await chrome.action.setBadgeText({ text: "" });
  return { ok: true, data: { id } };
}

// Allow popup to seed session after enrollment on web
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.token) {
    // session token updated — force re-unlock
    dek = null;
    cache = [];
  }
});
