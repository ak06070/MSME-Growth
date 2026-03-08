import { randomUUID } from "node:crypto";
import {
  ConnectorOrchestrator,
  type ConnectorAdapter,
  type ConnectorContext,
  type ConnectorRunResult,
  type ConnectorValidationIssue
} from "@msme/connectors";
import { validateInvoice } from "@msme/types";
import type { AuditLogger, Invoice } from "@msme/types";
import { parseCsv } from "./csv-parser";
import { InMemoryConnectorRunStore } from "./connector-run-store";
import { InMemoryInvoiceDomainStore } from "./invoice-domain-store";

const requiredHeaders = [
  "invoice_number",
  "invoice_date",
  "due_date",
  "customer_external_code",
  "customer_name",
  "subtotal_amount",
  "tax_amount",
  "total_amount",
  "currency"
];

const CSV_INVOICE_CONNECTOR_TYPE = "invoice_csv_v1";
const MANUAL_INVOICE_CONNECTOR_TYPE = "invoice_manual_v1";
const MAX_CSV_BYTES = 2 * 1024 * 1024;
const MAX_MANUAL_RECORDS = 1000;

interface CanonicalInvoiceDraft {
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  customerExternalCode?: string;
  customerName: string;
  subtotalAmount: number;
  taxAmount: number;
  totalAmount: number;
  currency: string;
  sourceType: "csv" | "manual";
  allowUpsert: boolean;
}

interface CsvConnectorInput {
  csvContent: string;
  allowUpsert: boolean;
}

interface ManualConnectorInput {
  invoices: ManualInvoiceEntry[];
  allowUpsert: boolean;
}

interface CsvRawInvoiceRecord {
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  customer_external_code: string;
  customer_name: string;
  subtotal_amount: string;
  tax_amount: string;
  total_amount: string;
  currency: string;
}

interface ManualRawInvoiceRecord {
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  customer_external_code: string;
  customer_name: string;
  subtotal_amount: string;
  tax_amount: string;
  total_amount: string;
  currency: string;
  source_reference: string;
  allow_upsert: boolean;
}

export interface InvoiceIngestionError {
  row: number;
  code: string;
  message: string;
  field?: string;
}

export interface InvoiceIngestionResult {
  runId: string;
  connectorType: string;
  status: "completed" | "partial_success" | "failed";
  summary: {
    totalRows: number;
    successfulRows: number;
    duplicateRows: number;
    failedRows: number;
  };
  errors: InvoiceIngestionError[];
  attempts: number;
  lastErrorCode?: string;
}

export interface IngestInvoiceCsvInput {
  actorId: string;
  tenantId: string;
  organizationId: string;
  csvContent: string;
  runLabel?: string;
  allowUpsert?: boolean;
}

export interface ManualInvoiceEntry {
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  customerExternalCode?: string;
  customerName: string;
  subtotalAmount: number;
  taxAmount: number;
  totalAmount: number;
  currency: string;
  sourceReference?: string;
}

export interface IngestManualInvoicesInput {
  actorId: string;
  tenantId: string;
  organizationId: string;
  invoices: ManualInvoiceEntry[];
  runLabel?: string;
  allowUpsert?: boolean;
}

interface PersistedInvoiceRecord {
  invoiceId: string;
  customerId: string;
  invoiceNumber: string;
}

const toFailureOutcome = (
  action: "start" | "validate" | "persist" | "retry" | "complete" | "fail"
): "success" | "failure" => {
  return action === "fail" ? "failure" : "success";
};

const toIngestionStatus = (
  status: ConnectorRunResult<PersistedInvoiceRecord>["status"]
): InvoiceIngestionResult["status"] => {
  if (status === "completed") {
    return "completed";
  }

  if (status === "partial_success") {
    return "partial_success";
  }

  return "failed";
};

const toInvoiceValidationErrors = (issues: ConnectorValidationIssue[]): InvoiceIngestionError[] => {
  return issues.map((issue) => ({
    row: issue.recordIndex ?? 0,
    code: issue.code,
    message: issue.message,
    field: issue.field
  }));
};

