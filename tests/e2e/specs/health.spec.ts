import { test, expect } from "@playwright/test";

test.describe("vault-api health (S8)", () => {
  test("GET /healthz returns ok with current stage", async ({ request }) => {
    const res = await request.get("/healthz");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.stage).toBe("S8");
  });

  test("GET /v1/server-info features include multiuser + tunnel + hardening", async ({
    request,
  }) => {
    const res = await request.get("/v1/server-info");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.stage).toBe("S8");
    expect(body.features.multiuser).toBe(true);
    expect(body.features.tunnel_access).toBe(true);
    expect(body.features.hardening_s8).toBe(true);
    expect(body.access).toBeTruthy();
  });
});
