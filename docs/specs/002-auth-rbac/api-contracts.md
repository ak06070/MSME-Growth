# Spec 002 API Contracts (Draft)

## Authentication Endpoints

### `POST /auth/login`
- Purpose: authenticate a user and establish session.
- Request:
```json
{
  "email": "user@example.com",
  "password": "string"
}
```
- Response `200`:
```json
{
  "userId": "usr_123",
  "activeTenantId": "ten_001",
  "activeOrganizationId": "org_001",
  "roles": ["finance_manager"]
}
```
- Errors: `401 invalid_credentials`, `423 user_suspended`.

### `POST /auth/logout`
- Purpose: invalidate active session.
- Response `204`.

### `GET /auth/session`
- Purpose: return active session context.
- Response `200`:
```json
{
  "authenticated": true,
  "userId": "usr_123",
  "activeTenantId": "ten_001",
  "activeOrganizationId": "org_001",
  "permissions": ["users:read", "users:update"]
}
```
- Error: `401` when unauthenticated.

## Admin Endpoints

### `POST /admin/users/invite`
- Permission: `users:invite`.
- Request:
```json
{
  "email": "new.user@example.com",
  "tenantId": "ten_001",
  "organizationId": "org_001",
  "role": "accountant"
}
```
- Response `202`:
```json
{
  "inviteId": "inv_001",
  "status": "invited"
}
```

### `POST /admin/users/:userId/roles`
- Permission: `roles:assign`.
- Request:
```json
{
  "tenantId": "ten_001",
  "role": "collections_agent"
}
```
- Response `200` with updated role bindings.

### `POST /admin/users/:userId/status`
- Permission: `users:suspend`.
- Request:
```json
{
  "tenantId": "ten_001",
  "status": "suspended"
}
```
- Response `200` with updated lifecycle state.

## Audit Endpoint

### `GET /admin/audit-events`
- Permission: `audit:read`.
- Query params: `tenantId`, `from`, `to`, `actorId`, `action`.
- Response `200`: paginated audit events list.
