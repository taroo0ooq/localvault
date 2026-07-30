/**
 * @localvault/crypto — S3 client crypto (REQ-015, REQ-016, REQ-006).
 * Zero-knowledge: PIN/recovery never leave the client as plaintext.
 */
import { argon2id } from "hash-wasm";

export const CRYPTO_STAGE = "S3" as const;

export interface Argon2Params {
  /** Memory in KiB */
  m: number;
  /** Iterations */
  t: number;
  /** Parallelism */
  p: number;
}

/** Cross-device profiles stored in vault_meta.kdf_params_json (ADR-009). */
export const ARGON2_PROFILES = {
  mobile_pin: { m: 65536, t: 3, p: 1 } satisfies Argon2Params,
  desktop_pin: { m: 131072, t: 3, p: 2 } satisfies Argon2Params,
  recovery: { m: 131072, t: 4, p: 2 } satisfies Argon2Params,
} as const;

export type PinProfileName = "mobile_pin" | "desktop_pin";

export function pickPinProfile(): PinProfileName {
  if (typeof navigator !== "undefined") {
    const ua = navigator.userAgent || "";
    if (/Mobi|Android|iPhone|iPad/i.test(ua)) return "mobile_pin";
  }
  return "desktop_pin";
}

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

export function assertPasswordPolicy(policy: PasswordPolicy): void {
  if (policy.length < 8 || policy.length > 128) {
    throw new Error("password length out of range");
  }
  if (!policy.uppercase && !policy.lowercase && !policy.digits && !policy.symbols) {
    throw new Error("password policy must allow at least one character class");
  }
}

const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnopqrstuvwxyz";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%^&*_-+=?";

export function generatePassword(policy: PasswordPolicy = DEFAULT_POLICY): string {
  assertPasswordPolicy(policy);
  let alphabet = "";
  const required: string[] = [];
  if (policy.uppercase) {
    alphabet += UPPER;
    required.push(pick(UPPER));
  }
  if (policy.lowercase) {
    alphabet += LOWER;
    required.push(pick(LOWER));
  }
  if (policy.digits) {
    alphabet += DIGITS;
    required.push(pick(DIGITS));
  }
  if (policy.symbols) {
    alphabet += SYMBOLS;
    required.push(pick(SYMBOLS));
  }
  const chars = [...required];
  while (chars.length < policy.length) chars.push(pick(alphabet));
  // Fisher–Yates
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join("");
}

/** Diceware-style recovery passphrase (REQ-016). */
const WORDLIST = [
  "anchor","bright","cedar","drift","ember","fjord","glacier","harbor",
  "ion","jade","kite","lotus","maple","north","orbit","pine","quartz",
  "river","solar","tide","umbra","vale","willow","xenon","yellow","zephyr",
  "alpha","bravo","comet","delta","echo","frost","grove","horizon","iris",
  "jasper","keel","lumen","meadow","nova","opal","prism","quill","ridge",
  "sable","torch","ultra","vista","wave","yarn","zinc","amber","bloom",
];

export function generateRecoveryPassphrase(wordCount = 8): string {
  if (wordCount < 6 || wordCount > 12) throw new Error("wordCount 6–12");
  const words: string[] = [];
  for (let i = 0; i < wordCount; i++) {
    words.push(WORDLIST[randomInt(WORDLIST.length)]!);
  }
  return words.join(" ");
}

export function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

/** TS 5.x BufferSource strictness helper */
function asBufferSource(u8: Uint8Array): ArrayBuffer {
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}

function pick(s: string): string {
  return s[randomInt(s.length)]!;
}

function randomInt(max: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0]! % max;
}

export function b64(u8: Uint8Array): string {
  let s = "";
  for (const x of u8) s += String.fromCharCode(x);
  return btoa(s);
}

export function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function deriveKEK(
  secret: string,
  salt: Uint8Array,
  params: Argon2Params,
): Promise<Uint8Array> {
  const hash = await argon2id({
    password: secret,
    salt,
    parallelism: params.p,
    iterations: params.t,
    memorySize: params.m,
    hashLength: 32,
    outputType: "binary",
  });
  return new Uint8Array(hash);
}

async function importAesKey(raw: Uint8Array, usages: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", asBufferSource(raw), "AES-GCM", false, usages);
}

/** Wrap DEK under KEK (AES-256-GCM). Returns base64(iv||ct). */
export async function wrapDEK(dek: Uint8Array, kek: Uint8Array): Promise<string> {
  const iv = randomBytes(12);
  const key = await importAesKey(kek, ["encrypt"]);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: asBufferSource(iv) }, key, asBufferSource(dek)),
  );
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return b64(out);
}

