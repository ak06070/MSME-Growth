import { randomUUID } from "node:crypto";

export type WorkflowTriggerType = "manual" | "scheduled" | "event";
export type WorkflowStepType = "task" | "approval";

export type WorkflowStatus =
  | "pending"
  | "running"
  | "awaiting_approval"
  | "completed"
  | "failed"
  | "escalated"
  | "cancelled";

export type WorkflowStepStatus =
  | "pending"
  | "running"
  | "awaiting_approval"
  | "completed"
  | "failed"
  | "skipped";

export interface WorkflowCondition {
  id: string;
  evaluate: (context: WorkflowExecutionContext) => boolean;
}

export interface WorkflowExecutionContext {
  tenantId: string;
  organizationId: string;
  triggerType: WorkflowTriggerType;
  actorId?: string;
  payload?: Record<string, unknown>;
  state: Record<string, unknown>;
}

export interface WorkflowStepResult {
  outcome: "completed" | "failed";
  retryable?: boolean;
  output?: Record<string, unknown>;
  errorCode?: string;
}

export type WorkflowStepRunner = (
  context: WorkflowExecutionContext
) => Promise<WorkflowStepResult>;

export interface WorkflowStepDefinition {
  id: string;
  name: string;
  type: WorkflowStepType;
  runner?: WorkflowStepRunner;
  conditions?: WorkflowCondition[];
  maxRetries?: number;
  approvalTimeoutMs?: number;
}

export interface WorkflowDefinition {
  workflowType: string;
  version: number;
  triggerTypes: WorkflowTriggerType[];
  steps: WorkflowStepDefinition[];
}

export interface WorkflowStepState {
  stepId: string;
  status: WorkflowStepStatus;
  attemptCount: number;
  startedAt?: string;
  completedAt?: string;
  approvalRequestedAt?: string;
  approvalActorId?: string;
  output?: Record<string, unknown>;
  errorCode?: string;
}

export interface WorkflowExecution {
  id: string;
  workflowType: string;
  workflowVersion: number;
  tenantId: string;
  organizationId: string;
  triggerType: WorkflowTriggerType;
  status: WorkflowStatus;
  currentStepIndex: number;
  steps: WorkflowStepState[];
  startedAt: string;
  completedAt?: string;
  failureCode?: string;
  payload?: Record<string, unknown>;
}

export interface WorkflowEvent {
  id: string;
  workflowExecutionId: string;
  tenantId: string;
  organizationId: string;
  eventType: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export type WorkflowAuditEventSink = (event: WorkflowEvent) => void | Promise<void>;

export class WorkflowRegistry {
  private readonly definitions = new Map<string, WorkflowDefinition>();

  register(definition: WorkflowDefinition): void {
    this.definitions.set(this.key(definition.workflowType, definition.version), definition);
  }

  get(workflowType: string, version?: number): WorkflowDefinition | undefined {
    if (version !== undefined) {
      return this.definitions.get(this.key(workflowType, version));
    }

    const latest = [...this.definitions.values()]
      .filter((definition) => definition.workflowType === workflowType)
      .sort((left, right) => right.version - left.version)[0];

    return latest;
  }

  private key(workflowType: string, version: number): string {
    return `${workflowType}:${version}`;
  }
}

export class InMemoryWorkflowStore {
  private readonly executions = new Map<string, WorkflowExecution>();
  private readonly events = new Map<string, WorkflowEvent[]>();

  saveExecution(execution: WorkflowExecution): void {
    this.executions.set(execution.id, execution);
  }

  getExecution(id: string): WorkflowExecution | undefined {
    return this.executions.get(id);
  }

  addEvent(event: WorkflowEvent): void {
    const executionEvents = this.events.get(event.workflowExecutionId) ?? [];
    executionEvents.push(event);
    this.events.set(event.workflowExecutionId, executionEvents);
  }

  listEvents(executionId: string): WorkflowEvent[] {
    return this.events.get(executionId) ?? [];
  }

  listExecutions(): WorkflowExecution[] {
    return [...this.executions.values()];
  }
}

export class WorkflowEngine {
  constructor(
    private readonly registry: WorkflowRegistry,
    private readonly store: InMemoryWorkflowStore,
    private readonly auditEventSink?: WorkflowAuditEventSink
  ) {}

  registerWorkflow(definition: WorkflowDefinition): void {
    this.registry.register(definition);
  }

