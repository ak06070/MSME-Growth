# Spec 004 - Connector Framework

- Status: Approved for implementation
- Last updated: 2026-03-08
- Depends on: Spec 001 Foundation, Spec 003 Core Domain Model

## Purpose
Define a reusable connector architecture for data ingestion that starts with CSV/manual sources and supports future accounting, bank, and GST sources.

## Connector Lifecycle
1. Connector registration and configuration load.
2. Input intake (file payload or manual payload).
3. Pre-validation (shape, required columns/fields, file constraints).
4. Normalization into canonical intermediate records.
5. Business validation against domain rules.
6. Duplicate detection and idempotency checks.
7. Persistence transaction and post-processing.
8. Audit event emission and ingestion result publication.

## Input Validation Pipeline
- Stage 1: Transport-level validation (file size/type/content encoding).
- Stage 2: Schema validation per connector type.
- Stage 3: Domain validation against canonical entity rules.
- Stage 4: Tenant and organization scope validation.
- Stage 5: Referential checks (customer, invoice references as applicable).

## Normalization Flow
- Source adapter converts input records into canonical DTOs.
- Mapping metadata stores source field -> canonical field lineage.
- Canonical DTOs pass through domain validators before persistence.
- Normalization errors are retained per record with traceable source row index/reference.

## Error Handling
- Record-level validation errors do not crash entire job unless failure threshold exceeded.
- Connector run status values:
  - `queued`
  - `running`
  - `partial_success`
  - `failed`
  - `completed`
- Fatal errors (parser failures, malformed input) fail fast and emit audit + diagnostic logs.

## Retry Behavior
- Retries are connector-run scoped and configurable by connector type.
- Safe retries depend on idempotency and duplicate detection guarantees.
- Retry metadata includes attempt count, last error, and next retry timestamp.

## Duplicate Detection Strategy
- Use connector-specific fingerprinting with canonical dedupe keys.
- Default invoice ingestion dedupe key baseline:
  - `tenantId + organizationId + invoiceNumber`
- Support configurable enhancement keys in later specs.
- Duplicate outcomes:
  - skip
  - upsert (if explicitly enabled)
  - fail with actionable error

## Audit Logging
Each connector run and meaningful state transition must emit audit events with:
- actor/system initiator
- tenant/org scope
- connector type and run ID
- action (`start`, `validate`, `persist`, `retry`, `complete`, `fail`)
- outcome and error metadata (if any)

## Security Constraints
- Inputs processed only within authenticated and authorized tenant context.
- Payload content scanning hooks for uploaded files.
- Sensitive field redaction in logs.
- Connector credentials/secrets stored via environment/secret manager, never hardcoded.
- Least-privilege data access for connector execution components.

## Acceptance Criteria
1. A shared connector interface supports source adapters and canonical output.
2. Validation and normalization stages are explicit and testable.
3. Duplicate detection strategy is defined and tenant-safe.
4. Retry and failure states are deterministic and observable.
5. Audit logging requirements for connector lifecycle are enforceable.

## Non-Goals (v1)
- Live accounting API integrations
- Live bank statement ingestion
- GST portal filing integration
- OCR-driven unstructured document parsing
- Autonomous connector-based financial decisioning
