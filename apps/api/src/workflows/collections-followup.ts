import type { Invoice } from "@msme/types";
import type { WorkflowDefinition } from "@msme/workflows";

export const COLLECTIONS_WORKFLOW_TYPE = "collections_followup";
export const COLLECTIONS_APPROVAL_STEP_ID = "approve_escalation";

export const createCollectionsFollowupWorkflowDefinition = (): WorkflowDefinition => {
  return {
    workflowType: COLLECTIONS_WORKFLOW_TYPE,
    version: 1,
    triggerTypes: ["manual", "scheduled", "event"],
    steps: [
      {
        id: "prepare_overdue_invoices",
        name: "Prepare overdue invoices",
        type: "task",
        runner: async (context) => {
          const overdueInvoices = (context.payload?.overdueInvoices as Invoice[] | undefined) ?? [];
          return {
            outcome: "completed",
            output: {
              overdueCount: overdueInvoices.length
            }
          };
        }
      },
      {
        id: COLLECTIONS_APPROVAL_STEP_ID,
        name: "Approve escalation",
        type: "approval",
        approvalTimeoutMs: 60 * 60 * 1000
      },
      {
        id: "queue_followup_actions",
        name: "Queue follow-up actions",
        type: "task",
        runner: async (context) => {
          const overdueInvoices = (context.payload?.overdueInvoices as Invoice[] | undefined) ?? [];
          return {
            outcome: "completed",
            output: {
              queuedActionCount: overdueInvoices.length
            }
          };
        }
      }
    ]
  };
};

export const isCollectionsWorkflowRoleAllowed = (roles: string[]): boolean => {
  const allowedRoles = new Set(["owner", "admin", "finance_manager", "collections_agent"]);
  return roles.some((role) => allowedRoles.has(role));
};
