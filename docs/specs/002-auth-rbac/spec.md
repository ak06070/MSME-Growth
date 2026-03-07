# Spec 002 - Auth, RBAC, Tenant Isolation, Audit Logging

## Purpose
Implement the access-control backbone needed before any operational workflows or AI actions are exposed.

## In scope
- User identity model
- Login/session integration placeholder or chosen auth provider integration
- Roles and permissions model
- Tenant-scoped authorization checks
- Audit logging for mutating actions
- Admin-only management primitives

## Out of scope
- Customer-facing self-serve onboarding beyond basics
- SSO unless explicitly approved
- Business workflow screens

## Functional requirements
1. Users belong to one or more tenant-scoped organizations as approved.
2. Permissions are evaluated server-side.
3. Sensitive actions are audit-logged with actor, action, resource, and timestamp.
4. UI hides inaccessible actions but backend remains authoritative.
5. Cross-tenant access is denied by default.

## Acceptance criteria
- Protected routes work.
- Roles and permissions are enforceable.
- Audit logs are written for create/update/delete/admin actions.
- Tests cover positive and negative authorization paths.
