import { defineConfig } from "@playwright/test";

const baseURL = process.env.VAULT_BASE_URL ?? "http://127.0.0.1:8443";

export default defineConfig({
  testDir: "./specs",
  timeout: 30_000,
  retries: 1,
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  reporter: [["list"], ["html", { open: "never" }]],
});
