-- Phase 5: transparent signal foundation.
--
-- Signals sit between source evidence and promoted trends. They preserve a
-- strategist's working observation, distinguish support from contradiction,
-- and keep each assessment as an immutable versioned snapshot. No rows are
-- generated automatically by this migration.

create table public.signals (
  id uuid primary key default extensions.gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  topic_id uuid references public.topics(id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  observation text not null check (char_length(btrim(observation)) between 1 and 5000),
  kind text not null default 'signal' check (
    kind in ('signal', 'emerging_pattern', 'observed_trend', 'hypothesis')
  ),
  status text not null default 'candidate' check (
    status in ('candidate', 'watching', 'promoted', 'dismissed')
  ),
  movement text not null default 'uncertain' check (
    movement in ('new', 'strengthening', 'stable', 'weakening', 'contradictory', 'uncertain')
  ),
  origin text not null default 'strategist' check (
    origin in ('strategist', 'deterministic', 'ai_assisted')
  ),
  scope_note text not null default 'Observed within this project''s collected evidence; not a population-level claim.'
    check (char_length(scope_note) between 1 and 1000),
  strategist_notes text check (strategist_notes is null or char_length(strategist_notes) <= 10000),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  unique (id, project_id)
);

create table public.signal_evidence (
  id uuid primary key default extensions.gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  signal_id uuid not null,
  evidence_type public.item_kind not null check (
    evidence_type in (
      'mention'::public.item_kind,
      'research'::public.item_kind,
      'inspiration'::public.item_kind
    )
  ),
  evidence_id uuid not null,
  relationship text not null check (relationship in ('support', 'contradict', 'context')),
  weight numeric not null default 1 check (weight > 0 and weight <= 1),
  rationale text check (rationale is null or char_length(rationale) <= 2000),
  added_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  foreign key (signal_id, project_id)
    references public.signals(id, project_id)
    on delete cascade,
  unique (signal_id, evidence_type, evidence_id, relationship)
);

create table public.signal_snapshots (
  id uuid primary key default extensions.gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  signal_id uuid not null,
  analysis_version text not null check (char_length(btrim(analysis_version)) between 1 and 120),
  method text not null check (method in ('deterministic', 'strategist', 'ai_assisted')),
  period_start timestamptz,
  period_end timestamptz,
  movement text not null check (
    movement in ('new', 'strengthening', 'stable', 'weakening', 'contradictory', 'uncertain')
  ),
  evidence_sufficiency text not null check (
    evidence_sufficiency in ('insufficient', 'limited', 'developing', 'sufficient')
  ),
  strength_score numeric not null check (strength_score between 0 and 100),
  supporting_count integer not null default 0 check (supporting_count >= 0),
  contradicting_count integer not null default 0 check (contradicting_count >= 0),
  source_diversity integer not null default 0 check (source_diversity >= 0),
  author_diversity integer not null default 0 check (author_diversity >= 0),
  growth_rate numeric,
  recency_days numeric check (recency_days is null or recency_days >= 0),
  factor_breakdown jsonb not null default '{}'::jsonb,
  limitations text[] not null default '{}',
  research_gaps text[] not null default '{}',
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  foreign key (signal_id, project_id)
    references public.signals(id, project_id)
    on delete cascade,
  check (period_start is null or period_end is null or period_end >= period_start)
);

create index signals_project_updated_idx
  on public.signals (project_id, updated_at desc, id desc);
create index signals_project_status_idx
  on public.signals (project_id, status, updated_at desc);
create index signals_created_by_idx
  on public.signals (created_by);
create index signals_topic_id_idx
  on public.signals (topic_id)
  where topic_id is not null;

create index signal_evidence_project_signal_idx
  on public.signal_evidence (project_id, signal_id, relationship, created_at desc);
create index signal_evidence_source_lookup_idx
  on public.signal_evidence (evidence_type, evidence_id, signal_id);
create index signal_evidence_added_by_idx
  on public.signal_evidence (added_by);

create index signal_snapshots_signal_created_idx
  on public.signal_snapshots (signal_id, created_at desc, id desc);
create index signal_snapshots_project_created_idx
  on public.signal_snapshots (project_id, created_at desc, id desc);
create index signal_snapshots_created_by_idx
  on public.signal_snapshots (created_by);

alter table public.signals enable row level security;
alter table public.signal_evidence enable row level security;
alter table public.signal_snapshots enable row level security;

revoke all on table public.signals, public.signal_evidence, public.signal_snapshots
from public, anon, authenticated;

grant select, insert, update, delete on table public.signals
to authenticated;
grant select, insert, update, delete on table public.signal_evidence
to authenticated;
grant select, insert on table public.signal_snapshots
to authenticated;

grant select, insert, update, delete on table public.signals, public.signal_evidence
to service_role;
grant select, insert on table public.signal_snapshots
to service_role;

create policy "permanent accounts read accessible signals"
on public.signals
for select
to authenticated
using (
  (select auth.uid()) is not null
  and not coalesce((((select auth.jwt()) ->> 'is_anonymous'))::boolean, true)
  and project_id = any(((select private.accessible_project_ids()))::uuid[])
);

create policy "permanent accounts create accessible signals"
on public.signals
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and not coalesce((((select auth.jwt()) ->> 'is_anonymous'))::boolean, true)
  and created_by = (select auth.uid())
  and project_id = any(((select private.accessible_project_ids()))::uuid[])
);

