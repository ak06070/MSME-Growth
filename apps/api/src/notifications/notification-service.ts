import { AppError, type AuditLogger } from "@msme/types";
import type {
  NotificationApprovalDecision,
  NotificationChannel,
  NotificationDeliveryAttempt,
  NotificationRecordV2,
  NotificationTemplate
} from "@msme/types";
import {
  ChannelDeliveryError,
  InAppNotificationAdapter,
  type NotificationChannelAdapter,
  WebhookNotificationAdapter
} from "./channel-adapters";
import { InMemoryNotificationStore } from "./notification-store";

const extractTemplatePlaceholders = (templateText: string): string[] => {
  const matches = templateText.matchAll(/{{\s*([a-zA-Z0-9_]+)\s*}}/g);
  const names = [...matches].map((match) => match[1] ?? "").filter(Boolean);
  return [...new Set(names)];
};

const normalizeVariables = (
  values: Record<string, string | number | boolean | null>
): Record<string, string> => {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, value === null ? "" : String(value)])
  );
};

interface NotificationServiceConfig {
  maxAttempts: number;
  retryDelayMs: number;
}

interface NotificationScope {
  tenantId: string;
  organizationId: string;
  actorId: string;
}

interface QueueNotificationInput extends NotificationScope {
  channel: NotificationChannel;
  templateKey: string;
  templateVersion?: number;
  recipientRef: string;
  variables: Record<string, string | number | boolean | null>;
  correlationRef?: string;
  workflowRef?: string;
  requiresApproval?: boolean;
  autoSend?: boolean;
}

interface SendNotificationInput extends NotificationScope {
  notificationId: string;
}

interface ApprovalInput extends NotificationScope {
  notificationId: string;
  approved: boolean;
  rationale?: string;
}

interface DismissInput extends NotificationScope {
  notificationId: string;
}

interface RegisterTemplateInput extends NotificationScope {
  channel: NotificationChannel;
  templateKey: string;
  version: number;
  subject?: string;
  body: string;
  allowedVariables: string[];
}

interface NotificationDeliveryOutcome {
  notification: NotificationRecordV2;
  attempt: NotificationDeliveryAttempt;
}

export interface NotificationServiceDeps {
  auditLogger: AuditLogger;
  store?: InMemoryNotificationStore;
  adapters?: NotificationChannelAdapter[];
  config?: Partial<NotificationServiceConfig>;
  providerUrls?: {
    emailWebhookUrl?: string;
    whatsappWebhookUrl?: string;
  };
}

export class NotificationService {
  private readonly store: InMemoryNotificationStore;
  private readonly adapters = new Map<NotificationChannel, NotificationChannelAdapter>();
  private readonly config: NotificationServiceConfig;

  constructor(private readonly deps: NotificationServiceDeps) {
    this.store = deps.store ?? new InMemoryNotificationStore();
    this.config = {
      maxAttempts: deps.config?.maxAttempts ?? 3,
      retryDelayMs: deps.config?.retryDelayMs ?? 60_000
    };

    const registeredAdapters =
      deps.adapters ??
      [
        new InAppNotificationAdapter(),
        new WebhookNotificationAdapter("email", deps.providerUrls?.emailWebhookUrl),
        new WebhookNotificationAdapter("whatsapp", deps.providerUrls?.whatsappWebhookUrl)
      ];

    for (const adapter of registeredAdapters) {
      this.adapters.set(adapter.channel, adapter);
    }
  }

  registerTemplate(input: RegisterTemplateInput): NotificationTemplate {
    if (input.version <= 0) {
      throw new AppError("INVALID_TEMPLATE_VERSION", "Template version must be greater than zero.", 400);
    }

    if (!input.templateKey.trim()) {
      throw new AppError("INVALID_TEMPLATE_KEY", "Template key is required.", 400);
    }

    if (!input.body.trim()) {
      throw new AppError("INVALID_TEMPLATE_BODY", "Template body is required.", 400);
    }

    const allowedVariables = [...new Set(input.allowedVariables.map((value) => value.trim()))].filter(
      Boolean
    );

    const placeholders = [
      ...extractTemplatePlaceholders(input.body),
      ...extractTemplatePlaceholders(input.subject ?? "")
    ];

    const missingAllowedVariables = placeholders.filter(
      (placeholder) => !allowedVariables.includes(placeholder)
    );

    if (missingAllowedVariables.length > 0) {
      throw new AppError(
        "INVALID_TEMPLATE_VARIABLES",
        `Missing allowed variable declarations: ${missingAllowedVariables.join(", ")}`,
        400
      );
    }

    const template = this.store.upsertTemplate({
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      channel: input.channel,
      templateKey: input.templateKey,
      version: input.version,
      subject: input.subject,
      body: input.body,
      allowedVariables,
      createdBy: input.actorId
    });

    void this.deps.auditLogger.log({
      action: "admin",
      actorId: input.actorId,
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      resourceType: "notification_template",
      resourceId: template.id,
      outcome: "success",
      timestamp: new Date().toISOString(),
      metadata: {
        channel: input.channel,
        templateKey: input.templateKey,
        version: input.version
      }
    });

    return template;
  }

