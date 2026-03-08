# Pilot Operations Runbook

## Monitoring Endpoints
- `GET /ops/metrics`: dashboard snapshot for API/auth/workflow/ingestion/notification metrics.
- `GET /ops/slo`: current SLO attainment and error budget view.
- Access is restricted to users with `audit:read` permission.

## Release Gates
1. `pnpm lint` passes.
2. `pnpm typecheck` passes.
3. `pnpm test` passes.
4. Schema migration `infra/migrations/004_platform_persistence.sql` reviewed and applied in target environment.
5. Security-sensitive environment variables are set through deployment secrets.

## Rollback Triggers
- sustained p95 latency regression above pilot threshold
- repeated auth or workflow failure rates breaching SLO targets
- outbound notification failures breaching acceptable error budget

## Rollback Procedure
1. Stop new deployment rollout.
2. Revert to previous versioned checkpoint.
3. Validate `/health`, `/ops/metrics`, and key auth/workflow endpoints.
4. Confirm tenant scope isolation and audit event continuity.
5. Announce rollback completion to pilot stakeholders.

## Support Escalation Matrix
- L1: support triage and user communication
- L2: application triage (auth, ingestion, workflow, notifications)
- L3: engineering remediation and hotfix rollout

## Backup and Restore Expectations
- When `DATABASE_URL` is configured, operational records are persisted in Postgres tables from migration `004_platform_persistence.sql`.
- Backups must include audit, connector, and notification tables.
- Run restoration drills against non-production data prior to pilot go-live.
- Validate tenant/org filters and audit continuity after restore.
