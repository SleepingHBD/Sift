alter table public.monitor_runs
  add column if not exists trigger_type text not null default 'manual',
  add column if not exists heartbeat_at timestamptz,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists cursor_source_run_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'monitor_runs_trigger_type_check'
      and conrelid = 'public.monitor_runs'::regclass
  ) then
    alter table public.monitor_runs
      add constraint monitor_runs_trigger_type_check
      check (trigger_type in ('manual', 'scheduled'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'monitor_runs_cursor_source_run_id_fkey'
      and conrelid = 'public.monitor_runs'::regclass
  ) then
    alter table public.monitor_runs
      add constraint monitor_runs_cursor_source_run_id_fkey
      foreign key (cursor_source_run_id)
      references public.monitor_runs(id)
      on delete set null;
  end if;
end
$$;

create unique index if not exists monitor_runs_one_active_query_idx
  on public.monitor_runs (monitoring_query_id)
  where status = 'running';

create index if not exists monitor_runs_expired_lease_idx
  on public.monitor_runs (lease_expires_at)
  where status = 'running';

create index if not exists monitor_runs_cursor_source_run_id_idx
  on public.monitor_runs (cursor_source_run_id)
  where cursor_source_run_id is not null;

comment on column public.monitor_runs.trigger_type is
  'How the collection was initiated. Scheduled runs remain disabled until locking and recovery are proven.';
comment on column public.monitor_runs.heartbeat_at is
  'Most recent execution heartbeat recorded by the trusted connector function.';
comment on column public.monitor_runs.lease_expires_at is
  'Expired running leases can be marked failed and safely retried.';
comment on column public.monitor_runs.cursor_source_run_id is
  'Prior run whose connector checkpoint seeded this execution.';
