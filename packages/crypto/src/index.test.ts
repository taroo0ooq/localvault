import { describe, expect, it } from "vitest";
import { assertPasswordPolicy, CRYPTO_STAGE, DEFAULT_POLICY } from "./index";

describe("@localvault/crypto S1 stub", () => {
  it("exports S1 stage marker", () => {
    expect(CRYPTO_STAGE).toBe("S1_STUB");
  });

  it("accepts default policy", () => {
    expect(() => assertPasswordPolicy(DEFAULT_POLICY)).not.toThrow();
  });

  it("rejects empty character classes", () => {
    expect(() =>
      assertPasswordPolicy({
        length: 20,
        uppercase: false,
        lowercase: false,
        digits: false,
        symbols: false,
      }),
    ).toThrow(/character class/);
  });
});
