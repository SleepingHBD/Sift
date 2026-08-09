-- Phase 4: store per-monitor scheduling and retention preferences without
-- enabling background execution or automatic deletion. The preview routine
-- executes as the caller so existing project RLS remains the authorization
-- boundary.

alter table public.monitoring_queries
  add column if not exists schedule_frequency text not null default 'manual',
  add column if not exists schedule_hour smallint not null default 9,
  add column if not exists schedule_weekday smallint not null default 1,
  add column if not exists schedule_timezone text not null default 'UTC',
  add column if not exists schedule_enabled boolean not null default false,
  add column if not exists next_scheduled_run_at timestamptz,
  add column if not exists last_scheduled_run_at timestamptz,
  add column if not exists retention_days smallint;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'monitoring_queries_schedule_frequency_check'
      and conrelid = 'public.monitoring_queries'::regclass
  ) then
    alter table public.monitoring_queries
      add constraint monitoring_queries_schedule_frequency_check
      check (schedule_frequency in ('manual', 'daily', 'weekly'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'monitoring_queries_schedule_hour_check'
      and conrelid = 'public.monitoring_queries'::regclass
  ) then
    alter table public.monitoring_queries
      add constraint monitoring_queries_schedule_hour_check
      check (schedule_hour between 0 and 23);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'monitoring_queries_schedule_weekday_check'
      and conrelid = 'public.monitoring_queries'::regclass
  ) then
    alter table public.monitoring_queries
      add constraint monitoring_queries_schedule_weekday_check
      check (schedule_weekday between 0 and 6);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'monitoring_queries_schedule_timezone_check'
      and conrelid = 'public.monitoring_queries'::regclass
  ) then
    alter table public.monitoring_queries
      add constraint monitoring_queries_schedule_timezone_check
      check (char_length(btrim(schedule_timezone)) between 1 and 100);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'monitoring_queries_schedule_state_check'
      and conrelid = 'public.monitoring_queries'::regclass
  ) then
    alter table public.monitoring_queries
      add constraint monitoring_queries_schedule_state_check
      check (
        not schedule_enabled
        or (enabled and schedule_frequency in ('daily', 'weekly'))
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'monitoring_queries_retention_days_check'
      and conrelid = 'public.monitoring_queries'::regclass
  ) then
    alter table public.monitoring_queries
      add constraint monitoring_queries_retention_days_check
      check (retention_days is null or retention_days in (90, 180, 365));
  end if;
end;
$$;

create index if not exists monitoring_queries_scheduled_due_idx
  on public.monitoring_queries (next_scheduled_run_at, id)
  where enabled
    and schedule_enabled
    and next_scheduled_run_at is not null;

create or replace function public.radar_retention_preview(
  p_monitor_id uuid,
  p_retention_days smallint
)
returns table (
  cutoff_at timestamptz,
  candidate_mentions bigint,
  protected_mentions bigint,
  eligible_mentions bigint,
  oldest_candidate_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  monitor_visible boolean := false;
  preview_cutoff timestamptz;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if coalesce((((select auth.jwt()) ->> 'is_anonymous'))::boolean, true) then
    raise exception 'A permanent account is required.' using errcode = '42501';
  end if;

  if p_retention_days not in (90, 180, 365) then
    raise exception 'Retention must be 90, 180, or 365 days.' using errcode = '22023';
  end if;

  select exists (
    select 1
    from public.monitoring_queries query
    where query.id = p_monitor_id
  ) into monitor_visible;

  if not monitor_visible then
    raise exception 'Monitor is unavailable to this account.' using errcode = '42501';
  end if;

  preview_cutoff := timezone('utc', now()) - make_interval(days => p_retention_days);

  return query
  with candidates as (
    select
      mention.id,
      mention.project_id,
      coalesce(mention.published_at, mention.created_at) as observed_at,
      (
        mention.is_important
        or mention.review_status in ('relevant', 'archived')
        or exists (
          select 1 from public.mention_notes note
          where note.mention_id = mention.id
            and note.project_id = mention.project_id
        )
        or exists (
          select 1 from public.saved_items saved
          where saved.item_type = 'mention'::public.item_kind
            and saved.item_id = mention.id
            and saved.project_id = mention.project_id
        )
        or exists (
          select 1 from public.insight_sources source
          join public.insights insight on insight.id = source.insight_id
          where source.source_type = 'mention'::public.item_kind
            and source.source_id = mention.id
            and insight.project_id = mention.project_id
        )
        or exists (
          select 1 from public.brief_sources source
          join public.briefs brief on brief.id = source.brief_id
          where source.source_type = 'mention'::public.item_kind
            and source.source_id = mention.id
            and brief.project_id = mention.project_id
        )
      ) as protected
    from public.mentions mention
    where mention.monitoring_query_id = p_monitor_id
      and coalesce(mention.published_at, mention.created_at) < preview_cutoff
  )
  select
    preview_cutoff,
    count(*)::bigint,
    count(*) filter (where candidates.protected)::bigint,
    count(*) filter (where not candidates.protected)::bigint,
    min(candidates.observed_at)
  from candidates;
end;
$$;

revoke all on function public.radar_retention_preview(uuid, smallint)
from public, anon;

grant execute on function public.radar_retention_preview(uuid, smallint)
to authenticated;

comment on column public.monitoring_queries.schedule_frequency is
  'Saved schedule preference. Manual remains the default; background execution is enabled separately.';
comment on column public.monitoring_queries.schedule_enabled is
  'Operational scheduler switch. It remains false until the trusted scheduler backend is installed.';
comment on column public.monitoring_queries.retention_days is
  'Saved raw-conversation retention preference. Null means keep forever; enforcement is enabled separately.';
comment on function public.radar_retention_preview(uuid, smallint) is
  'Counts RLS-visible aged conversations and separates protected evidence without deleting records.';
