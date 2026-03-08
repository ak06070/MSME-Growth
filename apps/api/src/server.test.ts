import { describe, expect, it } from "vitest";
import { buildServer } from "./server";

const extractCookie = (setCookieHeader: string | string[] | undefined): string => {
  if (!setCookieHeader) {
    throw new Error("Expected set-cookie header");
  }

  const first = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
  return first.split(";")[0];
};

describe("api auth and tenancy foundation", () => {
  it("returns health payload", async () => {
    const app = buildServer();

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "ok",
      service: "@msme/api"
    });

    await app.close();
  });

  it("rejects invalid login", async () => {
    const app = buildServer();

    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "admin@msme.local",
        password: "wrong-password"
      }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "INVALID_CREDENTIALS" });

    await app.close();
  });

  it("creates session on login and returns session context", async () => {
    const app = buildServer();

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "admin@msme.local",
        password: "Admin@123"
      }
    });

    expect(login.statusCode).toBe(200);

    const cookie = extractCookie(login.headers["set-cookie"]);

    const session = await app.inject({
      method: "GET",
      url: "/auth/session",
      headers: {
        cookie
      }
    });

    expect(session.statusCode).toBe(200);
    expect(session.json()).toMatchObject({
      authenticated: true,
      userId: "usr_admin",
      activeTenantId: "ten_001",
      activeOrganizationId: "org_001"
    });

    await app.close();
  });

  it("allows admin invite and audit retrieval", async () => {
    const app = buildServer();

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "admin@msme.local",
        password: "Admin@123"
      }
    });

    const cookie = extractCookie(login.headers["set-cookie"]);

    const invite = await app.inject({
      method: "POST",
      url: "/admin/users/invite",
      headers: {
        cookie
      },
      payload: {
        email: "new.user@msme.local",
        tenantId: "ten_001",
        organizationId: "org_001",
        role: "accountant"
      }
    });

    expect(invite.statusCode).toBe(202);
    expect(invite.json()).toMatchObject({ status: "invited" });

    const auditEvents = await app.inject({
      method: "GET",
      url: "/admin/audit-events?tenantId=ten_001",
      headers: {
        cookie
      }
    });

    expect(auditEvents.statusCode).toBe(200);
    expect(auditEvents.json().items.length).toBeGreaterThan(0);

    await app.close();
  });

  it("denies non-admin user from admin endpoint", async () => {
    const app = buildServer();

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "finance@msme.local",
        password: "Finance@123"
      }
    });

    const cookie = extractCookie(login.headers["set-cookie"]);

    const invite = await app.inject({
      method: "POST",
      url: "/admin/users/invite",
      headers: {
        cookie
      },
      payload: {
        email: "blocked.user@msme.local",
        tenantId: "ten_001",
        organizationId: "org_001",
        role: "accountant"
      }
    });

    expect(invite.statusCode).toBe(403);
    expect(invite.json()).toEqual({ error: "FORBIDDEN" });

    await app.close();
  });

  it("denies cross-tenant admin actions", async () => {
    const app = buildServer();

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "admin@msme.local",
        password: "Admin@123"
      }
    });

    const cookie = extractCookie(login.headers["set-cookie"]);

    const invite = await app.inject({
      method: "POST",
      url: "/admin/users/invite",
      headers: {
        cookie
      },
      payload: {
        email: "cross.tenant@msme.local",
        tenantId: "ten_002",
        organizationId: "org_002",
        role: "accountant"
      }
    });

    expect(invite.statusCode).toBe(403);
    expect(invite.json()).toEqual({ error: "FORBIDDEN_TENANT_SCOPE" });

    await app.close();
  });

  it("invalidates session on logout", async () => {
    const app = buildServer();

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "admin@msme.local",
        password: "Admin@123"
      }
    });

    const cookie = extractCookie(login.headers["set-cookie"]);

    const logout = await app.inject({
      method: "POST",
      url: "/auth/logout",
      headers: {
        cookie
      }
    });

    expect(logout.statusCode).toBe(204);

    const session = await app.inject({
      method: "GET",
      url: "/auth/session",
      headers: {
        cookie
      }
    });

    expect(session.statusCode).toBe(401);

    await app.close();
  });
});