const normalizeDraft = (
  rawRecord: {
    invoice_number?: string;
    invoice_date?: string;
    due_date?: string;
    customer_external_code?: string;
    customer_name?: string;
    subtotal_amount?: string;
    tax_amount?: string;
    total_amount?: string;
    currency?: string;
  },
  sourceType: "csv" | "manual",
  allowUpsert: boolean
):
  | { ok: true; value: CanonicalInvoiceDraft }
  | {
      ok: false;
      issues: ConnectorValidationIssue[];
    } => {
  const invoiceNumber = rawRecord.invoice_number?.trim() ?? "";
  const invoiceDate = rawRecord.invoice_date?.trim() ?? "";
  const dueDate = rawRecord.due_date?.trim() ?? "";
  const customerExternalCode = rawRecord.customer_external_code?.trim() ?? "";
  const customerName = rawRecord.customer_name?.trim() ?? "";
  const currency = (rawRecord.currency?.trim() ?? "").toUpperCase();
  const subtotalAmount = Number(rawRecord.subtotal_amount);
  const taxAmount = Number(rawRecord.tax_amount);
  const totalAmount = Number(rawRecord.total_amount);

  const issues: ConnectorValidationIssue[] = [];

  if (!invoiceNumber || !invoiceDate || !dueDate || !customerName || !currency) {
    issues.push({
      stage: "normalize",
      code: "MISSING_REQUIRED_VALUE",
      message: "Required invoice fields are missing."
    });
  }

  if (!Number.isFinite(subtotalAmount) || !Number.isFinite(taxAmount) || !Number.isFinite(totalAmount)) {
    issues.push({
      stage: "normalize",
      code: "INVALID_AMOUNT",
      message: "Amount values must be valid numbers."
    });
  }

  if (issues.length > 0) {
    return {
      ok: false,
      issues
    };
  }

  return {
    ok: true,
    value: {
      invoiceNumber,
      invoiceDate,
      dueDate,
      customerExternalCode: customerExternalCode || undefined,
      customerName,
      subtotalAmount,
      taxAmount,
      totalAmount,
      currency,
      sourceType,
      allowUpsert
    }
  };
};

const validateCanonicalDraft = (
  draft: CanonicalInvoiceDraft,
  context: ConnectorContext
): ConnectorValidationIssue[] => {
  const issues: ConnectorValidationIssue[] = [];

  if (draft.currency !== "INR") {
    issues.push({
      stage: "domain",
      code: "UNSUPPORTED_CURRENCY",
      message: "Only INR is supported in v1.",
      field: "currency"
    });
  }

  if (Math.abs(draft.totalAmount - (draft.subtotalAmount + draft.taxAmount)) > 0.01) {
    issues.push({
      stage: "domain",
      code: "TOTAL_MISMATCH",
      message: "total_amount must equal subtotal_amount + tax_amount."
    });
  }

  const invoiceForValidation: Invoice = {
    id: "validation-invoice",
    tenantId: context.tenantId,
    organizationId: context.organizationId,
    customerId: "validation-customer",
    invoiceNumber: draft.invoiceNumber,
    invoiceDate: draft.invoiceDate,
    dueDate: draft.dueDate,
    currency: draft.currency,
    subtotalAmount: draft.subtotalAmount,
    taxAmount: draft.taxAmount,
    totalAmount: draft.totalAmount,
    outstandingAmount: draft.totalAmount,
    status: "issued",
    sourceType: draft.sourceType
  };

  const domainValidationErrors = validateInvoice(invoiceForValidation);

  if (domainValidationErrors.length > 0) {
    issues.push({
      stage: "domain",
      code: "DOMAIN_VALIDATION_FAILED",
      message: domainValidationErrors.join(" ")
    });
  }

  return issues;
};

