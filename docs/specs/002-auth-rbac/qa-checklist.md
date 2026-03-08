# Spec 002 QA Checklist - Auth and Tenancy

## Scope Integrity
- [ ] No finance/GST/collections/loan/cashflow business logic added.
- [ ] Changes map only to Spec 002 requirements.

## Authentication
- [ ] Login accepts valid credentials and rejects invalid credentials.
- [ ] Logout invalidates active session.
- [ ] Session introspection returns active identity and tenant context.
- [ ] Suspended/deactivated users cannot access protected routes.

## Tenant Isolation
- [ ] Tenant context is required for protected actions.
- [ ] Cross-tenant attempts are denied.
- [ ] Cross-tenant denial emits security/audit signal.

## RBAC
- [ ] Role assignment drives backend permission checks.
- [ ] Unknown or missing permissions default to deny.
- [ ] Admin-only routes reject non-admin users.

## Audit Logging
- [ ] Login success/failure is logged.
- [ ] Role/membership/user state changes are logged.
- [ ] Protected mutating action outcomes are logged.
- [ ] Audit records include actor/action/resource/timestamp/tenant metadata.

## Validation Commands
- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`

## Documentation
- [ ] `api-contracts.md` updated
- [ ] `data-notes.md` updated
- [ ] `implementation-notes.md` added
- [ ] Remaining risks documented
