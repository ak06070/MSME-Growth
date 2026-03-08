# Spec 002 Architecture - Auth, RBAC, Tenant Isolation

## Goal
Add security-critical access control infrastructure on top of Spec 001 foundation without introducing business workflow logic.

## Components
- Auth service:
  - credential verification
  - session issuance and invalidation
- Session store:
  - active session records with expiration
- Tenant context resolver:
  - resolves active tenant/org from session
- Authorization engine:
  - role -> permissions mapping
  - route-level permission checks
- Admin management service:
  - invites, role assignment, suspension/reactivation
- Audit logger integration:
  - captures auth and access-control mutations

## Request Flow (Protected Routes)
1. Request enters API route.
2. Session middleware validates session token/cookie.
3. Tenant context resolver validates active membership.
4. Authorization guard evaluates required permission.
5. Route executes if allowed.
6. Audit event emitted for mutating actions and denied sensitive actions.

## Data Flow Boundaries
- Session data never crosses tenant boundary contexts.
- Membership validation is mandatory for every protected request.
- Audit records include tenant context metadata for traceability.

## Failure Modes
- Invalid credentials -> `401`.
- Missing/expired session -> `401`.
- Missing tenant membership -> `403`.
- Missing permission -> `403`.
- Role mapping inconsistency -> fail-safe deny + audit event.

## Validation
- unit tests: authz resolver, tenant context resolver
- integration tests: session lifecycle, protected route allow/deny, admin operations
- regression checks: lint, type-check, test

## Rollback / Recovery
- If auth endpoint failures spike, rollback latest auth endpoint commit and keep existing protected-route deny behavior.
- If authorization denies valid traffic, rollback guard updates and run in fail-safe conservative mode until corrected.
- If audit logging causes runtime errors, fallback to buffered logging while preserving route integrity.
