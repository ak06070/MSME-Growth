import { describe, expect, it } from "vitest";
import { buildServer } from "./server";

const extractCookie = (setCookieHeader: string | string[] | undefined): string => {
  if (!setCookieHeader) {
    throw new Error("Expected set-cookie header");
  }

  const first = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
  return first.split(";")[0];
};

const loginAsAdmin = async (app: ReturnType<typeof buildServer>): Promise<string> => {
  const login = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: {
      email: "admin@msme.local",
      password: "Admin@123"
    }
  });

  expect(login.statusCode).toBe(200);
  return extractCookie(login.headers["set-cookie"]);
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

  it("ingests valid CSV invoices", async () => {
    const app = buildServer();
    const cookie = await loginAsAdmin(app);

    const csvContent = [
      "invoice_number,invoice_date,due_date,customer_external_code,customer_name,subtotal_amount,tax_amount,total_amount,currency",
      "INV-CSV-001,2026-03-01,2026-03-15,CUST001,Acme Traders,1000,180,1180,INR"
    ].join("\n");

    const response = await app.inject({
      method: "POST",
      url: "/ingestion/invoices/csv",
      headers: { cookie },
      payload: {
        csvContent
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "completed",
      summary: {
        totalRows: 1,
        successfulRows: 1,
        duplicateRows: 0,
        failedRows: 0
      }
    });

    await app.close();
  });

  it("skips duplicate invoice rows", async () => {
    const app = buildServer();
    const cookie = await loginAsAdmin(app);

    const csvContent = [
      "invoice_number,invoice_date,due_date,customer_external_code,customer_name,subtotal_amount,tax_amount,total_amount,currency",
      "INV-CSV-DUP,2026-03-01,2026-03-15,CUST001,Acme Traders,1000,180,1180,INR"
    ].join("\n");

    await app.inject({
      method: "POST",
      url: "/ingestion/invoices/csv",
      headers: { cookie },
      payload: {
        csvContent
      }
    });

    const duplicateRun = await app.inject({
      method: "POST",
      url: "/ingestion/invoices/csv",
      headers: { cookie },
      payload: {
        csvContent
      }
    });

    expect(duplicateRun.statusCode).toBe(200);
    expect(duplicateRun.json()).toMatchObject({
      status: "partial_success",
      summary: {
        totalRows: 1,
        successfulRows: 0,
        duplicateRows: 1,
        failedRows: 0
      }
    });

    await app.close();
  });

  it("returns row errors for invalid CSV rows", async () => {
    const app = buildServer();
    const cookie = await loginAsAdmin(app);

    const csvContent = [
      "invoice_number,invoice_date,due_date,customer_external_code,customer_name,subtotal_amount,tax_amount,total_amount,currency",
      "INV-CSV-VALID,2026-03-01,2026-03-15,CUST010,Valid Customer,1000,180,1180,INR",
      "INV-CSV-INVALID,2026-03-20,2026-03-10,CUST011,Invalid Customer,1000,180,1180,USD"
    ].join("\n");

    const response = await app.inject({
      method: "POST",
      url: "/ingestion/invoices/csv",
      headers: { cookie },
      payload: {
        csvContent
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe("partial_success");
    expect(response.json().summary).toMatchObject({
      totalRows: 2,
      successfulRows: 1,
      failedRows: 1
    });
    expect(response.json().errors.length).toBeGreaterThan(0);

    await app.close();
  });

  it("rejects unauthenticated ingestion requests", async () => {
    const app = buildServer();

    const response = await app.inject({
      method: "POST",
      url: "/ingestion/invoices/csv",
      payload: {
        csvContent:
          "invoice_number,invoice_date,due_date,customer_external_code,customer_name,subtotal_amount,tax_amount,total_amount,currency\\nINV-1,2026-03-01,2026-03-15,CUST001,Acme,100,18,118,INR"
      }
    });

    expect(response.statusCode).toBe(401);

    await app.close();
  });

  it("starts and completes collections follow-up workflow", async () => {
    const app = buildServer();
    const cookie = await loginAsAdmin(app);

    const overdueCsv = [
      "invoice_number,invoice_date,due_date,customer_external_code,customer_name,subtotal_amount,tax_amount,total_amount,currency",
      "INV-OVERDUE-001,2026-01-01,2026-01-15,CUST200,Overdue Customer,1500,270,1770,INR"
    ].join("\n");

    await app.inject({
      method: "POST",
      url: "/ingestion/invoices/csv",
      headers: { cookie },
      payload: { csvContent: overdueCsv }
    });

    const start = await app.inject({
      method: "POST",
      url: "/workflows/collections-followup/start",
      headers: { cookie },
      payload: {
        triggerType: "manual"
      }
    });

    expect(start.statusCode).toBe(200);
    expect(start.json().workflowStatus).toBe("awaiting_approval");
    expect(start.json().overdueCount).toBeGreaterThan(0);

    const executionId = start.json().executionId as string;

    const approve = await app.inject({
      method: "POST",
      url: `/workflows/${executionId}/approve`,
      headers: { cookie },
      payload: {
        approved: true
      }
    });

    expect(approve.statusCode).toBe(200);
    expect(approve.json().workflowStatus).toBe("completed");

    const details = await app.inject({
      method: "GET",
      url: `/workflows/${executionId}`,
      headers: { cookie }
    });

    expect(details.statusCode).toBe(200);
    expect(details.json().execution.status).toBe("completed");
    expect(
      details
        .json()
        .events.map((event: { eventType: string }) => event.eventType)
        .includes("workflow_completed")
    ).toBe(true);

    await app.close();
  });

  it("rejects unauthenticated collections workflow start", async () => {
    const app = buildServer();

    const response = await app.inject({
      method: "POST",
      url: "/workflows/collections-followup/start",
      payload: {
        triggerType: "manual"
      }
    });

    expect(response.statusCode).toBe(401);

    await app.close();
  });
});
