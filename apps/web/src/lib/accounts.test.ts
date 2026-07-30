import { beforeEach, describe, expect, it } from "vitest";
import { listAccounts, removeAccount, upsertAccount } from "./accounts";

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  getItem(key: string) {
    return this.data.has(key) ? this.data.get(key)! : null;
  }
  key(index: number) {
    return [...this.data.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
}

describe("known accounts roster", () => {
  beforeEach(() => {
    // @ts-expect-error test polyfill
    globalThis.localStorage = new MemoryStorage();
  });

  it("upserts multiple users and lists newest first", () => {
    upsertAccount({
      username: "alice",
      baseUrl: "http://127.0.0.1:8443",
      deviceId: "d1",
      token: "t1",
      lastUsedAt: "2026-01-01T00:00:00.000Z",
    });
    upsertAccount({
      username: "bob",
      baseUrl: "http://127.0.0.1:8443/",
      deviceId: "d2",
      token: "t2",
      lastUsedAt: "2026-02-01T00:00:00.000Z",
    });
    upsertAccount({
      username: "carol",
      baseUrl: "http://127.0.0.1:8443",
      deviceId: "d3",
      token: "t3",
      lastUsedAt: "2026-03-01T00:00:00.000Z",
    });
    const list = listAccounts("http://127.0.0.1:8443");
    expect(list.map((a) => a.username)).toEqual(["carol", "bob", "alice"]);
  });

  it("updates token for same user", () => {
    upsertAccount({
      username: "alice",
      baseUrl: "http://h",
      deviceId: "d1",
      token: "old",
      lastUsedAt: "2026-01-01T00:00:00.000Z",
    });
    upsertAccount({
      username: "alice",
      baseUrl: "http://h",
      deviceId: "d1",
      token: "new",
      lastUsedAt: "2026-04-01T00:00:00.000Z",
    });
    const list = listAccounts("http://h");
    expect(list).toHaveLength(1);
    expect(list[0].token).toBe("new");
  });

  it("removes one account", () => {
    upsertAccount({
      username: "alice",
      baseUrl: "http://h",
      deviceId: "d1",
      token: "t",
      lastUsedAt: "2026-01-01T00:00:00.000Z",
    });
    removeAccount("alice", "http://h");
    expect(listAccounts("http://h")).toHaveLength(0);
  });
});
