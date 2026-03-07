export type WorkflowStatus = "pending" | "running" | "completed" | "failed";

export interface WorkflowDefinition {
  id: string;
  name: string;
  version: number;
}

export interface WorkflowExecution {
  workflowId: string;
  status: WorkflowStatus;
  startedAt: string;
  finishedAt?: string;
}
