import type { AuditEvent, AuditLogger } from "@msme/types";
import type { PlatformPersistence } from "./persistence/platform-persistence";

export class InMemoryAuditLogger implements AuditLogger {
  private readonly events: AuditEvent[] = [];

  constructor(private readonly persistence?: PlatformPersistence) {}

  async log(event: AuditEvent): Promise<void> {
    this.events.push(event);

    try {
      await this.persistence?.saveAuditEvent(event);
    } catch (error) {
      // Audit persistence failures should not block request processing in baseline mode.
      const message = error instanceof Error ? error.message : "unknown_audit_persistence_error";
      process.stderr.write(`${message}\n`);
    }
  }

  getEvents(): AuditEvent[] {
    return [...this.events];
  }
}
