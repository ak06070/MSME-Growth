import cookie from "@fastify/cookie";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { AppError, type PermissionKey, type RoleKey, type UserStatus } from "@msme/types";
import { InMemoryWorkflowStore, WorkflowEngine, WorkflowRegistry } from "@msme/workflows";
import { InMemoryAuditLogger } from "./audit";
import { HmacTokenAuthProvider } from "./auth-provider";
import { InMemoryAuthStore, type AuthContext } from "./auth-store";
import { loadApiEnv } from "./env";
import { InMemoryConnectorRunStore } from "./ingestion/connector-run-store";
import { InMemoryInvoiceDomainStore } from "./ingestion/invoice-domain-store";
import { InvoiceIngestionService } from "./ingestion/invoice-ingestion-service";
import { createLogger } from "./logger";
import { NotificationService } from "./notifications/notification-service";
import { InMemoryNotificationStore } from "./notifications/notification-store";
import { noopObservabilityHooks } from "./observability";
import { PilotMetricsRegistry } from "./ops/pilot-metrics";
import { createPlatformPersistence } from "./persistence/platform-persistence";
import {
  COLLECTIONS_APPROVAL_STEP_ID,
  COLLECTIONS_WORKFLOW_TYPE,
  createCollectionsFollowupWorkflowDefinition,
  isCollectionsWorkflowRoleAllowed
} from "./workflows/collections-followup";
import {
  CASHFLOW_APPROVAL_STEP_ID,
  CASHFLOW_WORKFLOW_TYPE,
  buildCashflowSummary,
  createCashflowSummaryWorkflowDefinition,
  isCashflowWorkflowRoleAllowed
} from "./workflows/cashflow-summary";
import { InMemoryCashflowSummaryStore } from "./workflows/cashflow-summary-store";
import {
  LOAN_READINESS_APPROVAL_STEP_ID,
  LOAN_READINESS_WORKFLOW_TYPE,
  createLoanReadinessWorkflowDefinition,
  isLoanReadinessRoleAllowed
} from "./workflows/loan-readiness";
import { InMemoryLoanReadinessStore } from "./workflows/loan-readiness-store";

const SESSION_COOKIE = "session_token";
const SESSION_COOKIE_MAX_AGE_SECONDS = 8 * 60 * 60;

const validRoles: RoleKey[] = [
  "owner",
  "finance_manager",
  "accountant",
  "collections_agent",
  "auditor",
  "admin"
];
const validStatuses: UserStatus[] = ["invited", "active", "suspended", "deactivated"];

declare module "fastify" {
  interface FastifyRequest {
    authContext?: AuthContext;
    sessionId?: string;
    requestStartedAtMs?: number;
  }
}

export interface ServerDeps {
  auditLogger?: InMemoryAuditLogger;
  authStore?: InMemoryAuthStore;
  invoiceDomainStore?: InMemoryInvoiceDomainStore;
  connectorRunStore?: InMemoryConnectorRunStore;
  notificationService?: NotificationService;
  workflowStore?: InMemoryWorkflowStore;
  cashflowSummaryStore?: InMemoryCashflowSummaryStore;
  loanReadinessStore?: InMemoryLoanReadinessStore;
}

const resolveSessionId = (request: FastifyRequest): string | null => {
  const cookieValue = request.cookies[SESSION_COOKIE];

  if (!cookieValue) {
    return null;
  }

  const unsigned = request.unsignCookie(cookieValue);

  if (!unsigned.valid) {
    return null;
  }

  return unsigned.value;
};

const resolveBearerToken = (request: FastifyRequest): string | null => {
  const authorization = request.headers.authorization;

  if (!authorization) {
    return null;
  }

  if (!authorization.startsWith("Bearer ")) {
    return null;
  }

  const token = authorization.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
};

const ensureTenantScope = (
  context: AuthContext,
  tenantId: string,
  organizationId: string
): boolean => {
  return (
    context.membership.tenantId === tenantId && context.membership.organizationId === organizationId
  );
};

const isValidRole = (value: string): value is RoleKey => {
  return validRoles.includes(value as RoleKey);
};

const isValidStatus = (value: string): value is UserStatus => {
  return validStatuses.includes(value as UserStatus);
};