const buildCsvConnector = (
  domainStore: InMemoryInvoiceDomainStore
): ConnectorAdapter<CsvConnectorInput, CsvRawInvoiceRecord, CanonicalInvoiceDraft, PersistedInvoiceRecord> => {
  return {
    connectorType: CSV_INVOICE_CONNECTOR_TYPE,
    retryPolicy: {
      maxAttempts: 2,
      retryDelayMs: 100
    },
    validateTransport(input) {
      if (!input.csvContent.trim()) {
        return [
          {
            stage: "transport",
            code: "EMPTY_PAYLOAD",
            message: "CSV payload cannot be empty."
          }
        ];
      }

      if (Buffer.byteLength(input.csvContent, "utf8") > MAX_CSV_BYTES) {
        return [
          {
            stage: "transport",
            code: "PAYLOAD_TOO_LARGE",
            message: `CSV payload exceeds ${MAX_CSV_BYTES} bytes.`
          }
        ];
      }

      const parsed = parseCsv(input.csvContent);
      const missingHeaders = requiredHeaders.filter((header) => !parsed.headers.includes(header));

      if (missingHeaders.length > 0) {
        return [
          {
            stage: "schema",
            code: "MISSING_HEADERS",
            message: `Missing required headers: ${missingHeaders.join(", ")}`
          }
        ];
      }

      return [];
    },
    parseInput(input) {
      const parsed = parseCsv(input.csvContent);

      return parsed.rows.map((row, index) => ({
        index: index + 2,
        reference: `csv-row-${index + 2}`,
        raw: {
          invoice_number: row.invoice_number ?? "",
          invoice_date: row.invoice_date ?? "",
          due_date: row.due_date ?? "",
          customer_external_code: row.customer_external_code ?? "",
          customer_name: row.customer_name ?? "",
          subtotal_amount: row.subtotal_amount ?? "",
          tax_amount: row.tax_amount ?? "",
          total_amount: row.total_amount ?? "",
          currency: row.currency ?? ""
        }
      }));
    },
    validateSchema(record) {
      const requiredFields: Array<keyof CsvRawInvoiceRecord> = [
        "invoice_number",
        "invoice_date",
        "due_date",
        "customer_name",
        "subtotal_amount",
        "tax_amount",
        "total_amount",
        "currency"
      ];

      const missing = requiredFields.filter((field) => (record.raw[field] ?? "").trim().length === 0);

      if (missing.length > 0) {
        return [
          {
            stage: "schema",
            code: "MISSING_REQUIRED_VALUE",
            message: `Missing required fields: ${missing.join(", ")}`
          }
        ];
      }

      return [];
    },
    normalizeRecord(record) {
      const normalized = normalizeDraft(record.raw, "csv", false);

      if (!normalized.ok) {
        return normalized;
      }

      return {
        ok: true,
        value: {
          recordIndex: record.index,
          recordReference: record.reference,
          fingerprint: `${normalized.value.invoiceNumber}:${normalized.value.sourceType}`,
          lineage: {
            invoiceNumber: "invoice_number",
            invoiceDate: "invoice_date",
            dueDate: "due_date",
            customerExternalCode: "customer_external_code",
            customerName: "customer_name",
            subtotalAmount: "subtotal_amount",
            taxAmount: "tax_amount",
            totalAmount: "total_amount",
            currency: "currency"
          },
          canonical: {
            ...normalized.value,
            allowUpsert: false
          }
        }
      };
    },
    validateDomain(record, context) {
      return validateCanonicalDraft(record.canonical, context);
    },
    validateScope(record, context) {
      if (!context.tenantId || !context.organizationId) {
        return [
          {
            stage: "scope",
            code: "INVALID_SCOPE",
            message: "Tenant and organization scope are required."
          }
        ];
      }

      if (!record.canonical.invoiceNumber) {
        return [
          {
            stage: "scope",
            code: "INVALID_SCOPE_RECORD",
            message: "Invoice number is required for scope checks."
          }
        ];
      }

      return [];
    },
    checkDuplicate(record, context) {
      const duplicate = domainStore.hasInvoice(
        context.tenantId,
        context.organizationId,
        record.canonical.invoiceNumber
      );

      return {
        isDuplicate: duplicate,
        outcome: record.canonical.allowUpsert ? "upsert" : "skip",
        reason: duplicate ? "Invoice already exists for tenant/org + invoiceNumber key." : undefined
      };
    },
    persistRecord(record, context, mode) {
      const customer = domainStore.findOrCreateCustomer({
        tenantId: context.tenantId,
        organizationId: context.organizationId,
        externalCode: record.canonical.customerExternalCode,
        customerName: record.canonical.customerName
      });

      const invoice = domainStore.saveInvoice(
        {
          id: randomUUID(),
          tenantId: context.tenantId,
          organizationId: context.organizationId,
          customerId: customer.id,
          invoiceNumber: record.canonical.invoiceNumber,
          invoiceDate: record.canonical.invoiceDate,
          dueDate: record.canonical.dueDate,
          currency: record.canonical.currency,
          subtotalAmount: record.canonical.subtotalAmount,
          taxAmount: record.canonical.taxAmount,
          totalAmount: record.canonical.totalAmount,
          outstandingAmount: record.canonical.totalAmount,
          status: "issued",
          sourceType: record.canonical.sourceType
        },
        mode
      );

      return {
        invoiceId: invoice.id,
        customerId: customer.id,
        invoiceNumber: invoice.invoiceNumber
      };
    }
  };
};

