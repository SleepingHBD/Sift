-- Phase 4: opt-in, audited Radar retention.
--
-- Existing monitors remain non-destructive because retention_enabled defaults
-- to false. The trusted scheduler may call the bounded enforcement RPC only
-- after a successful scheduled collection. Strategically handled evidence is
-- excluded, every deletion batch is audited, and reference writers coordinate
-- with cleanup so a concurrent citation cannot become orphaned.

alter table public.monitoring_queries
  add column if not exists retention_enabled boolean not null default false,
  add column if not exists last_retention_run_at timestamptz,
  add column if not exists last_retention_deleted_count integer not null default 0,
  add column if not exists last_retention_error text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'monitoring_queries_retention_state_check'
      and conrelid = 'public.monitoring_queries'::regclass
  ) then
    alter table public.monitoring_queries
      add constraint monitoring_queries_retention_state_check
      check (
        not retention_enabled
        or (
          retention_days is not null
          and enabled
          and schedule_enabled
          and schedule_frequency in ('daily', 'weekly')
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'monitoring_queries_last_retention_deleted_count_check'
      and conrelid = 'public.monitoring_queries'::regclass
  ) then
    alter table public.monitoring_queries
      add constraint monitoring_queries_last_retention_deleted_count_check
      check (last_retention_deleted_count >= 0);
  end if;
end;
$$;

create table public.radar_retention_runs (
  id uuid primary key default extensions.gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  monitoring_query_id uuid not null references public.monitoring_queries(id) on delete cascade,
  owner_id uuid references auth.users(id) on delete set null,
  status text not null check (status in ('completed', 'failed')),
  retention_days smallint not null check (retention_days in (90, 180, 365)),
  cutoff_at timestamptz not null,
  batch_limit smallint not null check (batch_limit between 1 and 500),
  candidate_mentions bigint not null default 0 check (candidate_mentions >= 0),
  protected_mentions bigint not null default 0 check (protected_mentions >= 0),
  eligible_mentions_before bigint not null default 0 check (eligible_mentions_before >= 0),
  deleted_mentions integer not null default 0 check (deleted_mentions >= 0),
  remaining_eligible_mentions bigint not null default 0 check (remaining_eligible_mentions >= 0),
  deleted_mention_ids uuid[] not null default '{}',
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default pg_catalog.now(),
  completed_at timestamptz,
  check (deleted_mentions <= eligible_mentions_before),
  check (cardinality(deleted_mention_ids) = deleted_mentions),
  check (cardinality(deleted_mention_ids) <= 500)
);

create index radar_retention_runs_monitor_started_idx
  on public.radar_retention_runs (monitoring_query_id, started_at desc, id desc);

create index radar_retention_runs_project_started_idx
  on public.radar_retention_runs (project_id, started_at desc, id desc);

alter table public.radar_retention_runs enable row level security;

revoke all on table public.radar_retention_runs
from public, anon, authenticated;

grant select on table public.radar_retention_runs
to authenticated;

grant select, insert, update on table public.radar_retention_runs
to service_role;

create policy "permanent accounts read accessible Radar retention audits"
on public.radar_retention_runs
for select
to authenticated
using (
  (select auth.uid()) is not null
  and not coalesce((((select auth.jwt()) ->> 'is_anonymous'))::boolean, true)
  and project_id = any(((select private.accessible_project_ids()))::uuid[])
);

create or replace function private.prepare_radar_retention_before_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.retention_days is null
    or not new.enabled
    or not new.schedule_enabled
    or new.schedule_frequency not in ('daily', 'weekly')
  then
    new.retention_enabled := false;
  end if;
  return new;
end;
$$;

revoke all on function private.prepare_radar_retention_before_write()
from public, anon, authenticated, service_role;

drop trigger if exists zz_prepare_radar_retention_before_write
on public.monitoring_queries;

create trigger zz_prepare_radar_retention_before_write
before insert or update of enabled, schedule_enabled, schedule_frequency, retention_days, retention_enabled
on public.monitoring_queries
for each row execute function private.prepare_radar_retention_before_write();

create or replace function private.radar_retention_candidates(
  p_monitor_id uuid,
  p_cutoff timestamptz
)
returns table (
  mention_id uuid,
  project_id uuid,
  observed_at timestamptz,
  protection_reasons text[]
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    mention.id,
    mention.project_id,
    coalesce(mention.published_at, mention.created_at),
    pg_catalog.array_remove(array[
      case when mention.is_important then 'important'::text end,
      case when mention.review_status <> 'unreviewed' then 'reviewed'::text end,
      case when exists (
        select 1
        from public.mention_notes note
        where note.mention_id = mention.id
          and note.project_id = mention.project_id
      ) then 'note'::text end,
      case when exists (
        select 1
        from public.saved_items saved
        where saved.item_type = 'mention'::public.item_kind
          and saved.item_id = mention.id
          and saved.project_id = mention.project_id
      ) then 'saved'::text end,
      case when exists (
        select 1
        from public.item_tags tag_link
        where tag_link.item_type = 'mention'::public.item_kind
          and tag_link.item_id = mention.id
          and tag_link.project_id = mention.project_id
      ) then 'tagged'::text end,
      case when exists (
        select 1
        from public.evidence_topic_assignments topic_link
        where topic_link.item_type = 'mention'::public.item_kind
          and topic_link.item_id = mention.id
          and topic_link.project_id = mention.project_id
      ) then 'strategist_topic'::text end,
      case when exists (
        select 1
        from public.insight_sources source
        join public.insights insight on insight.id = source.insight_id
        where source.source_type = 'mention'::public.item_kind
          and source.source_id = mention.id
          and insight.project_id = mention.project_id
      ) then 'insight_citation'::text end,
      case when exists (
        select 1
        from public.brief_sources source
        join public.briefs brief on brief.id = source.brief_id
        where source.source_type = 'mention'::public.item_kind
          and source.source_id = mention.id
          and brief.project_id = mention.project_id
      ) then 'brief_citation'::text end,
      case when exists (
        select 1
        from public.trend_mentions trend_link
        join public.trends trend on trend.id = trend_link.trend_id
        where trend_link.mention_id = mention.id
          and trend.project_id = mention.project_id
      ) then 'trend_evidence'::text end
    ]::text[], null::text)
  from public.mentions mention
  where mention.monitoring_query_id = p_monitor_id
    and coalesce(mention.published_at, mention.created_at) < p_cutoff;
$$;

revoke all on function private.radar_retention_candidates(uuid, timestamptz)
from public, anon, authenticated, service_role;

grant execute on function private.radar_retention_candidates(uuid, timestamptz)
to authenticated, service_role;

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

  preview_cutoff := pg_catalog.now() - pg_catalog.make_interval(days => p_retention_days);

  return query
  select
    preview_cutoff,
    count(*)::bigint,
    count(*) filter (where cardinality(candidate.protection_reasons) > 0)::bigint,
    count(*) filter (where cardinality(candidate.protection_reasons) = 0)::bigint,
    min(candidate.observed_at)
  from private.radar_retention_candidates(p_monitor_id, preview_cutoff) candidate;
end;
$$;

revoke all on function public.radar_retention_preview(uuid, smallint)
from public, anon, authenticated, service_role;

grant execute on function public.radar_retention_preview(uuid, smallint)
to authenticated;

create or replace function private.lock_radar_mention_reference()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  payload jsonb := pg_catalog.to_jsonb(new);
  reference_kind text := coalesce(payload ->> 'item_type', payload ->> 'source_type');
  reference_id uuid := coalesce(payload ->> 'item_id', payload ->> 'source_id')::uuid;
begin
  if reference_kind = 'mention' then
    if reference_id is null then
      raise exception 'A mention reference requires an evidence ID.' using errcode = '23503';
    end if;

    perform pg_catalog.pg_advisory_xact_lock_shared(
      pg_catalog.hashtextextended(reference_id::text, 40904)
    );

    if not exists (
      select 1
      from public.mentions mention
      where mention.id = reference_id
    ) then
      raise exception 'The referenced Radar conversation is unavailable.' using errcode = '23503';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.lock_radar_mention_reference()
from public, anon, authenticated, service_role;

drop trigger if exists lock_saved_radar_mention_reference on public.saved_items;
create trigger lock_saved_radar_mention_reference
before insert or update of item_type, item_id on public.saved_items
for each row execute function private.lock_radar_mention_reference();

drop trigger if exists lock_tagged_radar_mention_reference on public.item_tags;
create trigger lock_tagged_radar_mention_reference
before insert or update of item_type, item_id on public.item_tags
for each row execute function private.lock_radar_mention_reference();

drop trigger if exists lock_topic_radar_mention_reference on public.evidence_topic_assignments;
create trigger lock_topic_radar_mention_reference
before insert or update of item_type, item_id on public.evidence_topic_assignments
for each row execute function private.lock_radar_mention_reference();

drop trigger if exists lock_insight_radar_mention_reference on public.insight_sources;
create trigger lock_insight_radar_mention_reference
before insert or update of source_type, source_id on public.insight_sources
for each row execute function private.lock_radar_mention_reference();

drop trigger if exists lock_brief_radar_mention_reference on public.brief_sources;
create trigger lock_brief_radar_mention_reference
before insert or update of source_type, source_id on public.brief_sources
for each row execute function private.lock_radar_mention_reference();

create or replace function public.enforce_radar_retention(
  p_monitor_id uuid,
  p_batch_limit integer default 250
)
returns table (
  retention_run_id uuid,
  retention_status text,
  retention_cutoff_at timestamptz,
  candidate_mentions bigint,
  protected_mentions bigint,
  deleted_mentions integer,
  remaining_eligible_mentions bigint,
  retention_error text
)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  target record;
  retention_cutoff timestamptz;
  effective_limit integer;
  candidate_count bigint := 0;
  protected_count bigint := 0;
  eligible_count bigint := 0;
  remaining_count bigint := 0;
  audit_id uuid;
  selected_ids uuid[] := '{}'::uuid[];
  safe_ids uuid[] := '{}'::uuid[];
  deleted_ids uuid[] := '{}'::uuid[];
  deleted_count integer := 0;
  failure_state text;
  failure_message text;
begin
  if p_monitor_id is null then
    raise exception 'A Radar monitor is required.' using errcode = '22023';
  end if;

  if p_batch_limit is null or p_batch_limit < 1 or p_batch_limit > 500 then
    raise exception 'Retention batches must contain between 1 and 500 conversations.' using errcode = '22023';
  end if;
  effective_limit := p_batch_limit;

  select
    query.id,
    query.project_id,
    project.owner_id,
    query.retention_enabled,
    query.retention_days
  into target
  from public.monitoring_queries query
  join public.projects project on project.id = query.project_id
  where query.id = p_monitor_id
  for update of query;

  if not found then
    raise exception 'The Radar monitor is unavailable.' using errcode = '42501';
  end if;

  if not target.retention_enabled or target.retention_days is null then
    return query select
      null::uuid,
      'disabled'::text,
      null::timestamptz,
      0::bigint,
      0::bigint,
      0::integer,
      0::bigint,
      null::text;
    return;
  end if;

  retention_cutoff := pg_catalog.now() - pg_catalog.make_interval(days => target.retention_days);

  select
    count(*)::bigint,
    count(*) filter (where cardinality(candidate.protection_reasons) > 0)::bigint,
    count(*) filter (where cardinality(candidate.protection_reasons) = 0)::bigint
  into candidate_count, protected_count, eligible_count
  from private.radar_retention_candidates(p_monitor_id, retention_cutoff) candidate;

  insert into public.radar_retention_runs (
    project_id,
    monitoring_query_id,
    owner_id,
    status,
    retention_days,
    cutoff_at,
    batch_limit,
    candidate_mentions,
    protected_mentions,
    eligible_mentions_before,
    metadata
  ) values (
    target.project_id,
    p_monitor_id,
    target.owner_id,
    'completed',
    target.retention_days,
    retention_cutoff,
    effective_limit,
    candidate_count,
    protected_count,
    eligible_count,
    pg_catalog.jsonb_build_object('protectionPolicyVersion', 1, 'triggerType', 'scheduled')
  ) returning id into audit_id;

  begin
    select coalesce(pg_catalog.array_agg(locked.mention_id order by locked.observed_at, locked.mention_id), '{}'::uuid[])
    into selected_ids
    from (
      select candidate.mention_id, candidate.observed_at
      from private.radar_retention_candidates(p_monitor_id, retention_cutoff) candidate
      join public.mentions mention on mention.id = candidate.mention_id
      where cardinality(candidate.protection_reasons) = 0
      order by candidate.observed_at, candidate.mention_id
      for update of mention skip locked
      limit effective_limit
    ) locked;

    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(reference_id::text, 40904)
    )
    from unnest(selected_ids) as selected(reference_id)
    order by reference_id;

    select coalesce(pg_catalog.array_agg(candidate.mention_id order by candidate.mention_id), '{}'::uuid[])
    into safe_ids
    from private.radar_retention_candidates(p_monitor_id, retention_cutoff) candidate
    where candidate.mention_id = any(selected_ids)
      and cardinality(candidate.protection_reasons) = 0;

    with deleted as (
      delete from public.mentions mention
      where mention.monitoring_query_id = p_monitor_id
        and mention.id = any(safe_ids)
      returning mention.id
    )
    select coalesce(pg_catalog.array_agg(deleted.id order by deleted.id), '{}'::uuid[])
    into deleted_ids
    from deleted;

    deleted_count := cardinality(deleted_ids);

    select count(*) filter (where cardinality(candidate.protection_reasons) = 0)::bigint
    into remaining_count
    from private.radar_retention_candidates(p_monitor_id, retention_cutoff) candidate;

    update public.radar_retention_runs
    set
      status = 'completed',
      deleted_mentions = deleted_count,
      remaining_eligible_mentions = remaining_count,
      deleted_mention_ids = deleted_ids,
      completed_at = pg_catalog.now()
    where id = audit_id;

    update public.monitoring_queries
    set
      last_retention_run_at = pg_catalog.now(),
      last_retention_deleted_count = deleted_count,
      last_retention_error = null,
      updated_at = pg_catalog.now()
    where id = p_monitor_id;

    return query select
      audit_id,
      'completed'::text,
      retention_cutoff,
      candidate_count,
      protected_count,
      deleted_count,
      remaining_count,
      null::text;
  exception
    when others then
      get stacked diagnostics
        failure_state = returned_sqlstate,
        failure_message = message_text;
      failure_message := pg_catalog.left(
        coalesce(failure_state || ': ' || failure_message, 'Retention enforcement failed.'),
        1000
      );

      update public.radar_retention_runs
      set
        status = 'failed',
        error_message = failure_message,
        completed_at = pg_catalog.now()
      where id = audit_id;

      update public.monitoring_queries
      set
        last_retention_run_at = pg_catalog.now(),
        last_retention_deleted_count = 0,
        last_retention_error = failure_message,
        updated_at = pg_catalog.now()
      where id = p_monitor_id;

      return query select
        audit_id,
        'failed'::text,
        retention_cutoff,
        candidate_count,
        protected_count,
        0::integer,
        eligible_count,
        failure_message;
  end;
end;
$$;

revoke all on function public.enforce_radar_retention(uuid, integer)
from public, anon, authenticated, service_role;

grant execute on function public.enforce_radar_retention(uuid, integer)
to service_role;

comment on column public.monitoring_queries.retention_enabled is
  'Explicit per-monitor opt-in. False by default; eligible cleanup runs only after successful scheduled collection.';
comment on table public.radar_retention_runs is
  'Content-free audit records for bounded Radar retention batches. Deleted source text is not copied here.';
comment on function private.radar_retention_candidates(uuid, timestamptz) is
  'Classifies aged Radar conversations and explains every strategic protection that prevents cleanup.';
comment on function public.enforce_radar_retention(uuid, integer) is
  'Service-role-only, bounded retention enforcement with row locks, citation coordination, and durable audit results.';