create policy "permanent accounts update accessible signals"
on public.signals
for update
to authenticated
using (
  (select auth.uid()) is not null
  and not coalesce((((select auth.jwt()) ->> 'is_anonymous'))::boolean, true)
  and project_id = any(((select private.accessible_project_ids()))::uuid[])
)
with check (
  (select auth.uid()) is not null
  and not coalesce((((select auth.jwt()) ->> 'is_anonymous'))::boolean, true)
  and project_id = any(((select private.accessible_project_ids()))::uuid[])
);

create policy "permanent accounts delete accessible signals"
on public.signals
for delete
to authenticated
using (
  (select auth.uid()) is not null
  and not coalesce((((select auth.jwt()) ->> 'is_anonymous'))::boolean, true)
  and project_id = any(((select private.accessible_project_ids()))::uuid[])
);

create or replace function private.signal_evidence_source_exists(
  p_project_id uuid,
  p_evidence_type public.item_kind,
  p_evidence_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select case p_evidence_type
    when 'mention'::public.item_kind then exists (
      select 1 from public.mentions source
      where source.id = p_evidence_id and source.project_id = p_project_id
    )
    when 'research'::public.item_kind then exists (
      select 1 from public.research_items source
      where source.id = p_evidence_id and source.project_id = p_project_id
    )
    when 'inspiration'::public.item_kind then exists (
      select 1 from public.inspiration_items source
      where source.id = p_evidence_id and source.project_id = p_project_id
    )
    else false
  end;
$$;

revoke all on function private.signal_evidence_source_exists(uuid, public.item_kind, uuid)
from public, anon, authenticated, service_role;
grant execute on function private.signal_evidence_source_exists(uuid, public.item_kind, uuid)
to authenticated, service_role;

create policy "permanent accounts read accessible signal evidence"
on public.signal_evidence
for select
to authenticated
using (
  (select auth.uid()) is not null
  and not coalesce((((select auth.jwt()) ->> 'is_anonymous'))::boolean, true)
  and project_id = any(((select private.accessible_project_ids()))::uuid[])
);

create policy "permanent accounts create accessible signal evidence"
on public.signal_evidence
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and not coalesce((((select auth.jwt()) ->> 'is_anonymous'))::boolean, true)
  and added_by = (select auth.uid())
  and project_id = any(((select private.accessible_project_ids()))::uuid[])
  and private.signal_evidence_source_exists(project_id, evidence_type, evidence_id)
);

create policy "permanent accounts update accessible signal evidence"
on public.signal_evidence
for update
to authenticated
using (
  (select auth.uid()) is not null
  and not coalesce((((select auth.jwt()) ->> 'is_anonymous'))::boolean, true)
  and project_id = any(((select private.accessible_project_ids()))::uuid[])
)
with check (
  (select auth.uid()) is not null
  and not coalesce((((select auth.jwt()) ->> 'is_anonymous'))::boolean, true)
  and project_id = any(((select private.accessible_project_ids()))::uuid[])
  and private.signal_evidence_source_exists(project_id, evidence_type, evidence_id)
);

