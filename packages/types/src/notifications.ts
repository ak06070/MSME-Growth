import type { OrganizationId, TenantId } from "./index";

export type NotificationChannel = "in_app" | "email" | "whatsapp";
export type NotificationDeliveryStatus = "queued" | "sent" | "failed" | "dismissed";

export interface NotificationTemplate {
  id: string;
  tenantId: TenantId;
  organizationId: OrganizationId;
  channel: NotificationChannel;
  templateKey: string;
  version: number;
  subject?: string;
  body: string;
  allowedVariables: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationRecordV2 {
  id: string;
  tenantId: TenantId;
  organizationId: OrganizationId;
  channel: NotificationChannel;
  templateKey: string;
  templateVersion: number;
  recipientRef: string;
  variables: Record<string, string | number | boolean | null>;
  correlationRef?: string;
  workflowRef?: string;
  status: NotificationDeliveryStatus;
  requiresApproval: boolean;
  approvalState: "not_required" | "pending" | "approved" | "rejected";
  queuedAt: string;
  sentAt?: string;
  dismissedAt?: string;
  failureCode?: string;
  failureReason?: string;
  retryEligible: boolean;
  retryCount: number;
  nextRetryAt?: string;
}

export interface NotificationDeliveryAttempt {
  id: string;
  notificationId: string;
  tenantId: TenantId;
  organizationId: OrganizationId;
  channel: NotificationChannel;
  attemptNumber: number;
  status: "sent" | "failed";
  providerResponseRef?: string;
  failureCode?: string;
  failureReason?: string;
  timestamp: string;
}

export interface NotificationApprovalDecision {
  id: string;
  notificationId: string;
  tenantId: TenantId;
  organizationId: OrganizationId;
  actorId?: string;
  decision: "pending" | "approved" | "rejected";
  rationale?: string;
  requestedAt: string;
  decidedAt?: string;
}
