import { test, expect } from "@playwright/test";

const DESKTOP = process.env.DESKTOP_BASE_URL || "";

test.describe("desktop UI shell (S6)", () => {
  test.skip(!DESKTOP, "set DESKTOP_BASE_URL to exercise desktop vite preview");

  test("shows LocalVault Desktop chrome", async ({ page }) => {
    await page.goto(DESKTOP);
    await expect(page.getByText("LocalVault Desktop")).toBeVisible();
    await expect(page.getByTestId("desktop-base-url")).toBeVisible();
  });
});