create policy "permanent accounts delete accessible signal evidence"
on public.signal_evidence
for delete
to authenticated
using (
  (select auth.uid()) is not null
  and not coalesce((((select auth.jwt()) ->> 'is_anonymous'))::boolean, true)
  and project_id = any(((select private.accessible_project_ids()))::uuid[])
);

create policy "permanent accounts read accessible signal snapshots"
on public.signal_snapshots
for select
to authenticated
using (
  (select auth.uid()) is not null
  and not coalesce((((select auth.jwt()) ->> 'is_anonymous'))::boolean, true)
  and project_id = any(((select private.accessible_project_ids()))::uuid[])
);

create policy "permanent accounts append accessible signal snapshots"
on public.signal_snapshots
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and not coalesce((((select auth.jwt()) ->> 'is_anonymous'))::boolean, true)
  and created_by = (select auth.uid())
  and project_id = any(((select private.accessible_project_ids()))::uuid[])
);

create or replace function private.prepare_signal_before_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (
    new.project_id <> old.project_id
    or new.created_by <> old.created_by
  ) then
    raise exception 'Signal ownership cannot be changed.' using errcode = '22023';
  end if;

  if new.topic_id is not null and not exists (
    select 1
    from public.topics topic
    where topic.id = new.topic_id
      and topic.project_id = new.project_id
  ) then
    raise exception 'Signal topic must belong to the same project.' using errcode = '23503';
  end if;

  return new;
end;
$$;

revoke all on function private.prepare_signal_before_write()
from public, anon, authenticated, service_role;

create trigger prepare_signal_before_write
before insert or update on public.signals
for each row execute function private.prepare_signal_before_write();

create trigger set_signals_updated_at
before update on public.signals
for each row execute function public.set_updated_at();

create or replace function private.prepare_signal_evidence_before_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (
    new.project_id <> old.project_id
    or new.signal_id <> old.signal_id
    or new.evidence_type <> old.evidence_type
    or new.evidence_id <> old.evidence_id
    or new.added_by <> old.added_by
  ) then
    raise exception 'Signal evidence identity cannot be changed.' using errcode = '22023';
  end if;

  if new.evidence_type = 'mention'::public.item_kind then
    perform pg_catalog.pg_advisory_xact_lock_shared(
      pg_catalog.hashtextextended(new.evidence_id::text, 40904)
    );
  end if;

  if not private.signal_evidence_source_exists(
    new.project_id,
    new.evidence_type,
    new.evidence_id
  ) then
    raise exception 'Signal evidence must reference an available source in the same project.' using errcode = '23503';
  end if;

  return new;
end;
$$;

revoke all on function private.prepare_signal_evidence_before_write()
from public, anon, authenticated, service_role;

create trigger prepare_signal_evidence_before_write
before insert or update on public.signal_evidence
for each row execute function private.prepare_signal_evidence_before_write();

