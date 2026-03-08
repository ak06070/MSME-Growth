interface CounterMap {
  [key: string]: number;
}

const round = (value: number): number => {
  return Number(value.toFixed(4));
};

const percentage = (numerator: number, denominator: number): number => {
  if (denominator === 0) {
    return 1;
  }

  return numerator / denominator;
};

export class PilotMetricsRegistry {
  private readonly counters: CounterMap = {};
  private readonly latenciesMs: number[] = [];

  recordHttpRequest(input: {
    method: string;
    route: string;
    statusCode: number;
    durationMs: number;
  }): void {
    this.increment("http.total");
    this.increment(`http.method.${input.method.toUpperCase()}`);
    this.increment(`http.route.${input.route}`);

    if (input.statusCode >= 500) {
      this.increment("http.errors.5xx");
    } else if (input.statusCode >= 400) {
      this.increment("http.errors.4xx");
    } else {
      this.increment("http.success");
    }

    this.latenciesMs.push(input.durationMs);
  }

  recordAuthOutcome(success: boolean): void {
    this.increment("auth.total");
    this.increment(success ? "auth.success" : "auth.failure");
  }

  recordWorkflowOutcome(workflowType: string, status: string): void {
    this.increment("workflow.total");
    this.increment(`workflow.type.${workflowType}`);
    this.increment(`workflow.status.${status}`);
  }

  recordIngestionOutcome(input: {
    connectorType: string;
    status: string;
    totalRows: number;
    failedRows: number;
  }): void {
    this.increment("ingestion.total");
    this.increment(`ingestion.connector.${input.connectorType}`);
    this.increment(`ingestion.status.${input.status}`);
    this.incrementBy("ingestion.rows.total", input.totalRows);
    this.incrementBy("ingestion.rows.failed", input.failedRows);
  }

  recordNotificationOutcome(input: { channel: string; status: string }): void {
    this.increment("notification.total");
    this.increment(`notification.channel.${input.channel}`);
    this.increment(`notification.status.${input.status}`);
  }

  snapshot(): {
    generatedAt: string;
    requestVolume: number;
    latency: {
      p95Ms: number;
      averageMs: number;
    };
    http: {
      successRate: number;
      errorRate4xx: number;
      errorRate5xx: number;
    };
    auth: {
      successRate: number;
      failureRate: number;
    };
    workflows: {
      successRate: number;
      failedRate: number;
      escalatedRate: number;
    };
    ingestion: {
      completionRate: number;
      failedRunRate: number;
      rowFailureRate: number;
    };
    notifications: {
      sentRate: number;
      failedRate: number;
    };
  } {
    const httpTotal = this.get("http.total");
    const httpSuccess = this.get("http.success");
    const authTotal = this.get("auth.total");
    const authSuccess = this.get("auth.success");
    const workflowTotal = this.get("workflow.total");
    const workflowCompleted = this.get("workflow.status.completed");
    const workflowFailed = this.get("workflow.status.failed");
    const workflowEscalated = this.get("workflow.status.escalated");
    const ingestionTotal = this.get("ingestion.total");
    const ingestionFailed = this.get("ingestion.status.failed");
    const ingestionRowsTotal = this.get("ingestion.rows.total");
    const ingestionRowsFailed = this.get("ingestion.rows.failed");
    const notificationsTotal = this.get("notification.total");
    const notificationsSent = this.get("notification.status.sent");
    const notificationsFailed = this.get("notification.status.failed");

    return {
      generatedAt: new Date().toISOString(),
      requestVolume: httpTotal,
      latency: {
        p95Ms: round(this.percentileLatency(95)),
        averageMs: round(this.averageLatency())
      },
      http: {
        successRate: round(percentage(httpSuccess, httpTotal)),
        errorRate4xx: round(percentage(this.get("http.errors.4xx"), httpTotal)),
        errorRate5xx: round(percentage(this.get("http.errors.5xx"), httpTotal))
      },
      auth: {
        successRate: round(percentage(authSuccess, authTotal)),
        failureRate: round(percentage(this.get("auth.failure"), authTotal))
      },
      workflows: {
        successRate: round(percentage(workflowCompleted, workflowTotal)),
        failedRate: round(percentage(workflowFailed, workflowTotal)),
        escalatedRate: round(percentage(workflowEscalated, workflowTotal))
      },
      ingestion: {
        completionRate: round(
          percentage(
            this.get("ingestion.status.completed") + this.get("ingestion.status.partial_success"),
            ingestionTotal
          )
        ),
        failedRunRate: round(percentage(ingestionFailed, ingestionTotal)),
        rowFailureRate: round(percentage(ingestionRowsFailed, ingestionRowsTotal))
      },
      notifications: {
        sentRate: round(percentage(notificationsSent, notificationsTotal)),
        failedRate: round(percentage(notificationsFailed, notificationsTotal))
      }
    };
  }

  sloSnapshot(): {
    generatedAt: string;
    availabilityTarget: number;
    availabilityCurrent: number;
    errorBudgetRemaining: number;
    slos: Array<{
      key: string;
      target: number;
      current: number;
      met: boolean;
    }>;
  } {
    const snapshot = this.snapshot();
    const availabilityTarget = 0.995;
    const availabilityCurrent = 1 - snapshot.http.errorRate5xx;

    const slos = [
      {
        key: "auth_success_rate",
        target: 0.995,
        current: snapshot.auth.successRate
      },
      {
        key: "ingestion_completion_rate",
        target: 0.97,
        current: snapshot.ingestion.completionRate
      },
      {
        key: "workflow_completion_rate",
        target: 0.95,
        current: snapshot.workflows.successRate
      },
      {
        key: "notification_sent_rate",
        target: 0.95,
        current: snapshot.notifications.sentRate
      }
    ];

    return {
      generatedAt: new Date().toISOString(),
      availabilityTarget,
      availabilityCurrent: round(availabilityCurrent),
      errorBudgetRemaining: round(Math.max(0, availabilityTarget - snapshot.http.errorRate5xx)),
      slos: slos.map((slo) => ({
        key: slo.key,
        target: slo.target,
        current: round(slo.current),
        met: slo.current >= slo.target
      }))
    };
  }

  private increment(key: string): void {
    this.incrementBy(key, 1);
  }

  private incrementBy(key: string, value: number): void {
    this.counters[key] = (this.counters[key] ?? 0) + value;
  }

  private get(key: string): number {
    return this.counters[key] ?? 0;
  }

  private averageLatency(): number {
    if (this.latenciesMs.length === 0) {
      return 0;
    }

    const total = this.latenciesMs.reduce((sum, value) => sum + value, 0);
    return total / this.latenciesMs.length;
  }

  private percentileLatency(percentile: number): number {
    if (this.latenciesMs.length === 0) {
      return 0;
    }

    const sorted = [...this.latenciesMs].sort((left, right) => left - right);
    const index = Math.min(
      sorted.length - 1,
      Math.max(0, Math.ceil((percentile / 100) * sorted.length) - 1)
    );
    return sorted[index] ?? 0;
  }
}
