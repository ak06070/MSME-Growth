# Spec 003 - Core Domain Model

- Status: Implemented
- Last updated: 2026-03-08
- Depends on: Spec 001 Foundation, Spec 002 Auth/RBAC

## Purpose
Define canonical business entities and relationships for Phase-1 MSME platform workflows with strict tenant isolation and auditability.

## Entity Definitions

### Organization
- Purpose: Primary business unit within a tenant under which branch, users, and financial records operate.
- Key fields:
  - `id`
  - `tenantId`
  - `name`
  - `legalName`
  - `gstin` (optional in v1)
  - `status`
  - `createdAt`, `updatedAt`
- Relationships:
  - one-to-many with `Branch`
  - one-to-many with `Customer`, `Vendor`, `Invoice`, `Payment`
  - one-to-many with `WorkflowInstance`, `LoanApplicationWorkspace`, `NotificationRecord`
- Constraints:
  - `tenantId` required and immutable
  - `(tenantId, name)` unique
- Validation rules:
  - name length within configured bounds
  - optional GSTIN format validation when provided
- Tenant boundaries:
  - organization records are strictly tenant-scoped
- Audit implications:
  - create/update/status changes must emit audit events

### Branch
- Purpose: Optional subdivision of organization for operational and accounting segmentation.
- Key fields:
  - `id`
  - `tenantId`
  - `organizationId`
  - `name`
  - `code`
  - `address`
  - `status`
- Relationships:
  - belongs to `Organization`
  - referenced by `Invoice`, `Payment`, `LedgerEntry`
- Constraints:
  - `(tenantId, organizationId, code)` unique
- Validation rules:
  - non-empty `name`, `code`
- Tenant boundaries:
  - branch must belong to same-tenant organization
- Audit implications:
  - create/update/delete and status changes audited

### Customer
- Purpose: Counterparty receiving invoices and making payments.
- Key fields:
  - `id`
  - `tenantId`
  - `organizationId`
  - `branchId` (optional)
  - `name`
  - `externalCode`
  - `taxId` (optional)
  - `contactEmail`, `contactPhone`
  - `status`
- Relationships:
  - one-to-many with `Invoice`
  - one-to-many with `Payment`
- Constraints:
  - `(tenantId, organizationId, externalCode)` unique when externalCode exists
- Validation rules:
  - required customer name
  - email/phone format checks when present
- Tenant boundaries:
  - customer data cannot be queried outside tenant context
- Audit implications:
  - create/update/delete and merge operations audited

### Vendor
- Purpose: Counterparty from whom goods/services are procured.
- Key fields:
  - `id`
  - `tenantId`
  - `organizationId`
  - `name`
  - `externalCode`
  - `taxId` (optional)
  - `status`
- Relationships:
  - may be referenced by `LedgerEntry` and future AP workflows
- Constraints:
  - `(tenantId, organizationId, externalCode)` unique when externalCode exists
- Validation rules:
  - required vendor name
- Tenant boundaries:
  - tenant-scoped only
- Audit implications:
  - mutating actions audited

### Invoice
- Purpose: Canonical receivable/payable document used in ingestion, collections, and cashflow.
- Key fields:
  - `id`
  - `tenantId`
  - `organizationId`
  - `branchId` (optional)
  - `customerId` (required for AR in v1)
  - `invoiceNumber`
  - `invoiceDate`
  - `dueDate`
  - `currency`
  - `subtotalAmount`
  - `taxAmount`
  - `totalAmount`
  - `outstandingAmount`
  - `status`
  - `sourceType` (`csv`, `manual`)
- Relationships:
  - many-to-one with `Customer`
  - one-to-many with `Payment`
  - one-to-many with `LedgerEntry`
- Constraints:
  - `(tenantId, organizationId, invoiceNumber)` unique
  - `outstandingAmount` must be `>= 0`
- Validation rules:
  - due date must be on/after invoice date
  - amounts must be non-negative decimal values
- Tenant boundaries:
  - invoice lookup/mutation must include tenant filter
- Audit implications:
  - ingestion-created and manually updated invoices audited with source metadata

### Payment
- Purpose: Records settlement events linked to invoices.
- Key fields:
  - `id`
  - `tenantId`
  - `organizationId`
  - `invoiceId`
  - `customerId`
  - `paymentDate`
  - `amount`
  - `mode`
  - `referenceNumber`
  - `status`
- Relationships:
  - belongs to `Invoice`
  - updates derived `Invoice.outstandingAmount`
- Constraints:
  - payment amount must be positive
  - aggregate successful payments cannot exceed invoice total unless explicit adjustment workflow exists
- Validation rules:
  - payment date not null
  - invoice and customer tenant alignment required
- Tenant boundaries:
  - payment and invoice must share identical tenant/org scope
- Audit implications:
  - create/update/reversal actions audited

### LedgerEntry
- Purpose: Normalized accounting-like record for financial activity traceability.
- Key fields:
  - `id`
  - `tenantId`
  - `organizationId`
  - `entryDate`
  - `entryType`
  - `referenceType`
  - `referenceId`
  - `debitAmount`
  - `creditAmount`
  - `currency`
  - `description`
