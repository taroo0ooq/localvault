import { test, expect } from "@playwright/test";
import { generateKeyPairSync } from "node:crypto";

const EDGE = process.env.EDGE_BASE_URL || "http://127.0.0.1:9443";
const API = process.env.VAULT_BASE_URL || "http://127.0.0.1:8443";

function ed25519PublicKeyB64() {
  const { publicKey } = generateKeyPairSync("ed25519");
  const pubDer = publicKey.export({ type: "spki", format: "der" }) as Buffer;
  const raw = pubDer.subarray(pubDer.length - 32);
  return raw.toString("base64");
}

/**
 * S4 remote_pair_test: full register + item CRUD via reverse-proxy edge
 * (simulates Cloudflare/ngrok hop). Proves clients can pair over tunnel path.
 */
test.describe("remote pair over tunnel edge (S4 path, stage S8)", () => {
  test("register and list items via edge URL", async ({ request }) => {
    // Edge health should proxy vault
    const health = await request.get(`${EDGE}/healthz`);
    expect(health.ok()).toBeTruthy();
    const h = await health.json();
    expect(h.status).toBe("ok");

    const info = await request.get(`${EDGE}/v1/server-info`);
    expect(info.ok()).toBeTruthy();
    const body = await info.json();
    expect(body.features.tunnel_access).toBe(true);
    expect(body.stage).toBe("S8");

    const user = `tunnel_${Date.now().toString(36)}`;
    const reg = await request.post(`${EDGE}/v1/users/register`, {
      data: {
        username: user,
        device_name: "remote-device",
        device_public_key: ed25519PublicKeyB64(),
        kdf_params_json: JSON.stringify({ m: 65536, t: 3, p: 1 }),
        wrapped_dek_pin: "wrapped-pin-ciphertext-blob-edge-aaaa",
        wrapped_dek_recovery: "wrapped-recovery-ciphertext-edge-bbbb",
      },
    });
    expect(reg.status()).toBe(201);
    const { session_token } = await reg.json();

    const create = await request.post(`${EDGE}/v1/items`, {
      headers: { Authorization: `Bearer ${session_token}` },
      data: { ciphertext: "ct-edge", nonce: "n-edge", aad: "aad" },
    });
    expect(create.status()).toBe(201);

    const list = await request.get(`${EDGE}/v1/items`, {
      headers: { Authorization: `Bearer ${session_token}` },
    });
    expect(list.ok()).toBeTruthy();
    const items = (await list.json()).items;
    expect(items).toHaveLength(1);

    // Direct API still works (LAN path)
    const direct = await request.get(`${API}/healthz`);
    expect(direct.ok()).toBeTruthy();
  });
});
