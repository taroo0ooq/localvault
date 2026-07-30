import { describe, expect, it } from "vitest";
import { VaultClient, fetchHealth } from "./index";

describe("@localvault/api-client", () => {
  it("exports client", () => {
    expect(typeof VaultClient).toBe("function");
    expect(typeof fetchHealth).toBe("function");
  });
});