export const buildServer = (deps: ServerDeps = {}): FastifyInstance => {
  const env = loadApiEnv();
  const logger = createLogger();
  const pilotMetrics = new PilotMetricsRegistry();
  const platformPersistence = createPlatformPersistence(env.databaseUrl);
  const auditLogger = deps.auditLogger ?? new InMemoryAuditLogger(platformPersistence);
  const authStore = deps.authStore ?? new InMemoryAuthStore();
  const tokenAuthProvider = new HmacTokenAuthProvider(authStore, env.authTokenSecret);
  const invoiceDomainStore = deps.invoiceDomainStore ?? new InMemoryInvoiceDomainStore();
  const connectorRunStore = deps.connectorRunStore ?? new InMemoryConnectorRunStore(platformPersistence);
  const notificationService =
    deps.notificationService ??
    new NotificationService({
      auditLogger,
      store: new InMemoryNotificationStore(platformPersistence),
      providerUrls: {
        emailWebhookUrl: env.notificationEmailWebhookUrl,
        whatsappWebhookUrl: env.notificationWhatsappWebhookUrl
      },
      config: {
        maxAttempts: env.notificationMaxAttempts,
        retryDelayMs: env.notificationRetryDelayMs
      }
    });
  const workflowStore = deps.workflowStore ?? new InMemoryWorkflowStore();
  const cashflowSummaryStore = deps.cashflowSummaryStore ?? new InMemoryCashflowSummaryStore();
  const loanReadinessStore = deps.loanReadinessStore ?? new InMemoryLoanReadinessStore();
  const invoiceIngestionService = new InvoiceIngestionService(
    invoiceDomainStore,
    auditLogger,
    connectorRunStore
  );
  const workflowRegistry = new WorkflowRegistry();
  const workflowEngine = new WorkflowEngine(workflowRegistry, workflowStore, async (event) => {
    await auditLogger.log({
      action: "admin",
      actorId: "workflow_engine",
      tenantId: event.tenantId,
      organizationId: event.organizationId,
      resourceType: "workflow_event",
      resourceId: event.workflowExecutionId,
      outcome: "success",
      timestamp: event.timestamp,
      metadata: {
        eventType: event.eventType
      }
    });
  });

  workflowEngine.registerWorkflow(createCollectionsFollowupWorkflowDefinition());
  workflowEngine.registerWorkflow(createCashflowSummaryWorkflowDefinition());
  workflowEngine.registerWorkflow(createLoanReadinessWorkflowDefinition());

  const app = Fastify({
    logger: false,
    bodyLimit: 2 * 1024 * 1024
  });

  void app.register(cookie, {
    secret: env.sessionSecret,
    hook: "onRequest"
  });

  app.addHook("onClose", async () => {
    await platformPersistence.close();
  });

  const requireAuth = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.authContext || !request.sessionId) {
      pilotMetrics.recordAuthOutcome(false);
      await auditLogger.log({
        action: "access_denied",
        actorId: "anonymous",
        tenantId: "unknown",
        resourceType: "auth",
        resourceId: request.url,
        outcome: "failure",
        timestamp: new Date().toISOString(),
        metadata: {
          reason: "missing_or_invalid_session"
        }
      });

      return reply.status(401).send({ error: "UNAUTHENTICATED" });
    }
  };

  const requirePermission =
    (permission: PermissionKey) =>
    async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      if (!request.authContext || !request.sessionId) {
        return requireAuth(request, reply);
      }

      if (!request.authContext.permissions.includes(permission)) {
        await auditLogger.log({
          action: "access_denied",
          actorId: request.authContext.user.id,
          tenantId: request.authContext.membership.tenantId,
          organizationId: request.authContext.membership.organizationId,
          resourceType: "permission",
          resourceId: permission,
          outcome: "failure",
          timestamp: new Date().toISOString(),
          metadata: {
            route: request.url,
            method: request.method
          }
        });

        return reply.status(403).send({ error: "FORBIDDEN" });
      }
    };

  const requireCollectionsWorkflowAccess = async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> => {
    if (!request.authContext || !request.sessionId) {
      return requireAuth(request, reply);
    }

    if (!isCollectionsWorkflowRoleAllowed(request.authContext.membership.roles)) {
      return reply.status(403).send({ error: "FORBIDDEN" });
    }
  };

  const requireCashflowWorkflowAccess = async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> => {
    if (!request.authContext || !request.sessionId) {
      return requireAuth(request, reply);
    }

    if (!isCashflowWorkflowRoleAllowed(request.authContext.membership.roles)) {
      return reply.status(403).send({ error: "FORBIDDEN" });
    }
  };

  const requireLoanReadinessAccess = async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> => {
    if (!request.authContext || !request.sessionId) {
      return requireAuth(request, reply);
    }

    if (!isLoanReadinessRoleAllowed(request.authContext.membership.roles)) {
      return reply.status(403).send({ error: "FORBIDDEN" });
    }
  };

  app.addHook("onRequest", async (request, reply) => {
    request.requestStartedAtMs = Date.now();
    const correlationId = request.headers["x-correlation-id"]?.toString() ?? randomUUID();
    reply.header("x-correlation-id", correlationId);
    reply.header("x-content-type-options", "nosniff");
    reply.header("x-frame-options", "DENY");
    reply.header("referrer-policy", "no-referrer");
    reply.header("content-security-policy", "default-src 'self'");

    if (env.nodeEnv === "production") {
      reply.header("strict-transport-security", "max-age=15552000; includeSubDomains");
    }

    logger.info("incoming_request", {
      correlationId,
      method: request.method,
      route: request.url
    });

    noopObservabilityHooks.recordMetric("http.request.count", 1, {
      method: request.method,
      route: request.url
    });

    const sessionId = resolveSessionId(request);

    if (sessionId) {
      const authContext = authStore.resolveAuthContext(sessionId);
      if (authContext) {
        request.sessionId = sessionId;
        request.authContext = authContext;
        pilotMetrics.recordAuthOutcome(true);
      }
    }

    if (!request.authContext) {
      const bearerToken = resolveBearerToken(request);

      if (bearerToken) {
        const tokenContext = tokenAuthProvider.resolveAuthContext(bearerToken);

        if (tokenContext) {
          request.sessionId = tokenContext.session.id;
          request.authContext = tokenContext;
          pilotMetrics.recordAuthOutcome(true);
        }
      }
    }
  });

  app.addHook("onResponse", async (request, reply) => {
    const startedAt = request.requestStartedAtMs ?? Date.now();
    const durationMs = Date.now() - startedAt;
    const route = request.routeOptions.url ?? request.url;

    pilotMetrics.recordHttpRequest({
      method: request.method,
      route,
      statusCode: reply.statusCode,
      durationMs
    });
  });

  app.get("/health", async (request) => {
    return {
      status: "ok",
      service: "@msme/api",
      nodeEnv: env.nodeEnv,
      tenantHeaderSeen: Boolean(request.headers["x-tenant-id"]),
      timestamp: new Date().toISOString()
    };
  });

  app.get("/ops/metrics", { preHandler: requirePermission("audit:read") }, async (request, reply) => {
    const context = request.authContext;

    if (!context) {
      return reply.status(401).send({ error: "UNAUTHENTICATED" });
    }

    return reply.status(200).send({
      tenantId: context.membership.tenantId,
      organizationId: context.membership.organizationId,
      dashboard: pilotMetrics.snapshot()
    });
  });

  app.get("/ops/slo", { preHandler: requirePermission("audit:read") }, async (request, reply) => {
    const context = request.authContext;

    if (!context) {
      return reply.status(401).send({ error: "UNAUTHENTICATED" });
    }

    return reply.status(200).send({
      tenantId: context.membership.tenantId,
      organizationId: context.membership.organizationId,
      slo: pilotMetrics.sloSnapshot()
    });
  });

  app.post("/auth/login", async (request, reply) => {
    const body = request.body as { email?: string; password?: string };

    if (!body?.email || !body?.password) {
      return reply.status(400).send({ error: "INVALID_LOGIN_PAYLOAD" });
    }

    const authResult = authStore.authenticate(body.email, body.password);

    if (!authResult.ok) {
      pilotMetrics.recordAuthOutcome(false);
      await auditLogger.log({
        action: "login",
        actorId: body.email,
        tenantId: "unknown",
        resourceType: "auth",
        resourceId: "login",
        outcome: "failure",
        timestamp: new Date().toISOString(),
        metadata: {
          reason: authResult.reason
        }
      });

      const statusCode = authResult.reason === "inactive_user" ? 423 : 401;
      const errorCode = authResult.reason === "inactive_user" ? "USER_INACTIVE" : "INVALID_CREDENTIALS";
      return reply.status(statusCode).send({ error: errorCode });
    }

    const session = authStore.createSession(authResult.user, authResult.membership);
    pilotMetrics.recordAuthOutcome(true);

    reply.setCookie(SESSION_COOKIE, session.id, {
      path: "/",
      httpOnly: true,
      sameSite: "strict",
      secure: env.nodeEnv === "production",
      signed: true,
      maxAge: SESSION_COOKIE_MAX_AGE_SECONDS
    });

    await auditLogger.log({
      action: "login",
      actorId: authResult.user.id,
      tenantId: authResult.membership.tenantId,
      organizationId: authResult.membership.organizationId,
      resourceType: "auth",
      resourceId: "login",
      outcome: "success",
      timestamp: new Date().toISOString()
    });

    return reply.status(200).send({
      userId: authResult.user.id,
      activeTenantId: authResult.membership.tenantId,
      activeOrganizationId: authResult.membership.organizationId,
      roles: authResult.membership.roles
    });
  });

  app.post("/auth/logout", { preHandler: requireAuth }, async (request, reply) => {
    const context = request.authContext;

    if (!context || !request.sessionId) {
      return reply.status(401).send({ error: "UNAUTHENTICATED" });
    }

    authStore.revokeSession(request.sessionId);
    reply.clearCookie(SESSION_COOKIE, {
      path: "/",
      httpOnly: true,
      sameSite: "strict",
      secure: env.nodeEnv === "production",
      signed: true
    });

    await auditLogger.log({
      action: "logout",
      actorId: context.user.id,
      tenantId: context.membership.tenantId,
      organizationId: context.membership.organizationId,
      resourceType: "auth",
      resourceId: "logout",
      outcome: "success",
      timestamp: new Date().toISOString()
    });

    return reply.status(204).send();
  });

  app.get("/auth/session", { preHandler: requireAuth }, async (request, reply) => {
    const context = request.authContext;

    if (!context) {
      return reply.status(401).send({ error: "UNAUTHENTICATED" });
    }

    return reply.status(200).send({
      authenticated: true,
      userId: context.user.id,
      activeTenantId: context.membership.tenantId,
      activeOrganizationId: context.membership.organizationId,
      permissions: context.permissions
    });
  });

  app.post("/auth/token", { preHandler: requireAuth }, async (request, reply) => {
    const context = request.authContext;

    if (!context) {
      return reply.status(401).send({ error: "UNAUTHENTICATED" });
    }

    const token = tokenAuthProvider.issueToken({
      userId: context.user.id,
      tenantId: context.membership.tenantId,
      organizationId: context.membership.organizationId,
      roles: context.membership.roles
    });

    await auditLogger.log({
      action: "admin",
      actorId: context.user.id,
      tenantId: context.membership.tenantId,
      organizationId: context.membership.organizationId,
      resourceType: "auth_token",
      resourceId: context.user.id,
      outcome: "success",
      timestamp: new Date().toISOString()
    });

    return reply.status(200).send({
      token,
      tokenType: "Bearer"
    });
  });

  app.post("/ingestion/invoices/csv", { preHandler: requireAuth }, async (request, reply) => {
    const context = request.authContext;

    if (!context) {
      return reply.status(401).send({ error: "UNAUTHENTICATED" });
    }

    const body = request.body as { csvContent?: string; runLabel?: string };

    if (!body?.csvContent) {
      return reply.status(400).send({ error: "MISSING_CSV_CONTENT" });
    }

    const result = await invoiceIngestionService.ingestCsv({
      actorId: context.user.id,
      tenantId: context.membership.tenantId,
      organizationId: context.membership.organizationId,
      csvContent: body.csvContent,
      runLabel: body.runLabel
    });

    pilotMetrics.recordIngestionOutcome({
      connectorType: result.connectorType,
      status: result.status,
      totalRows: result.summary.totalRows,
      failedRows: result.summary.failedRows
    });

    return reply.status(200).send(result);
  });

  app.post("/ingestion/invoices/manual", { preHandler: requireAuth }, async (request, reply) => {
    const context = request.authContext;

    if (!context) {
      return reply.status(401).send({ error: "UNAUTHENTICATED" });
    }

    const body = request.body as {
      invoices?: Array<{
        invoiceNumber: string;
        invoiceDate: string;
        dueDate: string;
        customerExternalCode?: string;
        customerName: string;
        subtotalAmount: number;
        taxAmount: number;
        totalAmount: number;
        currency: string;
        sourceReference?: string;
      }>;
      runLabel?: string;
      allowUpsert?: boolean;
    };

    if (!Array.isArray(body?.invoices) || body.invoices.length === 0) {
      return reply.status(400).send({ error: "MISSING_MANUAL_INVOICE_PAYLOAD" });
    }

    const result = await invoiceIngestionService.ingestManual({
      actorId: context.user.id,
      tenantId: context.membership.tenantId,
      organizationId: context.membership.organizationId,
      invoices: body.invoices,
      runLabel: body.runLabel,
      allowUpsert: body.allowUpsert
    });

    pilotMetrics.recordIngestionOutcome({
      connectorType: result.connectorType,
      status: result.status,
      totalRows: result.summary.totalRows,
      failedRows: result.summary.failedRows
    });

    return reply.status(200).send(result);
  });

  app.get("/ingestion/runs", { preHandler: requireAuth }, async (request, reply) => {
    const context = request.authContext;
    const query = request.query as {
      connectorType?: string;
    };

    if (!context) {
      return reply.status(401).send({ error: "UNAUTHENTICATED" });
    }

    const items = invoiceIngestionService.listConnectorRuns({
      tenantId: context.membership.tenantId,
      organizationId: context.membership.organizationId,
      connectorType: query.connectorType
    });

    return reply.status(200).send({ items });
  });

  app.post(
    "/notifications/templates",
    { preHandler: requirePermission("users:update") },
    async (request, reply) => {
      const context = request.authContext;
      const body = request.body as {
        channel?: "in_app" | "email" | "whatsapp";
        templateKey?: string;
        version?: number;
        subject?: string;
        body?: string;
        allowedVariables?: string[];
      };

      if (!context) {
        return reply.status(401).send({ error: "UNAUTHENTICATED" });
      }

      if (!body?.channel || !body.templateKey || !body.version || !body.body) {
        return reply.status(400).send({ error: "INVALID_TEMPLATE_PAYLOAD" });
      }

      const template = notificationService.registerTemplate({
        actorId: context.user.id,
        tenantId: context.membership.tenantId,
        organizationId: context.membership.organizationId,
        channel: body.channel,
        templateKey: body.templateKey,
        version: body.version,
        subject: body.subject,
        body: body.body,
        allowedVariables: body.allowedVariables ?? []
      });

      return reply.status(201).send({ template });
    }
  );

  app.get("/notifications/templates", { preHandler: requireAuth }, async (request, reply) => {
    const context = request.authContext;
    const query = request.query as {
      channel?: "in_app" | "email" | "whatsapp";
      templateKey?: string;
    };

    if (!context) {
      return reply.status(401).send({ error: "UNAUTHENTICATED" });
    }

    const items = notificationService.listTemplates({
      tenantId: context.membership.tenantId,
      organizationId: context.membership.organizationId,
      channel: query.channel,
      templateKey: query.templateKey
    });

    return reply.status(200).send({ items });
  });

  app.post("/notifications", { preHandler: requireAuth }, async (request, reply) => {
    const context = request.authContext;
    const body = request.body as {
      channel?: "in_app" | "email" | "whatsapp";
      templateKey?: string;
      templateVersion?: number;
      recipientRef?: string;
      variables?: Record<string, string | number | boolean | null>;
      correlationRef?: string;
      workflowRef?: string;
      requiresApproval?: boolean;
      autoSend?: boolean;
    };

    if (!context) {
      return reply.status(401).send({ error: "UNAUTHENTICATED" });
    }

    if (!body?.channel || !body.templateKey || !body.recipientRef || !body.variables) {
      return reply.status(400).send({ error: "INVALID_NOTIFICATION_PAYLOAD" });
    }

    const notification = await notificationService.queueNotification({
      actorId: context.user.id,
      tenantId: context.membership.tenantId,
      organizationId: context.membership.organizationId,
      channel: body.channel,
      templateKey: body.templateKey,
      templateVersion: body.templateVersion,
      recipientRef: body.recipientRef,
      variables: body.variables,
      correlationRef: body.correlationRef,
      workflowRef: body.workflowRef,
      requiresApproval: body.requiresApproval,
      autoSend: body.autoSend
    });

    pilotMetrics.recordNotificationOutcome({
      channel: notification.channel,
      status: notification.status
    });

    return reply.status(201).send({ notification });
  });

  app.post(
    "/notifications/:notificationId/approve",
    { preHandler: requirePermission("users:update") },
    async (request, reply) => {
      const context = request.authContext;
      const params = request.params as { notificationId: string };
      const body = request.body as { approved?: boolean; rationale?: string };

      if (!context) {
        return reply.status(401).send({ error: "UNAUTHENTICATED" });
      }

      if (typeof body?.approved !== "boolean") {
        return reply.status(400).send({ error: "INVALID_APPROVAL_PAYLOAD" });
      }

      const approval = notificationService.approveNotification({
        actorId: context.user.id,
        tenantId: context.membership.tenantId,
        organizationId: context.membership.organizationId,
        notificationId: params.notificationId,
        approved: body.approved,
        rationale: body.rationale
      });

      return reply.status(200).send({ approval });
    }
  );

  app.post("/notifications/:notificationId/send", { preHandler: requireAuth }, async (request, reply) => {
    const context = request.authContext;
    const params = request.params as { notificationId: string };

    if (!context) {
      return reply.status(401).send({ error: "UNAUTHENTICATED" });
    }

    const delivery = await notificationService.sendNotification({
      actorId: context.user.id,
      tenantId: context.membership.tenantId,
      organizationId: context.membership.organizationId,
      notificationId: params.notificationId
    });

    pilotMetrics.recordNotificationOutcome({
      channel: delivery.notification.channel,
      status: delivery.notification.status
    });

    return reply.status(200).send(delivery);
  });

  app.post("/notifications/:notificationId/retry", { preHandler: requireAuth }, async (request, reply) => {
    const context = request.authContext;
    const params = request.params as { notificationId: string };

    if (!context) {
      return reply.status(401).send({ error: "UNAUTHENTICATED" });
    }

    const delivery = await notificationService.retryNotification({
      actorId: context.user.id,
      tenantId: context.membership.tenantId,
      organizationId: context.membership.organizationId,
      notificationId: params.notificationId
    });

    pilotMetrics.recordNotificationOutcome({
      channel: delivery.notification.channel,
      status: delivery.notification.status
    });

    return reply.status(200).send(delivery);
  });

  app.post(
    "/notifications/:notificationId/dismiss",
    { preHandler: requireAuth },
    async (request, reply) => {
      const context = request.authContext;
      const params = request.params as { notificationId: string };

      if (!context) {
        return reply.status(401).send({ error: "UNAUTHENTICATED" });
      }

      const notification = notificationService.dismissNotification({
        actorId: context.user.id,
        tenantId: context.membership.tenantId,
        organizationId: context.membership.organizationId,
        notificationId: params.notificationId
      });

      return reply.status(200).send({ notification });
    }
  );

  app.get("/notifications/inbox", { preHandler: requireAuth }, async (request, reply) => {
    const context = request.authContext;
    const query = request.query as { recipientRef?: string };

    if (!context) {
      return reply.status(401).send({ error: "UNAUTHENTICATED" });
    }

    const inbox = notificationService.listInbox({
      tenantId: context.membership.tenantId,
      organizationId: context.membership.organizationId,
      recipientRef: query.recipientRef ?? context.user.id
    });

    return reply.status(200).send(inbox);
  });

  app.get(
    "/notifications/:notificationId/attempts",
    { preHandler: requireAuth },
    async (request, reply) => {
      const context = request.authContext;
      const params = request.params as { notificationId: string };

      if (!context) {
        return reply.status(401).send({ error: "UNAUTHENTICATED" });
      }

      const items = notificationService.listAttempts({
        tenantId: context.membership.tenantId,
        organizationId: context.membership.organizationId,
        notificationId: params.notificationId
      });

      return reply.status(200).send({ items });
    }
  );

  app.post(
    "/workflows/collections-followup/start",
    { preHandler: requireCollectionsWorkflowAccess },
    async (request, reply) => {
      const context = request.authContext;

      if (!context) {
        return reply.status(401).send({ error: "UNAUTHENTICATED" });
      }

      const body = request.body as { triggerType?: "manual" | "scheduled" | "event" };
      const triggerType = body?.triggerType ?? "manual";
      const today = new Date();

      const overdueInvoices = invoiceDomainStore
        .listInvoices()
        .filter((invoice) => {
          if (
            invoice.tenantId !== context.membership.tenantId ||
            invoice.organizationId !== context.membership.organizationId
          ) {
            return false;
          }

          if (invoice.outstandingAmount <= 0) {
            return false;
          }

          return new Date(invoice.dueDate).getTime() < today.getTime();
        })
        .map((invoice) => ({
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          dueDate: invoice.dueDate,
          outstandingAmount: invoice.outstandingAmount,
          customerId: invoice.customerId
        }));

      const execution = await workflowEngine.startWorkflow({
        workflowType: COLLECTIONS_WORKFLOW_TYPE,
        tenantId: context.membership.tenantId,
        organizationId: context.membership.organizationId,
        triggerType,
        actorId: context.user.id,
        payload: {
          overdueInvoices
        }
      });

      await auditLogger.log({
        action: "admin",
        actorId: context.user.id,
        tenantId: context.membership.tenantId,
        organizationId: context.membership.organizationId,
        resourceType: "collections_followup_start",
        resourceId: execution.id,
        outcome: "success",
        timestamp: new Date().toISOString(),
        metadata: {
          overdueCount: overdueInvoices.length
        }
      });

      pilotMetrics.recordWorkflowOutcome(COLLECTIONS_WORKFLOW_TYPE, execution.status);

      return reply.status(200).send({
        executionId: execution.id,
        workflowStatus: execution.status,
        overdueCount: overdueInvoices.length
      });
    }
  );

  app.post(
    "/workflows/:executionId/approve",
    { preHandler: requireCollectionsWorkflowAccess },
    async (request, reply) => {
      const context = request.authContext;
      const params = request.params as { executionId: string };
      const body = request.body as { stepId?: string; approved?: boolean };

      if (!context) {
        return reply.status(401).send({ error: "UNAUTHENTICATED" });
      }

      const execution = workflowStore.getExecution(params.executionId);

      if (!execution) {
        return reply.status(404).send({ error: "WORKFLOW_NOT_FOUND" });
      }

      if (
        execution.tenantId !== context.membership.tenantId ||
        execution.organizationId !== context.membership.organizationId
      ) {
        return reply.status(403).send({ error: "FORBIDDEN_TENANT_SCOPE" });
      }

      const updated = await workflowEngine.decideApproval({
        executionId: params.executionId,
        stepId: body?.stepId ?? COLLECTIONS_APPROVAL_STEP_ID,
        actorId: context.user.id,
        approved: body?.approved ?? true
      });

      pilotMetrics.recordWorkflowOutcome(COLLECTIONS_WORKFLOW_TYPE, updated.status);

      return reply.status(200).send({
        executionId: updated.id,
        workflowStatus: updated.status
      });
    }
  );

  app.get(
    "/workflows/:executionId",
    { preHandler: requireCollectionsWorkflowAccess },
    async (request, reply) => {
      const context = request.authContext;
      const params = request.params as { executionId: string };

      if (!context) {
        return reply.status(401).send({ error: "UNAUTHENTICATED" });
      }

      const execution = workflowStore.getExecution(params.executionId);

      if (!execution) {
        return reply.status(404).send({ error: "WORKFLOW_NOT_FOUND" });
      }

      if (
        execution.tenantId !== context.membership.tenantId ||
        execution.organizationId !== context.membership.organizationId
      ) {
        return reply.status(403).send({ error: "FORBIDDEN_TENANT_SCOPE" });
      }

      return reply.status(200).send({
        execution,
        events: workflowStore.listEvents(execution.id)
      });
    }
  );

  app.post(
    "/workflows/cashflow-summary/generate",
    { preHandler: requireCashflowWorkflowAccess },
    async (request, reply) => {
      const context = request.authContext;
      const body = request.body as {
        triggerType?: "manual" | "scheduled" | "event";
        windowDays?: number;
      };

      if (!context) {
        return reply.status(401).send({ error: "UNAUTHENTICATED" });
      }

      const windowDays = body?.windowDays ?? 30;
      const snapshot = buildCashflowSummary({
        tenantId: context.membership.tenantId,
        organizationId: context.membership.organizationId,
        invoices: invoiceDomainStore.listInvoices(),
        windowDays,
        now: new Date(),
        snapshotId: randomUUID()
      });

      cashflowSummaryStore.save(snapshot);

      const execution = await workflowEngine.startWorkflow({
        workflowType: CASHFLOW_WORKFLOW_TYPE,
        tenantId: context.membership.tenantId,
        organizationId: context.membership.organizationId,
        triggerType: body?.triggerType ?? "manual",
        actorId: context.user.id,
        payload: {
          snapshot
        }
      });

      pilotMetrics.recordWorkflowOutcome(CASHFLOW_WORKFLOW_TYPE, execution.status);

      return reply.status(200).send({
        executionId: execution.id,
        workflowStatus: execution.status,
        snapshot
      });
    }
  );

  app.post(
    "/workflows/cashflow-summary/:executionId/approve",
    { preHandler: requireCashflowWorkflowAccess },
    async (request, reply) => {
      const context = request.authContext;
      const params = request.params as { executionId: string };
      const body = request.body as { stepId?: string; approved?: boolean };

      if (!context) {
        return reply.status(401).send({ error: "UNAUTHENTICATED" });
      }

      const execution = workflowStore.getExecution(params.executionId);

      if (!execution || execution.workflowType !== CASHFLOW_WORKFLOW_TYPE) {
        return reply.status(404).send({ error: "WORKFLOW_NOT_FOUND" });
      }

      if (
        execution.tenantId !== context.membership.tenantId ||
        execution.organizationId !== context.membership.organizationId
      ) {
        return reply.status(403).send({ error: "FORBIDDEN_TENANT_SCOPE" });
      }

      const updated = await workflowEngine.decideApproval({
        executionId: params.executionId,
        stepId: body?.stepId ?? CASHFLOW_APPROVAL_STEP_ID,
        actorId: context.user.id,
        approved: body?.approved ?? true
      });

      pilotMetrics.recordWorkflowOutcome(CASHFLOW_WORKFLOW_TYPE, updated.status);

      return reply.status(200).send({
        executionId: updated.id,
        workflowStatus: updated.status
      });
    }
  );

  app.get(
    "/workflows/cashflow-summary/:executionId",
    { preHandler: requireCashflowWorkflowAccess },
    async (request, reply) => {
      const context = request.authContext;
      const params = request.params as { executionId: string };

      if (!context) {
        return reply.status(401).send({ error: "UNAUTHENTICATED" });
      }

      const execution = workflowStore.getExecution(params.executionId);

      if (!execution || execution.workflowType !== CASHFLOW_WORKFLOW_TYPE) {
        return reply.status(404).send({ error: "WORKFLOW_NOT_FOUND" });
      }

      if (
        execution.tenantId !== context.membership.tenantId ||
        execution.organizationId !== context.membership.organizationId
      ) {
        return reply.status(403).send({ error: "FORBIDDEN_TENANT_SCOPE" });
      }

      const summarySnapshotId = execution.payload?.snapshot
        ? (execution.payload.snapshot as { id: string }).id
        : undefined;

      return reply.status(200).send({
        execution,
        events: workflowStore.listEvents(execution.id),
        snapshot: summarySnapshotId ? cashflowSummaryStore.get(summarySnapshotId) : null
      });
    }
  );

  app.post(
    "/workflows/loan-readiness/create",
    { preHandler: requireLoanReadinessAccess },
    async (request, reply) => {
      const context = request.authContext;
      const body = request.body as { name?: string };

      if (!context) {
        return reply.status(401).send({ error: "UNAUTHENTICATED" });
      }

      const workspace = loanReadinessStore.createWorkspace({
        tenantId: context.membership.tenantId,
        organizationId: context.membership.organizationId,
        name: body?.name ?? "Loan Readiness Workspace"
      });

      return reply.status(201).send({ workspace });
    }
  );

  app.post(
    "/workflows/loan-readiness/:workspaceId/checklist",
    { preHandler: requireLoanReadinessAccess },
    async (request, reply) => {
      const context = request.authContext;
      const params = request.params as { workspaceId: string };
      const body = request.body as {
        checklistItems?: Array<{ key: string; completed: boolean }>;
        riskFlags?: string[];
      };

      if (!context) {
        return reply.status(401).send({ error: "UNAUTHENTICATED" });
      }

      if (!body?.checklistItems || body.checklistItems.length === 0) {
        return reply.status(400).send({ error: "INVALID_CHECKLIST_PAYLOAD" });
      }

      const workspace = loanReadinessStore.getWorkspace(params.workspaceId);

      if (!workspace) {
        return reply.status(404).send({ error: "WORKSPACE_NOT_FOUND" });
      }

      if (
        workspace.tenantId !== context.membership.tenantId ||
        workspace.organizationId !== context.membership.organizationId
      ) {
        return reply.status(403).send({ error: "FORBIDDEN_TENANT_SCOPE" });
      }

      const updated = loanReadinessStore.updateChecklist({
        workspaceId: params.workspaceId,
        checklistItems: body.checklistItems,
        riskFlags: body.riskFlags
      });

      return reply.status(200).send({ workspace: updated });
    }
  );

  app.post(
    "/workflows/loan-readiness/:workspaceId/export-start",
    { preHandler: requireLoanReadinessAccess },
    async (request, reply) => {
      const context = request.authContext;
      const params = request.params as { workspaceId: string };

      if (!context) {
        return reply.status(401).send({ error: "UNAUTHENTICATED" });
      }

      const workspace = loanReadinessStore.getWorkspace(params.workspaceId);

      if (!workspace) {
        return reply.status(404).send({ error: "WORKSPACE_NOT_FOUND" });
      }

      if (
        workspace.tenantId !== context.membership.tenantId ||
        workspace.organizationId !== context.membership.organizationId
      ) {
        return reply.status(403).send({ error: "FORBIDDEN_TENANT_SCOPE" });
      }

      const execution = await workflowEngine.startWorkflow({
        workflowType: LOAN_READINESS_WORKFLOW_TYPE,
        tenantId: context.membership.tenantId,
        organizationId: context.membership.organizationId,
        triggerType: "manual",
        actorId: context.user.id,
        payload: {
          workspace
        }
      });

      pilotMetrics.recordWorkflowOutcome(LOAN_READINESS_WORKFLOW_TYPE, execution.status);

      return reply.status(200).send({
        executionId: execution.id,
        workflowStatus: execution.status,
        workspace
      });
    }
  );

  app.post(
    "/workflows/loan-readiness/:executionId/approve-export",
    { preHandler: requireLoanReadinessAccess },
    async (request, reply) => {
      const context = request.authContext;
      const params = request.params as { executionId: string };
      const body = request.body as { approved?: boolean; stepId?: string };

      if (!context) {
        return reply.status(401).send({ error: "UNAUTHENTICATED" });
      }

      const execution = workflowStore.getExecution(params.executionId);

      if (!execution || execution.workflowType !== LOAN_READINESS_WORKFLOW_TYPE) {
        return reply.status(404).send({ error: "WORKFLOW_NOT_FOUND" });
      }

      if (
        execution.tenantId !== context.membership.tenantId ||
        execution.organizationId !== context.membership.organizationId
      ) {
        return reply.status(403).send({ error: "FORBIDDEN_TENANT_SCOPE" });
      }

      const updated = await workflowEngine.decideApproval({
        executionId: params.executionId,
        stepId: body?.stepId ?? LOAN_READINESS_APPROVAL_STEP_ID,
        actorId: context.user.id,
        approved: body?.approved ?? true
      });

      pilotMetrics.recordWorkflowOutcome(LOAN_READINESS_WORKFLOW_TYPE, updated.status);

      const workspacePayload = updated.payload?.workspace as { id: string } | undefined;

      if (updated.status === "completed" && workspacePayload?.id) {
        loanReadinessStore.markExported({
          workspaceId: workspacePayload.id,
          exportSnapshotPath: `/exports/loan-readiness/${workspacePayload.id}.json`
        });
      }

      return reply.status(200).send({
        executionId: updated.id,
        workflowStatus: updated.status,
        workspace: workspacePayload?.id ? loanReadinessStore.getWorkspace(workspacePayload.id) : null
      });
    }
  );

  app.get(
    "/workflows/loan-readiness/:workspaceId",
    { preHandler: requireLoanReadinessAccess },
    async (request, reply) => {
      const context = request.authContext;
      const params = request.params as { workspaceId: string };

      if (!context) {
        return reply.status(401).send({ error: "UNAUTHENTICATED" });
      }

      const workspace = loanReadinessStore.getWorkspace(params.workspaceId);

      if (!workspace) {
        return reply.status(404).send({ error: "WORKSPACE_NOT_FOUND" });
      }

      if (
        workspace.tenantId !== context.membership.tenantId ||
        workspace.organizationId !== context.membership.organizationId
      ) {
        return reply.status(403).send({ error: "FORBIDDEN_TENANT_SCOPE" });
      }

      return reply.status(200).send({ workspace });
    }
  );

  app.post(
    "/admin/users/invite",
    { preHandler: requirePermission("users:invite") },
    async (request, reply) => {
      const context = request.authContext;

      if (!context) {
        return reply.status(401).send({ error: "UNAUTHENTICATED" });
      }

      const body = request.body as {
        email?: string;
        tenantId?: string;
        organizationId?: string;
        role?: string;
      };

      if (!body?.email || !body.tenantId || !body.organizationId || !body.role) {
        return reply.status(400).send({ error: "INVALID_INVITE_PAYLOAD" });
      }

      if (!isValidRole(body.role)) {
        return reply.status(400).send({ error: "INVALID_ROLE" });
      }

      if (!authStore.isKnownTenantOrg(body.tenantId, body.organizationId)) {
        return reply.status(400).send({ error: "UNKNOWN_TENANT_OR_ORG" });
      }

      if (!ensureTenantScope(context, body.tenantId, body.organizationId)) {
        await auditLogger.log({
          action: "access_denied",
          actorId: context.user.id,
          tenantId: context.membership.tenantId,
          organizationId: context.membership.organizationId,
          resourceType: "admin_invite",
          resourceId: body.email,
          outcome: "failure",
          timestamp: new Date().toISOString(),
          metadata: {
            reason: "cross_tenant_attempt"
          }
        });

        return reply.status(403).send({ error: "FORBIDDEN_TENANT_SCOPE" });
      }

      const invite = authStore.inviteUser({
        email: body.email,
        tenantId: body.tenantId,
        organizationId: body.organizationId,
        role: body.role
      });

      await auditLogger.log({
        action: "admin",
        actorId: context.user.id,
        tenantId: body.tenantId,
        organizationId: body.organizationId,
        resourceType: "user_invite",
        resourceId: invite.user.id,
        outcome: "success",
        timestamp: new Date().toISOString(),
        metadata: {
          role: body.role
        }
      });

      return reply.status(202).send({
        inviteId: invite.inviteId,
        status: "invited"
      });
    }
  );

  app.post(
    "/admin/users/:userId/roles",
    { preHandler: requirePermission("roles:assign") },
    async (request, reply) => {
      const context = request.authContext;
      const params = request.params as { userId: string };
      const body = request.body as {
        tenantId?: string;
        organizationId?: string;
        role?: string;
      };

      if (!context) {
        return reply.status(401).send({ error: "UNAUTHENTICATED" });
      }

      if (!body?.tenantId || !body.organizationId || !body.role) {
        return reply.status(400).send({ error: "INVALID_ROLE_ASSIGNMENT_PAYLOAD" });
      }

      if (!isValidRole(body.role)) {
        return reply.status(400).send({ error: "INVALID_ROLE" });
      }

      if (!ensureTenantScope(context, body.tenantId, body.organizationId)) {
        return reply.status(403).send({ error: "FORBIDDEN_TENANT_SCOPE" });
      }

      const membership = authStore.assignRole({
        userId: params.userId,
        tenantId: body.tenantId,
        organizationId: body.organizationId,
        role: body.role
      });

      if (!membership) {
        return reply.status(404).send({ error: "MEMBERSHIP_NOT_FOUND" });
      }

      await auditLogger.log({
        action: "update",
        actorId: context.user.id,
        tenantId: body.tenantId,
        organizationId: body.organizationId,
        resourceType: "membership_role",
        resourceId: membership.id,
        outcome: "success",
        timestamp: new Date().toISOString(),
        metadata: {
          role: body.role
        }
      });

      return reply.status(200).send({
        userId: membership.userId,
        tenantId: membership.tenantId,
        organizationId: membership.organizationId,
        roles: membership.roles
      });
    }
  );

  app.post(
    "/admin/users/:userId/status",
    { preHandler: requirePermission("users:suspend") },
    async (request, reply) => {
      const context = request.authContext;
      const params = request.params as { userId: string };
      const body = request.body as {
        tenantId?: string;
        organizationId?: string;
        status?: string;
      };

      if (!context) {
        return reply.status(401).send({ error: "UNAUTHENTICATED" });
      }

      if (!body?.tenantId || !body.organizationId || !body.status) {
        return reply.status(400).send({ error: "INVALID_STATUS_PAYLOAD" });
      }

      if (!isValidStatus(body.status)) {
        return reply.status(400).send({ error: "INVALID_USER_STATUS" });
      }

      if (!ensureTenantScope(context, body.tenantId, body.organizationId)) {
        return reply.status(403).send({ error: "FORBIDDEN_TENANT_SCOPE" });
      }

      const user = authStore.updateUserStatus({
        userId: params.userId,
        status: body.status
      });

      if (!user) {
        return reply.status(404).send({ error: "USER_NOT_FOUND" });
      }

      await auditLogger.log({
        action: "update",
        actorId: context.user.id,
        tenantId: body.tenantId,
        organizationId: body.organizationId,
        resourceType: "user_status",
        resourceId: user.id,
        outcome: "success",
        timestamp: new Date().toISOString(),
        metadata: {
          status: body.status
        }
      });

      return reply.status(200).send({
        userId: user.id,
        status: user.status
      });
    }
  );

  app.get(
    "/admin/audit-events",
    { preHandler: requirePermission("audit:read") },
    async (request, reply) => {
      const context = request.authContext;
      const query = request.query as {
        tenantId?: string;
        actorId?: string;
        action?: string;
      };

      if (!context) {
        return reply.status(401).send({ error: "UNAUTHENTICATED" });
      }

      if (query.tenantId && query.tenantId !== context.membership.tenantId) {
        return reply.status(403).send({ error: "FORBIDDEN_TENANT_SCOPE" });
      }

      const tenantId = query.tenantId ?? context.membership.tenantId;

      const events = auditLogger.getEvents().filter((event) => {
        if (event.tenantId !== tenantId) {
          return false;
        }

        if (query.actorId && event.actorId !== query.actorId) {
          return false;
        }

        if (query.action && event.action !== query.action) {
          return false;
        }

        return true;
      });

      return reply.status(200).send({
        items: events
      });
    }
  );

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: error.code,
        message: error.message,
        details: error.details
      });
    }

    const message = error instanceof Error ? error.message : "unknown_error";

    logger.error("request_failed", {
      message,
      route: request.url,
      method: request.method
    });

    return reply.status(500).send({
      error: "INTERNAL_SERVER_ERROR"
    });
  });

  return app;
};
