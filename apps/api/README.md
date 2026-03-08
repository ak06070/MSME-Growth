# apps/api

Backend API service for tenant-aware business operations and workflow execution.

What belongs here:
- HTTP endpoints and middleware
- request validation and authorization hooks
- service composition using shared packages

Run locally:
- `pnpm --filter @msme/api dev`

Key feature routes:
- Auth and session: `/auth/*`
- Connector ingestion: `/ingestion/*`
- Workflow execution: `/workflows/*`
- Notification layer: `/notifications/*`
- Pilot operations: `/ops/metrics`, `/ops/slo`