- Relationships:
  - references `Invoice` and/or `Payment`
- Constraints:
  - at least one of debit/credit must be > 0
- Validation rules:
  - non-negative amounts
  - valid reference mapping when `referenceType` is set
- Tenant boundaries:
  - strict tenant scoping for every ledger row
- Audit implications:
  - ledger modifications are high-sensitivity audited actions

### TaxProfile
- Purpose: Captures tax configuration metadata at organization level.
- Key fields:
  - `id`
  - `tenantId`
  - `organizationId`
  - `gstin`
  - `registrationType`
  - `filingFrequency`
  - `stateCode`
  - `status`
- Relationships:
  - one-to-many with `GSTReturnReference`
- Constraints:
  - `(tenantId, organizationId)` unique active tax profile
- Validation rules:
  - GSTIN/state format validation when provided
- Tenant boundaries:
  - tenant/org bound; never global lookup
- Audit implications:
  - tax profile updates audited due compliance impact

### GSTReturnReference
- Purpose: Stores references/metadata to GST return periods and statuses (not filing execution).
- Key fields:
  - `id`
  - `tenantId`
  - `organizationId`
  - `taxProfileId`
  - `returnType`
  - `period`
  - `status`
  - `referenceNumber` (optional)
  - `filedAt` (optional)
- Relationships:
  - belongs to `TaxProfile`
- Constraints:
  - `(tenantId, organizationId, returnType, period)` unique
- Validation rules:
  - valid period format and returnType enum
- Tenant boundaries:
  - strict tenant/org filtering
- Audit implications:
  - status transitions audited

### LoanApplicationWorkspace
- Purpose: Tracks lender-readiness artifacts and progress for loan submissions.
- Key fields:
  - `id`
  - `tenantId`
  - `organizationId`
  - `name`
  - `status`
  - `checklistProgress`
  - `riskFlags`
  - `exportSnapshotPath` (optional)
- Relationships:
  - references document/checklist records in later specs
- Constraints:
  - `(tenantId, organizationId, name)` unique
- Validation rules:
  - checklist progress between 0 and 100
- Tenant boundaries:
  - tenant/org scoped access only
- Audit implications:
  - checklist updates and export actions audited

### WorkflowInstance
- Purpose: Represents execution state for predefined internal workflows.
- Key fields:
  - `id`
  - `tenantId`
  - `organizationId`
  - `workflowType`
  - `triggerType`
  - `status`
  - `startedAt`
  - `completedAt` (optional)
  - `currentStep`
  - `retryCount`
  - `errorCode` (optional)
- Relationships:
  - one-to-many with execution history/event rows (in workflow spec)
- Constraints:
  - status transitions must follow workflow state rules
- Validation rules:
  - retry count non-negative
- Tenant boundaries:
  - no cross-tenant workflow execution data access
- Audit implications:
  - approval decisions, escalations, and failure transitions audited

### NotificationRecord
- Purpose: Canonical delivery record for in-app/email/WhatsApp-ready messages.
- Key fields:
  - `id`
  - `tenantId`
  - `organizationId`
  - `channel`
  - `templateKey`
  - `recipientRef`
  - `status`
  - `sentAt` (optional)
  - `failureReason` (optional)
- Relationships:
  - may reference workflow instance and business records
- Constraints:
  - idempotency key required for retriable sends in later implementation
- Validation rules:
  - valid channel/status enums
- Tenant boundaries:
  - notification records tenant-scoped
- Audit implications:
  - outbound approval and delivery outcomes audited

### AuditEvent
- Purpose: Immutable record of security-sensitive and mutating actions.
- Key fields:
  - `id`
  - `tenantId`
  - `organizationId` (optional)
  - `actorId` (optional)
  - `action`
  - `resourceType`
  - `resourceId` (optional)
  - `outcome`
  - `metadata`
  - `timestamp`
- Relationships:
  - references all mutable entity operations
- Constraints:
  - append-only write pattern
- Validation rules:
  - required minimal audit fields for every event
- Tenant boundaries:
  - tenant filter required for read access
- Audit implications:
  - foundational compliance artifact; read access restricted by RBAC

## Out of Scope
- full accounting chart-of-accounts model
- GST portal filing actions
- AP workflow business logic
- automated lender integrations
- OCR/document extraction entity model

## Migration Considerations
- Introduce entities incrementally with reversible migrations.
- Backfill tenant/org foreign keys where legacy placeholders exist.
- Add uniqueness and tenant-scoped indexes prior to high-volume ingestion.
- Ensure migration order preserves referential integrity across Organization -> Customer -> Invoice -> Payment chains.

## Acceptance Criteria
1. Canonical entities are defined with typed contracts and clear relationships.
2. Tenant boundaries are explicit for every entity.
3. Validation and constraints are documented for each entity.
4. Audit implications are documented for each mutable entity.
5. Out-of-scope and migration considerations are explicit.

## Test Strategy
- Schema/model unit tests for required fields and enums.
- Validation tests for date/amount/identifier rules.
- Relationship integrity tests for foreign-key style references.
- Tenant boundary tests confirming deny behavior for cross-tenant access.
- Audit emission tests for create/update/delete/status transitions.
