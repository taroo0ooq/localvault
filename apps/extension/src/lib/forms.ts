/**
 * Login form heuristics for autofill / autosave / generate-fill (S5).
 * Pure DOM helpers — no chrome.* APIs (unit-testable).
 */

export interface FieldMap {
  username: HTMLInputElement | null;
  password: HTMLInputElement | null;
  newPassword: HTMLInputElement | null;
  form: HTMLFormElement | null;
}

const USER_RE =
  /user|login|email|e-mail|account|identifier|phone|id$/i;
const PASS_RE = /pass|pwd|secret/i;
const NEW_PASS_RE = /new.?pass|confirm|register|signup|create.?pass/i;

export function isVisible(el: Element): boolean {
  const h = el as HTMLElement;
  if (h.hidden) return false;
  if (h.getAttribute("aria-hidden") === "true") return false;
  // jsdom often has offsetParent === null; treat connected elements as visible
  // unless explicitly display/visibility hidden.
  let style: CSSStyleDeclaration | null = null;
  try {
    style = typeof getComputedStyle === "function" ? getComputedStyle(h) : null;
  } catch {
    style = null;
  }
  if (style && (style.display === "none" || style.visibility === "hidden" || style.opacity === "0")) {
    return false;
  }
  return true;
}

export function scoreUsernameInput(input: HTMLInputElement): number {
  let s = 0;
  const t = (input.type || "text").toLowerCase();
  if (t === "password") return -100;
  if (t === "email") s += 40;
  if (t === "text" || t === "tel" || t === "username") s += 20;
  const blob = `${input.name} ${input.id} ${input.autocomplete} ${input.placeholder} ${input.getAttribute("aria-label") || ""}`;
  if (USER_RE.test(blob)) s += 50;
  if (/username|email/.test(input.autocomplete || "")) s += 40;
  if (!isVisible(input)) s -= 80;
  return s;
}

export function scorePasswordInput(input: HTMLInputElement, forNew = false): number {
  let s = 0;
  if ((input.type || "").toLowerCase() !== "password") return -100;
  const blob = `${input.name} ${input.id} ${input.autocomplete} ${input.placeholder} ${input.getAttribute("aria-label") || ""}`;
  if (forNew) {
    if (NEW_PASS_RE.test(blob) || /new-password/.test(input.autocomplete || "")) s += 60;
    else s += 10;
  } else {
    if (/current-password|password/.test(input.autocomplete || "")) s += 40;
    if (PASS_RE.test(blob) && !NEW_PASS_RE.test(blob)) s += 40;
  }
  if (!isVisible(input)) s -= 80;
  return s;
}

export function detectLoginFields(root: ParentNode = document): FieldMap {
  const inputs = Array.from(root.querySelectorAll("input")).filter(
    (el): el is HTMLInputElement => el instanceof HTMLInputElement,
  );
  let username: HTMLInputElement | null = null;
  let password: HTMLInputElement | null = null;
  let newPassword: HTMLInputElement | null = null;
  let bestU = 0;
  let bestP = 0;
  let bestN = 0;
  for (const input of inputs) {
    const u = scoreUsernameInput(input);
    if (u > bestU) {
      bestU = u;
      username = input;
    }
    const p = scorePasswordInput(input, false);
    if (p > bestP) {
      bestP = p;
      password = input;
    }
    const n = scorePasswordInput(input, true);
    if (n > bestN) {
      bestN = n;
      newPassword = input;
    }
  }
  // Prefer password field's form for association
  const form =
    password?.form ||
    newPassword?.form ||
    username?.form ||
    root.querySelector("form");
  if (bestU < 15) username = null;
  if (bestP < 15) password = null;
  if (bestN < 40) newPassword = null;
  return { username, password, newPassword, form: form instanceof HTMLFormElement ? form : null };
}

export function fillField(el: HTMLInputElement, value: string): void {
  el.focus();
  const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  proto?.set?.call(el, value);
  el.value = value;
  const view = el.ownerDocument.defaultView;
  const Ev = view?.Event || Event;
  el.dispatchEvent(new Ev("input", { bubbles: true }));
  el.dispatchEvent(new Ev("change", { bubbles: true }));
}

export function originFromUrl(href: string): string {
  try {
    return new URL(href).origin;
  } catch {
    return href;
  }
}

export interface SaveCandidate {
  origin: string;
  title: string;
  username: string;
  password: string;
  url: string;
}

export function collectSaveCandidate(
  fields: FieldMap,
  pageUrl: string,
  pageTitle: string,
): SaveCandidate | null {
  const password = fields.newPassword?.value || fields.password?.value || "";
  if (!password || password.length < 1) return null;
  const username = fields.username?.value || "";
  return {
    origin: originFromUrl(pageUrl),
    title: pageTitle || originFromUrl(pageUrl),
    username,
    password,
    url: pageUrl,
  };
}
