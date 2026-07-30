import { test, expect } from "@playwright/test";

const WEB = process.env.WEB_BASE_URL || "http://127.0.0.1:5173";
const API = process.env.VAULT_BASE_URL || "http://127.0.0.1:8443";

test.describe("web enrollment S3", () => {
  test.skip(!process.env.RUN_WEB_E2E, "set RUN_WEB_E2E=1 when web server is up");

  test("username → PIN → recovery → vault item", async ({ page }) => {
    const user = `web_${Date.now().toString(36)}`;
    await page.goto(WEB);
    await page.getByTestId("base-url").fill(API);
    await page.getByRole("button", { name: "Connect" }).click();
    await page.getByRole("button", { name: /Create account/i }).click();
    await page.getByTestId("enroll-username").fill(user);
    await page.getByRole("button", { name: /Continue to PIN/i }).click();
    await page.getByTestId("enroll-pin").fill("123456");
    await page.getByTestId("enroll-pin2").fill("123456");
    await page.getByRole("button", { name: /Create PIN/i }).click();
    await expect(page.getByTestId("recovery-phrase")).toBeVisible({ timeout: 60_000 });
    await page.getByTestId("recovery-confirm").check();
    await page.getByRole("button", { name: /Finish registration/i }).click();
    await expect(page.getByRole("heading", { name: "Passwords" })).toBeVisible({
      timeout: 60_000,
    });
    await page.getByTestId("add-item").click();
    await page.getByTestId("item-title").fill("Demo");
    await page.getByTestId("item-url").fill("https://example.com");
    await page.getByTestId("item-username").fill("demo");
    await page.getByTestId("item-password").fill("hunter2-not-real");
    await page.getByRole("button", { name: /Save encrypted/i }).click();
    await expect(page.getByTestId("vault-item")).toBeVisible({ timeout: 30_000 });
  });
});
