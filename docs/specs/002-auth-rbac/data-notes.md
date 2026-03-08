# Spec 002 Data Notes

## Core Entities

### User
- `id`
- `email` (unique)
- `passwordHash`
- `status` (`invited` | `active` | `suspended` | `deactivated`)
- `createdAt`
- `updatedAt`

### Tenant
- `id`
- `name`
- `status`

### Organization
- `id`
- `tenantId`
- `name`

### Membership
- `id`
- `userId`
- `tenantId`
- `organizationId`
- `role`
- `isActive`

### Session
- `id`
- `userId`
- `tenantId`
- `organizationId`
- `expiresAt`
- `revokedAt`

### AuditEvent
- `id`
- `tenantId`
- `organizationId`
- `actorId`
- `action`
- `resourceType`
- `resourceId`
- `outcome`
- `metadata`
- `timestamp`

## Indexing/Constraint Notes
- Unique index on `users.email`.
- Composite index on `memberships(userId, tenantId, organizationId)`.
- Composite index on `sessions(userId, tenantId, revokedAt)`.
- Composite index on `audit_events(tenantId, timestamp)`.

## Data Safety Notes
- Password hashes only; never store plaintext credentials.
- Tenant/organization fields required on memberships, sessions, and audit events.
- Audit metadata must avoid raw secrets and sensitive payload dumps.
