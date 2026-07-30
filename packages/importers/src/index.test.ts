import { describe, expect, it } from "vitest";
import { detectCsvSource } from "./index";

describe("@localvault/importers S1 stub", () => {
  it("detects google-like headers", () => {
    expect(detectCsvSource("name,url,username,password,note")).toBe("google");
  });

  it("detects apple-like headers", () => {
    expect(detectCsvSource("Title,URL,Username,Password,Notes,OTPAuth")).toBe("apple");
  });

  it("returns null for unknown", () => {
    expect(detectCsvSource("foo,bar")).toBeNull();
  });
});
