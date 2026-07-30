/** Typed LocalVault API client (S2 surface). */

export interface ServerInfo {
  name: string;
  version: string;
  stage: string;
  features?: Record<string, boolean>;
}

export interface RegisterResult {
  user_id: string;
  username: string;
  device_id: string;
  session_token: string;
}

export interface VaultMeta {
  kdf_params_json: string;
  wrapped_dek_pin: string;
  wrapped_dek_recovery: string;
  version: number;
  updated_at: string;
}

export interface CipherItem {
  id: string;
  ciphertext: string;
  nonce: string;
  aad: string;
  updated_at: string;
}

export class VaultClient {
  constructor(
    public baseUrl: string,
    public token?: string,
  ) {}

  private url(path: string) {
    return `${this.baseUrl.replace(/\/$/, "")}${path}`;
  }

  private headers(json = true): HeadersInit {
    const h: Record<string, string> = {};
    if (json) h["Content-Type"] = "application/json";
    if (this.token) h.Authorization = `Bearer ${this.token}`;
    return h;
  }

  async health(): Promise<{ status: string; stage: string }> {
    const res = await fetch(this.url("/healthz"));
    if (!res.ok) throw new Error(`healthz ${res.status}`);
    return res.json();
  }

  async serverInfo(): Promise<ServerInfo> {
    const res = await fetch(this.url("/v1/server-info"));
    if (!res.ok) throw new Error(`server-info ${res.status}`);
    return res.json();
  }

  async checkUsername(username: string): Promise<{ available: boolean }> {
    const res = await fetch(
      this.url(`/v1/users/check?username=${encodeURIComponent(username)}`),
    );
    if (!res.ok) throw new Error(`check ${res.status}`);
    return res.json();
  }

  async register(body: {
    username: string;
    display_name?: string;
    device_name: string;
    device_public_key: string;
    kdf_params_json: string;
    wrapped_dek_pin: string;
    wrapped_dek_recovery: string;
  }): Promise<RegisterResult> {
    const res = await fetch(this.url("/v1/users/register"), {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `register ${res.status}`);
    }
    return res.json();
  }

  async getVaultMeta(): Promise<VaultMeta> {
    const res = await fetch(this.url("/v1/vault/meta"), { headers: this.headers(false) });
    if (!res.ok) throw new Error(`vault meta ${res.status}`);
    return res.json();
  }

  async listItems(): Promise<CipherItem[]> {
    const res = await fetch(this.url("/v1/items"), { headers: this.headers(false) });
    if (!res.ok) throw new Error(`items ${res.status}`);
    const data = await res.json();
    return data.items || [];
  }

  async createItem(ciphertext: string, nonce: string, aad: string): Promise<{ id: string }> {
    const res = await fetch(this.url("/v1/items"), {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ ciphertext, nonce, aad }),
    });
    if (!res.ok) throw new Error(`create item ${res.status}`);
    return res.json();
  }

  async deleteItem(id: string): Promise<void> {
    const res = await fetch(this.url(`/v1/items/${id}`), {
      method: "DELETE",
      headers: this.headers(false),
    });
    if (!res.ok) throw new Error(`delete ${res.status}`);
  }
}

export async function fetchServerInfo(baseUrl: string): Promise<ServerInfo> {
  return new VaultClient(baseUrl).serverInfo();
}

export async function fetchHealth(baseUrl: string): Promise<{ status: string }> {
  return new VaultClient(baseUrl).health();
}

/** Generate ed25519 keypair for device registration (Web Crypto). */
export async function generateDeviceKeyPair(): Promise<{
  publicKeyB64: string;
  privateKey: CryptoKey;
}> {
  const kp = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
  let s = "";
  for (const x of raw) s += String.fromCharCode(x);
  return { publicKeyB64: btoa(s), privateKey: kp.privateKey };
}