-- Keep strategically linked Radar conversations outside automatic retention.
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
        select 1 from public.mention_notes note
        where note.mention_id = mention.id and note.project_id = mention.project_id
      ) then 'note'::text end,
      case when exists (
        select 1 from public.saved_items saved
        where saved.item_type = 'mention'::public.item_kind
          and saved.item_id = mention.id and saved.project_id = mention.project_id
      ) then 'saved'::text end,
      case when exists (
        select 1 from public.item_tags tag_link
        where tag_link.item_type = 'mention'::public.item_kind
          and tag_link.item_id = mention.id and tag_link.project_id = mention.project_id
      ) then 'tagged'::text end,
      case when exists (
        select 1 from public.evidence_topic_assignments topic_link
        where topic_link.item_type = 'mention'::public.item_kind
          and topic_link.item_id = mention.id and topic_link.project_id = mention.project_id
      ) then 'strategist_topic'::text end,
      case when exists (
        select 1 from public.insight_sources source
        join public.insights insight on insight.id = source.insight_id
        where source.source_type = 'mention'::public.item_kind
          and source.source_id = mention.id and insight.project_id = mention.project_id
      ) then 'insight_citation'::text end,
      case when exists (
        select 1 from public.brief_sources source
        join public.briefs brief on brief.id = source.brief_id
        where source.source_type = 'mention'::public.item_kind
          and source.source_id = mention.id and brief.project_id = mention.project_id
      ) then 'brief_citation'::text end,
      case when exists (
        select 1 from public.trend_mentions trend_link
        join public.trends trend on trend.id = trend_link.trend_id
        where trend_link.mention_id = mention.id and trend.project_id = mention.project_id
      ) then 'trend_evidence'::text end,
      case when exists (
        select 1 from public.signal_evidence signal_link
        where signal_link.evidence_type = 'mention'::public.item_kind
          and signal_link.evidence_id = mention.id
          and signal_link.project_id = mention.project_id
      ) then 'signal_evidence'::text end
    ]::text[], null::text)
  from public.mentions mention
  where mention.monitoring_query_id = p_monitor_id
    and coalesce(mention.published_at, mention.created_at) < p_cutoff;
$$;

revoke all on function private.radar_retention_candidates(uuid, timestamptz)
from public, anon, authenticated, service_role;
grant execute on function private.radar_retention_candidates(uuid, timestamptz)
to authenticated, service_role;

