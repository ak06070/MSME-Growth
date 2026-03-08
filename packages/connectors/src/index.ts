import { randomUUID } from "node:crypto";

export type ConnectorRunStatus = "queued" | "running" | "partial_success" | "failed" | "completed";
export type ConnectorDuplicateOutcome = "skip" | "upsert" | "fail";

export type ConnectorStage =
  | "transport"
  | "schema"
  | "normalize"
  | "domain"
  | "scope"
  | "referential"
  | "dedupe"
  | "persist";

export type ConnectorAction = "start" | "validate" | "persist" | "retry" | "complete" | "fail";

export interface ConnectorContext {
  actorId?: string;
  tenantId: string;
  organizationId: string;
  correlationId?: string;
  runLabel?: string;
}

export interface ConnectorRawRecord<TRaw> {
  index: number;
  reference: string;
  raw: TRaw;
}

export interface ConnectorValidationIssue {
  stage: ConnectorStage;
  code: string;
  message: string;
  field?: string;
  recordIndex?: number;
  recordReference?: string;
}

export interface ConnectorNormalizedRecord<TCanonical> {
  recordIndex: number;
  recordReference: string;
  canonical: TCanonical;
  lineage: Record<string, string>;
  fingerprint: string;
}

export interface ConnectorDuplicateResolution {
  isDuplicate: boolean;
  outcome?: ConnectorDuplicateOutcome;
  reason?: string;
}

export interface ConnectorRetryPolicy {
  maxAttempts: number;
  retryDelayMs: number;
}

export interface ConnectorAttemptResult {
  attempt: number;
  startedAt: string;
  completedAt: string;
  status: "success" | "failure";
  errorCode?: string;
  errorMessage?: string;
}

export interface ConnectorRunSummary {
  totalRecords: number;
  processedRecords: number;
  successfulRecords: number;
  duplicateRecords: number;
  failedRecords: number;
}

export interface ConnectorPersistedRecord<TPersisted> {
  recordIndex: number;
  recordReference: string;
  outcome: "inserted" | "upserted";
  persisted: TPersisted;
}

export interface ConnectorRunResult<TPersisted = unknown> {
  runId: string;
  connectorType: string;
  status: ConnectorRunStatus;
  summary: ConnectorRunSummary;
  errors: ConnectorValidationIssue[];
  attempts: ConnectorAttemptResult[];
  startedAt: string;
  completedAt: string;
  lastErrorCode?: string;
  nextRetryAt?: string;
  persistedRecords: ConnectorPersistedRecord<TPersisted>[];
}

export interface ConnectorAuditEvent {
  runId: string;
  connectorType: string;
  action: ConnectorAction;
  actorId?: string;
  tenantId: string;
  organizationId: string;
  status: ConnectorRunStatus;
  timestamp: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export type ConnectorAuditSink = (event: ConnectorAuditEvent) => void | Promise<void>;

export interface ConnectorFingerprintStore {
  has(fingerprint: string): boolean | Promise<boolean>;
  remember(fingerprint: string): void | Promise<void>;
}

export class InMemoryConnectorFingerprintStore implements ConnectorFingerprintStore {
  private readonly fingerprints = new Set<string>();

  has(fingerprint: string): boolean {
    return this.fingerprints.has(fingerprint);
  }

