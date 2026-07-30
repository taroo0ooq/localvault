import { describe, expect, it } from "vitest";
import {
  ARGON2_PROFILES,
  CRYPTO_STAGE,
  assertPasswordPolicy,
  decryptItem,
  encryptItem,
  enrollVaultCrypto,
  generatePassword,
  generateRecoveryPassphrase,
  unlockWithPin,
  unlockWithRecovery,
  DEFAULT_POLICY,
} from "./index";

describe("@localvault/crypto S3", () => {
  it("stage marker", () => {
    expect(CRYPTO_STAGE).toBe("S3");
  });

  it("generates passwords", () => {
    const p = generatePassword(DEFAULT_POLICY);
    expect(p.length).toBe(20);
  });

  it("recovery passphrase word count", () => {
    const r = generateRecoveryPassphrase(8);
    expect(r.split(" ")).toHaveLength(8);
  });

  it("rejects empty policy", () => {
    expect(() =>
      assertPasswordPolicy({
        length: 20,
        uppercase: false,
        lowercase: false,
        digits: false,
        symbols: false,
      }),
    ).toThrow();
  });

  it("enroll → unlock with PIN (KAT)", async () => {
    const pin = "123456";
    const enrolled = await enrollVaultCrypto(pin, "mobile_pin");
    expect(enrolled.recoveryPassphrase.split(" ").length).toBe(8);
    const dek = await unlockWithPin(
      pin,
      enrolled.kdf_params_json,
      enrolled.wrapped_dek_pin,
    );
    expect(dek.length).toBe(32);
    // wrong pin fails
    await expect(
      unlockWithPin("000000", enrolled.kdf_params_json, enrolled.wrapped_dek_pin),
    ).rejects.toBeTruthy();
  }, 60_000);

  it("enroll → unlock with recovery", async () => {
    const enrolled = await enrollVaultCrypto("654321", "desktop_pin");
    const dek = await unlockWithRecovery(
      enrolled.recoveryPassphrase,
      enrolled.kdf_params_json,
      enrolled.wrapped_dek_recovery,
    );
    expect(dek.length).toBe(32);
  }, 60_000);

  it("encrypt/decrypt item with DEK", async () => {
    const enrolled = await enrollVaultCrypto("111111", "mobile_pin");
    const plain = JSON.stringify({
      title: "Example",
      url: "https://example.com",
      username: "u",
      password: "p",
    });
    const enc = await encryptItem(enrolled.dek, plain, "item");
    const dec = await decryptItem(
      enrolled.dek,
      enc.ciphertext,
      enc.nonce,
      enc.aad,
    );
    expect(dec).toBe(plain);
  }, 60_000);

  it("profiles defined", () => {
    expect(ARGON2_PROFILES.recovery.t).toBeGreaterThanOrEqual(4);
  });
});
