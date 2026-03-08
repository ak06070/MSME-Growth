# Spec 007 Implementation Notes

## Scope Confirmation
Implemented only collections follow-up workflow scope:
- workflow definition for collections follow-up
- API endpoints to start, approve, and inspect workflow execution
- audit trail emission for workflow events
- minimal workflow UI shell page
- tests

No cashflow-summary logic (Spec 008) or loan-readiness logic (Spec 009) was implemented.

## What Was Added
- Collections follow-up workflow definition in API (`manual/scheduled/event` trigger support).
- API routes:
  - `POST /workflows/collections-followup/start`
  - `POST /workflows/:executionId/approve`
  - `GET /workflows/:executionId`
- Role-gated access for collections workflow actions.
- Overdue invoice selection from ingestion-backed invoice store.
- Workflow event -> audit event bridge for traceability.
- Minimal web shell page at `/workflows/collections-followup`.
- Integration tests for start/approve/completion and unauthenticated denial.

## Validation Evidence
Successful commands:
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`

## Security and Isolation Notes
- Workflow routes require authenticated session.
- Role checks restrict who can run/approve collections follow-up workflows.
- Execution retrieval enforces tenant/org scope matching.
- Workflow events are captured with tenant/org metadata and forwarded to audit logs.

## Remaining Gaps (Out of Scope)
- provider-specific outbound communication dispatch
- advanced escalation notifications
- queue/backoff orchestration beyond in-memory engine behavior
