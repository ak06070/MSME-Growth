import type { AuditEvent, AuditLogger } from "@msme/types";

export class InMemoryAuditLogger implements AuditLogger {
  private readonly events: AuditEvent[] = [];

  async log(event: AuditEvent): Promise<void> {
    this.events.push(event);
  }

  getEvents(): AuditEvent[] {
    return [...this.events];
  }
}
