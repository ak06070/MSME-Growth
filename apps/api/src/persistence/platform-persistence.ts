import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import type {
  AuditEvent,
  NotificationApprovalDecision,
  NotificationDeliveryAttempt,
  NotificationRecordV2,
  NotificationTemplate
} from "@msme/types";
import type { ConnectorRunSnapshot } from "../ingestion/connector-run-store";

export interface PlatformPersistence {
  saveAuditEvent(event: AuditEvent): Promise<void>;
  saveConnectorRun(run: ConnectorRunSnapshot): Promise<void>;
  saveNotificationTemplate(template: NotificationTemplate): Promise<void>;
  saveNotificationRecord(record: NotificationRecordV2): Promise<void>;
  saveNotificationApproval(decision: NotificationApprovalDecision): Promise<void>;
  saveNotificationAttempt(attempt: NotificationDeliveryAttempt): Promise<void>;
  close(): Promise<void>;
}

export class NoopPlatformPersistence implements PlatformPersistence {
  async saveAuditEvent(): Promise<void> {
    // No-op persistence for local/dev execution without a configured database.
  }

  async saveConnectorRun(): Promise<void> {
    // No-op persistence for local/dev execution without a configured database.
  }

  async saveNotificationTemplate(): Promise<void> {
    // No-op persistence for local/dev execution without a configured database.
  }

  async saveNotificationRecord(): Promise<void> {
    // No-op persistence for local/dev execution without a configured database.
  }

  async saveNotificationApproval(): Promise<void> {
    // No-op persistence for local/dev execution without a configured database.
  }

  async saveNotificationAttempt(): Promise<void> {
    // No-op persistence for local/dev execution without a configured database.
  }

  async close(): Promise<void> {
    // No-op persistence for local/dev execution without a configured database.
  }
}

