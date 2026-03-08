-- Spec 004 + 010 + production persistence baseline
-- Connector runs, notification layer, and durable audit events.

create table if not exists audit_events (
  id bigserial primary key,
  actor_id text,
  tenant_id text not null,
  organization_id text,
  action text not null,
  resource_type text not null,
  resource_id text,
  outcome text not null,
  timestamp timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists connector_runs (
  run_id text primary key,
  connector_type text not null,
  tenant_id text not null,
  organization_id text not null,
  actor_id text,
  status text not null,
  started_at timestamptz not null,
  completed_at timestamptz not null,
  attempts integer not null,
  last_error_code text,
  next_retry_at timestamptz,
  summary jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_connector_runs_scope
  on connector_runs (tenant_id, organization_id, connector_type, status);

create table if not exists notification_templates (
  template_id text primary key,
  tenant_id text not null,
  organization_id text not null,
  channel text not null,
  template_key text not null,
  version integer not null,
  subject text,
  body text not null,
  allowed_variables jsonb not null,
  created_by text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (tenant_id, organization_id, channel, template_key, version)
);

create table if not exists notification_records (
  notification_id text primary key,
  tenant_id text not null,
  organization_id text not null,
  channel text not null,
  template_key text not null,
  template_version integer not null,
  recipient_ref text not null,
  variables jsonb not null,
  correlation_ref text,
  workflow_ref text,
  status text not null,
  requires_approval boolean not null,
  approval_state text not null,
  queued_at timestamptz not null,
  sent_at timestamptz,
  dismissed_at timestamptz,
  failure_code text,
  failure_reason text,
  retry_eligible boolean not null,
  retry_count integer not null,
  next_retry_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_notification_records_scope
  on notification_records (tenant_id, organization_id, channel, status);

create index if not exists idx_notification_records_recipient
  on notification_records (tenant_id, organization_id, recipient_ref, status);

create table if not exists notification_approvals (
  approval_id text primary key,
  notification_id text not null,
  tenant_id text not null,
  organization_id text not null,
  actor_id text,
  decision text not null,
  rationale text,
  requested_at timestamptz not null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_notification_approvals_notification
  on notification_approvals (notification_id, decision);

create table if not exists notification_attempts (
  attempt_id text primary key,
  notification_id text not null,
  tenant_id text not null,
  organization_id text not null,
  channel text not null,
  attempt_number integer not null,
  status text not null,
  provider_response_ref text,
  failure_code text,
  failure_reason text,
  timestamp timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_notification_attempts_notification
  on notification_attempts (notification_id, attempt_number);