  async startWorkflow(input: {
    workflowType: string;
    tenantId: string;
    organizationId: string;
    triggerType: WorkflowTriggerType;
    actorId?: string;
    payload?: Record<string, unknown>;
    version?: number;
  }): Promise<WorkflowExecution> {
    const definition = this.registry.get(input.workflowType, input.version);

    if (!definition) {
      throw new Error(`Unknown workflow definition: ${input.workflowType}`);
    }

    if (!definition.triggerTypes.includes(input.triggerType)) {
      throw new Error(
        `Trigger type ${input.triggerType} is not supported for ${input.workflowType}`
      );
    }

    const execution: WorkflowExecution = {
      id: randomUUID(),
      workflowType: definition.workflowType,
      workflowVersion: definition.version,
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      triggerType: input.triggerType,
      status: "pending",
      currentStepIndex: 0,
      startedAt: new Date().toISOString(),
      payload: input.payload,
      steps: definition.steps.map((step) => ({
        stepId: step.id,
        status: "pending",
        attemptCount: 0
      }))
    };

    this.store.saveExecution(execution);
    await this.emitEvent(execution, "workflow_started", {
      triggerType: input.triggerType,
      actorId: input.actorId
    });

    return this.runExecution(execution.id, input.actorId);
  }

  async decideApproval(input: {
    executionId: string;
    stepId: string;
    actorId: string;
    approved: boolean;
  }): Promise<WorkflowExecution> {
    const execution = this.store.getExecution(input.executionId);

    if (!execution) {
      throw new Error(`Unknown workflow execution: ${input.executionId}`);
    }

    if (execution.status !== "awaiting_approval") {
      throw new Error(`Workflow execution ${input.executionId} is not awaiting approval.`);
    }

    const stepState = execution.steps.find((step) => step.stepId === input.stepId);

    if (!stepState || stepState.status !== "awaiting_approval") {
      throw new Error(`Step ${input.stepId} is not awaiting approval.`);
    }

    stepState.approvalActorId = input.actorId;

    if (!input.approved) {
      stepState.status = "failed";
      stepState.completedAt = new Date().toISOString();
      execution.status = "failed";
      execution.completedAt = new Date().toISOString();
      execution.failureCode = "APPROVAL_REJECTED";

      this.store.saveExecution(execution);
      await this.emitEvent(execution, "approval_rejected", {
        stepId: input.stepId,
        actorId: input.actorId
      });

      return execution;
    }

    stepState.status = "completed";
    stepState.completedAt = new Date().toISOString();
    execution.currentStepIndex += 1;
    execution.status = "running";

    this.store.saveExecution(execution);
    await this.emitEvent(execution, "approval_approved", {
      stepId: input.stepId,
      actorId: input.actorId
    });

    return this.runExecution(execution.id, input.actorId);
  }

  async escalateTimedOutApprovals(nowIso = new Date().toISOString()): Promise<void> {
    const now = new Date(nowIso).getTime();

    for (const execution of this.store.listExecutions()) {
      if (execution.status !== "awaiting_approval") {
        continue;
      }

      const definition = this.registry.get(execution.workflowType, execution.workflowVersion);
      if (!definition) {
        continue;
      }

      const stepDefinition = definition.steps[execution.currentStepIndex];
      const stepState = execution.steps[execution.currentStepIndex];

      if (!stepDefinition || !stepState || !stepState.approvalRequestedAt) {
        continue;
      }

      const timeoutMs = stepDefinition.approvalTimeoutMs ?? 0;
      const requestedAt = new Date(stepState.approvalRequestedAt).getTime();

      if (timeoutMs > 0 && requestedAt + timeoutMs <= now) {
        execution.status = "escalated";
        this.store.saveExecution(execution);
        await this.emitEvent(execution, "approval_escalated", {
          stepId: stepState.stepId,
          timeoutMs
        });
      }
    }
  }

