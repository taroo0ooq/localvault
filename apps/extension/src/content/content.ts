/**
 * Content script: autofill, autosave observers, generate-fill (S5).
 */
import {
  collectSaveCandidate,
  detectLoginFields,
  fillField,
} from "../lib/forms";
import type { VaultItemPlain } from "@localvault/crypto";

const MARK = "data-lv-bound";

function bindPage() {
  if (document.documentElement.getAttribute(MARK)) return;
  document.documentElement.setAttribute(MARK, "1");

  // Autosave: listen submit + password blur
  document.addEventListener(
    "submit",
    () => {
      const fields = detectLoginFields(document);
      const cand = collectSaveCandidate(fields, location.href, document.title);
      if (cand?.password) {
        chrome.runtime.sendMessage({ type: "CONTENT_AUTOSAVE_OFFER", candidate: cand });
      }
    },
    true,
  );

  document.addEventListener(
    "change",
    (ev) => {
      const t = ev.target;
      if (!(t instanceof HTMLInputElement) || t.type !== "password") return;
      if (t.value.length < 8) return;
      const fields = detectLoginFields(document);
      const cand = collectSaveCandidate(fields, location.href, document.title);
      if (cand?.password) {
        chrome.runtime.sendMessage({ type: "CONTENT_AUTOSAVE_OFFER", candidate: cand });
      }
    },
    true,
  );

  // Inline autofill chip when focus username/password
  document.addEventListener(
    "focusin",
    async (ev) => {
      const t = ev.target;
      if (!(t instanceof HTMLInputElement)) return;
      if (t.type !== "password" && t.type !== "email" && t.type !== "text") return;
      const res = await chrome.runtime.sendMessage({
        type: "MATCH_ITEMS",
        origin: location.origin,
      });
      if (!res?.ok || !Array.isArray(res.data) || res.data.length === 0) return;
      showChip(t, res.data as VaultItemPlain[]);
    },
    true,
  );
}

function showChip(anchor: HTMLInputElement, items: VaultItemPlain[]) {
  const id = "lv-autofill-chip";
  document.getElementById(id)?.remove();
  const chip = document.createElement("div");
  chip.id = id;
  chip.setAttribute("role", "listbox");
  Object.assign(chip.style, {
    position: "absolute",
    zIndex: "2147483646",
    background: "#141a1f",
    color: "#e8eef2",
    border: "1px solid #2a3440",
    borderRadius: "10px",
    padding: "6px",
    fontFamily: "system-ui,sans-serif",
    fontSize: "12px",
    boxShadow: "0 8px 24px rgba(0,0,0,.35)",
    maxWidth: "280px",
  } as CSSStyleDeclaration);
  const rect = anchor.getBoundingClientRect();
  chip.style.left = `${rect.left + window.scrollX}px`;
  chip.style.top = `${rect.bottom + window.scrollY + 4}px`;
  for (const it of items.slice(0, 5)) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = `${it.username || it.title || "item"} · ${it.title || ""}`.trim();
    Object.assign(btn.style, {
      display: "block",
      width: "100%",
      textAlign: "left",
      background: "transparent",
      border: "0",
      color: "inherit",
      padding: "8px 10px",
      borderRadius: "8px",
      cursor: "pointer",
    } as CSSStyleDeclaration);
    btn.onmouseenter = () => {
      btn.style.background = "#1c242c";
    };
    btn.onmouseleave = () => {
      btn.style.background = "transparent";
    };
    btn.onclick = () => {
      applyFill(it);
      chip.remove();
    };
    chip.appendChild(btn);
  }
  document.body.appendChild(chip);
  setTimeout(() => {
    const close = (e: MouseEvent) => {
      if (!chip.contains(e.target as Node)) {
        chip.remove();
        document.removeEventListener("mousedown", close, true);
      }
    };
    document.addEventListener("mousedown", close, true);
  }, 0);
}

function applyFill(item: VaultItemPlain) {
  const fields = detectLoginFields(document);
  if (fields.username && item.username) fillField(fields.username, item.username);
  if (fields.password && item.password) fillField(fields.password, item.password);
}

chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
  if (msg?.type === "DO_AUTOFILL") {
    const items = (msg.items || []) as VaultItemPlain[];
    if (items[0]) applyFill(items[0]);
    sendResponse({ ok: true });
  }
  if (msg?.type === "DO_GENERATE_FILL") {
    const fields = detectLoginFields(document);
    const target = fields.newPassword || fields.password;
    if (target && msg.password) fillField(target, msg.password);
    sendResponse({ ok: true });
  }
  if (msg?.type === "DETECT_FIELDS") {
    const f = detectLoginFields(document);
    sendResponse({
      ok: true,
      data: {
        hasUsername: Boolean(f.username),
        hasPassword: Boolean(f.password),
        hasNewPassword: Boolean(f.newPassword),
      },
    });
  }
  return false;
});

bindPage();
