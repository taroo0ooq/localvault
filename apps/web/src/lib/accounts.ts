/**
 * Device-local account roster for multiuser re-login (REQ-020).
 * Stores session tokens per username@host so sign-out does not lose the
 * ability to pick a user and unlock again.
 * Never stores PIN, recovery, or DEK.
 */

export interface KnownAccount {
  username: string;
  baseUrl: string;
  deviceId: string;
  token: string;
  lastUsedAt: string;
}

const KEY = "localvault.web.accounts.v1";

function normalizeBase(url: string): string {
  return url.replace(/\/+$/, "");
}

function readAll(): KnownAccount[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const all = JSON.parse(raw) as KnownAccount[];
    return Array.isArray(all) ? all : [];
  } catch {
    return [];
  }
}

export function listAccounts(baseUrl?: string): KnownAccount[] {
  const all = readAll();
  const filtered = baseUrl
    ? all.filter((a) => normalizeBase(a.baseUrl) === normalizeBase(baseUrl))
    : all;
  return filtered.sort((a, b) => (a.lastUsedAt < b.lastUsedAt ? 1 : -1));
}

export function upsertAccount(account: KnownAccount): void {
  const base = normalizeBase(account.baseUrl);
  const next: KnownAccount = {
    ...account,
    baseUrl: base,
    username: account.username.toLowerCase(),
    lastUsedAt: account.lastUsedAt || new Date().toISOString(),
  };
  const all = readAll();
  const merged = [
    next,
    ...all.filter(
      (a) => !(a.username === next.username && normalizeBase(a.baseUrl) === base),
    ),
  ];
  localStorage.setItem(KEY, JSON.stringify(merged));
}

export function removeAccount(username: string, baseUrl: string): void {
  const u = username.toLowerCase();
  const base = normalizeBase(baseUrl);
  const next = readAll().filter(
    (a) => !(a.username === u && normalizeBase(a.baseUrl) === base),
  );
  localStorage.setItem(KEY, JSON.stringify(next));
}

export function accountKey(a: Pick<KnownAccount, "username" | "baseUrl">): string {
  return `${normalizeBase(a.baseUrl)}::${a.username.toLowerCase()}`;
}
