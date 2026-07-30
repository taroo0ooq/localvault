const PK = "localvault.device.keypair.jwk";

export async function getOrCreateDeviceKey(): Promise<{
  publicKeyB64: string;
  privateKey: CryptoKey;
}> {
  const existing = localStorage.getItem(PK);
  if (existing) {
    try {
      const { privateJwk, publicB64 } = JSON.parse(existing) as {
        privateJwk: JsonWebKey;
        publicB64: string;
      };
      const privateKey = await crypto.subtle.importKey(
        "jwk",
        privateJwk,
        "Ed25519",
        false,
        ["sign"],
      );
      return { publicKeyB64: publicB64, privateKey };
    } catch {
      localStorage.removeItem(PK);
    }
  }
  const kp = (await crypto.subtle.generateKey("Ed25519", true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const privateJwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
  const publicB64 = bytesToB64(raw);
  localStorage.setItem(PK, JSON.stringify({ privateJwk, publicB64 }));
  return { publicKeyB64: publicB64, privateKey: kp.privateKey };
}

function bytesToB64(u8: Uint8Array): string {
  let s = "";
  for (const x of u8) s += String.fromCharCode(x);
  return btoa(s);
}
