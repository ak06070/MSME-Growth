# AGENTS.md

## Project identity
Build an AI operating platform for Indian MSMEs that unifies finance, compliance, collections, loan-readiness, workflow orchestration, stakeholder collaboration, and auditability.

## Business intent
The platform must help MSMEs and ecosystem stakeholders reduce financial friction, improve collections, improve compliance accuracy, improve working-capital readiness, and automate repetitive operational workflows.

## Primary stakeholders
- MSME owner / founder
- Finance manager / accountant
- Chartered accountant / compliance partner
- Sales / collections team
- Lender / NBFC partner
- Internal ops / support / admin

## Core product modules
1. Tenant and organization management
2. User management and RBAC
3. Data ingestion and normalization
4. Finance data model and ledger abstractions
5. Workflow engine with approvals and escalations
6. AI agent orchestration with bounded tools
7. Collections automation
8. Cashflow and risk insights
9. GST / compliance assistance
10. Loan-readiness workspace
11. Notifications and communication layer
12. Audit logging and observability

## Phase-1 boundaries
Phase 1 supports:
- Multi-tenant foundation
- Auth and RBAC
- Audit logs
- CSV-based invoice ingestion
- Customer and invoice data model
- Manual + rules-based collections workflows
- Cashflow summary dashboard
- Human-in-the-loop AI recommendations
- Basic loan-readiness checklist and export

Phase 1 does NOT support:
- Direct GST portal filing
- Autonomous financial decision-making
- Live bank integrations unless explicitly spec-approved
- OCR-heavy ingestion unless explicitly spec-approved
- Industry benchmarking unless explicitly spec-approved
- Multi-country localization
- Mobile app
- Custom workflow builder for end customers

## Engineering rules
- All work must map to an approved spec under `/docs/specs`.
- Never implement features that are not explicitly in scope.
- Prefer simple, testable, typed implementations.
- Favor stable abstractions over cleverness.
- All changes must preserve multi-tenant isolation.
- All mutating actions must be audit-logged.
- All AI outputs that can affect user decisions must be explainable or traceable.
- All critical workflows must support human approval gates.

## Documentation rules
Every implementation task must update:
- relevant spec status
- task checklist
- API docs if API changes
- migration notes if schema changes
- runbook notes if ops impact exists

## Quality gates
A task is not done unless it includes:
- implementation
- tests
- lint passing
- type-check passing
- docs updated
- acceptance criteria satisfied
- security concerns noted
- no forbidden scope expansion

## Security and privacy rules
- Never commit real secrets.
- Use environment variables for secrets.
- Minimize PII handling.
- Encrypt sensitive data at rest and in transit.
- Enforce least privilege.
- Tenant data must never leak across boundaries.
- Log security-sensitive events.

## AI rules
- AI is advisory unless a spec explicitly allows automation.
- AI recommendations must reference the structured inputs used.
- AI output must be validated against business rules before persistence.
- No prompt should allow unrestricted tool invocation.
- Tools must be explicitly enumerated per workflow.

## Working style for Codex
Before coding:
1. Read `AGENTS.md`.
2. Read relevant master docs.
3. Read the target spec.
4. Restate the task in your own words.
5. Identify assumptions.
6. Implement only the requested slice.

When coding:
- Keep diffs narrow.
- Prefer incremental commits.
- Add TODO only if linked to a future spec.
- Do not refactor unrelated code.

After coding:
- Run tests.
- Summarize what changed.
- List remaining risks.
- Confirm exact files touched.

## Definition of done
Done means production-quality for the scoped slice, not a demo.
