import { test, expect } from "@playwright/test";

test.describe("vault-api health (S4)", () => {
  test("GET /healthz returns ok stage S4", async ({ request }) => {
    const res = await request.get("/healthz");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.stage).toBe("S4");
  });

  test("GET /v1/server-info tunnel feature", async ({ request }) => {
    const res = await request.get("/v1/server-info");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.stage).toBe("S4");
    expect(body.features.multiuser).toBe(true);
    expect(body.features.tunnel_access).toBe(true);
    expect(body.access).toBeTruthy();
  });
});
