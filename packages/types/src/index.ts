export type TenantId = string;
export type OrganizationId = string;
export type ActorId = string;

export interface TenantContext {
  tenantId: TenantId;
  organizationId: OrganizationId;
  actorId?: ActorId;
  correlationId?: string;
}

export type AuditAction = "create" | "update" | "delete" | "admin";

export interface AuditEvent {
  actorId?: string;
  tenantId: TenantId;
  organizationId?: OrganizationId;
  action: AuditAction;
  resourceType: string;
  resourceId?: string;
  outcome: "success" | "failure";
  timestamp: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface AuditLogger {
  log(event: AuditEvent): Promise<void>;
}

export interface LogContext {
  tenantId?: TenantId;
  organizationId?: OrganizationId;
  correlationId?: string;
  [key: string]: unknown;
}

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  child(context: LogContext): Logger;
}

export interface FeatureFlagProvider {
  isEnabled(flagKey: string, context: TenantContext): boolean;
}

export interface ObservabilityHooks {
  recordMetric(name: string, value: number, tags?: Record<string, string>): void;
  recordSpan(name: string, metadata?: Record<string, string>): void;
}

export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    statusCode = 500,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}
