import { describe, expect, it } from "vitest";
import { isValidUsername } from "./index";

describe("@localvault/shared-types", () => {
  it("accepts simple usernames", () => {
    expect(isValidUsername("tareq")).toBe(true);
    expect(isValidUsername("alex.home")).toBe(true);
  });

  it("rejects invalid usernames", () => {
    expect(isValidUsername("ab")).toBe(false);
    expect(isValidUsername("Bad Case")).toBe(false);
  });
});
