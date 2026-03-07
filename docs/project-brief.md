# Project Brief

## 1. Product Vision
Build a multi-tenant AI operating platform for Indian MSMEs that unifies finance operations, compliance assistance, collections workflows, loan-readiness preparation, stakeholder collaboration, and end-to-end auditability.

## 2. Business Goal
Reduce financial and operational friction for MSMEs by improving:
- invoice collections consistency
- cashflow visibility
- compliance accuracy and readiness
- loan-readiness outcomes
- automation of repetitive operations with human control gates

## 3. Target Users and Stakeholders
Primary users and ecosystem actors:
- MSME owner/founder
- Finance manager/accountant
- Chartered accountant/compliance partner
- Sales and collections teams
- Lender/NBFC partners
- Internal operations/support/admin users

## 4. In-Scope Capabilities (Phase 1)
Phase-1 scope includes:
- Multi-tenant platform foundation
- Authentication and RBAC
- Audit logging baseline
- CSV-based invoice ingestion
- Core customer and invoice data models
- Manual and rules-based collections workflows
- Cashflow summary dashboard
- Human-in-the-loop AI recommendations
- Basic loan-readiness checklist and export

## 5. Out-of-Scope Capabilities (Phase 1)
Explicitly out of scope unless separately spec-approved:
- Direct GST portal filing
- Autonomous financial decision-making
- Live bank integrations
- OCR-heavy ingestion
- Industry benchmarking
- Multi-country localization
- Native mobile app
- End-customer custom workflow builder

## 6. Architecture Principles
- Monorepo with clear boundaries: `apps` + `packages` + `infra` + `docs`
- Multi-tenant isolation is non-negotiable at all layers
- Simple, typed, testable modules over clever abstractions
- Stable interfaces for logging, audit, workflows, and AI tool boundaries
- Human approval gates for critical operational workflows
- Explainable and traceable AI recommendations before persistence

## 7. Security and Compliance Constraints
- No hardcoded secrets; environment-variable driven secret management
- Least-privilege authorization model
- Encrypt sensitive data at rest and in transit
- Minimize PII exposure and retention
- Tenant data must never cross tenant boundaries
- All security-sensitive and mutating actions must be logged
- No feature may bypass identity, authorization, or audit controls

## 8. Development Rules
- Every implementation must map to an approved spec in `/docs/specs`
- No out-of-scope or speculative feature implementation
- Keep diffs narrow and avoid unrelated refactors
- Update docs on each implementation task:
  - spec status
  - task checklist
  - API docs (if changed)
  - migration notes (if schema changes)
  - runbook notes (if ops impact exists)

## 9. Definition of Done
A scoped task is done only when it includes:
- implementation
- tests
- lint passing
- type-check passing
- docs updated
- acceptance criteria satisfied
- security concerns noted
- no forbidden scope expansion

## 10. Recommended Implementation Order
Recommended spec progression for controlled delivery:
1. `000` Repository Bootstrap
2. `001` Platform Foundation
3. `002` Auth + RBAC + Tenant Isolation + Audit Logging
4. `003` Core Domain Model
5. `004` Connector Framework
6. `005` CSV Invoice Ingestion
7. `006` Workflow Engine
8. `007` Collections Follow-up Workflow
9. `008` Cashflow Summary Workflow
10. `009` Loan-Readiness Workspace Workflow
11. `010` Notification Layer
12. `011` Pilot Hardening and Release Readiness
