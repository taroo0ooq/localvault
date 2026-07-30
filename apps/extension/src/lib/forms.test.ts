import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import {
  collectSaveCandidate,
  detectLoginFields,
  fillField,
  scoreUsernameInput,
} from "./forms";

function dom(html: string) {
  const d = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
    url: "https://login.example.com/signin",
  });
  // @ts-expect-error test env
  global.document = d.window.document;
  // @ts-expect-error test env
  global.HTMLInputElement = d.window.HTMLInputElement;
  // @ts-expect-error test env
  global.HTMLFormElement = d.window.HTMLFormElement;
  // @ts-expect-error test env
  global.getComputedStyle = d.window.getComputedStyle;
  return d;
}

describe("form detection", () => {
  it("detects classic login form", () => {
    const d = dom(`
      <form>
        <input type="email" name="email" autocomplete="username" />
        <input type="password" name="password" autocomplete="current-password" />
        <button type="submit">Sign in</button>
      </form>
    `);
    const fields = detectLoginFields(d.window.document);
    expect(fields.username?.name).toBe("email");
    expect(fields.password?.name).toBe("password");
  });

  it("fills fields with events", () => {
    const d = dom(`<input id="u" type="text" name="user" />`);
    const el = d.window.document.getElementById("u") as HTMLInputElement;
    let fired = false;
    el.addEventListener("input", () => {
      fired = true;
    });
    fillField(el, "alice");
    expect(el.value).toBe("alice");
    expect(fired).toBe(true);
  });

  it("collects autosave candidate", () => {
    const d = dom(`
      <form>
        <input type="text" name="username" value="bob" autocomplete="username" />
        <input type="password" name="password" value="s3cret" autocomplete="current-password" />
      </form>
    `);
    const fields = detectLoginFields(d.window.document);
    const c = collectSaveCandidate(fields, "https://login.example.com/signin", "Example");
    expect(c?.username).toBe("bob");
    expect(c?.password).toBe("s3cret");
    expect(c?.origin).toBe("https://login.example.com");
  });

  it("scores email highly", () => {
    const d = dom(`<input type="email" name="email" />`);
    const el = d.window.document.querySelector("input") as HTMLInputElement;
    expect(scoreUsernameInput(el)).toBeGreaterThan(30);
  });
});