  private async runExecution(executionId: string, actorId?: string): Promise<WorkflowExecution> {
    const execution = this.store.getExecution(executionId);

    if (!execution) {
      throw new Error(`Unknown workflow execution: ${executionId}`);
    }

    const definition = this.registry.get(execution.workflowType, execution.workflowVersion);

    if (!definition) {
      throw new Error(`Unknown workflow definition: ${execution.workflowType}`);
    }

    const executionContext: WorkflowExecutionContext = {
      tenantId: execution.tenantId,
      organizationId: execution.organizationId,
      triggerType: execution.triggerType,
      actorId,
      payload: execution.payload,
      state: {}
    };

    execution.status = "running";

    while (execution.currentStepIndex < definition.steps.length) {
      const stepDefinition = definition.steps[execution.currentStepIndex];
      const stepState = execution.steps[execution.currentStepIndex];

      if (!stepDefinition || !stepState) {
        execution.status = "failed";
        execution.failureCode = "INVALID_STEP_INDEX";
        execution.completedAt = new Date().toISOString();
        this.store.saveExecution(execution);
        await this.emitEvent(execution, "workflow_failed", {
          failureCode: execution.failureCode
        });
        return execution;
      }

      const conditionsPassed = (stepDefinition.conditions ?? []).every((condition) =>
        condition.evaluate(executionContext)
      );

      if (!conditionsPassed) {
        stepState.status = "skipped";
        stepState.completedAt = new Date().toISOString();
        await this.emitEvent(execution, "step_skipped", {
          stepId: stepDefinition.id
        });
        execution.currentStepIndex += 1;
        continue;
      }

      if (stepDefinition.type === "approval") {
        stepState.status = "awaiting_approval";
        stepState.approvalRequestedAt = new Date().toISOString();
        execution.status = "awaiting_approval";
        this.store.saveExecution(execution);
        await this.emitEvent(execution, "approval_requested", {
          stepId: stepDefinition.id,
          timeoutMs: stepDefinition.approvalTimeoutMs ?? null
        });
        return execution;
      }

      if (!stepDefinition.runner) {
        throw new Error(`Task step ${stepDefinition.id} is missing a runner.`);
      }

      const maxRetries = stepDefinition.maxRetries ?? 0;
      let completed = false;
      let lastErrorCode: string | undefined;

      for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
        stepState.status = "running";
        stepState.attemptCount = attempt;
        stepState.startedAt = new Date().toISOString();

        await this.emitEvent(execution, "step_started", {
          stepId: stepDefinition.id,
          attempt
        });

        const result = await stepDefinition.runner(executionContext);

        if (result.outcome === "completed") {
          stepState.status = "completed";
          stepState.completedAt = new Date().toISOString();
          stepState.output = result.output;
          completed = true;

          await this.emitEvent(execution, "step_completed", {
            stepId: stepDefinition.id,
            attempt
          });

          if (result.output) {
            executionContext.state[stepDefinition.id] = result.output;
          }
          break;
        }

        lastErrorCode = result.errorCode ?? "STEP_FAILED";
        stepState.errorCode = lastErrorCode;

        await this.emitEvent(execution, "step_failed", {
          stepId: stepDefinition.id,
          attempt,
          errorCode: lastErrorCode,
          retryable: result.retryable ?? false
        });

        if (result.retryable && attempt <= maxRetries) {
          await this.emitEvent(execution, "step_retry", {
            stepId: stepDefinition.id,
            nextAttempt: attempt + 1
          });
          continue;
        }

        break;
      }

      if (!completed) {
        stepState.status = "failed";
        stepState.completedAt = new Date().toISOString();
        execution.status = "failed";
        execution.failureCode = lastErrorCode ?? "STEP_FAILED";
        execution.completedAt = new Date().toISOString();
        this.store.saveExecution(execution);

        await this.emitEvent(execution, "workflow_failed", {
          stepId: stepDefinition.id,
          failureCode: execution.failureCode
        });

        return execution;
      }

      execution.currentStepIndex += 1;
    }

    execution.status = "completed";
    execution.completedAt = new Date().toISOString();
    this.store.saveExecution(execution);

    await this.emitEvent(execution, "workflow_completed", {
      stepsExecuted: execution.steps.length
    });

    return execution;
  }

  private async emitEvent(
    execution: WorkflowExecution,
    eventType: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const event: WorkflowEvent = {
      id: randomUUID(),
      workflowExecutionId: execution.id,
      tenantId: execution.tenantId,
      organizationId: execution.organizationId,
      eventType,
      timestamp: new Date().toISOString(),
      metadata
    };

    this.store.addEvent(event);
    this.store.saveExecution(execution);

    if (this.auditEventSink) {
      await this.auditEventSink(event);
    }
  }
}
