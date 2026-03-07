# Codex Starter Pack for MSME AI Platform

This package is the operating system for how Codex should build the product.

## What to upload or paste into Codex first
1. `AGENTS.md`
2. `README_START_HERE.md`
3. `docs/master/*`
4. `docs/specs/000-repo-bootstrap/spec.md`
5. `docs/specs/001-foundation/spec.md`
6. `docs/specs/002-auth-rbac/spec.md`
7. `docs/templates/*`
8. `prompts/*`

## Recommended first workflow in Codex
1. Open a clean repository in Codex.
2. Copy `AGENTS.md` into the repo root.
3. Copy `docs/` and `prompts/` into the repo.
4. Ask Codex to read `AGENTS.md` and summarize the project into `/docs/project-brief.md`.
5. Ask Codex to implement only `000-repo-bootstrap`.
6. Review the diff.
7. Ask Codex to implement only `001-foundation`.
8. Review the diff.
9. Ask Codex to implement only `002-auth-rbac`.
10. Continue feature-by-feature.

## Non-negotiables
- Codex must never code outside approved specs.
- Every code change must map to a spec ID.
- Every task must include tests, docs, and acceptance criteria.
- No business workflow may be implemented without tenant isolation, audit logging, and RBAC in place.
- No production secrets may be committed.

## Suggested repo layout
```text
/msme-ai-platform
  AGENTS.md
  README.md
  /docs
    /master
    /specs
    /templates
  /apps
    /web
    /api
  /packages
    /ui
    /types
    /workflows
    /agents
    /connectors
  /infra
  /tests
```

## Delivery philosophy
This product is not a generic chatbot. It is a constrained, auditable AI operating layer for Indian MSMEs with workflow automation, stakeholder-specific experiences, and compliance-grade controls.
