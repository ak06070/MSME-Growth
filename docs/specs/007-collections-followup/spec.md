# Spec 007 - Collections Follow-up Workflow

- Status: Implemented
- Last updated: 2026-03-08
- Depends on: Spec 005 CSV Invoice Ingestion, Spec 006 Workflow Engine

## Business Objective
Improve invoice collection consistency with structured follow-up actions, approval controls, and traceable outcomes.

## Trigger
- manual trigger by authorized finance/collections user
- scheduled trigger for overdue invoices
- event trigger when invoice becomes overdue

## Inputs
- tenant/org context
- invoice aging data
- customer contact details
- follow-up policy rules (stage, cadence)
- optional prior communication history

## Outputs
- workflow execution record
- follow-up action plan per invoice/customer
- status updates on collection stage
- audit events and notification dispatch requests

## User Roles Involved
- collections_agent
- finance_manager
- accountant
- admin/auditor (oversight)

## Human Approval Points
- approval required before escalation to high-severity follow-up stage
- approval required before outbound communication templates with legal-sensitive wording

## Data Dependencies
- Invoice
- Customer
- Payment
- WorkflowInstance
- NotificationRecord
- AuditEvent

## API/UI Implications
- API endpoints for manual start and status retrieval
- UI list for overdue items and follow-up queue
- UI action panel for approval/rejection of escalation steps

## Logging and Audit Requirements
- log workflow start, step completion, failures, approvals, and escalations
- audit outbound communication approvals and action outcomes
- preserve tenant/org scoping for all events

## Acceptance Criteria
1. Overdue invoices can enter a predefined follow-up workflow.
2. Workflow supports manual and scheduled triggers.
3. Approval gates block escalation until explicit decision.
4. Workflow state and follow-up actions are auditable.
5. Tests cover allow/deny paths and escalation outcomes.

## Non-Goals
- autonomous message sending without approval
- predictive collection scoring beyond simple rules
- external WhatsApp provider integration in this spec

## Test Strategy
- unit tests for follow-up stage rules
- integration tests for workflow trigger and approval flows
- tenant isolation tests for cross-tenant denial
- audit event assertion tests for key transitions
