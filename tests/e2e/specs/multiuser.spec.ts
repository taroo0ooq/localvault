import { test, expect } from "@playwright/test";
import { generateKeyPairSync, sign } from "node:crypto";

function ed25519PublicKeyB64() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pubDer = publicKey.export({ type: "spki", format: "der" }) as Buffer;
  // SPKI for ed25519: last 32 bytes are raw public key
  const raw = pubDer.subarray(pubDer.length - 32);
  return {
    pubB64: raw.toString("base64"),
    privateKey,
  };
}

async function register(request: any, username: string, pubB64: string) {
  const res = await request.post("/v1/users/register", {
    data: {
      username,
      device_name: "e2e",
      device_public_key: pubB64,
      kdf_params_json: JSON.stringify({ m: 65536, t: 3, p: 1 }),
      wrapped_dek_pin: "wrapped-pin-ciphertext-blob-e2e-aaaa",
      wrapped_dek_recovery: "wrapped-recovery-ciphertext-e2e-bbbb",
    },
  });
  expect(res.status()).toBe(201);
  return res.json();
}

test.describe("multiuser isolation (REQ-020)", () => {
  test("two users cannot see each other items", async ({ request }) => {
    const a = ed25519PublicKeyB64();
    const b = ed25519PublicKeyB64();
    const userA = `alice_${Date.now().toString(36)}`;
    const userB = `bob_${Date.now().toString(36)}`;

    const regA = await register(request, userA, a.pubB64);
    const regB = await register(request, userB, b.pubB64);

    const create = await request.post("/v1/items", {
      headers: { Authorization: `Bearer ${regA.session_token}` },
      data: {
        ciphertext: "ct-alice-only",
        nonce: "n-alice",
        aad: "aad",
      },
    });
    expect(create.status()).toBe(201);
    const { id } = await create.json();

    const listB = await request.get("/v1/items", {
      headers: { Authorization: `Bearer ${regB.session_token}` },
    });
    expect(listB.ok()).toBeTruthy();
    const bodyB = await listB.json();
    expect(bodyB.items).toHaveLength(0);

    const getB = await request.get(`/v1/items/${id}`, {
      headers: { Authorization: `Bearer ${regB.session_token}` },
    });
    expect(getB.status()).toBe(404);

    const listA = await request.get("/v1/items", {
      headers: { Authorization: `Bearer ${regA.session_token}` },
    });
    const bodyA = await listA.json();
    expect(bodyA.items).toHaveLength(1);
  });

  test("username availability check", async ({ request }) => {
    const res = await request.get("/v1/users/check?username=available_user_xyz");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.available).toBe(true);
  });
});
