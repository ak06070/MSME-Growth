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

## Scope Guardrails
- All implementation must map to approved specs under `docs/specs`.
- No out-of-scope business features are allowed.
- Preserve tenant isolation, security, and auditability constraints.
