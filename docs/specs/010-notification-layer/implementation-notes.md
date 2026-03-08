# Spec 010 Implementation Notes

## Scope Confirmation
Implemented the notification layer for in-app delivery with email/WhatsApp-ready abstractions, approval controls, delivery logs, failure tracking, and template management.

Implemented:
- in-app notification model and inbox flow
- channel adapter abstraction for `in_app`, `email`, `whatsapp`
- template registry with key/version and variable allowlist checks
- approval-controlled outbound sends
- delivery attempt logs and retry metadata
- tenant-scoped notification APIs

Not implemented:
- direct WhatsApp provider integration
- autonomous outbound messaging without approval

## What Was Added
- `packages/types/src/notifications.ts` and exports for notification contracts.
- `apps/api/src/notifications/notification-store.ts`: notification/template/approval/attempt persistence model.
- `apps/api/src/notifications/channel-adapters.ts`: in-app adapter + webhook adapters for email/whatsapp readiness.
- `apps/api/src/notifications/notification-service.ts`: queue, approve, send, retry, dismiss, inbox/attempts APIs and audit hooks.
- `apps/api/src/server.ts` new routes:
  - `POST /notifications/templates`
  - `GET /notifications/templates`
  - `POST /notifications`
  - `POST /notifications/:notificationId/approve`
  - `POST /notifications/:notificationId/send`
  - `POST /notifications/:notificationId/retry`
  - `POST /notifications/:notificationId/dismiss`
  - `GET /notifications/inbox`
  - `GET /notifications/:notificationId/attempts`

## Validation Evidence
Successful commands:
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`

## Security and Isolation Notes
- Notification/template operations are tenant/org scoped.
- Template management and approval use role-gated routes.
- Outbound send is blocked until explicit approval when required.
- Delivery attempts and outcomes are audit logged.
- Provider URLs are read from environment variables only.

## Assumptions
- Email/WhatsApp readiness is modeled through provider-neutral webhook adapters.
- Outbound channels default to approval-required unless explicitly overridden.
- In-app notifications can auto-send immediately when no approval is required.

## Remaining Gaps (Out of Scope)
- provider-specific delivery receipts/callback processing
- bulk campaign orchestration
- rich template editor UI
