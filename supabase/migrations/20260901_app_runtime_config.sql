-- Web Master application runtime: configuration, members, records, links, audit and dashboard metrics.
-- Additive migration. All direct client access remains denied by RLS; the pilot uses service_role server-side.

create extension if not exists pgcrypto;

create table if not exists public.app_runtime_configs (
  project_id uuid primary key references public.app_projects(id) on delete cascade,
  owner_token text not null,
  schema_version integer not null default 1 check (schema_version = 1),
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (octet_length(config::text) <= 524288)
);
create index if not exists app_runtime_configs_owner_idx
  on public.app_runtime_configs(owner_token, updated_at desc);

create table if not exists public.app_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.app_projects(id) on delete cascade,
  email text,
  display_name text,
  role_key text not null check (role_key ~ '^[A-Za-z][A-Za-z0-9_]{0,63}$'),
  status text not null default 'active' check (status in ('invited','active','disabled')),
  external_auth_id text,
  invited_at timestamptz,
  last_active_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (email is null or length(email) <= 320),
  check (display_name is null or length(display_name) <= 200),
  check (external_auth_id is null or length(external_auth_id) <= 512)
);
create unique index if not exists app_members_project_email_uidx
  on public.app_members(project_id, lower(email)) where email is not null;
create unique index if not exists app_members_project_external_auth_uidx
  on public.app_members(project_id, external_auth_id) where external_auth_id is not null;
create index if not exists app_members_project_status_idx
  on public.app_members(project_id, status, last_active_at desc);

create table if not exists public.app_records (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.app_projects(id) on delete cascade,
  entity_key text not null check (entity_key ~ '^[A-Za-z][A-Za-z0-9_]{0,63}$'),
  data jsonb not null default '{}'::jsonb,
  owner_member_id uuid references public.app_members(id) on delete set null,
  created_by_member_id uuid references public.app_members(id) on delete set null,
  updated_by_member_id uuid references public.app_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (jsonb_typeof(data) = 'object'),
  check (octet_length(data::text) <= 524288)
);
create index if not exists app_records_project_entity_idx
  on public.app_records(project_id, entity_key, created_at desc, id desc)
  where deleted_at is null;
create index if not exists app_records_owner_idx
  on public.app_records(project_id, owner_member_id)
  where deleted_at is null;
create index if not exists app_records_data_gin_idx
  on public.app_records using gin(data);

