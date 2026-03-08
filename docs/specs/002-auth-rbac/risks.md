# Spec 002 Risk Register - Auth and Tenancy

| ID | Risk | Probability | Impact | Mitigation | Detection | Rollback |
|---|---|---|---|---|---|---|
| A1 | Incorrect permission mapping grants excessive access | Medium | Critical | Default deny and explicit permission map tests | Negative authz tests and audit anomaly checks | Revert permission map changes and disable affected routes |
| A2 | Session invalidation gaps allow stale access | Medium | High | Centralized session invalidation on logout/suspension | Session lifecycle integration tests | Revert session changes and force global session reset |
| A3 | Tenant context resolution bug allows cross-tenant leakage | Low | Critical | Mandatory membership checks per request | Cross-tenant denial integration tests | Revert context resolver and enforce deny-all on protected routes |
| A4 | Audit event emission misses critical security actions | Medium | High | Define mandatory audited action list and test assertions | Test coverage and audit completeness checks | Revert route changes lacking audit coverage |
| A5 | Admin endpoint misuse due weak guarding | Medium | High | Dedicated admin permission checks and deny tests | Admin route security tests | Disable admin endpoints until guard fix is deployed |
