# Spec 006 - Workflow Engine

- Status: Approved for implementation
- Last updated: 2026-03-08
- Depends on: Spec 001 Foundation, Spec 003 Core Domain Model

## Purpose
Define an internal workflow framework for predefined operational playbooks with strong auditability, tenant isolation, and human approval controls.

## Scope
In scope:
- workflow definitions and versioning
- trigger processing
- condition evaluation
- step execution orchestration
- human approval steps
- escalation handling
- execution history and state persistence model
- failure handling and retry policy

Out of scope:
- open-ended user-authored agents
- arbitrary end-user workflow builder
- autonomous AI decision execution

## Workflow Definition Model
A workflow definition includes:
- `workflowType`
- `version`
- `triggerConfig`
- ordered `steps`
- optional `conditions`
- retry policy
- escalation policy
- approval requirements per applicable step

## Trigger Support
Engine must support predefined trigger classes:
- manual trigger (user initiated)
- scheduled trigger (time-based)
- event trigger (domain event emitted)

Trigger execution requirements:
- trigger payload validation
- tenant/org context propagation
- deterministic mapping to workflow definition version

## Condition Support
- Step and workflow conditions evaluate against structured context.
- Condition outcomes are deterministic (`true`/`false`).
- Unsupported/malformed condition evaluation fails safe and records error state.

## Step Execution
- Steps execute through step-runner abstraction.
- Each step has explicit input/output contracts.
- Step states: `pending`, `running`, `awaiting_approval`, `completed`, `failed`, `skipped`.
- Engine records per-step start/completion timestamps and metadata.

## Human Approval Steps
- Configurable approval gates can pause workflow progression.
- Approval requests include:
  - actor role requirements
  - approval payload context
  - timeout/escalation policy
- Approval outcomes:
  - `approved`
  - `rejected`
  - `timed_out`

## Escalations
- Time-based escalation rules for pending approvals/failures.
- Escalation actions may include:
  - notification event emission
  - reassignment to fallback approver role
  - workflow status transition to `escalated`

## Execution History
Must record:
- workflow instance metadata
- trigger source and payload references
- step-by-step execution timeline
- approval and escalation events
- retry attempts and outcomes

## Failure Handling
- Step failures are captured with error codes/messages.
- Workflow-level failure policy determines stop/continue behavior.
- Fatal failures transition workflow instance to `failed` with preserved context for diagnostics.

## Retry Policy
- Configurable per step and/or workflow.
- Retry strategy fields:
  - max attempts
  - delay/backoff policy
  - retryable error classification
- Retry attempts must be auditable and idempotency-safe.

## Auditability
- Every workflow state transition and approval action must emit audit events.
- Audit records must include tenant/org context, actor, action, and outcome.
- Engine execution logs must be traceable by workflow instance ID.

## Tenant Isolation
- Workflow instances are strictly tenant/org scoped.
- Trigger payloads cannot cause cross-tenant step execution.
- Step runner context must enforce tenant boundary constraints.

## Acceptance Criteria
1. Engine can register and execute predefined workflow definitions.
2. Manual, scheduled, and event triggers are supported at baseline.
3. Approval steps pause execution until explicit decision or timeout.
4. Failures and retries are deterministic and observable.
5. Execution history captures all state transitions and attempts.
6. Tenant isolation and audit logging are enforced for workflow operations.
