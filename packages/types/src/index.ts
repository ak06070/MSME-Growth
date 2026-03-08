export type TenantId = string;
export type OrganizationId = string;
export type ActorId = string;

export interface TenantContext {
  tenantId: TenantId;
  organizationId: OrganizationId;
  actorId?: ActorId;
  correlationId?: string;
}

export type UserStatus = "invited" | "active" | "suspended" | "deactivated";
export type TenantStatus = "active" | "inactive";
export type RoleKey =
  | "owner"
  | "finance_manager"
  | "accountant"
  | "collections_agent"
  | "auditor"
  | "admin";
export type PermissionKey =
  | "users:invite"
  | "users:read"
  | "users:update"
  | "users:suspend"
  | "roles:assign"
  | "audit:read";

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Tenant {
  id: TenantId;
  name: string;
  status: TenantStatus;
  createdAt?: string;
  updatedAt?: string;
}

export interface Organization {
  id: OrganizationId;
  tenantId: TenantId;
  name: string;
  legalName?: string;
  gstin?: string;
  status?: TenantStatus;
  createdAt?: string;
  updatedAt?: string;
}

export interface Membership {
  id: string;
  userId: string;
  tenantId: TenantId;
  organizationId: OrganizationId;
  roles: RoleKey[];
  isActive: boolean;
}

export interface SessionRecord {
  id: string;
  userId: string;
  tenantId: TenantId;
  organizationId: OrganizationId;
  expiresAt: string;
  revokedAt?: string;
}

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "admin"
  | "login"
  | "logout"
  | "access_denied";

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

export * from "./core-domain";
export * from "./core-domain.fixtures";
export * from "./core-domain.schemas";
export * from "./core-domain.validators";
export * from "./notifications";
