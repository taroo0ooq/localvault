async function send(msg: unknown) {
  return chrome.runtime.sendMessage(msg);
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

async function refresh() {
  const res = await send({ type: "GET_STATUS" });
  if (!res?.ok) return;
  const s = res.data as {
    connected: boolean;
    baseUrl: string;
    username: string | null;
    unlocked: boolean;
    itemCount: number;
  };
  $("status").textContent = s.unlocked
    ? `Unlocked · ${s.itemCount} items · ${s.username || ""}`
    : s.connected
      ? `Connected · locked · ${s.baseUrl}`
      : "Not connected";

  $("view-connect").classList.toggle("hidden", s.connected && Boolean(s.baseUrl));
  $("view-session").classList.toggle("hidden", !s.connected || s.unlocked);
  $("view-vault").classList.toggle("hidden", !s.unlocked);

  if (s.baseUrl) ($("baseUrl") as HTMLInputElement).value = s.baseUrl;
  if (s.username) ($("username") as HTMLInputElement).value = s.username;

  const pending = await chrome.storage.session.get("pendingSave");
  if (pending.pendingSave && s.unlocked) {
    $("pending").classList.remove("hidden");
    $("pendingMeta").textContent = JSON.stringify(pending.pendingSave, null, 2);
  } else {
    $("pending").classList.add("hidden");
  }

  if (s.unlocked) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url) {
      const origin = new URL(tab.url).origin;
      const m = await send({ type: "MATCH_ITEMS", origin });
      const ul = $("matches");
      ul.innerHTML = "";
      if (m?.ok && Array.isArray(m.data)) {
        for (const it of m.data as { title?: string; username?: string; url?: string }[]) {
          const li = document.createElement("li");
          li.textContent = `${it.title || it.url || "item"} — ${it.username || ""}`;
          ul.appendChild(li);
        }
      }
    }
  }
}

$("btnConnect").onclick = async () => {
  const baseUrl = ($("baseUrl") as HTMLInputElement).value.trim();
  const res = await send({ type: "CONNECT", baseUrl });
  if (!res?.ok) alert(res?.error || "connect failed");
  await refresh();
};

$("btnUnlock").onclick = async () => {
  const username = ($("username") as HTMLInputElement).value.trim();
  const token = ($("token") as HTMLInputElement).value.trim();
  const pin = ($("pin") as HTMLInputElement).value;
  if (token) await chrome.storage.local.set({ token, username });
  const res = await send({ type: "UNLOCK", username, pin });
  if (!res?.ok) alert(res?.error || "unlock failed");
  await refresh();
};

$("btnLock").onclick = async () => {
  await send({ type: "LOCK" });
  await refresh();
};

$("btnAutofill").onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) return;
  const origin = new URL(tab.url).origin;
  const m = await send({ type: "MATCH_ITEMS", origin });
  if (!m?.ok) return alert(m?.error || "no matches");
  await chrome.tabs.sendMessage(tab.id, { type: "DO_AUTOFILL", items: m.data });
};

$("btnGenerate").onclick = async () => {
  const gen = await send({ type: "GENERATE_PASSWORD", length: 20 });
  if (!gen?.ok) return;
  const password = (gen.data as { password: string }).password;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  await chrome.tabs.sendMessage(tab.id, { type: "DO_GENERATE_FILL", password });
};

$("btnSave").onclick = async () => {
  const pending = await chrome.storage.session.get("pendingSave");
  const c = pending.pendingSave as {
    title: string;
    url: string;
    username: string;
    password: string;
  };
  if (!c) return;
  const res = await send({
    type: "SAVE_ITEM",
    item: {
      title: c.title,
      url: c.url,
      username: c.username,
      password: c.password,
    },
  });
  if (!res?.ok) alert(res?.error || "save failed");
  await refresh();
};

$("btnDismiss").onclick = async () => {
  await chrome.storage.session.remove("pendingSave");
  await chrome.action.setBadgeText({ text: "" });
  await refresh();
};

void refresh();
