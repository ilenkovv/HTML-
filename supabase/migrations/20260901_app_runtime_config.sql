-- Web Master: configurable application runtime, users, records, relations and admin dashboard.
-- This migration is intentionally additive. It does not change deployment tables.

create extension if not exists pgcrypto;

create table if not exists app_runtime_configs (
  project_id uuid primary key,
  owner_token text not null,
  schema_version integer not null default 1 check (schema_version = 1),
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_runtime_configs_owner_idx
  on app_runtime_configs(owner_token, updated_at desc);

create table if not exists app_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  email text,
  display_name text,
  role_key text not null,
  status text not null default 'active' check (status in ('invited','active','disabled')),
  external_auth_id text,
  invited_at timestamptz,
  last_active_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, email),
  unique(project_id, external_auth_id)
);

create index if not exists app_members_project_status_idx
  on app_members(project_id, status, last_active_at desc);

create table if not exists app_records (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  entity_key text not null,
  data jsonb not null default '{}'::jsonb,
  owner_member_id uuid references app_members(id) on delete set null,
  created_by_member_id uuid references app_members(id) on delete set null,
  updated_by_member_id uuid references app_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists app_records_project_entity_idx
  on app_records(project_id, entity_key, created_at desc)
  where deleted_at is null;
create index if not exists app_records_owner_idx
  on app_records(project_id, owner_member_id)
  where deleted_at is null;
create index if not exists app_records_data_gin_idx
  on app_records using gin(data);

create table if not exists app_record_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  relation_id text not null,
  from_record_id uuid not null references app_records(id) on delete cascade,
  to_record_id uuid not null references app_records(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(project_id, relation_id, from_record_id, to_record_id),
  check (from_record_id <> to_record_id)
);

create index if not exists app_record_links_from_idx
  on app_record_links(project_id, relation_id, from_record_id);
create index if not exists app_record_links_to_idx
  on app_record_links(project_id, relation_id, to_record_id);

create table if not exists app_audit_log (
  id bigint generated always as identity primary key,
  project_id uuid not null,
  actor_member_id uuid references app_members(id) on delete set null,
  action text not null,
  entity_key text,
  record_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists app_audit_log_project_idx
  on app_audit_log(project_id, created_at desc);

create table if not exists app_daily_metrics (
  project_id uuid not null,
  metric_date date not null,
  users_count integer not null default 0,
  active_users_count integer not null default 0,
  records_count bigint not null default 0,
  storage_bytes bigint not null default 0,
  ai_requests_count bigint not null default 0,
  errors_count bigint not null default 0,
  current_release integer,
  updated_at timestamptz not null default now(),
  primary key(project_id, metric_date),
  check (users_count >= 0),
  check (active_users_count >= 0),
  check (records_count >= 0),
  check (storage_bytes >= 0),
  check (ai_requests_count >= 0),
  check (errors_count >= 0)
);

alter table app_runtime_configs enable row level security;
alter table app_members enable row level security;
alter table app_records enable row level security;
alter table app_record_links enable row level security;
alter table app_audit_log enable row level security;
alter table app_daily_metrics enable row level security;

-- No anon/authenticated policies are created here intentionally.
-- The current Web Master pilot accesses these tables only through its server-side service role.
-- Before exposing direct client access, add project-scoped RLS policies tied to authenticated principals.
