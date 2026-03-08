-- Spec 004 + 010 + production persistence baseline
-- Connector runs, notification layer, and durable audit events.

create table if not exists audit_events (
  id text primary key,
  actor_id text,
  tenant_id text not null,
  organization_id text,
  action text not null,
  resource_type text not null,
  resource_id text,
  outcome text not null,
  timestamp text not null,
  metadata text,
  created_at text not null default now()::text
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
  id text primary key,
  tenant_id text not null,
  organization_id text not null,
  channel text not null,
  template_key text not null,
  template_version integer,
  recipient_ref text not null,
  variables text,
  correlation_ref text,
  workflow_ref text,
  status text not null,
  requires_approval boolean not null default false,
  approval_state text not null default 'not_required',
  queued_at text,
  sent_at text,
  dismissed_at text,
  failure_code text,
  failure_reason text,
  retry_eligible boolean not null default false,
  retry_count integer not null default 0,
  next_retry_at text,
  created_at text not null default now()::text,
  updated_at text not null default now()::text
);

alter table notification_records add column if not exists template_version integer;
alter table notification_records add column if not exists variables text;
alter table notification_records add column if not exists correlation_ref text;
alter table notification_records add column if not exists workflow_ref text;
alter table notification_records add column if not exists requires_approval boolean default false;
alter table notification_records add column if not exists approval_state text default 'not_required';
alter table notification_records add column if not exists queued_at text;
alter table notification_records add column if not exists dismissed_at text;
alter table notification_records add column if not exists failure_code text;
alter table notification_records add column if not exists retry_eligible boolean default false;
alter table notification_records add column if not exists retry_count integer default 0;
alter table notification_records add column if not exists next_retry_at text;

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
