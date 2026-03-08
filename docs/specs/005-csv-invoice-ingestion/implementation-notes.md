# Spec 005 Implementation Notes

## Scope Confirmation
Implemented only CSV invoice ingestion scope:
- ingestion endpoint in API
- CSV parsing
- validation rules
- duplicate detection
- normalization to canonical invoice model
- in-memory persistence
- audit logging
- tests

No OCR, bank statements, GST reconciliation, collections workflows, cashflow AI, loan-readiness logic, or unrelated notifications were added.

## What Was Added
- `POST /ingestion/invoices/csv` endpoint (auth-protected).
- CSV parser utility and ingestion service pipeline.
- Duplicate detection using `tenantId + organizationId + invoiceNumber`.
- Customer resolution and auto-create baseline in tenant/org scope.
- Canonical invoice validation through shared domain validators.
- In-memory invoice/customer store for ingestion persistence baseline.
- Audit events for ingestion start and completion/failure.
- Ingestion integration tests for valid, duplicate, invalid, and unauthenticated scenarios.

## Validation Evidence
Successful commands:
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`

## Assumptions Recorded
- v1 handler accepts JSON payload with `csvContent` (upload handler baseline) rather than multipart file streams.
- CSV parser is minimal and does not yet support quoted comma-escaped fields.
- In-memory persistence is used in this stage; persistent storage wiring is deferred.

## Remaining Gaps (Out of Scope)
- multipart file upload transport
- persistent ingestion run history tables
- downloadable error report artifact storage
- advanced CSV parser edge-case handling
