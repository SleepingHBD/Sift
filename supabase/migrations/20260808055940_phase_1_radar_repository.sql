-- Phase 1: make Radar definitions and run history safe to hydrate from the
-- authenticated Supabase workspace. Existing records remain untouched.

drop index if exists public.monitoring_queries_project_client_ref_idx;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'monitoring_queries_project_client_ref_key'
      and conrelid = 'public.monitoring_queries'::regclass
  ) then
    alter table public.monitoring_queries
      add constraint monitoring_queries_project_client_ref_key
      unique (project_id, client_ref);
  end if;
end
$$;

alter table public.monitor_runs
  add column if not exists client_ref text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'monitor_runs_query_client_ref_key'
      and conrelid = 'public.monitor_runs'::regclass
  ) then
    alter table public.monitor_runs
      add constraint monitor_runs_query_client_ref_key
      unique (monitoring_query_id, client_ref);
  end if;
end
$$;

create index if not exists monitoring_queries_project_created_cursor_idx
  on public.monitoring_queries (project_id, created_at desc, id desc);

create index if not exists mentions_query_created_cursor_idx
  on public.mentions (monitoring_query_id, created_at desc, id desc)
  where monitoring_query_id is not null;

create index if not exists monitor_runs_query_started_cursor_idx
  on public.monitor_runs (monitoring_query_id, started_at desc, id desc);

comment on column public.monitor_runs.client_ref is
  'Stable client-generated run identifier used for idempotent browser-data migration.';
