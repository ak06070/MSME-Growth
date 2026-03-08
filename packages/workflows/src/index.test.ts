import { describe, expect, it } from "vitest";
import {
  InMemoryWorkflowStore,
  WorkflowEngine,
  WorkflowRegistry,
  type WorkflowDefinition
} from "./index";

const buildEngine = () => {
  const registry = new WorkflowRegistry();
  const store = new InMemoryWorkflowStore();
  const sinkEvents: string[] = [];

  const engine = new WorkflowEngine(registry, store, (event) => {
    sinkEvents.push(event.eventType);
  });

  return { engine, store, sinkEvents };
};

describe("workflow engine", () => {
  it("executes task steps and completes", async () => {
    const { engine, store } = buildEngine();

    const definition: WorkflowDefinition = {
      workflowType: "collections_followup",
      version: 1,
      triggerTypes: ["manual"],
      steps: [
        {
          id: "prepare",
          name: "Prepare payload",
          type: "task",
          runner: async () => ({ outcome: "completed", output: { prepared: true } })
        },
        {
          id: "dispatch",
          name: "Dispatch action",
          type: "task",
          runner: async () => ({ outcome: "completed" })
        }
      ]
    };

    engine.registerWorkflow(definition);

    const execution = await engine.startWorkflow({
      workflowType: "collections_followup",
      tenantId: "ten_001",
      organizationId: "org_001",
      triggerType: "manual",
      actorId: "usr_admin"
    });

    expect(execution.status).toBe("completed");
    expect(execution.tenantId).toBe("ten_001");
    expect(execution.organizationId).toBe("org_001");
    expect(store.listEvents(execution.id).map((event) => event.eventType)).toContain(
      "workflow_completed"
    );
  });

  it("retries retryable failures before succeeding", async () => {
    const { engine } = buildEngine();

    let attempts = 0;

    engine.registerWorkflow({
      workflowType: "retry_demo",
      version: 1,
      triggerTypes: ["manual"],
      steps: [
        {
          id: "retry-step",
          name: "Retry step",
          type: "task",
          maxRetries: 2,
          runner: async () => {
            attempts += 1;
            if (attempts < 2) {
              return { outcome: "failed", retryable: true, errorCode: "TEMP_ERROR" };
            }
            return { outcome: "completed" };
          }
        }
      ]
    });

    const execution = await engine.startWorkflow({
      workflowType: "retry_demo",
      tenantId: "ten_001",
      organizationId: "org_001",
      triggerType: "manual"
    });

    expect(execution.status).toBe("completed");
    expect(execution.steps[0].attemptCount).toBe(2);
  });

  it("pauses at approval steps and resumes on approval", async () => {
    const { engine } = buildEngine();

    engine.registerWorkflow({
      workflowType: "approval_demo",
      version: 1,
      triggerTypes: ["manual"],
      steps: [
        {
          id: "approval",
          name: "Need approval",
          type: "approval",
          approvalTimeoutMs: 10000
        },
        {
          id: "post-approval",
          name: "Continue",
          type: "task",
          runner: async () => ({ outcome: "completed" })
        }
      ]
    });

    const started = await engine.startWorkflow({
      workflowType: "approval_demo",
      tenantId: "ten_001",
      organizationId: "org_001",
      triggerType: "manual"
    });

    expect(started.status).toBe("awaiting_approval");

    const approved = await engine.decideApproval({
      executionId: started.id,
      stepId: "approval",
      actorId: "usr_admin",
      approved: true
    });

    expect(approved.status).toBe("completed");
  });

  it("fails workflow when approval is rejected", async () => {
    const { engine } = buildEngine();

    engine.registerWorkflow({
      workflowType: "approval_reject_demo",
      version: 1,
      triggerTypes: ["manual"],
      steps: [
        {
          id: "approval",
          name: "Need approval",
          type: "approval"
        }
      ]
    });

    const started = await engine.startWorkflow({
      workflowType: "approval_reject_demo",
      tenantId: "ten_001",
      organizationId: "org_001",
      triggerType: "manual"
    });

    const rejected = await engine.decideApproval({
      executionId: started.id,
      stepId: "approval",
      actorId: "usr_admin",
      approved: false
    });

    expect(rejected.status).toBe("failed");
    expect(rejected.failureCode).toBe("APPROVAL_REJECTED");
  });

  it("escalates timed out approvals", async () => {
    const { engine, store } = buildEngine();

    engine.registerWorkflow({
      workflowType: "approval_timeout_demo",
      version: 1,
      triggerTypes: ["manual"],
      steps: [
        {
          id: "approval",
          name: "Need approval",
          type: "approval",
          approvalTimeoutMs: 1
        }
      ]
    });

    const started = await engine.startWorkflow({
      workflowType: "approval_timeout_demo",
      tenantId: "ten_001",
      organizationId: "org_001",
      triggerType: "manual"
    });

    await engine.escalateTimedOutApprovals(new Date(Date.now() + 10).toISOString());

    const escalated = store.getExecution(started.id);
    expect(escalated?.status).toBe("escalated");
    expect(store.listEvents(started.id).map((event) => event.eventType)).toContain(
      "approval_escalated"
    );
  });
});
