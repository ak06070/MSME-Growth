# Spec 011 - Pilot Hardening

- Status: Approved for implementation
- Last updated: 2026-03-08
- Depends on: Specs 001-010 completion baseline

## Purpose
Define pilot-readiness hardening requirements for reliability, security, operations, and controlled release.

## Performance Expectations
- API p95 latency target for core endpoints under pilot load.
- Workflow execution latency baseline for predefined flows.
- CSV ingestion throughput baseline for pilot data volumes.
- Dashboard summary generation within acceptable response window.

## Error Budget
- Define monthly service availability target (for example, 99.5% pilot baseline).
- Establish acceptable failed workflow execution percentage threshold.
- Track notification delivery failure budget and recovery expectations.

## Monitoring Dashboards
Minimum dashboards:
- API request volume/latency/error rates
- auth failure and access-denied trends
- workflow success/failure/retry rates
- ingestion run outcomes and row-level failure trends
- notification queue and delivery outcomes

## SLO Ideas
- Auth endpoints success rate SLO
- CSV ingestion completion SLO
- Workflow execution completion SLO by workflow type
- Critical approval-step turnaround SLO

## Security Review Checklist
- tenant isolation penetration checks
- RBAC negative-path verification
- audit log completeness validation for mutating actions
- secret scanning and dependency vulnerability review
- secure header/cookie/session review

## QA/UAT Checklist
- end-to-end tests for 007/008/009 workflows
- cross-tenant denial verification on all protected routes
- regression suite for ingestion/auth/workflow endpoints
- user role UAT scripts for owner/finance/accountant/collections roles

## Release Gates
- lint/typecheck/test pipelines green
- critical bug backlog triaged and within threshold
- security checklist sign-off complete
- runbook and support playbooks updated
- rollback plan validated in staging-like environment

## Rollback Plan
- release by reversible, versioned checkpoints
- rollback triggers based on SLO/error-budget breach
- defined owner and communication protocol for rollback execution
- post-rollback verification checklist for auth/workflow/data integrity

## Support Readiness
- support ownership matrix (L1/L2/L3)
- incident severity definitions and response SLAs
- on-call escalation procedure and communication templates
- known issue register for pilot participants

## Data Backup and Restore Expectations
- scheduled backups for operational data stores
- restoration drill with documented RTO/RPO targets
- backup integrity verification and access controls
- auditability of backup and restore operations

## Acceptance Criteria
1. Pilot quality/security/ops gates are explicitly defined and measurable.
2. Monitoring and SLO targets map to critical user journeys.
3. Rollback and support readiness are documented and actionable.
4. Backup/restore expectations include validation and ownership.