  listTemplates(input: {
    tenantId: string;
    organizationId: string;
    channel?: NotificationChannel;
    templateKey?: string;
  }): NotificationTemplate[] {
    return this.store.listTemplates(input);
  }

  async queueNotification(input: QueueNotificationInput): Promise<NotificationRecordV2> {
    const template = this.requireTemplate({
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      channel: input.channel,
      templateKey: input.templateKey,
      version: input.templateVersion
    });

    this.validateTemplateVariables(template, input.variables);

    const requiresApproval = input.requiresApproval ?? input.channel !== "in_app";

    const notification = this.store.createNotification({
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      channel: input.channel,
      templateKey: template.templateKey,
      templateVersion: template.version,
      recipientRef: input.recipientRef,
      variables: input.variables,
      correlationRef: input.correlationRef,
      workflowRef: input.workflowRef,
      status: "queued",
      requiresApproval,
      approvalState: requiresApproval ? "pending" : "not_required"
    });

    if (requiresApproval) {
      this.store.upsertApproval({
        notificationId: notification.id,
        tenantId: notification.tenantId,
        organizationId: notification.organizationId,
        actorId: undefined,
        decision: "pending",
        rationale: undefined,
        decidedAt: undefined
      });
    }

    await this.deps.auditLogger.log({
      action: "admin",
      actorId: input.actorId,
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      resourceType: "notification",
      resourceId: notification.id,
      outcome: "success",
      timestamp: new Date().toISOString(),
      metadata: {
        channel: notification.channel,
        templateKey: notification.templateKey,
        requiresApproval,
        approvalState: notification.approvalState
      }
    });

    if ((input.autoSend ?? true) && notification.channel === "in_app" && !notification.requiresApproval) {
      const delivery = await this.sendNotification({
        notificationId: notification.id,
        actorId: input.actorId,
        tenantId: input.tenantId,
        organizationId: input.organizationId
      });

      return delivery.notification;
    }

    return notification;
  }

  approveNotification(input: ApprovalInput): NotificationApprovalDecision {
    const notification = this.requireNotification(input.notificationId);
    this.assertScope(notification, input);

    if (!notification.requiresApproval) {
      throw new AppError("APPROVAL_NOT_REQUIRED", "Notification does not require approval.", 409);
    }

    const decision: NotificationApprovalDecision = this.store.upsertApproval({
      notificationId: notification.id,
      tenantId: notification.tenantId,
      organizationId: notification.organizationId,
      actorId: input.actorId,
      decision: input.approved ? "approved" : "rejected",
      rationale: input.rationale,
      decidedAt: new Date().toISOString()
    });

    notification.approvalState = input.approved ? "approved" : "rejected";

    if (!input.approved) {
      notification.retryEligible = false;
      notification.nextRetryAt = undefined;
    }

    this.store.updateNotification(notification);

    void this.deps.auditLogger.log({
      action: "admin",
      actorId: input.actorId,
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      resourceType: "notification_approval",
      resourceId: notification.id,
      outcome: "success",
      timestamp: new Date().toISOString(),
      metadata: {
        approved: input.approved,
        rationale: input.rationale ?? ""
      }
    });

    return decision;
  }