  remember(fingerprint: string): void {
    this.fingerprints.add(fingerprint);
  }
}

export interface ConnectorAdapter<TInput, TRaw, TCanonical, TPersisted = unknown> {
  readonly connectorType: string;
  readonly retryPolicy?: Partial<ConnectorRetryPolicy>;
  readonly maxRecordFailures?: number;
  readonly defaultDuplicateOutcome?: ConnectorDuplicateOutcome;
  validateTransport(
    input: TInput,
    context: ConnectorContext
  ): Promise<ConnectorValidationIssue[]> | ConnectorValidationIssue[];
  parseInput(
    input: TInput,
    context: ConnectorContext
  ): Promise<ConnectorRawRecord<TRaw>[]> | ConnectorRawRecord<TRaw>[];
  validateSchema(
    record: ConnectorRawRecord<TRaw>,
    context: ConnectorContext
  ): Promise<ConnectorValidationIssue[]> | ConnectorValidationIssue[];
  normalizeRecord(
    record: ConnectorRawRecord<TRaw>,
    context: ConnectorContext
  ):
    | Promise<
        { ok: true; value: ConnectorNormalizedRecord<TCanonical> } | { ok: false; issues: ConnectorValidationIssue[] }
      >
    | { ok: true; value: ConnectorNormalizedRecord<TCanonical> }
    | { ok: false; issues: ConnectorValidationIssue[] };
  validateDomain(
    record: ConnectorNormalizedRecord<TCanonical>,
    context: ConnectorContext
  ): Promise<ConnectorValidationIssue[]> | ConnectorValidationIssue[];
  validateScope(
    record: ConnectorNormalizedRecord<TCanonical>,
    context: ConnectorContext
  ): Promise<ConnectorValidationIssue[]> | ConnectorValidationIssue[];
  validateReferential?(
    record: ConnectorNormalizedRecord<TCanonical>,
    context: ConnectorContext
  ): Promise<ConnectorValidationIssue[]> | ConnectorValidationIssue[];
  checkDuplicate?(
    record: ConnectorNormalizedRecord<TCanonical>,
    context: ConnectorContext
  ): Promise<ConnectorDuplicateResolution> | ConnectorDuplicateResolution;
  persistRecord(
    record: ConnectorNormalizedRecord<TCanonical>,
    context: ConnectorContext,
    mode: "insert" | "upsert"
  ): Promise<TPersisted> | TPersisted;
}

export interface ConnectorRuntimeOptions {
  fingerprintStore?: ConnectorFingerprintStore;
  auditSink?: ConnectorAuditSink;
}

interface AttemptExecutionResult<TPersisted> {
  status: ConnectorRunStatus;
  summary: ConnectorRunSummary;
  errors: ConnectorValidationIssue[];
  persistedRecords: ConnectorPersistedRecord<TPersisted>[];
  retryableFailure: boolean;
  lastErrorCode?: string;
  lastErrorMessage?: string;
}

const defaultRetryPolicy: ConnectorRetryPolicy = {
  maxAttempts: 1,
  retryDelayMs: 1000
};

const addRecordContext = (
  issue: ConnectorValidationIssue,
  record: { index: number; reference: string }
): ConnectorValidationIssue => {
  return {
    ...issue,
    recordIndex: issue.recordIndex ?? record.index,
    recordReference: issue.recordReference ?? record.reference
  };
};

const computeStatusFromSummary = (summary: ConnectorRunSummary): ConnectorRunStatus => {
  if (summary.failedRecords === 0 && summary.duplicateRecords === 0) {
    return "completed";
  }

  if (summary.successfulRecords === 0 && summary.duplicateRecords === 0 && summary.failedRecords > 0) {
    return "failed";
  }

  return "partial_success";
};

export class ConnectorRuntime<TInput, TRaw, TCanonical, TPersisted = unknown> {
  private readonly fingerprintStore: ConnectorFingerprintStore;
  private readonly auditSink?: ConnectorAuditSink;

  constructor(
    private readonly adapter: ConnectorAdapter<TInput, TRaw, TCanonical, TPersisted>,
    options: ConnectorRuntimeOptions = {}
  ) {
    this.fingerprintStore = options.fingerprintStore ?? new InMemoryConnectorFingerprintStore();
    this.auditSink = options.auditSink;
  }

