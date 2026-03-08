# MSME Growth Platform

Spec-driven monorepo for the AI operating platform for Indian MSMEs.

## Foundation Stack
- TypeScript
- Next.js (`apps/web`)
- Fastify (`apps/api`)
- pnpm workspaces

## Quick Start
1. Install dependencies:
   - `pnpm install`
2. Run validation:
   - `pnpm lint`
   - `pnpm typecheck`
   - `pnpm test`
3. Run apps:
   - API: `pnpm --filter @msme/api dev`
   - Web: `pnpm --filter @msme/web dev`

## API Runtime Configuration
Set environment variables (see `.env.example`):
- `SESSION_SECRET`
- `AUTH_TOKEN_SECRET`
- `DATABASE_URL` (optional; enables Postgres persistence hooks)
- `NOTIFICATION_EMAIL_WEBHOOK_URL` (optional)
- `NOTIFICATION_WHATSAPP_WEBHOOK_URL` (optional)
- `NOTIFICATION_MAX_ATTEMPTS`
- `NOTIFICATION_RETRY_DELAY_MS`

## Key API Endpoints
- Health: `GET /health`
- Auth token minting: `POST /auth/token`
- Ingestion (CSV/manual): `POST /ingestion/invoices/csv`, `POST /ingestion/invoices/manual`
- Connector runs: `GET /ingestion/runs`
- Notifications: `/notifications/*` routes
- Pilot ops metrics: `GET /ops/metrics`, `GET /ops/slo`

## Scope Guardrails
- All implementation must map to approved specs under `docs/specs`.
- No out-of-scope business features are allowed.
- Preserve tenant isolation, security, and auditability constraints.
