import { describe, expect, it } from "vitest";
import type { WorkflowExecution } from "./index";

describe("workflow placeholders", () => {
  it("supports workflow execution status", () => {
    const execution: WorkflowExecution = {
      workflowId: "wf-1",
      status: "pending",
      startedAt: new Date().toISOString()
    };

    expect(execution.status).toBe("pending");
  });
});
