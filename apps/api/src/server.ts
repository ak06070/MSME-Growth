import Fastify, { type FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { loadApiEnv } from "./env";
import { createLogger } from "./logger";
import { InMemoryAuditLogger } from "./audit";
import { noopObservabilityHooks } from "./observability";

export interface ServerDeps {
  auditLogger?: InMemoryAuditLogger;
}

export const buildServer = (deps: ServerDeps = {}): FastifyInstance => {
  const env = loadApiEnv();
  const logger = createLogger();
  const auditLogger = deps.auditLogger ?? new InMemoryAuditLogger();

  const app = Fastify({
    logger: false
  });

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

  app.post("/foundation/audit-sample", async (request, reply) => {
    await auditLogger.log({
      action: "admin",
      actorId: "system",
      tenantId: request.headers["x-tenant-id"]?.toString() ?? "unknown",
      resourceType: "foundation-sample",
      resourceId: "audit-sample",
      outcome: "success",
      timestamp: new Date().toISOString(),
      metadata: {
        note: "foundation placeholder"
      }
    });

    return reply.status(202).send({ accepted: true });
  });

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
