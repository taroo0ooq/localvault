import type { VaultItemPlain } from "@localvault/crypto";
import { upsertAccount } from "./accounts";

const KEY = "localvault.web.session.v1";

export interface StoredSession {
  baseUrl: string;
  username: string;
  deviceId: string;
  token: string;
  /** Only kept while tab unlocked — never PIN/recovery. */
}

export function loadSession(): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

export function saveSession(s: StoredSession) {
  sessionStorage.setItem(KEY, JSON.stringify(s));
  // Persist on this device so multiuser can re-select after sign-out (#23)
  upsertAccount({
    username: s.username,
    baseUrl: s.baseUrl,
    deviceId: s.deviceId,
    token: s.token,
    lastUsedAt: new Date().toISOString(),
  });
}

/** Clear active tab session only — known accounts remain for re-login. */
export function clearSession() {
  sessionStorage.removeItem(KEY);
}

export type Screen =
  | "connect"
  | "welcome"
  | "accounts"
  | "enroll"
  | "unlock"
  | "vault"
  | "generator"
  | "import";

export interface DecryptedItem extends VaultItemPlain {
  id: string;
}
