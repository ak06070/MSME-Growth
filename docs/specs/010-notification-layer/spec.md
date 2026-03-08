# Spec 010 - Notification Layer

- Status: Approved for implementation
- Last updated: 2026-03-08
- Depends on: Spec 006 Workflow Engine, Spec 007/008/009 workflow specs

## Purpose
Define a platform notification layer supporting in-app delivery now, with email/WhatsApp-ready abstractions, approval controls, and delivery observability.

## Scope
In scope:
- in-app notification model and delivery flow
- channel abstraction for email-ready and WhatsApp-ready integrations
- delivery logging and status tracking
- template management foundation
- approval-controlled outbound messaging
- failure tracking and retry metadata

Out of scope:
- direct WhatsApp provider implementation in this spec
- autonomous outbound messaging without approvals

## In-App Notifications
- Canonical notification record persisted per tenant/org.
- Notification states:
  - `queued`
  - `sent`
  - `failed`
  - `dismissed`
- User-facing inbox list and unread tracking supported by notification status metadata.

## Email-Ready Abstraction
- Channel adapter interface for future provider integration.
- Provider-neutral payload contract:
  - recipient
  - template key
  - render variables
  - correlation/workflow reference

## WhatsApp-Ready Abstraction
- Channel adapter interface with same payload abstraction as email.
- Template-key driven message rendering with approval gating.
- No direct provider coupling in v1 implementation baseline.

## Delivery Logging
- Every send attempt logs:
  - notification ID
  - channel
  - attempt count
  - status
  - provider response reference (optional)
  - timestamp

## Template Management
- Template registry keyed by channel + template key + version.
- Variables whitelist for safe rendering.
- Template updates should be auditable and role-restricted.

## Approval-Controlled Outbound Messaging
- Outbound email/WhatsApp sends require explicit approval when configured by workflow policy.
- Approval event must capture actor, decision, and rationale metadata.
- Rejected approvals keep notifications unsent with clear status.

## Failure Tracking
- Capture failure code, failure reason, and retry eligibility.
- Retry policy metadata includes next retry time and max attempts.
- Failed notifications remain queryable for ops/support review.

## Security and Privacy Constraints
- Tenant/org scope enforced for all notification records.
- Sensitive content redaction in logs where applicable.
- Role-based access to template and approval actions.
- No secrets or provider keys in source control.

## Acceptance Criteria
1. Notification records support in-app, email-ready, and WhatsApp-ready channels.
2. Outbound approval gate behavior is deterministic and auditable.
3. Delivery attempts and failures are persistently logged.
4. Template metadata and rendering inputs are versioned and traceable.
5. Tenant isolation is enforced for all notification operations.
