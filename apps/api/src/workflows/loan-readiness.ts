import type { WorkflowDefinition } from "@msme/workflows";

export const LOAN_READINESS_WORKFLOW_TYPE = "loan_readiness_export";
export const LOAN_READINESS_APPROVAL_STEP_ID = "approve_export";

export const createLoanReadinessWorkflowDefinition = (): WorkflowDefinition => {
  return {
    workflowType: LOAN_READINESS_WORKFLOW_TYPE,
    version: 1,
    triggerTypes: ["manual"],
    steps: [
      {
        id: "prepare_workspace_export",
        name: "Prepare workspace export",
        type: "task",
        runner: async (context) => {
          const workspace = context.payload?.workspace as { id: string } | undefined;
          return {
            outcome: "completed",
            output: {
              workspaceId: workspace?.id
            }
          };
        }
      },
      {
        id: LOAN_READINESS_APPROVAL_STEP_ID,
        name: "Approve loan readiness export",
        type: "approval",
        approvalTimeoutMs: 60 * 60 * 1000
      },
      {
        id: "finalize_workspace_export",
        name: "Finalize workspace export",
        type: "task",
        runner: async () => ({ outcome: "completed" })
      }
    ]
  };
};

export const isLoanReadinessRoleAllowed = (roles: string[]): boolean => {
  const allowedRoles = new Set(["owner", "admin", "finance_manager", "accountant"]);
  return roles.some((role) => allowedRoles.has(role));
};
