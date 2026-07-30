import { test, expect } from "@playwright/test";

test.describe("vault-api health (S1)", () => {
  test("GET /healthz returns ok", async ({ request }) => {
    const res = await request.get("/healthz");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe("ok");
  });

  test("GET /v1/server-info returns stage S1", async ({ request }) => {
    const res = await request.get("/v1/server-info");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.stage).toBe("S1");
  });
});
