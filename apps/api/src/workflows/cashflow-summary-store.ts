export interface CashflowRiskFlag {
  code: string;
  severity: "low" | "medium" | "high";
  reason: string;
}

export interface CashflowSummarySnapshot {
  id: string;
  tenantId: string;
  organizationId: string;
  windowDays: number;
  generatedAt: string;
  totalOutstanding: number;
  overdueOutstanding: number;
  agingBuckets: {
    days0to30: number;
    days31to60: number;
    days61Plus: number;
  };
  riskFlags: CashflowRiskFlag[];
}

export class InMemoryCashflowSummaryStore {
  private readonly snapshots = new Map<string, CashflowSummarySnapshot>();

  save(snapshot: CashflowSummarySnapshot): void {
    this.snapshots.set(snapshot.id, snapshot);
  }

  get(id: string): CashflowSummarySnapshot | undefined {
    return this.snapshots.get(id);
  }
}
