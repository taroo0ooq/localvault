import { test, expect } from "@playwright/test";

test.describe("vault-api health (S2)", () => {
  test("GET /healthz returns ok stage S2", async ({ request }) => {
    const res = await request.get("/healthz");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.stage).toBe("S2");
  });

  test("GET /v1/server-info multiuser feature", async ({ request }) => {
    const res = await request.get("/v1/server-info");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.stage).toBe("S2");
    expect(body.features.multiuser).toBe(true);
  });
});
