# Spec 005 - CSV Invoice Ingestion

- Status: Approved for implementation
- Last updated: 2026-03-08
- Depends on: Spec 003 Core Domain Model, Spec 004 Connector Framework

## Purpose
Define a Phase-1 workflow for CSV invoice upload, validation, normalization, and persistence into canonical invoice records.

## Supported Input Format
Required CSV columns (case-insensitive headers supported):
- `invoice_number`
- `invoice_date`
- `due_date`
- `customer_external_code`
- `customer_name`
- `subtotal_amount`
- `tax_amount`
- `total_amount`
- `currency`

Optional columns:
- `branch_code`
- `reference_notes`

File constraints:
- UTF-8 encoded CSV
- max file size: 10 MB (v1 default)
- max row count per upload: 10,000

## Validation Rules
- Mandatory columns must exist.
- Mandatory fields must be non-empty per row.
- `invoice_date` and `due_date` must parse as valid dates.
- `due_date` must be on/after `invoice_date`.
- amount fields must parse as non-negative decimals.
- `total_amount` must equal `subtotal_amount + tax_amount` within tolerance.
- `currency` must be valid allowed currency code (v1 baseline includes `INR`).
- tenant/org context required from authenticated request, never from file content.

## Duplicate Handling
Default duplicate key:
- `tenantId + organizationId + invoice_number`

Duplicate behavior in v1:
- row marked as duplicate and skipped
- ingest job proceeds for non-duplicate valid rows
- response includes duplicate row references and counts

## Mapping to Canonical Invoice Model
CSV rows normalize into canonical invoice entity fields:
- `invoice_number` -> `invoiceNumber`
- `invoice_date` -> `invoiceDate`
- `due_date` -> `dueDate`
- `currency` -> `currency`
- `subtotal_amount` -> `subtotalAmount`
- `tax_amount` -> `taxAmount`
- `total_amount` -> `totalAmount`
- `total_amount` -> initial `outstandingAmount`
- source metadata -> `sourceType=csv`

Customer resolution rules:
- match by `customer_external_code` when present
- fallback to `customer_name` exact match
- if no existing customer match, create customer in active tenant/org scope

## Error Reporting
Ingestion response must include:
- total rows processed
- successful rows count
- duplicate rows count
- failed rows count
- per-row error details:
  - row number
  - error code
  - message
  - offending field(s)

## User Feedback Expectations
- Upload acknowledgment with run ID.
- Deterministic completion status: `completed`, `partial_success`, or `failed`.
- Downloadable/returnable structured error summary payload.
- Clear indication that duplicates were skipped (not overwritten).

## API Design
Primary endpoint (v1):
- `POST /ingestion/invoices/csv`

Request:
- multipart file upload (`file`) and optional metadata (`runLabel`).
- auth/session context provides tenant/org scope.

Response (`200` or `202`):
```json
{
  "runId": "ing_001",
  "status": "partial_success",
  "summary": {
    "totalRows": 100,
    "successfulRows": 90,
    "duplicateRows": 5,
    "failedRows": 5
  },
  "errors": [
    {
      "row": 17,
      "code": "INVALID_DATE",
      "message": "due_date must be on/after invoice_date"
    }
  ]
}
```

## Storage Considerations
- Persist canonical invoice records only after validation passes per row.
- Persist ingestion run metadata and row-level outcomes for traceability.
- Store original file reference/path only when policy allows.
- Enforce tenant/org indexes for fast dedupe checks.

## Audit Requirements
Must audit:
- upload initiated
- validation completed
- persistence completed
- duplicates skipped summary
- failure outcome with reason metadata

## Acceptance Criteria
1. CSV files with valid rows ingest to canonical invoices successfully.
2. Invalid rows produce structured per-row error output.
3. Duplicate invoice rows are skipped with explicit reporting.
4. Ingestion is tenant-scoped and denies cross-tenant writes.
5. Audit events cover ingestion lifecycle states.
6. Tests cover happy path, validation failures, and duplicates.

## Test Cases
- valid single-row file ingests successfully
- mixed valid/invalid rows returns partial_success with errors
- duplicate invoice number row is skipped
- malformed header file returns validation failure
- cross-tenant write attempt is denied
- customer auto-create path works for unknown customer references

## Out of Scope
- OCR or PDF invoice extraction
- bank statement ingestion
- GST reconciliation logic
- collections workflow triggers beyond ingestion event hooks
- AI enrichment during ingestion