export async function unwrapDEK(wrappedB64: string, kek: Uint8Array): Promise<Uint8Array> {
  const raw = fromB64(wrappedB64);
  const iv = raw.slice(0, 12);
  const ct = raw.slice(12);
  const key = await importAesKey(kek, ["decrypt"]);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: asBufferSource(iv) }, key, asBufferSource(ct));
  return new Uint8Array(pt);
}

export async function encryptItem(
  dek: Uint8Array,
  plaintext: string,
  aad = "",
): Promise<{ ciphertext: string; nonce: string; aad: string }> {
  const iv = randomBytes(12);
  const key = await importAesKey(dek, ["encrypt"]);
  const enc = new TextEncoder();
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: asBufferSource(iv), additionalData: enc.encode(aad) },
      key,
      enc.encode(plaintext),
    ),
  );
  return { ciphertext: b64(ct), nonce: b64(iv), aad };
}

export async function decryptItem(
  dek: Uint8Array,
  ciphertextB64: string,
  nonceB64: string,
  aad = "",
): Promise<string> {
  const key = await importAesKey(dek, ["decrypt"]);
  const enc = new TextEncoder();
  const pt = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: asBufferSource(fromB64(nonceB64)),
      additionalData: enc.encode(aad),
    },
    key,
    asBufferSource(fromB64(ciphertextB64)),
  );
  return new TextDecoder().decode(pt);
}

export interface EnrollmentVaultMeta {
  kdf_params_json: string;
  wrapped_dek_pin: string;
  wrapped_dek_recovery: string;
  dek: Uint8Array;
  recoveryPassphrase: string;
  pinSaltB64: string;
  recoverySaltB64: string;
}

/**
 * Complete enrollment crypto AFTER username + PIN confirmed (ADR-012).
 * Generates recovery passphrase, DEK, wraps under PIN-KEK and Recovery-KEK.
 */
export async function enrollVaultCrypto(
  pin: string,
  profile: PinProfileName = pickPinProfile(),
): Promise<EnrollmentVaultMeta> {
  if (!/^\d{6,12}$/.test(pin)) {
    throw new Error("PIN must be 6–12 digits");
  }
  const pinParams = ARGON2_PROFILES[profile];
  const recoveryParams = ARGON2_PROFILES.recovery;
  const pinSalt = randomBytes(16);
  const recoverySalt = randomBytes(16);
  const recoveryPassphrase = generateRecoveryPassphrase(8);
  const dek = randomBytes(32);

  const pinKEK = await deriveKEK(pin, pinSalt, pinParams);
  const recKEK = await deriveKEK(recoveryPassphrase, recoverySalt, recoveryParams);

  const wrapped_dek_pin = await wrapDEK(dek, pinKEK);
  const wrapped_dek_recovery = await wrapDEK(dek, recKEK);

  const kdf = {
    version: 1,
    pin_profile: profile,
    pin: { ...pinParams, salt_b64: b64(pinSalt) },
    recovery: { ...recoveryParams, salt_b64: b64(recoverySalt) },
  };

  return {
    kdf_params_json: JSON.stringify(kdf),
    wrapped_dek_pin,
    wrapped_dek_recovery,
    dek,
    recoveryPassphrase,
    pinSaltB64: b64(pinSalt),
    recoverySaltB64: b64(recoverySalt),
  };
}

export async function unlockWithPin(
  pin: string,
  kdfParamsJSON: string,
  wrappedDekPin: string,
): Promise<Uint8Array> {
  const kdf = JSON.parse(kdfParamsJSON) as {
    pin: Argon2Params & { salt_b64: string };
  };
  const salt = fromB64(kdf.pin.salt_b64);
  const kek = await deriveKEK(pin, salt, kdf.pin);
  return unwrapDEK(wrappedDekPin, kek);
}

export async function unlockWithRecovery(
  recovery: string,
  kdfParamsJSON: string,
  wrappedDekRecovery: string,
): Promise<Uint8Array> {
  const kdf = JSON.parse(kdfParamsJSON) as {
    recovery: Argon2Params & { salt_b64: string };
  };
  const salt = fromB64(kdf.recovery.salt_b64);
  const kek = await deriveKEK(recovery, salt, kdf.recovery);
  return unwrapDEK(wrappedDekRecovery, kek);
}

/** Item payload stored encrypted. */
export interface VaultItemPlain {
  title: string;
  url: string;
  username: string;
  password: string;
  notes?: string;
}
