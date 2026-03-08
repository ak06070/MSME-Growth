# Spec 002 Tasks - Auth and Tenancy

## Overview
- Spec: `002-auth-rbac`
- Goal: Deliver authentication, tenant-aware authorization, and audit logging foundation.

## Sequential Tasks

| Task ID | Task | Depends On | Acceptance Criteria | Validation | Rollback |
|---|---|---|---|---|---|
| AUTH-01 | Define auth domain types and permission catalog | Spec 001 packages | Role/permission types are stable and tenant-scoped | Unit tests for role-permission mapping | Revert catalog and restore prior placeholder types |
| AUTH-02 | Implement user/tenant/role/session models | AUTH-01 | Core model interfaces and storage contracts are available | Typecheck + model tests | Revert model layer and keep interfaces only |
| AUTH-03 | Implement login/logout/session introspection endpoints | AUTH-02 | Auth endpoints issue/clear sessions and return active context | Integration tests for login/logout/session | Revert endpoint layer and disable routes |
| AUTH-04 | Add tenant-aware request context middleware | AUTH-02, AUTH-03 | Protected requests resolve valid tenant context or deny | Integration tests for context resolution and denial | Revert middleware and enforce temporary global deny |
| AUTH-05 | Implement RBAC authorization guard for protected routes | AUTH-04 | Permission checks enforce allow/deny server-side | Positive/negative authz integration tests | Revert guard and block mutation routes pending fix |
| AUTH-06 | Add admin management endpoints (invite/role assignment/suspend) | AUTH-05 | Admin-only operations function with audit logs | Integration tests for admin paths and denial paths | Revert admin routes while preserving auth core |
| AUTH-07 | Emit audit events for auth and mutating access actions | AUTH-03, AUTH-05, AUTH-06 | Required audit events persisted with required fields | Audit event assertions in tests | Revert event emission changes and block affected mutations |
| AUTH-08 | Update docs and implementation notes | AUTH-01 to AUTH-07 | Spec docs, API contracts, and risks are updated | Documentation review checklist | Docs-only rollback if needed |

## Completion Checklist
- [ ] AUTH-01 Auth types and permission catalog
- [ ] AUTH-02 Core model contracts
- [ ] AUTH-03 Session endpoints
- [ ] AUTH-04 Tenant context middleware
- [ ] AUTH-05 RBAC guards
- [ ] AUTH-06 Admin management endpoints
- [ ] AUTH-07 Audit logging coverage
- [ ] AUTH-08 Documentation + implementation notes
