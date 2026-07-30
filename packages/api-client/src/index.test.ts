import { describe, expect, it } from "vitest";
import { fetchHealth } from "./index";

describe("@localvault/api-client S1 stub", () => {
  it("exports fetchHealth function", () => {
    expect(typeof fetchHealth).toBe("function");
  });
});
