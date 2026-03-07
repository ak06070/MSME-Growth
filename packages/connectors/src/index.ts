export type ConnectorStatus = "idle" | "running" | "failed";

export interface ConnectorRunResult {
  status: ConnectorStatus;
  importedCount: number;
  errorCount: number;
}

export interface Connector {
  id: string;
  run(payload: string): Promise<ConnectorRunResult>;
}
