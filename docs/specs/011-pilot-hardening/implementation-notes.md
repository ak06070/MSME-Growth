# Spec 011 Implementation Notes

## Scope Confirmation
Implemented pilot-hardening baselines for security posture, observability, SLO/error-budget visibility, and operational readiness hooks.

Implemented:
- hardened response headers baseline
- request body limit baseline
- auth/workflow/ingestion/notification metrics capture
- tenant-scoped ops endpoints for metrics and SLO snapshots
- bearer token auth provider integration for production-oriented auth flows
- optional Postgres-backed durable persistence hooks for audit/connector/notification records
- migration baseline for platform persistence tables

## What Was Added
- `apps/api/src/ops/pilot-metrics.ts`: dashboard metrics and SLO snapshot calculations.
- `apps/api/src/server.ts` hardening updates:
  - security headers (`nosniff`, `x-frame-options`, CSP, referrer policy, HSTS in production)
  - request timing capture and `onResponse` metrics
  - `GET /ops/metrics` and `GET /ops/slo`
  - `POST /auth/token` and bearer token auth resolution in request pipeline
- `apps/api/src/auth-provider.ts`: HMAC token issuance and verification.
- `apps/api/src/persistence/platform-persistence.ts`: optional Postgres persistence adapter with noop fallback.
- `apps/api/src/audit.ts`, connector run store, and notification store persistence sinks.
- `infra/migrations/004_platform_persistence.sql`: durable schema for audit, connector runs, notification templates/records/approvals/attempts.

## Validation Evidence
Successful commands:
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`

## Security and Reliability Notes
- Security headers applied globally through request hook.
- Audit logging remains mandatory for mutating/auth-sensitive flows.
- SLO/error-budget metrics are surfaced via ops endpoints for pilot monitoring.
- Durable persistence is environment-gated through `DATABASE_URL` to preserve local dev velocity.

## Assumptions
- Postgres schema migration is applied by environment-specific deployment tooling.
- Pilot SLO thresholds are baseline defaults and can be tightened from observed production telemetry.
- HMAC bearer tokens are an interim production-ready integration layer for service-to-service or API-client usage.

## Remaining Gaps (Out of Scope)
- managed dashboards in external observability tools (Grafana/Datadog)
- automatic rollback orchestration in deployment system
- automated backup/restore job runners (expectation documented; infra wiring remains environment-specific)