const buildManualConnector = (
  domainStore: InMemoryInvoiceDomainStore
): ConnectorAdapter<
  ManualConnectorInput,
  ManualRawInvoiceRecord,
  CanonicalInvoiceDraft,
  PersistedInvoiceRecord
> => {
  return {
    connectorType: MANUAL_INVOICE_CONNECTOR_TYPE,
    retryPolicy: {
      maxAttempts: 1,
      retryDelayMs: 0
    },
    validateTransport(input) {
      if (!Array.isArray(input.invoices) || input.invoices.length === 0) {
        return [
          {
            stage: "transport",
            code: "EMPTY_MANUAL_PAYLOAD",
            message: "Manual ingestion payload must include at least one invoice."
          }
        ];
      }

      if (input.invoices.length > MAX_MANUAL_RECORDS) {
        return [
          {
            stage: "transport",
            code: "PAYLOAD_TOO_LARGE",
            message: `Manual ingestion supports at most ${MAX_MANUAL_RECORDS} records per run.`
          }
        ];
      }

      return [];
    },
    parseInput(input) {
      return input.invoices.map((invoice, index) => ({
        index: index + 1,
        reference: invoice.sourceReference ?? `manual-row-${index + 1}`,
        raw: {
          invoice_number: invoice.invoiceNumber,
          invoice_date: invoice.invoiceDate,
          due_date: invoice.dueDate,
          customer_external_code: invoice.customerExternalCode ?? "",
          customer_name: invoice.customerName,
          subtotal_amount: String(invoice.subtotalAmount),
          tax_amount: String(invoice.taxAmount),
          total_amount: String(invoice.totalAmount),
          currency: invoice.currency,
          source_reference: invoice.sourceReference ?? `manual-row-${index + 1}`,
          allow_upsert: input.allowUpsert
        }
      }));
    },
    validateSchema(record) {
      if (!record.raw.invoice_number || !record.raw.customer_name) {
        return [
          {
            stage: "schema",
            code: "MISSING_REQUIRED_VALUE",
            message: "Manual record is missing required invoice fields."
          }
        ];
      }

      return [];
    },
    normalizeRecord(record) {
      const normalized = normalizeDraft(record.raw, "manual", record.raw.allow_upsert);

      if (!normalized.ok) {
        return normalized;
      }

      return {
        ok: true,
        value: {
          recordIndex: record.index,
          recordReference: record.reference,
          fingerprint: `${normalized.value.invoiceNumber}:${normalized.value.sourceType}`,
          lineage: {
            invoiceNumber: "invoice_number",
            invoiceDate: "invoice_date",
            dueDate: "due_date",
            customerExternalCode: "customer_external_code",
            customerName: "customer_name",
            subtotalAmount: "subtotal_amount",
            taxAmount: "tax_amount",
            totalAmount: "total_amount",
            currency: "currency"
          },
          canonical: normalized.value
        }
      };
    },
    validateDomain(record, context) {
      return validateCanonicalDraft(record.canonical, context);
    },
    validateScope(_record, context) {
      if (!context.tenantId || !context.organizationId) {
        return [
          {
            stage: "scope",
            code: "INVALID_SCOPE",
            message: "Tenant and organization scope are required."
          }
        ];
      }

      return [];
    },
    checkDuplicate(record, context) {
      const duplicate = domainStore.hasInvoice(
        context.tenantId,
        context.organizationId,
        record.canonical.invoiceNumber
      );

      return {
        isDuplicate: duplicate,
        outcome: record.canonical.allowUpsert ? "upsert" : "skip",
        reason: duplicate ? "Invoice already exists for tenant/org + invoiceNumber key." : undefined
      };
    },
    persistRecord(record, context, mode) {
      const customer = domainStore.findOrCreateCustomer({
        tenantId: context.tenantId,
        organizationId: context.organizationId,
        externalCode: record.canonical.customerExternalCode,
        customerName: record.canonical.customerName
      });

      const invoice = domainStore.saveInvoice(
        {
          id: randomUUID(),
          tenantId: context.tenantId,
          organizationId: context.organizationId,
          customerId: customer.id,
          invoiceNumber: record.canonical.invoiceNumber,
          invoiceDate: record.canonical.invoiceDate,
          dueDate: record.canonical.dueDate,
          currency: record.canonical.currency,
          subtotalAmount: record.canonical.subtotalAmount,
          taxAmount: record.canonical.taxAmount,
          totalAmount: record.canonical.totalAmount,
          outstandingAmount: record.canonical.totalAmount,
          status: "issued",
          sourceType: record.canonical.sourceType
        },
        mode
      );

      return {
        invoiceId: invoice.id,
        customerId: customer.id,
        invoiceNumber: invoice.invoiceNumber
      };
    }
  };
};

