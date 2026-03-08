# Spec 004 Implementation Notes

## Scope Confirmation
Implemented the reusable connector framework and integrated it into invoice ingestion without adding out-of-scope connectors.

Implemented:
- shared connector runtime with lifecycle states and deterministic retries
- explicit validation/normalization pipeline stages
- duplicate detection and idempotency behavior (`skip`, `upsert`, `fail`)
- connector run tracking and tenant-scoped run listing
- CSV + manual invoice connector adapters using shared runtime
- connector lifecycle audit emission and persistence hooks

Not implemented:
- live accounting APIs
- live bank/GST connectors
- OCR-driven ingestion

## What Was Added
- `packages/connectors/src/index.ts`: connector interfaces, runtime, registry, orchestrator, retry and dedupe controls.
- `packages/connectors/src/index.test.ts`: tests for partial success, retries, failure thresholds, and unknown connector handling.
- `apps/api/src/ingestion/invoice-ingestion-service.ts`: migrated to connector runtime for CSV/manual ingestion.
- `apps/api/src/ingestion/connector-run-store.ts`: run metadata snapshot store with optional durable persistence sink.
- `apps/api/src/ingestion/invoice-domain-store.ts`: dedupe lookup and upsert-safe persistence behavior.
- `apps/api/src/server.ts`:
  - `POST /ingestion/invoices/csv`
  - `POST /ingestion/invoices/manual`
  - `GET /ingestion/runs`

## Validation Evidence
Successful commands:
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`

## Security and Isolation Notes
- All ingestion routes remain auth-protected.
- Dedupe keys remain tenant/org scoped.
- Connector runs are filtered by active tenant/org scope.
- Connector lifecycle actions are audit logged.

## Assumptions
- CSV ingestion remains JSON payload (`csvContent`) transport in this phase.
- Row-level partial failures are allowed unless failure threshold is exceeded.
- Durable connector-run persistence is enabled only when `DATABASE_URL` is configured.

## Remaining Gaps (Out of Scope)
- background connector worker queues
- dead-letter handling for large asynchronous jobs
- provider credentials for external accounting/banking/GST connectors
