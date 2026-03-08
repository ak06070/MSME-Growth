import { randomUUID } from "node:crypto";
import type {
  NotificationApprovalDecision,
  NotificationDeliveryAttempt,
  NotificationRecordV2,
  NotificationTemplate
} from "@msme/types";
import type { PlatformPersistence } from "../persistence/platform-persistence";

export class InMemoryNotificationStore {
  private readonly templates = new Map<string, NotificationTemplate>();
  private readonly notifications = new Map<string, NotificationRecordV2>();
  private readonly approvals = new Map<string, NotificationApprovalDecision>();
  private readonly attempts = new Map<string, NotificationDeliveryAttempt[]>();

  constructor(private readonly persistence?: PlatformPersistence) {}

  upsertTemplate(input: Omit<NotificationTemplate, "id" | "createdAt" | "updatedAt">): NotificationTemplate {
    const key = this.templateKey(
      input.tenantId,
      input.organizationId,
      input.channel,
      input.templateKey,
      input.version
    );
    const existing = this.templates.get(key);
    const timestamp = new Date().toISOString();

    const template: NotificationTemplate = {
      id: existing?.id ?? randomUUID(),
      ...input,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp
    };

    this.templates.set(key, template);
    void this.persistence?.saveNotificationTemplate(template).catch((error: unknown) => {
      const message =
        error instanceof Error ? error.message : "unknown_notification_template_persistence_error";
      process.stderr.write(`${message}\n`);
    });
    return template;
  }

  getTemplate(input: {
    tenantId: string;
    organizationId: string;
    channel: NotificationTemplate["channel"];
    templateKey: string;
    version?: number;
  }): NotificationTemplate | undefined {
    const direct = input.version
      ? this.templates.get(
          this.templateKey(
            input.tenantId,
            input.organizationId,
            input.channel,
            input.templateKey,
            input.version
          )
        )
      : undefined;

    if (direct) {
      return direct;
    }

    const candidates = [...this.templates.values()]
      .filter(
        (template) =>
          template.tenantId === input.tenantId &&
          template.organizationId === input.organizationId &&
          template.channel === input.channel &&
          template.templateKey === input.templateKey
      )
      .sort((left, right) => right.version - left.version);

    return candidates[0];
  }

  listTemplates(filters: {
    tenantId: string;
    organizationId: string;
    channel?: NotificationTemplate["channel"];
    templateKey?: string;
  }): NotificationTemplate[] {
    return [...this.templates.values()]
      .filter((template) => {
        if (template.tenantId !== filters.tenantId) {
          return false;
        }

        if (template.organizationId !== filters.organizationId) {
          return false;
        }

        if (filters.channel && template.channel !== filters.channel) {
          return false;
        }

        if (filters.templateKey && template.templateKey !== filters.templateKey) {
          return false;
        }

        return true;
      })
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  createNotification(
    input: Omit<
      NotificationRecordV2,
      "id" | "queuedAt" | "retryCount" | "retryEligible" | "approvalState"
    > & {
      approvalState?: NotificationRecordV2["approvalState"];
      retryCount?: number;
      retryEligible?: boolean;
      queuedAt?: string;
    }
  ): NotificationRecordV2 {
    const notification: NotificationRecordV2 = {
      id: randomUUID(),
      queuedAt: input.queuedAt ?? new Date().toISOString(),
      retryCount: input.retryCount ?? 0,
      retryEligible: input.retryEligible ?? false,
      approvalState: input.approvalState ?? "not_required",
      ...input
    };

    this.notifications.set(notification.id, notification);
    void this.persistence?.saveNotificationRecord(notification).catch((error: unknown) => {
      const message =
        error instanceof Error ? error.message : "unknown_notification_persistence_error";
      process.stderr.write(`${message}\n`);
    });
    return notification;
  }

  updateNotification(notification: NotificationRecordV2): NotificationRecordV2 {
    this.notifications.set(notification.id, notification);
    void this.persistence?.saveNotificationRecord(notification).catch((error: unknown) => {
      const message =
        error instanceof Error ? error.message : "unknown_notification_persistence_error";
      process.stderr.write(`${message}\n`);
    });
    return notification;
  }

  getNotification(notificationId: string): NotificationRecordV2 | undefined {
    return this.notifications.get(notificationId);
  }

  listNotifications(filters: {
    tenantId: string;
    organizationId: string;
    recipientRef?: string;
    channel?: NotificationRecordV2["channel"];
    status?: NotificationRecordV2["status"];
  }): NotificationRecordV2[] {
    return [...this.notifications.values()]
      .filter((notification) => {
        if (notification.tenantId !== filters.tenantId) {
          return false;
        }

        if (notification.organizationId !== filters.organizationId) {
          return false;
        }

        if (filters.recipientRef && notification.recipientRef !== filters.recipientRef) {
          return false;
        }

        if (filters.channel && notification.channel !== filters.channel) {
          return false;
        }

        if (filters.status && notification.status !== filters.status) {
          return false;
        }

        return true;
      })
      .sort((left, right) => right.queuedAt.localeCompare(left.queuedAt));
  }

  upsertApproval(input: Omit<NotificationApprovalDecision, "id" | "requestedAt">): NotificationApprovalDecision {
    const existing = this.approvals.get(input.notificationId);

    const approval: NotificationApprovalDecision = {
      id: existing?.id ?? randomUUID(),
      notificationId: input.notificationId,
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      actorId: input.actorId,
      decision: input.decision,
      rationale: input.rationale,
      requestedAt: existing?.requestedAt ?? new Date().toISOString(),
      decidedAt: input.decidedAt
    };

    this.approvals.set(input.notificationId, approval);
    void this.persistence?.saveNotificationApproval(approval).catch((error: unknown) => {
      const message =
        error instanceof Error ? error.message : "unknown_notification_approval_persistence_error";
      process.stderr.write(`${message}\n`);
    });
    return approval;
  }

  getApproval(notificationId: string): NotificationApprovalDecision | undefined {
    return this.approvals.get(notificationId);
  }

  addAttempt(
    input: Omit<NotificationDeliveryAttempt, "id" | "timestamp">
  ): NotificationDeliveryAttempt {
    const attempt: NotificationDeliveryAttempt = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      ...input
    };

    const existing = this.attempts.get(input.notificationId) ?? [];
    existing.push(attempt);
    this.attempts.set(input.notificationId, existing);
    void this.persistence?.saveNotificationAttempt(attempt).catch((error: unknown) => {
      const message =
        error instanceof Error ? error.message : "unknown_notification_attempt_persistence_error";
      process.stderr.write(`${message}\n`);
    });

    return attempt;
  }

  listAttempts(notificationId: string): NotificationDeliveryAttempt[] {
    return [...(this.attempts.get(notificationId) ?? [])].sort((left, right) =>
      left.timestamp.localeCompare(right.timestamp)
    );
  }

  private templateKey(
    tenantId: string,
    organizationId: string,
    channel: NotificationTemplate["channel"],
    templateKey: string,
    version: number
  ): string {
    return [tenantId, organizationId, channel, templateKey, String(version)].join(":");
  }
}
