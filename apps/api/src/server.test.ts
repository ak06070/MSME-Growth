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

  it("applies pilot hardening security headers", async () => {
    const app = buildServer();

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-frame-options"]).toBe("DENY");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.headers["content-security-policy"]).toContain("default-src");

    await app.close();
  });

  it("exposes ops metrics for authorized users only", async () => {
    const app = buildServer();

    const adminCookie = await loginAsAdmin(app);

    const adminResponse = await app.inject({
      method: "GET",
      url: "/ops/metrics",
      headers: {
        cookie: adminCookie
      }
    });

    expect(adminResponse.statusCode).toBe(200);
    expect(adminResponse.json().dashboard).toBeTruthy();

    const sloResponse = await app.inject({
      method: "GET",
      url: "/ops/slo",
      headers: {
        cookie: adminCookie
      }
    });

    expect(sloResponse.statusCode).toBe(200);
    expect(sloResponse.json().slo.slos.length).toBeGreaterThan(0);

    const financeLogin = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "finance@msme.local",
        password: "Finance@123"
      }
    });

    const financeCookie = extractCookie(financeLogin.headers["set-cookie"]);

    const forbidden = await app.inject({
      method: "GET",
      url: "/ops/metrics",
      headers: {
        cookie: financeCookie
      }
    });

    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.json()).toEqual({ error: "FORBIDDEN" });

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

  it("issues bearer token and authenticates via authorization header", async () => {
    const app = buildServer();
    const cookie = await loginAsAdmin(app);

    const tokenResponse = await app.inject({
      method: "POST",
      url: "/auth/token",
      headers: { cookie }
    });

    expect(tokenResponse.statusCode).toBe(200);
    const token = tokenResponse.json().token as string;

    const session = await app.inject({
      method: "GET",
      url: "/auth/session",
      headers: {
        authorization: `Bearer ${token}`
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

  it("ingests manual invoice payloads with connector framework", async () => {
    const app = buildServer();
    const cookie = await loginAsAdmin(app);

    const response = await app.inject({
      method: "POST",
      url: "/ingestion/invoices/manual",
      headers: { cookie },
      payload: {
        invoices: [
          {
            invoiceNumber: "INV-MAN-001",
            invoiceDate: "2026-03-01",
            dueDate: "2026-03-20",
            customerExternalCode: "M001",
            customerName: "Manual Customer",
            subtotalAmount: 2000,
            taxAmount: 360,
            totalAmount: 2360,
            currency: "INR"
          }
        ]
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

  it("lists connector runs in tenant scope", async () => {
    const app = buildServer();
    const cookie = await loginAsAdmin(app);

    const csvContent = [
      "invoice_number,invoice_date,due_date,customer_external_code,customer_name,subtotal_amount,tax_amount,total_amount,currency",
      "INV-RUN-001,2026-03-01,2026-03-15,CUST001,Acme Traders,1000,180,1180,INR"
    ].join("\\n");

    await app.inject({
      method: "POST",
      url: "/ingestion/invoices/csv",
      headers: { cookie },
      payload: {
        csvContent
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/ingestion/runs",
      headers: { cookie }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().items.length).toBeGreaterThan(0);
    expect(response.json().items[0]).toMatchObject({
      tenantId: "ten_001",
      organizationId: "org_001"
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

  it("creates in-app notifications, tracks inbox, and supports dismiss", async () => {
    const app = buildServer();
    const cookie = await loginAsAdmin(app);

    const template = await app.inject({
      method: "POST",
      url: "/notifications/templates",
      headers: { cookie },
      payload: {
        channel: "in_app",
        templateKey: "collections_inapp_v1",
        version: 1,
        body: "Reminder for {{customerName}}",
        allowedVariables: ["customerName"]
      }
    });

    expect(template.statusCode).toBe(201);

    const queued = await app.inject({
      method: "POST",
      url: "/notifications",
      headers: { cookie },
      payload: {
        channel: "in_app",
        templateKey: "collections_inapp_v1",
        recipientRef: "usr_admin",
        variables: {
          customerName: "Acme Traders"
        }
      }
    });

    expect(queued.statusCode).toBe(201);
    expect(queued.json().notification.status).toBe("sent");
    const notificationId = queued.json().notification.id as string;

    const inbox = await app.inject({
      method: "GET",
      url: "/notifications/inbox?recipientRef=usr_admin",
      headers: { cookie }
    });

    expect(inbox.statusCode).toBe(200);
    expect(inbox.json().unreadCount).toBeGreaterThan(0);

    const dismiss = await app.inject({
      method: "POST",
      url: `/notifications/${notificationId}/dismiss`,
      headers: { cookie }
    });

    expect(dismiss.statusCode).toBe(200);
    expect(dismiss.json().notification.status).toBe("dismissed");

    const attempts = await app.inject({
      method: "GET",
      url: `/notifications/${notificationId}/attempts`,
      headers: { cookie }
    });

    expect(attempts.statusCode).toBe(200);
    expect(attempts.json().items[0].status).toBe("sent");

    await app.close();
  });

  it("requires approval for outbound notification sends and logs failures", async () => {
    const app = buildServer();
    const cookie = await loginAsAdmin(app);

    await app.inject({
      method: "POST",
      url: "/notifications/templates",
      headers: { cookie },
      payload: {
        channel: "email",
        templateKey: "collections_email_v1",
        version: 1,
        subject: "Follow-up {{invoiceNumber}}",
        body: "Invoice {{invoiceNumber}} is overdue by {{daysOverdue}} days.",
        allowedVariables: ["invoiceNumber", "daysOverdue"]
      }
    });

    const queued = await app.inject({
      method: "POST",
      url: "/notifications",
      headers: { cookie },
      payload: {
        channel: "email",
        templateKey: "collections_email_v1",
        recipientRef: "owner@example.com",
        variables: {
          invoiceNumber: "INV-1001",
          daysOverdue: 14
        },
        requiresApproval: true,
        autoSend: false
      }
    });

    expect(queued.statusCode).toBe(201);
    const notificationId = queued.json().notification.id as string;

    const blockedSend = await app.inject({
      method: "POST",
      url: `/notifications/${notificationId}/send`,
      headers: { cookie }
    });

    expect(blockedSend.statusCode).toBe(409);
    expect(blockedSend.json().error).toBe("APPROVAL_REQUIRED");

    const approval = await app.inject({
      method: "POST",
      url: `/notifications/${notificationId}/approve`,
      headers: { cookie },
      payload: {
        approved: true,
        rationale: "Business-approved reminder"
      }
    });

    expect(approval.statusCode).toBe(200);
    expect(approval.json().approval.decision).toBe("approved");

    const send = await app.inject({
      method: "POST",
      url: `/notifications/${notificationId}/send`,
      headers: { cookie }
    });

    expect(send.statusCode).toBe(200);
    expect(send.json().notification.status).toBe("failed");
    expect(send.json().notification.failureCode).toBe("CHANNEL_NOT_CONFIGURED");

    const attempts = await app.inject({
      method: "GET",
      url: `/notifications/${notificationId}/attempts`,
      headers: { cookie }
    });

    expect(attempts.statusCode).toBe(200);
    expect(attempts.json().items[0].status).toBe("failed");

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

  it("generates cashflow summary workflow with risk flags", async () => {
    const app = buildServer();
    const cookie = await loginAsAdmin(app);

    const csv = [
      "invoice_number,invoice_date,due_date,customer_external_code,customer_name,subtotal_amount,tax_amount,total_amount,currency",
      "INV-CF-001,2026-01-01,2026-01-20,CF001,Cashflow Customer,5000,900,5900,INR"
    ].join("\n");

    await app.inject({
      method: "POST",
      url: "/ingestion/invoices/csv",
      headers: { cookie },
      payload: { csvContent: csv }
    });

    const response = await app.inject({
      method: "POST",
      url: "/workflows/cashflow-summary/generate",
      headers: { cookie },
      payload: {
        triggerType: "manual",
        windowDays: 90
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().workflowStatus).toBe("awaiting_approval");
    expect(response.json().snapshot.totalOutstanding).toBeGreaterThan(0);
    expect(response.json().snapshot.riskFlags.length).toBeGreaterThan(0);

    await app.close();
  });

  it("approves and retrieves cashflow summary workflow", async () => {
    const app = buildServer();
    const cookie = await loginAsAdmin(app);

    const response = await app.inject({
      method: "POST",
      url: "/workflows/cashflow-summary/generate",
      headers: { cookie },
      payload: {
        triggerType: "manual",
        windowDays: 30
      }
    });

    const executionId = response.json().executionId as string;

    const approval = await app.inject({
      method: "POST",
      url: `/workflows/cashflow-summary/${executionId}/approve`,
      headers: { cookie },
      payload: {
        approved: true
      }
    });

    expect(approval.statusCode).toBe(200);
    expect(approval.json().workflowStatus).toBe("completed");

    const details = await app.inject({
      method: "GET",
      url: `/workflows/cashflow-summary/${executionId}`,
      headers: { cookie }
    });

    expect(details.statusCode).toBe(200);
    expect(details.json().execution.status).toBe("completed");
    expect(details.json().snapshot).toBeTruthy();

    await app.close();
  });

  it("creates loan-readiness workspace and completes export approval flow", async () => {
    const app = buildServer();
    const cookie = await loginAsAdmin(app);

    const created = await app.inject({
      method: "POST",
      url: "/workflows/loan-readiness/create",
      headers: { cookie },
      payload: {
        name: "FY26 Loan Prep"
      }
    });

    expect(created.statusCode).toBe(201);
    const workspaceId = created.json().workspace.id as string;

    const checklistUpdate = await app.inject({
      method: "POST",
      url: `/workflows/loan-readiness/${workspaceId}/checklist`,
      headers: { cookie },
      payload: {
        checklistItems: [
          { key: "financial_statements", completed: true },
          { key: "gst_references", completed: true },
          { key: "kyc_documents", completed: true }
        ],
        riskFlags: []
      }
    });

    expect(checklistUpdate.statusCode).toBe(200);
    expect(checklistUpdate.json().workspace.checklistProgress).toBe(100);

    const exportStart = await app.inject({
      method: "POST",
      url: `/workflows/loan-readiness/${workspaceId}/export-start`,
      headers: { cookie }
    });

    expect(exportStart.statusCode).toBe(200);
    expect(exportStart.json().workflowStatus).toBe("awaiting_approval");

    const executionId = exportStart.json().executionId as string;

    const exportApprove = await app.inject({
      method: "POST",
      url: `/workflows/loan-readiness/${executionId}/approve-export`,
      headers: { cookie },
      payload: {
        approved: true
      }
    });

    expect(exportApprove.statusCode).toBe(200);
    expect(exportApprove.json().workflowStatus).toBe("completed");
    expect(exportApprove.json().workspace.status).toBe("submitted");

    const workspaceDetails = await app.inject({
      method: "GET",
      url: `/workflows/loan-readiness/${workspaceId}`,
      headers: { cookie }
    });

    expect(workspaceDetails.statusCode).toBe(200);
    expect(workspaceDetails.json().workspace.exportSnapshotPath).toContain(workspaceId);

    await app.close();
  });

  it("rejects unauthenticated loan-readiness workspace creation", async () => {
    const app = buildServer();

    const response = await app.inject({
      method: "POST",
      url: "/workflows/loan-readiness/create",
      payload: {
        name: "Unauthenticated workspace"
      }
    });

    expect(response.statusCode).toBe(401);

    await app.close();
  });
});
