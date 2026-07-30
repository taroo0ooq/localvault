import type { VaultItemPlain } from "@localvault/crypto";

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
}

export function clearSession() {
  sessionStorage.removeItem(KEY);
}

export type Screen =
  | "connect"
  | "welcome"
  | "enroll"
  | "unlock"
  | "vault"
  | "generator"
  | "import";

export interface DecryptedItem extends VaultItemPlain {
  id: string;
}