export class PostgresPlatformPersistence implements PlatformPersistence {
  private readonly pool: Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({
      connectionString: databaseUrl,
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined
    });
  }

  async saveAuditEvent(event: AuditEvent): Promise<void> {
    await this.pool.query(
      `
      insert into audit_events (
        id,
        actor_id,
        tenant_id,
        organization_id,
        action,
        resource_type,
        resource_id,
        outcome,
        timestamp,
        metadata
      )
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      `,
      [
        randomUUID(),
        event.actorId ?? null,
        event.tenantId,
        event.organizationId ?? null,
        event.action,
        event.resourceType,
        event.resourceId ?? null,
        event.outcome,
        event.timestamp,
        JSON.stringify(event.metadata ?? {})
      ]
    );
  }

  async saveConnectorRun(run: ConnectorRunSnapshot): Promise<void> {
    await this.pool.query(
      `
      insert into connector_runs (
        run_id,
        connector_type,
        tenant_id,
        organization_id,
        actor_id,
        status,
        started_at,
        completed_at,
        attempts,
        last_error_code,
        next_retry_at,
        summary
      )
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
      on conflict (run_id) do update
      set
        status = excluded.status,
        completed_at = excluded.completed_at,
        attempts = excluded.attempts,
        last_error_code = excluded.last_error_code,
        next_retry_at = excluded.next_retry_at,
        summary = excluded.summary,
        updated_at = now()
      `,
      [
        run.runId,
        run.connectorType,
        run.tenantId,
        run.organizationId,
        run.actorId ?? null,
        run.status,
        run.startedAt,
        run.completedAt,
        run.attempts,
        run.lastErrorCode ?? null,
        run.nextRetryAt ?? null,
        JSON.stringify(run.summary)
      ]
    );
  }

  async saveNotificationTemplate(template: NotificationTemplate): Promise<void> {
    await this.ensureOrganizationRecord(template.tenantId, template.organizationId);

    await this.pool.query(
      `
      insert into notification_templates (
        template_id,
        tenant_id,
        organization_id,
        channel,
        template_key,
        version,
        subject,
        body,
        allowed_variables,
        created_by,
        created_at,
        updated_at
      )
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12)
      on conflict (template_id) do update
      set
        subject = excluded.subject,
        body = excluded.body,
        allowed_variables = excluded.allowed_variables,
        updated_at = excluded.updated_at
      `,
      [
        template.id,
        template.tenantId,
        template.organizationId,
        template.channel,
        template.templateKey,
        template.version,
        template.subject ?? null,
        template.body,
        JSON.stringify(template.allowedVariables),
        template.createdBy,
        template.createdAt,
        template.updatedAt
      ]
    );
  }

  async saveNotificationRecord(record: NotificationRecordV2): Promise<void> {
    await this.ensureOrganizationRecord(record.tenantId, record.organizationId);

    await this.pool.query(
      `
      insert into notification_records (
        id,
        tenant_id,
        organization_id,
        channel,
        template_key,
        template_version,
        recipient_ref,
        variables,
        correlation_ref,
        workflow_ref,
        status,
        requires_approval,
        approval_state,
        queued_at,
        sent_at,
        dismissed_at,
        failure_code,
        failure_reason,
        retry_eligible,
        retry_count,
        next_retry_at,
        created_at,
        updated_at
      )
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
      on conflict (id) do update
      set
        status = excluded.status,
        approval_state = excluded.approval_state,
        sent_at = excluded.sent_at,
        dismissed_at = excluded.dismissed_at,
        failure_code = excluded.failure_code,
        failure_reason = excluded.failure_reason,
        retry_eligible = excluded.retry_eligible,
        retry_count = excluded.retry_count,
        next_retry_at = excluded.next_retry_at,
        updated_at = now()
      `,
      [
        record.id,
        record.tenantId,
        record.organizationId,
        record.channel,
        record.templateKey,
        record.templateVersion,
        record.recipientRef,
        JSON.stringify(record.variables),
        record.correlationRef ?? null,
        record.workflowRef ?? null,
        record.status,
        record.requiresApproval,
        record.approvalState,
        record.queuedAt,
        record.sentAt ?? null,
        record.dismissedAt ?? null,
        record.failureCode ?? null,
        record.failureReason ?? null,
        record.retryEligible,
        record.retryCount,
        record.nextRetryAt ?? null,
        record.queuedAt,
        record.queuedAt
      ]
    );
  }

  async saveNotificationApproval(decision: NotificationApprovalDecision): Promise<void> {
    await this.pool.query(
      `
      insert into notification_approvals (
        approval_id,
        notification_id,
        tenant_id,
        organization_id,
        actor_id,
        decision,
        rationale,
        requested_at,
        decided_at
      )
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      on conflict (approval_id) do update
      set
        actor_id = excluded.actor_id,
        decision = excluded.decision,
        rationale = excluded.rationale,
        decided_at = excluded.decided_at,
        updated_at = now()
      `,
      [
        decision.id,
        decision.notificationId,
        decision.tenantId,
        decision.organizationId,
        decision.actorId ?? null,
        decision.decision,
        decision.rationale ?? null,
        decision.requestedAt,
        decision.decidedAt ?? null
      ]
    );
  }

  async saveNotificationAttempt(attempt: NotificationDeliveryAttempt): Promise<void> {
    await this.pool.query(
      `
      insert into notification_attempts (
        attempt_id,
        notification_id,
        tenant_id,
        organization_id,
        channel,
        attempt_number,
        status,
        provider_response_ref,
        failure_code,
        failure_reason,
        timestamp
      )
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      on conflict (attempt_id) do nothing
      `,
      [
        attempt.id,
        attempt.notificationId,
        attempt.tenantId,
        attempt.organizationId,
        attempt.channel,
        attempt.attemptNumber,
        attempt.status,
        attempt.providerResponseRef ?? null,
        attempt.failureCode ?? null,
        attempt.failureReason ?? null,
        attempt.timestamp
      ]
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private async ensureOrganizationRecord(
    tenantId: string,
    organizationId: string
  ): Promise<void> {
    const now = new Date().toISOString();

    await this.pool.query(
      `
      insert into organizations (
        id,
        tenant_id,
        name,
        status,
        created_at,
        updated_at
      )
      values ($1,$2,$3,'active',$4,$5)
      on conflict do nothing
      `,
      [organizationId, tenantId, `Persisted ${organizationId}`, now, now]
    );
  }
}

export const createPlatformPersistence = (databaseUrl?: string): PlatformPersistence => {
  if (!databaseUrl) {
    return new NoopPlatformPersistence();
  }

  return new PostgresPlatformPersistence(databaseUrl);
};
