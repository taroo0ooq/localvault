import { describe, expect, it } from "vitest";
import { pickDesktopArgonProfile } from "./platform";

describe("desktop platform helpers", () => {
  it("uses desktop Argon2 profile name", () => {
    expect(pickDesktopArgonProfile()).toBe("desktop_pin");
  });
});