  async run(input: TInput, context: ConnectorContext): Promise<ConnectorRunResult<TPersisted>> {
    const runId = randomUUID();
    const startedAt = new Date().toISOString();
    const retryPolicy: ConnectorRetryPolicy = {
      maxAttempts: this.adapter.retryPolicy?.maxAttempts ?? defaultRetryPolicy.maxAttempts,
      retryDelayMs: this.adapter.retryPolicy?.retryDelayMs ?? defaultRetryPolicy.retryDelayMs
    };

    const attempts: ConnectorAttemptResult[] = [];
    const maxAttempts = Math.max(1, retryPolicy.maxAttempts);
    let nextRetryAt: string | undefined;

    await this.emitAudit(runId, context, "start", "running", {
      connectorType: this.adapter.connectorType,
      maxAttempts
    });

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const attemptStartedAt = new Date().toISOString();
      const attemptResult = await this.executeAttempt(runId, input, context);
      const attemptCompletedAt = new Date().toISOString();

      attempts.push({
        attempt,
        startedAt: attemptStartedAt,
        completedAt: attemptCompletedAt,
        status: attemptResult.status === "failed" ? "failure" : "success",
        errorCode: attemptResult.lastErrorCode,
        errorMessage: attemptResult.lastErrorMessage
      });

      if (attemptResult.status !== "failed") {
        const completedAt = new Date().toISOString();

        await this.emitAudit(runId, context, "complete", attemptResult.status, {
          attempt,
          totalRecords: attemptResult.summary.totalRecords,
          successfulRecords: attemptResult.summary.successfulRecords,
          duplicateRecords: attemptResult.summary.duplicateRecords,
          failedRecords: attemptResult.summary.failedRecords
        });

        return {
          runId,
          connectorType: this.adapter.connectorType,
          status: attemptResult.status,
          summary: attemptResult.summary,
          errors: attemptResult.errors,
          attempts,
          startedAt,
          completedAt,
          persistedRecords: attemptResult.persistedRecords
        };
      }

      if (attemptResult.retryableFailure && attempt < maxAttempts) {
        nextRetryAt = new Date(Date.now() + retryPolicy.retryDelayMs).toISOString();

        await this.emitAudit(runId, context, "retry", "running", {
          attempt,
          nextRetryAt,
          lastErrorCode: attemptResult.lastErrorCode ?? null
        });

        continue;
      }

      const completedAt = new Date().toISOString();

      await this.emitAudit(runId, context, "fail", "failed", {
        attempt,
        lastErrorCode: attemptResult.lastErrorCode ?? null,
        failedRecords: attemptResult.summary.failedRecords
      });

      return {
        runId,
        connectorType: this.adapter.connectorType,
        status: "failed",
        summary: attemptResult.summary,
        errors: attemptResult.errors,
        attempts,
        startedAt,
        completedAt,
        lastErrorCode: attemptResult.lastErrorCode,
        nextRetryAt,
        persistedRecords: attemptResult.persistedRecords
      };
    }

    const completedAt = new Date().toISOString();

    await this.emitAudit(runId, context, "fail", "failed", {
      lastErrorCode: "RETRY_EXHAUSTED"
    });

    return {
      runId,
      connectorType: this.adapter.connectorType,
      status: "failed",
      summary: {
        totalRecords: 0,
        processedRecords: 0,
        successfulRecords: 0,
        duplicateRecords: 0,
        failedRecords: 0
      },
      errors: [
        {
          stage: "transport",
          code: "RETRY_EXHAUSTED",
          message: "Connector run exhausted retry policy without a terminal result."
        }
      ],
      attempts,
      startedAt,
      completedAt,
      lastErrorCode: "RETRY_EXHAUSTED",
      nextRetryAt,
      persistedRecords: []
    };
  }