  async sendNotification(input: SendNotificationInput): Promise<NotificationDeliveryOutcome> {
    const notification = this.requireNotification(input.notificationId);
    this.assertScope(notification, input);

    if (notification.status === "dismissed") {
      throw new AppError("NOTIFICATION_DISMISSED", "Dismissed notifications cannot be sent.", 409);
    }

    if (notification.requiresApproval && notification.approvalState !== "approved") {
      throw new AppError(
        "APPROVAL_REQUIRED",
        "Notification send requires an approved outbound decision.",
        409
      );
    }

    const template = this.requireTemplate({
      tenantId: notification.tenantId,
      organizationId: notification.organizationId,
      channel: notification.channel,
      templateKey: notification.templateKey,
      version: notification.templateVersion
    });

    this.validateTemplateVariables(template, notification.variables);

    const adapter = this.adapters.get(notification.channel);

    if (!adapter) {
      throw new AppError(
        "CHANNEL_ADAPTER_MISSING",
        `No adapter is configured for ${notification.channel}.`,
        500
      );
    }

    const attemptNumber = this.store.listAttempts(notification.id).length + 1;

    try {
      const rendered = this.renderTemplate(template, notification.variables);
      const result = await adapter.send({
        notification,
        template,
        rendered
      });

      const attempt = this.store.addAttempt({
        notificationId: notification.id,
        tenantId: notification.tenantId,
        organizationId: notification.organizationId,
        channel: notification.channel,
        attemptNumber,
        status: "sent",
        providerResponseRef: result.providerResponseRef
      });

      notification.status = "sent";
      notification.sentAt = attempt.timestamp;
      notification.failureCode = undefined;
      notification.failureReason = undefined;
      notification.nextRetryAt = undefined;
      notification.retryEligible = false;
      notification.retryCount = attemptNumber;
      this.store.updateNotification(notification);

      await this.deps.auditLogger.log({
        action: "admin",
        actorId: input.actorId,
        tenantId: notification.tenantId,
        organizationId: notification.organizationId,
        resourceType: "notification_delivery",
        resourceId: notification.id,
        outcome: "success",
        timestamp: attempt.timestamp,
        metadata: {
          channel: notification.channel,
          attemptNumber,
          providerResponseRef: result.providerResponseRef ?? ""
        }
      });

      return {
        notification,
        attempt
      };
    } catch (error) {
      const deliveryError = this.toDeliveryError(error);
      const retryEligible = deliveryError.retryable && attemptNumber < this.config.maxAttempts;
      const nextRetryAt = retryEligible
        ? new Date(Date.now() + this.config.retryDelayMs * attemptNumber).toISOString()
        : undefined;

      const attempt = this.store.addAttempt({
        notificationId: notification.id,
        tenantId: notification.tenantId,
        organizationId: notification.organizationId,
        channel: notification.channel,
        attemptNumber,
        status: "failed",
        failureCode: deliveryError.code,
        failureReason: deliveryError.message
      });

      notification.status = "failed";
      notification.failureCode = deliveryError.code;
      notification.failureReason = deliveryError.message;
      notification.retryEligible = retryEligible;
      notification.nextRetryAt = nextRetryAt;
      notification.retryCount = attemptNumber;
      this.store.updateNotification(notification);

      await this.deps.auditLogger.log({
        action: "admin",
        actorId: input.actorId,
        tenantId: notification.tenantId,
        organizationId: notification.organizationId,
        resourceType: "notification_delivery",
        resourceId: notification.id,
        outcome: "failure",
        timestamp: attempt.timestamp,
        metadata: {
          channel: notification.channel,
          attemptNumber,
          failureCode: deliveryError.code,
          retryEligible
        }
      });

      return {
        notification,
        attempt
      };
    }
  }

  async retryNotification(input: SendNotificationInput): Promise<NotificationDeliveryOutcome> {
    const notification = this.requireNotification(input.notificationId);
    this.assertScope(notification, input);

    if (notification.status !== "failed") {
      throw new AppError("RETRY_NOT_ALLOWED", "Only failed notifications can be retried.", 409);
    }

    if (!notification.retryEligible) {
      throw new AppError("RETRY_NOT_ELIGIBLE", "Notification is not eligible for retry.", 409);
    }

    if (notification.nextRetryAt && new Date(notification.nextRetryAt).getTime() > Date.now()) {
      throw new AppError("RETRY_NOT_DUE", "Notification retry window is not yet open.", 409);
    }

    return this.sendNotification(input);
  }

