import { test, expect } from "@playwright/test";

const WEB = process.env.WEB_BASE_URL || "http://127.0.0.1:5173";

async function registerUser(page: import("@playwright/test").Page, user: string, pin = "123456") {
  // From welcome or accounts
  if (await page.getByTestId("accounts-create").isVisible().catch(() => false)) {
    await page.getByTestId("accounts-create").click();
  } else if (await page.getByTestId("create-account").isVisible().catch(() => false)) {
    await page.getByTestId("create-account").click();
  } else if (await page.getByRole("button", { name: /Create account/i }).isVisible()) {
    await page.getByRole("button", { name: /Create account/i }).click();
  } else if (await page.getByTestId("sign-out").isVisible().catch(() => false)) {
    await page.getByTestId("sign-out").click();
    if (await page.getByTestId("accounts-create").isVisible().catch(() => false)) {
      await page.getByTestId("accounts-create").click();
    } else {
      await page.getByRole("button", { name: /Create account/i }).click();
    }
  }

  await page.getByTestId("enroll-username").fill(user);
  await page.getByRole("button", { name: /Continue to PIN/i }).click();
  await page.getByTestId("enroll-pin").fill(pin);
  await page.getByTestId("enroll-pin2").fill(pin);
  await page.getByRole("button", { name: /Create PIN/i }).click();
  await expect(page.getByTestId("recovery-phrase")).toBeVisible({ timeout: 90_000 });
  await page.getByTestId("recovery-confirm").check();
  await page.getByRole("button", { name: /Finish registration/i }).click();
  await expect(page.getByRole("heading", { name: "Passwords" })).toBeVisible({
    timeout: 90_000,
  });
}

test.describe("multiuser account selection (#23)", () => {
  test.skip(!process.env.RUN_WEB_E2E, "set RUN_WEB_E2E=1 when web server is up");

  test("three users sign out then re-select from account list", async ({ page }) => {
    const stamp = Date.now().toString(36);
    const users = [`u1_${stamp}`, `u2_${stamp}`, `u3_${stamp}`];

    await page.goto(WEB);
    await page.getByTestId("base-url").fill(WEB);
    await page.getByRole("button", { name: "Connect" }).click();
    await expect(page.getByRole("button", { name: /Create account/i })).toBeVisible({
      timeout: 15_000,
    });

    for (const u of users) {
      await registerUser(page, u);
      await page.getByTestId("sign-out").click();
      // After sign-out must land on account chooser (or welcome with choose)
      const list = page.getByTestId("account-list");
      const choose = page.getByTestId("choose-account");
      await expect(list.or(choose)).toBeVisible({ timeout: 10_000 });
      if (await choose.isVisible().catch(() => false)) {
        await choose.click();
      }
      await expect(page.getByTestId(`account-${u}`)).toBeVisible();
    }

    // All three visible
    for (const u of users) {
      await expect(page.getByTestId(`account-${u}`)).toBeVisible();
      await expect(page.getByRole("button", { name: `Sign in as ${u}` })).toBeVisible();
    }

    // Re-login as user1
    await page.getByTestId(`account-${users[0]}`).click();
    await expect(page.getByText(`@${users[0]}`)).toBeVisible();
    await page.getByTestId("unlock-pin").fill("123456");
    await page.getByRole("button", { name: /^Unlock$/i }).click();
    await expect(page.getByRole("heading", { name: "Passwords" })).toBeVisible({
      timeout: 60_000,
    });
  });
});
