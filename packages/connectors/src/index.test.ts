import { describe, expect, it } from "vitest";
import {
  ConnectorOrchestrator,
  type ConnectorAdapter,
  type ConnectorContext,
  type ConnectorRawRecord
} from "./index";

interface CsvInput {
  content: string;
}

interface ParsedRow {
  invoiceNumber: string;
  amount: string;
}

interface CanonicalRow {
  invoiceNumber: string;
  amount: number;
  tenantId: string;
  organizationId: string;
}

const context: ConnectorContext = {
  tenantId: "ten_001",
  organizationId: "org_001",
  actorId: "usr_admin"
};

const parseRows = (content: string): ConnectorRawRecord<ParsedRow>[] => {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [invoiceNumber, amount] = line.split(",");
      return {
        index: index + 2,
        reference: `row-${index + 2}`,
        raw: {
          invoiceNumber: invoiceNumber ?? "",
          amount: amount ?? ""
        }
      };
    });
};

const buildInvoiceAdapter = (): ConnectorAdapter<CsvInput, ParsedRow, CanonicalRow, { id: string }> => {
  return {
    connectorType: "csv_invoice",
    retryPolicy: {
      maxAttempts: 1
    },
    validateTransport(input) {
      if (!input.content.trim()) {
        return [
          {
            stage: "transport",
            code: "EMPTY_CONTENT",
            message: "CSV content cannot be empty."
          }
        ];
      }

      return [];
    },
    parseInput(input) {
      return parseRows(input.content);
    },
    validateSchema(record) {
      if (!record.raw.invoiceNumber || !record.raw.amount) {
        return [
          {
            stage: "schema",
            code: "INVALID_SCHEMA",
            message: "invoiceNumber and amount are required."
          }
        ];
      }

      return [];
    },
    normalizeRecord(record, runContext) {
      const parsedAmount = Number(record.raw.amount);

      if (!Number.isFinite(parsedAmount)) {
        return {
          ok: false,
          issues: [
            {
              stage: "normalize",
              code: "INVALID_AMOUNT",
              message: "Amount must be numeric."
            }
          ]
        };
      }

      return {
        ok: true,
        value: {
          recordIndex: record.index,
          recordReference: record.reference,
          fingerprint: `${runContext.tenantId}:${runContext.organizationId}:${record.raw.invoiceNumber}`,
          lineage: {
            invoiceNumber: "invoice_number",
            amount: "amount"
          },
          canonical: {
            invoiceNumber: record.raw.invoiceNumber,
            amount: parsedAmount,
            tenantId: runContext.tenantId,
            organizationId: runContext.organizationId
          }
        }
      };
    },
    validateDomain(record) {
      if (record.canonical.amount <= 0) {
        return [
          {
            stage: "domain",
            code: "INVALID_DOMAIN_AMOUNT",
            message: "Amount must be greater than zero."
          }
        ];
      }

      return [];
    },
    validateScope(record, runContext) {
      if (
        record.canonical.tenantId !== runContext.tenantId ||
        record.canonical.organizationId !== runContext.organizationId
      ) {
        return [
          {
            stage: "scope",
            code: "SCOPE_VIOLATION",
            message: "Tenant scope mismatch."
          }
        ];
      }

      return [];
    },
    persistRecord(record) {
      return {
        id: `${record.canonical.invoiceNumber}-${record.canonical.amount}`
      };
    }
  };
};

describe("connector framework", () => {
  it("returns partial_success with duplicate and invalid records", async () => {
    const orchestrator = new ConnectorOrchestrator();
    orchestrator.register(buildInvoiceAdapter());

    const result = await orchestrator.run<CsvInput, ParsedRow, CanonicalRow, { id: string }>(
      "csv_invoice",
      {
        content: "INV-001,100\nINV-002,invalid\nINV-001,100"
      },
      context
    );

    expect(result.status).toBe("partial_success");
    expect(result.summary).toMatchObject({
      totalRecords: 3,
      successfulRecords: 1,
      duplicateRecords: 1,
      failedRecords: 1
    });
    expect(result.errors).toHaveLength(1);
    expect(result.persistedRecords).toHaveLength(1);
  });

  it("retries parser failures based on policy", async () => {
    let attempts = 0;

    const adapter: ConnectorAdapter<CsvInput, ParsedRow, CanonicalRow, { id: string }> = {
      ...buildInvoiceAdapter(),
      connectorType: "csv_retry",
      retryPolicy: {
        maxAttempts: 2,
        retryDelayMs: 0
      },
      parseInput(input) {
        attempts += 1;

        if (attempts === 1) {
          throw new Error("Transient parser error");
        }

        return parseRows(input.content);
      }
    };

    const orchestrator = new ConnectorOrchestrator();
    orchestrator.register(adapter);

    const result = await orchestrator.run<CsvInput, ParsedRow, CanonicalRow, { id: string }>(
      "csv_retry",
      {
        content: "INV-010,999"
      },
      context
    );

    expect(result.status).toBe("completed");
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts[0]?.status).toBe("failure");
    expect(result.attempts[1]?.status).toBe("success");
  });

  it("fails when record failures exceed threshold", async () => {
    const adapter: ConnectorAdapter<CsvInput, ParsedRow, CanonicalRow, { id: string }> = {
      ...buildInvoiceAdapter(),
      connectorType: "csv_threshold",
      maxRecordFailures: 0
    };

    const orchestrator = new ConnectorOrchestrator();
    orchestrator.register(adapter);

    const result = await orchestrator.run<CsvInput, ParsedRow, CanonicalRow, { id: string }>(
      "csv_threshold",
      {
        content: "INV-001,bad"
      },
      context
    );

    expect(result.status).toBe("failed");
    expect(result.lastErrorCode).toBe("FAILURE_THRESHOLD_EXCEEDED");
  });

  it("throws for unknown connector type", async () => {
    const orchestrator = new ConnectorOrchestrator();

    await expect(
      orchestrator.run("missing", { content: "INV-1,100" }, context)
    ).rejects.toThrowError(/Unknown connector type/);
  });
});