  dismissNotification(input: DismissInput): NotificationRecordV2 {
    const notification = this.requireNotification(input.notificationId);
    this.assertScope(notification, input);

    if (notification.channel !== "in_app") {
      throw new AppError("INVALID_DISMISS_CHANNEL", "Only in-app notifications can be dismissed.", 409);
    }

    notification.status = "dismissed";
    notification.dismissedAt = new Date().toISOString();
    notification.retryEligible = false;
    notification.nextRetryAt = undefined;
    this.store.updateNotification(notification);

    void this.deps.auditLogger.log({
      action: "update",
      actorId: input.actorId,
      tenantId: notification.tenantId,
      organizationId: notification.organizationId,
      resourceType: "notification",
      resourceId: notification.id,
      outcome: "success",
      timestamp: notification.dismissedAt,
      metadata: {
        status: "dismissed"
      }
    });

    return notification;
  }

  listInbox(input: {
    tenantId: string;
    organizationId: string;
    recipientRef: string;
  }): {
    unreadCount: number;
    items: NotificationRecordV2[];
  } {
    const items = this.store.listNotifications({
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      recipientRef: input.recipientRef,
      channel: "in_app"
    });

    const unreadCount = items.filter((item) => item.status === "sent").length;

    return {
      unreadCount,
      items
    };
  }

  getNotification(input: { tenantId: string; organizationId: string; notificationId: string }) {
    const notification = this.requireNotification(input.notificationId);
    this.assertScope(notification, input);

    return notification;
  }

  listAttempts(input: {
    tenantId: string;
    organizationId: string;
    notificationId: string;
  }): NotificationDeliveryAttempt[] {
    const notification = this.requireNotification(input.notificationId);
    this.assertScope(notification, input);

    return this.store.listAttempts(input.notificationId);
  }

  listFailedNotifications(input: { tenantId: string; organizationId: string }): NotificationRecordV2[] {
    return this.store.listNotifications({
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      status: "failed"
    });
  }

  private requireTemplate(input: {
    tenantId: string;
    organizationId: string;
    channel: NotificationChannel;
    templateKey: string;
    version?: number;
  }): NotificationTemplate {
    const template = this.store.getTemplate(input);

    if (!template) {
      throw new AppError("TEMPLATE_NOT_FOUND", "Notification template was not found.", 404);
    }

    return template;
  }

  private requireNotification(notificationId: string): NotificationRecordV2 {
    const notification = this.store.getNotification(notificationId);

    if (!notification) {
      throw new AppError("NOTIFICATION_NOT_FOUND", "Notification was not found.", 404);
    }

    return notification;
  }

  private assertScope(
    record: { tenantId: string; organizationId: string },
    input: { tenantId: string; organizationId: string }
  ): void {
    if (record.tenantId !== input.tenantId || record.organizationId !== input.organizationId) {
      throw new AppError("FORBIDDEN_TENANT_SCOPE", "Tenant scope mismatch.", 403);
    }
  }

  private validateTemplateVariables(
    template: NotificationTemplate,
    variables: Record<string, string | number | boolean | null>
  ): void {
    const providedKeys = Object.keys(variables);
    const disallowed = providedKeys.filter((key) => !template.allowedVariables.includes(key));

    if (disallowed.length > 0) {
      throw new AppError(
        "INVALID_TEMPLATE_VARIABLE",
        `Template received disallowed variables: ${disallowed.join(", ")}`,
        400
      );
    }

    const placeholders = [
      ...extractTemplatePlaceholders(template.body),
      ...extractTemplatePlaceholders(template.subject ?? "")
    ];
    const missing = placeholders.filter((placeholder) => !(placeholder in variables));

    if (missing.length > 0) {
      throw new AppError(
        "MISSING_TEMPLATE_VARIABLE",
        `Template is missing required render variables: ${missing.join(", ")}`,
        400
      );
    }
  }

  private renderTemplate(
    template: NotificationTemplate,
    variables: Record<string, string | number | boolean | null>
  ): {
    subject?: string;
    body: string;
  } {
    const normalized = normalizeVariables(variables);

    const render = (value: string): string => {
      return value.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, variable: string) => {
        return normalized[variable] ?? "";
      });
    };

    return {
      subject: template.subject ? render(template.subject) : undefined,
      body: render(template.body)
    };
  }

  private toDeliveryError(error: unknown): ChannelDeliveryError {
    if (error instanceof ChannelDeliveryError) {
      return error;
    }

    if (error instanceof AppError) {
      return new ChannelDeliveryError(error.code, error.message, false);
    }

    if (error instanceof Error) {
      return new ChannelDeliveryError("DELIVERY_ERROR", error.message, true);
    }

    return new ChannelDeliveryError("DELIVERY_ERROR", "Unknown delivery error.", true);
  }
}
