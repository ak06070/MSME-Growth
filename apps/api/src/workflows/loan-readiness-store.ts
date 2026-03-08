import { randomUUID } from "node:crypto";

export interface LoanChecklistItem {
  key: string;
  label: string;
  completed: boolean;
}

export interface LoanReadinessWorkspaceRecord {
  id: string;
  tenantId: string;
  organizationId: string;
  name: string;
  status: "open" | "in_review" | "submitted" | "closed";
  checklistProgress: number;
  checklistItems: LoanChecklistItem[];
  riskFlags: string[];
  exportSnapshotPath?: string;
  createdAt: string;
  updatedAt: string;
}

export class InMemoryLoanReadinessStore {
  private readonly workspaces = new Map<string, LoanReadinessWorkspaceRecord>();

  createWorkspace(input: {
    tenantId: string;
    organizationId: string;
    name: string;
  }): LoanReadinessWorkspaceRecord {
    const now = new Date().toISOString();
    const workspace: LoanReadinessWorkspaceRecord = {
      id: randomUUID(),
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      name: input.name,
      status: "open",
      checklistProgress: 0,
      checklistItems: [
        { key: "financial_statements", label: "Financial Statements", completed: false },
        { key: "gst_references", label: "GST References", completed: false },
        { key: "kyc_documents", label: "KYC Documents", completed: false }
      ],
      riskFlags: [],
      createdAt: now,
      updatedAt: now
    };

    this.workspaces.set(workspace.id, workspace);
    return workspace;
  }

  getWorkspace(id: string): LoanReadinessWorkspaceRecord | undefined {
    return this.workspaces.get(id);
  }

  updateChecklist(input: {
    workspaceId: string;
    checklistItems: Array<{ key: string; completed: boolean }>;
    riskFlags?: string[];
  }): LoanReadinessWorkspaceRecord | null {
    const workspace = this.workspaces.get(input.workspaceId);

    if (!workspace) {
      return null;
    }

    const nextItems = workspace.checklistItems.map((item) => {
      const update = input.checklistItems.find((candidate) => candidate.key === item.key);
      if (!update) {
        return item;
      }
      return {
        ...item,
        completed: update.completed
      };
    });

    const completedCount = nextItems.filter((item) => item.completed).length;
    const checklistProgress = Math.round((completedCount / nextItems.length) * 100);

    workspace.checklistItems = nextItems;
    workspace.checklistProgress = checklistProgress;
    workspace.riskFlags = input.riskFlags ?? workspace.riskFlags;
    workspace.status = checklistProgress === 100 ? "in_review" : "open";
    workspace.updatedAt = new Date().toISOString();

    this.workspaces.set(workspace.id, workspace);
    return workspace;
  }

  markExported(input: {
    workspaceId: string;
    exportSnapshotPath: string;
  }): LoanReadinessWorkspaceRecord | null {
    const workspace = this.workspaces.get(input.workspaceId);

    if (!workspace) {
      return null;
    }

    workspace.status = "submitted";
    workspace.exportSnapshotPath = input.exportSnapshotPath;
    workspace.updatedAt = new Date().toISOString();
    this.workspaces.set(workspace.id, workspace);

    return workspace;
  }
}
