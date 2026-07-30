import { test, expect } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.resolve(__dirname, "../../../apps/extension/fixtures/login.html");

test.describe("extension form fixtures (S5)", () => {
  test("login fixture has username + password fields", async ({ page }) => {
    const html = await readFile(fixture, "utf8");
    const server = createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html);
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("no port");
    const url = `http://127.0.0.1:${addr.port}/`;
    await page.goto(url);
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.locator("#newpass")).toBeVisible();
    // Simulate content-script detection via page.evaluate using same heuristics
    const detected = await page.evaluate(() => {
      const USER_RE = /user|login|email|e-mail|account|identifier|phone|id$/i;
      const inputs = [...document.querySelectorAll("input")] as HTMLInputElement[];
      const email = inputs.find((i) => i.type === "email");
      const pass = inputs.find((i) => i.type === "password" && i.autocomplete === "current-password");
      const neu = inputs.find((i) => i.autocomplete === "new-password");
      return {
        email: Boolean(email && USER_RE.test(email.name + email.type)),
        pass: Boolean(pass),
        neu: Boolean(neu),
      };
    });
    expect(detected.email).toBe(true);
    expect(detected.pass).toBe(true);
    expect(detected.neu).toBe(true);
    server.close();
  });
});
