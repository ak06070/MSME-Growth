# Spec 008 - Cashflow Summary Workflow

- Status: Implemented
- Last updated: 2026-03-08
- Depends on: Spec 003 Core Domain Model, Spec 005 CSV Invoice Ingestion, Spec 006 Workflow Engine

## Business Objective
Provide a tenant-scoped cashflow summary view with explainable risk flags to support working-capital decisions.

## Trigger
- scheduled daily summary generation
- manual refresh by authorized users
- event trigger after major invoice/payment ingestion batches

## Inputs
- invoices and payment records
- aging buckets and due-date projections
- configurable summary window (e.g., 7/30/90 days)
- optional risk-threshold config

## Outputs
- cashflow summary snapshot
- receivables status by aging bucket
- risk flags with supporting metrics
- audit trail for generation events

## User Roles Involved
- owner
- finance_manager
- accountant
- auditor (read-only)

## Human Approval Points
- approval required before sharing summary externally to lender-facing views
- approval required before persisting manual risk-flag overrides

## Data Dependencies
- Invoice
- Payment
- LedgerEntry
- WorkflowInstance
- AuditEvent

## API/UI Implications
- API endpoint for summary generation/retrieval
- dashboard widgets for cash inflow outlook and overdue concentrations
- UI section for risk flag explanations and approval status

## Logging and Audit Requirements
- log summary generation runs and source window parameters
- audit manual adjustments, overrides, and external-share approvals
- retain generated snapshot metadata for traceability

## Acceptance Criteria
1. Summary can be generated for configured date windows.
2. Risk flags are deterministic and explainable.
3. Manual overrides require approval and are audited.
4. Tenant-isolated summary retrieval is enforced.
5. Tests validate calculations, permissions, and audit emission.

## Non-Goals
- predictive ML forecasting
- lender integration data push
- scenario simulation tooling

## Test Strategy
- unit tests for aggregation and bucket calculations
- integration tests for summary endpoints and approval gates
- tenant isolation tests
- regression tests for edge-case amount/date handling
