# Spec 002 - Auth, RBAC, Tenant Isolation, Audit Logging

- Status: Implemented
- Last updated: 2026-03-08
- Depends on: Spec 001 Foundation

## Purpose
Implement the access-control backbone required before exposing operational business workflows.

## Business Context
The platform serves multiple stakeholders across multiple tenants. Phase-1 value cannot be delivered safely without strong user identity, tenant boundaries, permission enforcement, and auditable mutating actions.

## Authentication Model
- Email/password authentication for Phase 1 with server-side credential verification.
- Session-based authentication using signed server sessions (HTTP-only cookie) and server-side session store.
- Session identity includes:
  - `userId`
  - active `tenantId`
  - active `organizationId`
  - role bindings for the active tenant context
- No social login or SSO in Phase 1.

## Role-Based Access Control
- Roles are tenant-scoped and assigned through membership records.
- Phase-1 baseline roles:
  - `owner`
  - `finance_manager`
  - `accountant`
  - `collections_agent`
  - `auditor`
  - `admin`
- Permissions are server-authoritative and mapped from role -> permission set.
- UI visibility may hide unauthorized actions, but backend authorization is mandatory.

## Tenant Isolation
- Every protected request resolves an active tenant context before business access.
- Data access and mutations must be filtered by active `tenantId`.
- Cross-tenant access is denied by default and logged as a security event.
- Tenant context switching is explicit and validated against user memberships.

## User Lifecycle
- User states:
  - `invited`
  - `active`
  - `suspended`
  - `deactivated`
- Invitation flow is admin-controlled.
- Only active users can authenticate and access protected routes.
- Suspend/deactivate actions immediately invalidate active sessions.

## Session Handling
- Sessions are signed and integrity-protected.
- Session timeout and idle expiration are enforced server-side.
- Session invalidation occurs on logout, suspension, deactivation, and credential reset.
- Session fixation prevention through session regeneration on login.

## Audit Logging Requirements
All security-sensitive and mutating actions must emit audit events with:
- actor identity (`actorId`)
- tenant and organization context
- action type
- resource type and resource ID
- outcome (`success`/`failure`)
- timestamp
- minimal metadata (without sensitive credential material)

Mandatory audited actions include:
- login success/failure
- logout
- role assignment/removal
- tenant membership changes
- user suspension/deactivation/reactivation
- protected route mutation attempts (allowed and denied)

## Admin Permissions
- Admin capabilities are tenant-scoped by default.
- Admins can:
  - invite users
  - assign/remove roles
  - suspend/reactivate users
  - view tenant-scoped audit logs
- Super-admin/global admin behavior is out of scope unless separately approved.

## Security Constraints
- Passwords must be hashed using modern adaptive hashing.
- No plaintext credentials in logs or persistence.
- Failed login attempts must be rate-limited.
- Authorization checks must run server-side before data access.
- Default-deny behavior for unknown roles/permissions.
- Least-privilege principle for all permission bundles.

## API Boundaries
Spec 002 may introduce only identity and access-control APIs:
- auth endpoints (login/logout/session introspection)
- user and membership management endpoints (admin-protected)
- role assignment and permission inspection endpoints
- audit log retrieval endpoint (admin/auditor restricted)

No finance, compliance, collections, or loan business endpoints are allowed in this spec.

## Data Model Implications
Introduce foundational entities and relationships:
- `User`
- `Tenant`
- `Organization`
- `Membership` (user <-> tenant/org)
- `Role`
- `Permission`
- `RolePermission`
- `Session`
- `AuditEvent`

All new entities must enforce tenant-safe querying and indexing strategy.

## Non-Goals
- SSO/OAuth providers
- customer-facing self-service onboarding at scale
- business workflow authorization logic beyond generic protection
- fine-grained field-level ABAC policies

## Acceptance Criteria
1. Users can authenticate and receive valid sessions.
2. Protected routes deny anonymous requests.
3. Permission checks are enforced server-side for protected actions.
4. Cross-tenant access is denied and logged.
5. Admin endpoints enforce admin role requirements.
6. Audit events are persisted for login, role/membership changes, and mutating protected actions.
7. Tests cover positive and negative authz paths.

## Test Strategy
- Unit tests for permission resolver and role mapping.
- Unit tests for tenant-context resolution and denial behavior.
- Integration tests for login/logout/session lifecycle.
- Integration tests for protected-route allow/deny scenarios.
- Integration tests for admin user/role actions and audit event emission.
