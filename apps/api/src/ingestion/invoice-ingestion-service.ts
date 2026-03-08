import { randomUUID } from "node:crypto";
import { validateInvoice } from "@msme/types";
import type { AuditLogger, Invoice } from "@msme/types";
import { parseCsv } from "./csv-parser";
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

export interface InvoiceIngestionError {
  row: number;
  code: string;
  message: string;
  field?: string;
}

export interface InvoiceIngestionResult {
  runId: string;
  status: "completed" | "partial_success" | "failed";
  summary: {
    totalRows: number;
    successfulRows: number;
    duplicateRows: number;
    failedRows: number;
  };
  errors: InvoiceIngestionError[];
}

export interface IngestInvoiceCsvInput {
  actorId: string;
  tenantId: string;
  organizationId: string;
  csvContent: string;
  runLabel?: string;
}

export class InvoiceIngestionService {
  constructor(
    private readonly domainStore: InMemoryInvoiceDomainStore,
    private readonly auditLogger: AuditLogger
  ) {}

  async ingestCsv(input: IngestInvoiceCsvInput): Promise<InvoiceIngestionResult> {
    const runId = randomUUID();
    const parsed = parseCsv(input.csvContent);
    const errors: InvoiceIngestionError[] = [];

    await this.auditLogger.log({
      action: "admin",
      actorId: input.actorId,
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      resourceType: "invoice_ingestion_run",
      resourceId: runId,
      outcome: "success",
      timestamp: new Date().toISOString(),
      metadata: {
        stage: "start",
        runLabel: input.runLabel ?? ""
      }
    });

    const missingHeaders = requiredHeaders.filter((header) => !parsed.headers.includes(header));

    if (missingHeaders.length > 0) {
      const result: InvoiceIngestionResult = {
        runId,
        status: "failed",
        summary: {
          totalRows: 0,
          successfulRows: 0,
          duplicateRows: 0,
          failedRows: 0
        },
        errors: [
          {
            row: 0,
            code: "MISSING_HEADERS",
            message: `Missing required headers: ${missingHeaders.join(", ")}`
          }
        ]
      };

      await this.auditLogger.log({
        action: "admin",
        actorId: input.actorId,
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        resourceType: "invoice_ingestion_run",
        resourceId: runId,
        outcome: "failure",
        timestamp: new Date().toISOString(),
        metadata: {
          stage: "validate",
          reason: "missing_headers"
        }
      });

      return result;
    }

    let successfulRows = 0;
    let duplicateRows = 0;
    let failedRows = 0;

    parsed.rows.forEach((row, index) => {
      const rowNumber = index + 2;

      const invoiceNumber = row.invoice_number?.trim() ?? "";
      const invoiceDate = row.invoice_date?.trim() ?? "";
      const dueDate = row.due_date?.trim() ?? "";
      const customerExternalCode = row.customer_external_code?.trim() ?? "";
      const customerName = row.customer_name?.trim() ?? "";
      const currency = (row.currency?.trim() ?? "").toUpperCase();
      const subtotalAmount = Number(row.subtotal_amount);
      const taxAmount = Number(row.tax_amount);
      const totalAmount = Number(row.total_amount);

      if (!invoiceNumber || !invoiceDate || !dueDate || !customerName || !currency) {
        failedRows += 1;
        errors.push({
          row: rowNumber,
          code: "MISSING_REQUIRED_VALUE",
          message: "Required invoice fields are missing."
        });
        return;
      }

      if (!Number.isFinite(subtotalAmount) || !Number.isFinite(taxAmount) || !Number.isFinite(totalAmount)) {
        failedRows += 1;
        errors.push({
          row: rowNumber,
          code: "INVALID_AMOUNT",
          message: "Amount values must be valid numbers."
        });
        return;
      }

      if (currency !== "INR") {
        failedRows += 1;
        errors.push({
          row: rowNumber,
          code: "UNSUPPORTED_CURRENCY",
          message: "Only INR is supported in v1.",
          field: "currency"
        });
        return;
      }

      if (Math.abs(totalAmount - (subtotalAmount + taxAmount)) > 0.01) {
        failedRows += 1;
        errors.push({
          row: rowNumber,
          code: "TOTAL_MISMATCH",
          message: "total_amount must equal subtotal_amount + tax_amount."
        });
        return;
      }

      if (this.domainStore.hasInvoice(input.tenantId, input.organizationId, invoiceNumber)) {
        duplicateRows += 1;
        return;
      }

      const customer = this.domainStore.findOrCreateCustomer({
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        externalCode: customerExternalCode || undefined,
        customerName
      });

      const invoice: Invoice = {
        id: randomUUID(),
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        customerId: customer.id,
        invoiceNumber,
        invoiceDate,
        dueDate,
        currency,
        subtotalAmount,
        taxAmount,
        totalAmount,
        outstandingAmount: totalAmount,
        status: "issued",
        sourceType: "csv"
      };

      const validationErrors = validateInvoice(invoice);

      if (validationErrors.length > 0) {
        failedRows += 1;
        errors.push({
          row: rowNumber,
          code: "DOMAIN_VALIDATION_FAILED",
          message: validationErrors.join(" ")
        });
        return;
      }

      this.domainStore.saveInvoice(invoice);
      successfulRows += 1;
    });

    const status: InvoiceIngestionResult["status"] =
      failedRows > 0
        ? successfulRows > 0 || duplicateRows > 0
          ? "partial_success"
          : "failed"
        : duplicateRows > 0
          ? "partial_success"
          : "completed";

    const result: InvoiceIngestionResult = {
      runId,
      status,
      summary: {
        totalRows: parsed.rows.length,
        successfulRows,
        duplicateRows,
        failedRows
      },
      errors
    };

    await this.auditLogger.log({
      action: "admin",
      actorId: input.actorId,
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      resourceType: "invoice_ingestion_run",
      resourceId: runId,
      outcome: status === "failed" ? "failure" : "success",
      timestamp: new Date().toISOString(),
      metadata: {
        stage: "complete",
        status,
        totalRows: parsed.rows.length,
        successfulRows,
        duplicateRows,
        failedRows
      }
    });

    return result;
  }
}