  private async executeAttempt(
    runId: string,
    input: TInput,
    context: ConnectorContext
  ): Promise<AttemptExecutionResult<TPersisted>> {
    const errors: ConnectorValidationIssue[] = [];
    const persistedRecords: ConnectorPersistedRecord<TPersisted>[] = [];
    let rawRecords: ConnectorRawRecord<TRaw>[] = [];

    const transportIssues = await this.adapter.validateTransport(input, context);

    if (transportIssues.length > 0) {
      errors.push(...transportIssues);
      return {
        status: "failed",
        summary: {
          totalRecords: 0,
          processedRecords: 0,
          successfulRecords: 0,
          duplicateRecords: 0,
          failedRecords: 0
        },
        errors,
        persistedRecords,
        retryableFailure: false,
        lastErrorCode: transportIssues[0]?.code,
        lastErrorMessage: transportIssues[0]?.message
      };
    }

    await this.emitAudit(runId, context, "validate", "running", {
      stage: "transport"
    });

    try {
      rawRecords = await this.adapter.parseInput(input, context);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to parse connector input.";

      errors.push({
        stage: "transport",
        code: "PARSER_FAILURE",
        message
      });

      return {
        status: "failed",
        summary: {
          totalRecords: 0,
          processedRecords: 0,
          successfulRecords: 0,
          duplicateRecords: 0,
          failedRecords: 0
        },
        errors,
        persistedRecords,
        retryableFailure: true,
        lastErrorCode: "PARSER_FAILURE",
        lastErrorMessage: message
      };
    }

    let successfulRecords = 0;
    let duplicateRecords = 0;
    let failedRecords = 0;

    for (const rawRecord of rawRecords) {
      const schemaIssues = (await this.adapter.validateSchema(rawRecord, context)).map((issue) =>
        addRecordContext(issue, rawRecord)
      );

      if (schemaIssues.length > 0) {
        errors.push(...schemaIssues);
        failedRecords += 1;
        continue;
      }

      const normalized = await this.adapter.normalizeRecord(rawRecord, context);

      if (!normalized.ok) {
        errors.push(...normalized.issues.map((issue) => addRecordContext(issue, rawRecord)));
        failedRecords += 1;
        continue;
      }

      const normalizedRecord = normalized.value;

      const domainIssues = (await this.adapter.validateDomain(normalizedRecord, context)).map((issue) =>
        addRecordContext(issue, rawRecord)
      );

      if (domainIssues.length > 0) {
        errors.push(...domainIssues);
        failedRecords += 1;
        continue;
      }

      const scopeIssues = (await this.adapter.validateScope(normalizedRecord, context)).map((issue) =>
        addRecordContext(issue, rawRecord)
      );

      if (scopeIssues.length > 0) {
        errors.push(...scopeIssues);
        failedRecords += 1;
        continue;
      }

      const referentialIssues = (
        await (this.adapter.validateReferential?.(normalizedRecord, context) ?? Promise.resolve([]))
      ).map((issue) => addRecordContext(issue, rawRecord));

      if (referentialIssues.length > 0) {
        errors.push(...referentialIssues);
        failedRecords += 1;
        continue;
      }

      const explicitDedupe =
        (await this.adapter.checkDuplicate?.(normalizedRecord, context)) ??
        ({
          isDuplicate: await this.fingerprintStore.has(normalizedRecord.fingerprint),
          outcome: this.adapter.defaultDuplicateOutcome ?? "skip"
        } satisfies ConnectorDuplicateResolution);

      if (explicitDedupe.isDuplicate) {
        const duplicateOutcome = explicitDedupe.outcome ?? this.adapter.defaultDuplicateOutcome ?? "skip";

        if (duplicateOutcome === "fail") {
          errors.push({
            stage: "dedupe",
            code: "DUPLICATE_RECORD",
            message: explicitDedupe.reason ?? "Duplicate record encountered.",
            recordIndex: rawRecord.index,
            recordReference: rawRecord.reference
          });
          failedRecords += 1;
          continue;
        }

        if (duplicateOutcome === "skip") {
          duplicateRecords += 1;
          continue;
        }

        const persisted = await this.adapter.persistRecord(normalizedRecord, context, "upsert");
        persistedRecords.push({
          recordIndex: normalizedRecord.recordIndex,
          recordReference: normalizedRecord.recordReference,
          outcome: "upserted",
          persisted
        });
        successfulRecords += 1;
        await this.fingerprintStore.remember(normalizedRecord.fingerprint);

        continue;
      }

      const persisted = await this.adapter.persistRecord(normalizedRecord, context, "insert");
      persistedRecords.push({
        recordIndex: normalizedRecord.recordIndex,
        recordReference: normalizedRecord.recordReference,
        outcome: "inserted",
        persisted
      });
      successfulRecords += 1;
      await this.fingerprintStore.remember(normalizedRecord.fingerprint);
    }

    const summary: ConnectorRunSummary = {
      totalRecords: rawRecords.length,
      processedRecords: successfulRecords + duplicateRecords + failedRecords,
      successfulRecords,
      duplicateRecords,
      failedRecords
    };

    const failureThreshold = this.adapter.maxRecordFailures ?? Number.POSITIVE_INFINITY;

    if (summary.failedRecords > failureThreshold) {
      return {
        status: "failed",
        summary,
        errors,
        persistedRecords,
        retryableFailure: false,
        lastErrorCode: "FAILURE_THRESHOLD_EXCEEDED",
        lastErrorMessage: `Failed records exceeded threshold (${failureThreshold}).`
      };
    }

    const status = computeStatusFromSummary(summary);

    if (summary.successfulRecords > 0) {
      await this.emitAudit(runId, context, "persist", status, {
        successfulRecords: summary.successfulRecords,
        duplicateRecords: summary.duplicateRecords
      });
    }

    return {
      status,
      summary,
      errors,
      persistedRecords,
      retryableFailure: false
    };
  }

