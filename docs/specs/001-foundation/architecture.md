# Spec 001 Architecture - Platform Foundation

## Goal
Define the minimum architecture baseline needed for safe, incremental feature delivery in later specs.

## Current State
- Repo has starter docs and spec seeds.
- No runtime apps, package contracts, or CI execution baseline implemented.

## Constraints
- Must preserve multi-tenant safety assumptions.
- Must avoid business logic and auth implementation in this spec.
- Must stay typed, testable, and minimally coupled.

## Baseline Architecture
- `apps/web`: Next.js shell for UI routing and basic app boot path.
- `apps/api`: Fastify shell for health/status and middleware baseline.
- `packages/types`: shared type contracts and error models.
- `packages/ui`: shared UI primitives.
- `packages/workflows`: workflow interfaces/placeholders only.
- `packages/agents`: bounded AI interface contracts only.
- `packages/connectors`: ingestion connector interfaces/placeholders only.

## Cross-Cutting Foundation Interfaces
- Logging: structured logger contract with context metadata support.
- Audit logging: append-only event contract for future mutating actions.
- Feature flags: typed interface for runtime gating.
- Error conventions: consistent service/domain error model.
- Environment strategy: typed env parsing per runtime boundary.

## Milestones
1. Tooling and workspace setup
2. App and package scaffolding
3. Contract interfaces and conventions
4. CI and docs hardening

## Validation
- Root checks: lint, type-check, test
- App smoke checks for web/API startup
- Contract-level unit tests for core interfaces
- CI workflow execution on branch

## Rollback / Recovery
- Use Git checkpoint rollback at each completed task.
- If CI instability appears, revert the last tooling/CI commit first.
- If contract changes cascade failures, restore prior package export surface and reintroduce incrementally.
