import type { ConnectorRunStatus, ConnectorRunSummary } from "@msme/connectors";
import type { PlatformPersistence } from "../persistence/platform-persistence";

export interface ConnectorRunSnapshot {
  runId: string;
  connectorType: string;
  tenantId: string;
  organizationId: string;
  actorId?: string;
  status: ConnectorRunStatus;
  startedAt: string;
  completedAt: string;
  attempts: number;
  lastErrorCode?: string;
  nextRetryAt?: string;
  summary: ConnectorRunSummary;
}

export class InMemoryConnectorRunStore {
  private readonly runs = new Map<string, ConnectorRunSnapshot>();

  constructor(private readonly persistence?: PlatformPersistence) {}

  save(run: ConnectorRunSnapshot): void {
    this.runs.set(run.runId, run);

    void this.persistence?.saveConnectorRun(run).catch((error: unknown) => {
      const message =
        error instanceof Error ? error.message : "unknown_connector_run_persistence_error";
      process.stderr.write(`${message}\n`);
    });
  }

  get(runId: string): ConnectorRunSnapshot | undefined {
    return this.runs.get(runId);
  }

  list(filters?: {
    tenantId?: string;
    organizationId?: string;
    connectorType?: string;
  }): ConnectorRunSnapshot[] {
    return [...this.runs.values()]
      .filter((run) => {
        if (filters?.tenantId && run.tenantId !== filters.tenantId) {
          return false;
        }

        if (filters?.organizationId && run.organizationId !== filters.organizationId) {
          return false;
        }

        if (filters?.connectorType && run.connectorType !== filters.connectorType) {
          return false;
        }

        return true;
      })
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt));
  }
}