-- Surface signal citations in the shared evidence relationship drawer so
-- deletion never hides a strategic dependency from the user.
create or replace function public.list_evidence_relationships(
  p_kind public.item_kind,
  p_item_id uuid,
  p_project_id uuid
)
returns table (
  relationship_type text,
  relationship_id uuid,
  target_id uuid,
  target_project_id uuid,
  label text,
  blocking boolean,
  metadata jsonb
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  source_visible boolean := false;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if coalesce((((select auth.jwt()) ->> 'is_anonymous'))::boolean, true) then
    raise exception 'A permanent account is required.' using errcode = '42501';
  end if;

  if p_kind not in (
    'mention'::public.item_kind,
    'research'::public.item_kind,
    'inspiration'::public.item_kind
  ) then
    raise exception 'Unsupported evidence kind.' using errcode = '22023';
  end if;

  source_visible := case
    when p_kind = 'mention'::public.item_kind then exists (
      select 1 from public.mentions source
      where source.id = p_item_id and source.project_id = p_project_id
    )
    when p_kind = 'research'::public.item_kind then exists (
      select 1 from public.research_items source
      where source.id = p_item_id and source.project_id = p_project_id
    )
    when p_kind = 'inspiration'::public.item_kind then exists (
      select 1 from public.inspiration_items source
      where source.id = p_item_id and source.project_id = p_project_id
    )
    else false
  end;

  if not source_visible then
    raise exception 'Evidence is unavailable to this account.' using errcode = '42501';
  end if;

  return query
  select
    'signal'::text,
    link.id,
    signal.id,
    signal.project_id,
    signal.title::text,
    true,
    pg_catalog.jsonb_build_object(
      'relationship', link.relationship,
      'rationale', link.rationale,
      'signal_kind', signal.kind,
      'signal_status', signal.status
    )
  from public.signal_evidence link
  join public.signals signal on signal.id = link.signal_id
  where link.project_id = p_project_id
    and link.evidence_type = p_kind
    and link.evidence_id = p_item_id;

  return query
  select
    'insight'::text,
    source.id,
    insight.id,
    insight.project_id,
    insight.title::text,
    true,
    pg_catalog.jsonb_build_object('claim_type', source.claim_type, 'excerpt', source.excerpt)
  from public.insight_sources source
  join public.insights insight on insight.id = source.insight_id
  where source.source_type = p_kind and source.source_id = p_item_id;

  return query
  select
    'brief'::text,
    source.id,
    brief.id,
    brief.project_id,
    brief.title::text,
    true,
    pg_catalog.jsonb_build_object('excerpt', source.excerpt)
  from public.brief_sources source
  join public.briefs brief on brief.id = source.brief_id
  where source.source_type = p_kind and source.source_id = p_item_id;

  return query
  select
    case
      when saved.destination in ('insight_evidence', 'insight_seed') then 'insight'
      when saved.destination = 'brief' then 'brief'
      when saved.destination = 'project' then 'project'
      else 'saved'
    end::text,
    saved.id,
    saved.destination_id,
    coalesce(target_project.id, target_insight.project_id, target_brief.project_id, saved.project_id),
    case
      when saved.destination = 'project' then coalesce(target_project.name, 'Linked project')
      when saved.destination in ('insight_evidence', 'insight_seed') then coalesce(target_insight.title, 'Insight evidence')
      when saved.destination = 'brief' then coalesce(target_brief.title, 'Brief evidence')
      when saved.destination = 'research' then 'Research library'
      when saved.destination = 'inspiration' then 'Inspiration library'
      else 'Saved marker'
    end::text,
    saved.destination in ('insight_evidence', 'insight_seed', 'brief'),
    pg_catalog.jsonb_build_object('destination', saved.destination, 'note', saved.note, 'source_excerpt', saved.source_excerpt)
  from public.saved_items saved
  left join public.projects target_project
    on saved.destination = 'project' and target_project.id = saved.destination_id
  left join public.insights target_insight
    on saved.destination in ('insight_evidence', 'insight_seed') and target_insight.id = saved.destination_id
  left join public.briefs target_brief
    on saved.destination = 'brief' and target_brief.id = saved.destination_id
  where saved.project_id = p_project_id
    and saved.item_type = p_kind
    and saved.item_id = p_item_id
    and saved.user_id = (select auth.uid());

  return query
  select
    'tag'::text,
    item_tag.id,
    tag.id,
    item_tag.project_id,
    tag.name::text,
    false,
    '{}'::jsonb
  from public.item_tags item_tag
  join public.tags tag on tag.id = item_tag.tag_id
  where item_tag.project_id = p_project_id
    and item_tag.item_type = p_kind
    and item_tag.item_id = p_item_id;

  return query
  select
    'asset'::text,
    asset.id,
    asset.id,
    asset.project_id,
    asset.original_filename::text,
    false,
    pg_catalog.jsonb_build_object('asset_kind', asset.asset_kind, 'mime_type', asset.mime_type, 'byte_size', asset.byte_size)
  from public.evidence_assets asset
  where p_kind = 'research'::public.item_kind
    and asset.project_id = p_project_id
    and asset.research_item_id = p_item_id;

  return query
  select
    'note'::text,
    note.id,
    note.id,
    note.project_id,
    'Conversation note'::text,
    false,
    pg_catalog.jsonb_build_object('preview', pg_catalog.left(note.content, 180))
  from public.mention_notes note
  where p_kind = 'mention'::public.item_kind
    and note.project_id = p_project_id
    and note.mention_id = p_item_id
    and note.user_id = (select auth.uid());

  return query
  select
    'trend'::text,
    trend.id,
    trend.id,
    trend.project_id,
    trend.name::text,
    false,
    pg_catalog.jsonb_build_object('relationship', 'trend evidence')
  from public.trend_mentions link
  join public.trends trend on trend.id = link.trend_id
  where p_kind = 'mention'::public.item_kind and link.mention_id = p_item_id;
end;
$$;

revoke all on function public.list_evidence_relationships(public.item_kind, uuid, uuid)
from public, anon, authenticated, service_role;
grant execute on function public.list_evidence_relationships(public.item_kind, uuid, uuid)
to authenticated;

comment on table public.signals is
  'Evidence-scoped analytical observations that remain distinct from promoted trends and strategic conclusions.';
comment on table public.signal_evidence is
  'Project-safe support, contradiction, or context relationships from a signal to original evidence.';
comment on table public.signal_snapshots is
  'Immutable versioned assessments that preserve factor breakdowns, limitations, and research gaps.';
comment on function public.list_evidence_relationships(public.item_kind, uuid, uuid) is
  'Returns RLS-visible organization and strategic relationships, including blocking signal citations, for one evidence source.';
