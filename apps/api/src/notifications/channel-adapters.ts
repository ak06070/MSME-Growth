import type { NotificationChannel, NotificationRecordV2, NotificationTemplate } from "@msme/types";

export interface ChannelSendPayload {
  notification: NotificationRecordV2;
  template: NotificationTemplate;
  rendered: {
    subject?: string;
    body: string;
  };
}

export interface ChannelSendResult {
  providerResponseRef?: string;
}

export interface NotificationChannelAdapter {
  readonly channel: NotificationChannel;
  send(payload: ChannelSendPayload): Promise<ChannelSendResult>;
}

export class ChannelDeliveryError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable = true
  ) {
    super(message);
    this.name = "ChannelDeliveryError";
  }
}

export class InAppNotificationAdapter implements NotificationChannelAdapter {
  readonly channel = "in_app" as const;

  async send(payload: ChannelSendPayload): Promise<ChannelSendResult> {
    return {
      providerResponseRef: `in-app:${payload.notification.id}`
    };
  }
}

export class WebhookNotificationAdapter implements NotificationChannelAdapter {
  constructor(
    public readonly channel: "email" | "whatsapp",
    private readonly webhookUrl?: string
  ) {}

  async send(payload: ChannelSendPayload): Promise<ChannelSendResult> {
    if (!this.webhookUrl) {
      throw new ChannelDeliveryError(
        "CHANNEL_NOT_CONFIGURED",
        `${this.channel} webhook URL is not configured.`,
        false
      );
    }

    const response = await fetch(this.webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        channel: this.channel,
        notificationId: payload.notification.id,
        recipient: payload.notification.recipientRef,
        templateKey: payload.template.templateKey,
        templateVersion: payload.template.version,
        rendered: payload.rendered,
        correlationRef: payload.notification.correlationRef,
        workflowRef: payload.notification.workflowRef
      })
    });

    if (!response.ok) {
      throw new ChannelDeliveryError(
        "PROVIDER_REQUEST_FAILED",
        `${this.channel} provider returned status ${response.status}`,
        true
      );
    }

    const responseBody =
      (await response.json().catch(() => ({ providerResponseRef: undefined }))) as {
        providerResponseRef?: string;
      };

    return {
      providerResponseRef:
        responseBody.providerResponseRef ?? `${this.channel}:${payload.notification.id}:${Date.now()}`
    };
  }
}