-- Atomic uniqueness for dynamic JSON fields marked `unique: true` in app_runtime_configs.
create table if not exists public.app_record_unique_values (
  project_id uuid not null references public.app_projects(id) on delete cascade,
  entity_key text not null,
  field_key text not null,
  value_hash text not null check (value_hash ~ '^[0-9a-f]{64}$'),
  record_id uuid not null references public.app_records(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(project_id, entity_key, field_key, value_hash)
);
create index if not exists app_record_unique_values_record_idx
  on public.app_record_unique_values(record_id);

create or replace function public.web_master_sync_record_unique_values()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  runtime_config jsonb;
  entity_config jsonb;
  field_config jsonb;
  current_key text;
  current_value jsonb;
  current_hash text;
begin
  delete from public.app_record_unique_values where record_id = new.id;

  if new.deleted_at is not null then
    return new;
  end if;

  select c.config into runtime_config
  from public.app_runtime_configs c
  where c.project_id = new.project_id;

  if runtime_config is null then
    return new;
  end if;

  select entity_item into entity_config
  from jsonb_array_elements(coalesce(runtime_config->'entities', '[]'::jsonb)) as entity_item
  where entity_item->>'key' = new.entity_key
  limit 1;

  if entity_config is null then
    return new;
  end if;

  for field_config in
    select field_item
    from jsonb_array_elements(coalesce(entity_config->'fields', '[]'::jsonb)) as field_item
  loop
    if coalesce(field_config->>'unique', 'false') = 'true' then
      current_key := field_config->>'key';
      if current_key is not null and new.data ? current_key then
        current_value := new.data -> current_key;
        if current_value is not null and current_value <> 'null'::jsonb then
          current_hash := encode(digest(convert_to(current_value::text, 'UTF8'), 'sha256'), 'hex');
          insert into public.app_record_unique_values(project_id, entity_key, field_key, value_hash, record_id)
          values (new.project_id, new.entity_key, current_key, current_hash, new.id);
        end if;
      end if;
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_web_master_sync_record_unique_values on public.app_records;
create trigger trg_web_master_sync_record_unique_values
after insert or update of project_id, entity_key, data, deleted_at on public.app_records
for each row execute function public.web_master_sync_record_unique_values();

create table if not exists public.app_record_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.app_projects(id) on delete cascade,
  relation_id text not null check (length(relation_id) between 1 and 128),
  relation_kind text not null default 'many_to_many' check (relation_kind in ('one_to_one','one_to_many','many_to_many')),
  from_record_id uuid not null references public.app_records(id) on delete cascade,
  to_record_id uuid not null references public.app_records(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(project_id, relation_id, from_record_id, to_record_id),
  check (from_record_id <> to_record_id)
);
create index if not exists app_record_links_from_idx
  on public.app_record_links(project_id, relation_id, from_record_id);
create index if not exists app_record_links_to_idx
  on public.app_record_links(project_id, relation_id, to_record_id);
create unique index if not exists app_record_links_one_to_one_from_uidx
  on public.app_record_links(project_id, relation_id, from_record_id)
  where relation_kind = 'one_to_one';
create unique index if not exists app_record_links_one_to_one_to_uidx
  on public.app_record_links(project_id, relation_id, to_record_id)
  where relation_kind = 'one_to_one';
create unique index if not exists app_record_links_one_to_many_to_uidx
  on public.app_record_links(project_id, relation_id, to_record_id)
  where relation_kind = 'one_to_many';

create or replace function public.web_master_validate_record_link()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  from_project uuid;
  to_project uuid;
  from_entity_key text;
  to_entity_key text;
  runtime_config jsonb;
  relation_config jsonb;
  from_entity_id text;
  to_entity_id text;
  configured_kind text;
begin
  select r.project_id, r.entity_key into from_project, from_entity_key
  from public.app_records r
  where r.id = new.from_record_id and r.deleted_at is null;

  select r.project_id, r.entity_key into to_project, to_entity_key
  from public.app_records r
  where r.id = new.to_record_id and r.deleted_at is null;

  if from_project is null or to_project is null then
    raise exception using errcode = '23503', message = 'linked record not found';
  end if;
  if from_project <> new.project_id or to_project <> new.project_id then
    raise exception using errcode = '23514', message = 'cross-project record link is forbidden';
  end if;

  select c.config into runtime_config
  from public.app_runtime_configs c
  where c.project_id = new.project_id;
  if runtime_config is null then
    raise exception using errcode = '23514', message = 'runtime config not found';
  end if;

  select relation_item into relation_config
  from jsonb_array_elements(coalesce(runtime_config->'relations', '[]'::jsonb)) as relation_item
  where relation_item->>'id' = new.relation_id
  limit 1;
  if relation_config is null then
    raise exception using errcode = '23514', message = 'relation not configured';
  end if;

  select entity_item->>'id' into from_entity_id
  from jsonb_array_elements(coalesce(runtime_config->'entities', '[]'::jsonb)) as entity_item
  where entity_item->>'key' = from_entity_key
  limit 1;
  select entity_item->>'id' into to_entity_id
  from jsonb_array_elements(coalesce(runtime_config->'entities', '[]'::jsonb)) as entity_item
  where entity_item->>'key' = to_entity_key
  limit 1;

  if relation_config->>'fromEntityId' <> from_entity_id or relation_config->>'toEntityId' <> to_entity_id then
    raise exception using errcode = '23514', message = 'record entities do not match relation';
  end if;

  configured_kind := relation_config->>'kind';
  if configured_kind not in ('one_to_one','one_to_many','many_to_many') then
    raise exception using errcode = '23514', message = 'invalid relation kind';
  end if;
  new.relation_kind := configured_kind;
  return new;
end;
$$;

drop trigger if exists trg_web_master_validate_record_link on public.app_record_links;
create trigger trg_web_master_validate_record_link
before insert or update on public.app_record_links
for each row execute function public.web_master_validate_record_link();

create table if not exists public.app_audit_log (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.app_projects(id) on delete cascade,
  actor_member_id uuid references public.app_members(id) on delete set null,
  action text not null check (length(action) between 1 and 120),
  entity_key text,
  record_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (octet_length(metadata::text) <= 65536)
);
create index if not exists app_audit_log_project_idx
  on public.app_audit_log(project_id, created_at desc);

create table if not exists public.app_daily_metrics (
  project_id uuid not null references public.app_projects(id) on delete cascade,
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
  check (errors_count >= 0),
  check (current_release is null or current_release >= 0)
);

alter table public.app_runtime_configs enable row level security;
alter table public.app_members enable row level security;
alter table public.app_records enable row level security;
alter table public.app_record_unique_values enable row level security;
alter table public.app_record_links enable row level security;
alter table public.app_audit_log enable row level security;
alter table public.app_daily_metrics enable row level security;

-- No anon/authenticated policies are created intentionally.
-- Current Web Master runtime CRUD uses the server-side service role and performs project/role checks in TypeScript.
grant all on public.app_runtime_configs to service_role;
grant all on public.app_members to service_role;
grant all on public.app_records to service_role;
grant all on public.app_record_unique_values to service_role;
grant all on public.app_record_links to service_role;
grant all on public.app_audit_log to service_role;
grant all on public.app_daily_metrics to service_role;
grant usage, select on sequence public.app_audit_log_id_seq to service_role;
