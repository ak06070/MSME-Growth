import type { WorkflowDefinition } from "@msme/workflows";
import type { Invoice } from "@msme/types";
import type { CashflowRiskFlag, CashflowSummarySnapshot } from "./cashflow-summary-store";

export const CASHFLOW_WORKFLOW_TYPE = "cashflow_summary";
export const CASHFLOW_APPROVAL_STEP_ID = "approve_external_share";

export const createCashflowSummaryWorkflowDefinition = (): WorkflowDefinition => {
  return {
    workflowType: CASHFLOW_WORKFLOW_TYPE,
    version: 1,
    triggerTypes: ["manual", "scheduled", "event"],
    steps: [
      {
        id: "aggregate_summary",
        name: "Aggregate summary",
        type: "task",
        runner: async (context) => {
          const snapshot = context.payload?.snapshot as CashflowSummarySnapshot | undefined;
          return {
            outcome: "completed",
            output: {
              snapshotId: snapshot?.id,
              riskFlagCount: snapshot?.riskFlags.length ?? 0
            }
          };
        }
      },
      {
        id: CASHFLOW_APPROVAL_STEP_ID,
        name: "Approve external share",
        type: "approval",
        approvalTimeoutMs: 60 * 60 * 1000
      },
      {
        id: "publish_summary",
        name: "Publish summary",
        type: "task",
        runner: async () => ({
          outcome: "completed"
        })
      }
    ]
  };
};

export const isCashflowWorkflowRoleAllowed = (roles: string[]): boolean => {
  const allowedRoles = new Set(["owner", "admin", "finance_manager", "accountant"]);
  return roles.some((role) => allowedRoles.has(role));
};

const dayMs = 24 * 60 * 60 * 1000;

export const buildCashflowSummary = (input: {
  tenantId: string;
  organizationId: string;
  invoices: Invoice[];
  windowDays: number;
  now: Date;
  snapshotId: string;
}): CashflowSummarySnapshot => {
  const scopedInvoices = input.invoices.filter(
    (invoice) =>
      invoice.tenantId === input.tenantId &&
      invoice.organizationId === input.organizationId &&
      invoice.outstandingAmount > 0
  );

  const cutoff = input.now.getTime() - input.windowDays * dayMs;
  const withinWindow = scopedInvoices.filter(
    (invoice) => new Date(invoice.invoiceDate).getTime() >= cutoff
  );

  const totalOutstanding = withinWindow.reduce(
    (sum, invoice) => sum + invoice.outstandingAmount,
    0
  );

  let overdueOutstanding = 0;
  const buckets = {
    days0to30: 0,
    days31to60: 0,
    days61Plus: 0
  };

  for (const invoice of withinWindow) {
    const dueDate = new Date(invoice.dueDate).getTime();
    const ageInDays = Math.floor((input.now.getTime() - dueDate) / dayMs);

    if (ageInDays > 0) {
      overdueOutstanding += invoice.outstandingAmount;

      if (ageInDays <= 30) {
        buckets.days0to30 += invoice.outstandingAmount;
      } else if (ageInDays <= 60) {
        buckets.days31to60 += invoice.outstandingAmount;
      } else {
        buckets.days61Plus += invoice.outstandingAmount;
      }
    }
  }

  const riskFlags: CashflowRiskFlag[] = [];

  if (overdueOutstanding > 0 && totalOutstanding > 0) {
    const overdueRatio = overdueOutstanding / totalOutstanding;

    if (overdueRatio >= 0.5) {
      riskFlags.push({
        code: "HIGH_OVERDUE_CONCENTRATION",
        severity: "high",
        reason: "Overdue outstanding exceeds 50% of total outstanding."
      });
    } else if (overdueRatio >= 0.3) {
      riskFlags.push({
        code: "MODERATE_OVERDUE_CONCENTRATION",
        severity: "medium",
        reason: "Overdue outstanding exceeds 30% of total outstanding."
      });
    }
  }

  if (buckets.days61Plus > 0) {
    riskFlags.push({
      code: "LONG_AGING_RECEIVABLES",
      severity: "high",
      reason: "Outstanding receivables older than 60 days are present."
    });
  }

  return {
    id: input.snapshotId,
    tenantId: input.tenantId,
    organizationId: input.organizationId,
    windowDays: input.windowDays,
    generatedAt: input.now.toISOString(),
    totalOutstanding,
    overdueOutstanding,
    agingBuckets: buckets,
    riskFlags
  };
};