  private async emitAudit(
    runId: string,
    context: ConnectorContext,
    action: ConnectorAction,
    status: ConnectorRunStatus,
    metadata?: Record<string, string | number | boolean | null>
  ): Promise<void> {
    if (!this.auditSink) {
      return;
    }

    await this.auditSink({
      runId,
      connectorType: this.adapter.connectorType,
      action,
      actorId: context.actorId,
      tenantId: context.tenantId,
      organizationId: context.organizationId,
      status,
      timestamp: new Date().toISOString(),
      metadata
    });
  }
}

export class ConnectorRegistry {
  private readonly adapters = new Map<string, ConnectorAdapter<unknown, unknown, unknown, unknown>>();

  register<TInput, TRaw, TCanonical, TPersisted>(
    adapter: ConnectorAdapter<TInput, TRaw, TCanonical, TPersisted>
  ): void {
    this.adapters.set(adapter.connectorType, adapter as ConnectorAdapter<unknown, unknown, unknown, unknown>);
  }

  get<TInput, TRaw, TCanonical, TPersisted>(
    connectorType: string
  ): ConnectorAdapter<TInput, TRaw, TCanonical, TPersisted> | undefined {
    return this.adapters.get(connectorType) as
      | ConnectorAdapter<TInput, TRaw, TCanonical, TPersisted>
      | undefined;
  }

  listConnectorTypes(): string[] {
    return [...this.adapters.keys()];
  }
}

export interface ConnectorOrchestratorOptions extends ConnectorRuntimeOptions {
  registry?: ConnectorRegistry;
}

export class ConnectorOrchestrator {
  private readonly registry: ConnectorRegistry;
  private readonly options: ConnectorRuntimeOptions;

  constructor(options: ConnectorOrchestratorOptions = {}) {
    this.registry = options.registry ?? new ConnectorRegistry();
    this.options = {
      fingerprintStore: options.fingerprintStore,
      auditSink: options.auditSink
    };
  }

  register<TInput, TRaw, TCanonical, TPersisted>(
    adapter: ConnectorAdapter<TInput, TRaw, TCanonical, TPersisted>
  ): void {
    this.registry.register(adapter);
  }

  async run<TInput, TRaw, TCanonical, TPersisted>(
    connectorType: string,
    input: TInput,
    context: ConnectorContext
  ): Promise<ConnectorRunResult<TPersisted>> {
    const adapter = this.registry.get<TInput, TRaw, TCanonical, TPersisted>(connectorType);

    if (!adapter) {
      throw new Error(`Unknown connector type: ${connectorType}`);
    }

    const runtime = new ConnectorRuntime(adapter, this.options);
    return runtime.run(input, context);
  }
}
