import cookie from "@fastify/cookie";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import type { PermissionKey, RoleKey, UserStatus } from "@msme/types";
import { InMemoryWorkflowStore, WorkflowEngine, WorkflowRegistry } from "@msme/workflows";
import { InMemoryAuditLogger } from "./audit";
import { InMemoryAuthStore, type AuthContext } from "./auth-store";
import { loadApiEnv } from "./env";
import { InMemoryInvoiceDomainStore } from "./ingestion/invoice-domain-store";
import { InvoiceIngestionService } from "./ingestion/invoice-ingestion-service";
import { createLogger } from "./logger";
import { noopObservabilityHooks } from "./observability";
import {
  COLLECTIONS_APPROVAL_STEP_ID,
  COLLECTIONS_WORKFLOW_TYPE,
  createCollectionsFollowupWorkflowDefinition,
  isCollectionsWorkflowRoleAllowed
} from "./workflows/collections-followup";

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
  }
}

export interface ServerDeps {
  auditLogger?: InMemoryAuditLogger;
  authStore?: InMemoryAuthStore;
  invoiceDomainStore?: InMemoryInvoiceDomainStore;
  workflowStore?: InMemoryWorkflowStore;
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
  const auditLogger = deps.auditLogger ?? new InMemoryAuditLogger();
  const authStore = deps.authStore ?? new InMemoryAuthStore();
  const invoiceDomainStore = deps.invoiceDomainStore ?? new InMemoryInvoiceDomainStore();
  const workflowStore = deps.workflowStore ?? new InMemoryWorkflowStore();
  const invoiceIngestionService = new InvoiceIngestionService(invoiceDomainStore, auditLogger);
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

  const app = Fastify({ logger: false });

  void app.register(cookie, {
    secret: env.sessionSecret,
    hook: "onRequest"
  });

  const requireAuth = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.authContext || !request.sessionId) {
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

  app.addHook("onRequest", async (request, reply) => {
    const correlationId = request.headers["x-correlation-id"]?.toString() ?? randomUUID();
    reply.header("x-correlation-id", correlationId);

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
      }
    }
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

  app.post("/auth/login", async (request, reply) => {
    const body = request.body as { email?: string; password?: string };

    if (!body?.email || !body?.password) {
      return reply.status(400).send({ error: "INVALID_LOGIN_PAYLOAD" });
    }

    const authResult = authStore.authenticate(body.email, body.password);

    if (!authResult.ok) {
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

    return reply.status(200).send(result);
  });

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
