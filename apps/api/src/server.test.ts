import { describe, expect, it } from "vitest";
import { buildServer } from "./server";

describe("api foundation shell", () => {
  it("returns health payload", async () => {
    const app = buildServer();

    const response = await app.inject({
      method: "GET",
      url: "/health",
      headers: {
        "x-tenant-id": "tenant-1"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["x-correlation-id"]).toBeDefined();
    expect(response.json()).toMatchObject({
      status: "ok",
      service: "@msme/api",
      tenantHeaderSeen: true
    });

    await app.close();
  });

  it("accepts audit sample route", async () => {
    const app = buildServer();

    const response = await app.inject({
      method: "POST",
      url: "/foundation/audit-sample",
      headers: {
        "x-tenant-id": "tenant-2"
      }
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ accepted: true });

    await app.close();
  });
});
