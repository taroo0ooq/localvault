/**
 * @localvault/crypto — S1 scaffold only.
 * Full Argon2id / AES-GCM / recovery generator arrives in S3 (REQ-015, REQ-016).
 */

export const CRYPTO_STAGE = "S1_STUB" as const;

/** Placeholder password policy — real CSPRNG generator in S3. */
export interface PasswordPolicy {
  length: number;
  uppercase: boolean;
  lowercase: boolean;
  digits: boolean;
  symbols: boolean;
}

export const DEFAULT_POLICY: PasswordPolicy = {
  length: 20,
  uppercase: true,
  lowercase: true,
  digits: true,
  symbols: true,
};

/**
 * S1 stub: validates policy shape only. Does not generate secrets.
 * S3 will implement CSPRNG generation + Argon2id KAT tests.
 */
export function assertPasswordPolicy(policy: PasswordPolicy): void {
  if (policy.length < 8 || policy.length > 128) {
    throw new Error("password length out of range");
  }
  if (!policy.uppercase && !policy.lowercase && !policy.digits && !policy.symbols) {
    throw new Error("password policy must allow at least one character class");
  }
}