export class InvoiceIngestionService {
  private readonly orchestrator: ConnectorOrchestrator;

  constructor(
    private readonly domainStore: InMemoryInvoiceDomainStore,
    private readonly auditLogger: AuditLogger,
    private readonly connectorRunStore = new InMemoryConnectorRunStore()
  ) {
    this.orchestrator = new ConnectorOrchestrator({
      auditSink: async (event) => {
        await this.auditLogger.log({
          action: "admin",
          actorId: event.actorId,
          tenantId: event.tenantId,
          organizationId: event.organizationId,
          resourceType: "connector_run",
          resourceId: event.runId,
          outcome: toFailureOutcome(event.action),
          timestamp: event.timestamp,
          metadata: {
            connectorType: event.connectorType,
            connectorAction: event.action,
            status: event.status,
            ...(event.metadata ?? {})
          }
        });
      }
    });

    this.orchestrator.register(buildCsvConnector(this.domainStore));
    this.orchestrator.register(buildManualConnector(this.domainStore));
  }

  async ingestCsv(input: IngestInvoiceCsvInput): Promise<InvoiceIngestionResult> {
    const result = await this.orchestrator.run<
      CsvConnectorInput,
      CsvRawInvoiceRecord,
      CanonicalInvoiceDraft,
      PersistedInvoiceRecord
    >(
      CSV_INVOICE_CONNECTOR_TYPE,
      {
        csvContent: input.csvContent,
        allowUpsert: input.allowUpsert ?? false
      },
      {
        actorId: input.actorId,
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        runLabel: input.runLabel
      }
    );

    return this.storeAndMapResult(result, {
      actorId: input.actorId,
      tenantId: input.tenantId,
      organizationId: input.organizationId
    });
  }

  async ingestManual(input: IngestManualInvoicesInput): Promise<InvoiceIngestionResult> {
    const result = await this.orchestrator.run<
      ManualConnectorInput,
      ManualRawInvoiceRecord,
      CanonicalInvoiceDraft,
      PersistedInvoiceRecord
    >(
      MANUAL_INVOICE_CONNECTOR_TYPE,
      {
        invoices: input.invoices,
        allowUpsert: input.allowUpsert ?? false
      },
      {
        actorId: input.actorId,
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        runLabel: input.runLabel
      }
    );

    return this.storeAndMapResult(result, {
      actorId: input.actorId,
      tenantId: input.tenantId,
      organizationId: input.organizationId
    });
  }

  listConnectorRuns(input: {
    tenantId: string;
    organizationId: string;
    connectorType?: string;
  }) {
    return this.connectorRunStore.list({
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      connectorType: input.connectorType
    });
  }

  private storeAndMapResult(
    result: ConnectorRunResult<PersistedInvoiceRecord>,
    scope: {
      actorId: string;
      tenantId: string;
      organizationId: string;
    }
  ): InvoiceIngestionResult {
    this.connectorRunStore.save({
      runId: result.runId,
      connectorType: result.connectorType,
      actorId: scope.actorId,
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      status: result.status,
      startedAt: result.startedAt,
      completedAt: result.completedAt,
      attempts: result.attempts.length,
      lastErrorCode: result.lastErrorCode,
      nextRetryAt: result.nextRetryAt,
      summary: result.summary
    });

    return {
      runId: result.runId,
      connectorType: result.connectorType,
      status: toIngestionStatus(result.status),
      summary: {
        totalRows: result.summary.totalRecords,
        successfulRows: result.summary.successfulRecords,
        duplicateRows: result.summary.duplicateRecords,
        failedRows: result.summary.failedRecords
      },
      errors: toInvoiceValidationErrors(result.errors),
      attempts: result.attempts.length,
      lastErrorCode: result.lastErrorCode
    };
  }
}

export const invoiceConnectorTypes = {
  csv: CSV_INVOICE_CONNECTOR_TYPE,
  manual: MANUAL_INVOICE_CONNECTOR_TYPE
} as const;
