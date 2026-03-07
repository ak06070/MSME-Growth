# Open Questions and Assumptions

## Confirmed Defaults
- Foundation scaffold default stack is fixed as: TypeScript + Next.js + Fastify + pnpm.
- Delivery model is spec-driven with Git checkpoints after each approved prompt step.

## Ambiguities and Missing Decisions

1. Tenant model granularity
- Open question: Should a user be able to hold active memberships across multiple organizations and multiple tenants simultaneously in Phase 1, or be restricted per session?
- Why it matters: Impacts auth token claims, tenant context resolution, and RBAC checks.

2. RBAC model shape
- Open question: Should roles be fixed system roles only, or system roles plus tenant-configurable custom roles in Phase 1?
- Why it matters: Affects authorization schema complexity and admin UX scope.

3. Audit log immutability approach
- Open question: Is append-only storage with soft controls sufficient for Phase 1, or is tamper-evident signing required now?
- Why it matters: Changes storage design and verification workflows.

4. Data retention policy
- Open question: What retention durations apply to audit logs, workflow history, and uploaded CSV files?
- Why it matters: Drives archival, purge jobs, compliance posture, and storage cost.

5. PII classification baseline
- Open question: Which invoice/customer fields are classified as sensitive PII for masking and access controls?
- Why it matters: Determines logging redaction and field-level access policies.

6. Canonical finance model depth for v1
- Open question: How deep should ledger abstractions go in Phase 1 (minimal posting records vs richer accounting constructs)?
- Why it matters: Determines scope for Spec 003 and downstream workflow dependencies.

7. Database technology choice
- Open question: Which primary datastore should be used for v1 (for example PostgreSQL with ORM), and is this already constrained by infra?
- Why it matters: Affects migrations, transaction handling, and multi-tenant isolation strategies.

8. Workflow approval SLA defaults
- Open question: What are default timeout/escalation windows for approval steps in predefined workflows?
- Why it matters: Needed for deterministic workflow-engine behavior.

9. Notification channel readiness in v1
- Open question: Should outbound email/WhatsApp be mocked with delivery logs only in Phase 1, or require live provider integration behind approval gates?
- Why it matters: Impacts integration scope and pilot readiness.

10. AI recommendation policy envelope
- Open question: Which recommendation categories are allowed in Phase 1, and what mandatory human-approval points apply per category?
- Why it matters: Required to enforce AI safety and bounded automation rules.

11. CSV ingestion contract versioning
- Open question: Should invoice CSV templates support one canonical schema only, or versioned schemas from day one?
- Why it matters: Impacts parser design and long-term compatibility.

12. Duplicate detection keys
- Open question: What is the authoritative duplicate key strategy (invoice number only vs tenant + customer + date + amount fingerprint)?
- Why it matters: Directly affects ingestion accuracy and false positive/negative rates.

13. Observability baseline depth
- Open question: Which telemetry stack is approved for Phase 1 (logs only vs logs + metrics + traces)?
- Why it matters: Changes instrumentation scope in foundation and pilot hardening.

14. Deployment topology
- Open question: Single-region deployment in India for pilot, or multi-region resilience required from v1?
- Why it matters: Affects infra complexity, data locality, and failover requirements.

15. UAT ownership model
- Open question: Who signs off UAT per spec (product, engineering, ops, compliance), and what is the minimum acceptance pack?
- Why it matters: Needed for consistent release gating across specs.

## Working Assumption Until Decided
If a question above remains unresolved during implementation, default behavior will be conservative:
- restrict access rather than permit
- require explicit human approval rather than automate
- log more context with redaction rather than less logging
- keep schema/interfaces minimal and extensible
