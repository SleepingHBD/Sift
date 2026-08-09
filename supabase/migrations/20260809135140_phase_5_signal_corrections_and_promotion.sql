-- Phase 5: strategist-controlled signal correction, lineage, and promotion.
--
-- Corrections remain editable on the authoritative signal row while an
-- immutable revision trail records what changed. Merge and split operations
-- are atomic and preserve source-signal lineage. Promotion is deliberately
-- gated by the latest versioned assessment and creates a separate Trend row.

alter table public.signals
  add column analysis_changed_at timestamptz not null default pg_catalog.now(),
  add column superseded_by_signal_id uuid,
  add column promoted_trend_id uuid;

alter table public.trends
  add constraint trends_id_project_id_key unique (id, project_id);

alter table public.signals
  add constraint signals_superseded_by_signal_project_fkey
  foreign key (superseded_by_signal_id, project_id)
  references public.signals(id, project_id)
  on delete restrict,
  add constraint signals_promoted_trend_project_fkey
  foreign key (promoted_trend_id, project_id)
  references public.trends(id, project_id)
  on delete restrict,
  add constraint signals_not_self_superseded_check
  check (superseded_by_signal_id is null or superseded_by_signal_id <> id),
  add constraint signals_promotion_state_check
  check (
    (promoted_trend_id is null and not (status = 'promoted' or kind = 'observed_trend'))
    or
    (promoted_trend_id is not null and status = 'promoted' and kind = 'observed_trend')
  );

create index signals_superseded_by_project_idx
  on public.signals (superseded_by_signal_id, project_id)
  where superseded_by_signal_id is not null;
create index signals_promoted_trend_project_idx
  on public.signals (promoted_trend_id, project_id)
  where promoted_trend_id is not null;
create index signals_project_analysis_changed_idx
  on public.signals (project_id, analysis_changed_at desc, id desc);

create table public.signal_revisions (
  id uuid primary key default extensions.gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  signal_id uuid not null,
  change_kind text not null check (
    change_kind in ('correction', 'status', 'topic', 'merge', 'promotion')
  ),
  changed_fields text[] not null check (
    cardinality(changed_fields) between 1 and 12
  ),
  before_state jsonb not null,
  after_state jsonb not null,
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default pg_catalog.now(),
  foreign key (signal_id, project_id)
    references public.signals(id, project_id)
    on delete cascade
);

create table public.signal_lineage (
  id uuid primary key default extensions.gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  source_signal_id uuid not null,
  target_signal_id uuid not null,
  relationship text not null check (relationship in ('merge', 'split')),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  foreign key (source_signal_id, project_id)
    references public.signals(id, project_id)
    on delete restrict,
  foreign key (target_signal_id, project_id)
    references public.signals(id, project_id)
    on delete restrict,
  check (source_signal_id <> target_signal_id),
  unique (source_signal_id, target_signal_id, relationship)
);

create index signal_revisions_signal_project_created_idx
  on public.signal_revisions (signal_id, project_id, created_at desc, id desc);
create index signal_revisions_project_created_idx
  on public.signal_revisions (project_id, created_at desc, id desc);
create index signal_revisions_changed_by_idx
  on public.signal_revisions (changed_by)
  where changed_by is not null;
create index signal_lineage_source_project_idx
  on public.signal_lineage (source_signal_id, project_id, created_at desc);
create index signal_lineage_target_project_idx
  on public.signal_lineage (target_signal_id, project_id, created_at desc);
create index signal_lineage_project_created_idx
  on public.signal_lineage (project_id, created_at desc, id desc);
create index signal_lineage_created_by_idx
  on public.signal_lineage (created_by);

alter table public.signal_revisions enable row level security;
alter table public.signal_lineage enable row level security;

revoke all on table public.signal_revisions, public.signal_lineage
from public, anon, authenticated;

grant select on table public.signal_revisions, public.signal_lineage
to authenticated;
grant select, insert, update, delete on table public.signal_revisions, public.signal_lineage
to service_role;

create policy "permanent accounts read accessible signal revisions"
on public.signal_revisions
for select
to authenticated
using (
  (select auth.uid()) is not null
  and not coalesce((((select auth.jwt()) ->> 'is_anonymous'))::boolean, true)
  and project_id = any(((select private.accessible_project_ids()))::uuid[])
);

create policy "permanent accounts read accessible signal lineage"
on public.signal_lineage
for select
to authenticated
using (
  (select auth.uid()) is not null
  and not coalesce((((select auth.jwt()) ->> 'is_anonymous'))::boolean, true)
  and project_id = any(((select private.accessible_project_ids()))::uuid[])
);

create or replace function private.prepare_signal_correction_before_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.analysis_changed_at := pg_catalog.now();
    if current_user = 'authenticated' then
      new.superseded_by_signal_id := null;
      new.promoted_trend_id := null;
    end if;
    return new;
  end if;

  if current_user = 'authenticated' and (
    new.analysis_changed_at is distinct from old.analysis_changed_at
    or new.superseded_by_signal_id is distinct from old.superseded_by_signal_id
    or new.promoted_trend_id is distinct from old.promoted_trend_id
  ) then
    raise exception 'Signal provenance fields can only be changed by a verified Signal operation.'
      using errcode = '42501';
  end if;

  if new.promoted_trend_id is null and (
    new.status = 'promoted' or new.kind = 'observed_trend'
  ) then
    raise exception 'Use the promotion review before naming an observed trend.'
      using errcode = '22023';
  end if;

  if new.promoted_trend_id is not null and not (
    new.status = 'promoted' and new.kind = 'observed_trend'
  ) then
    raise exception 'A promoted signal must remain linked to its observed trend.'
      using errcode = '22023';
  end if;

  if new.promoted_trend_id is null and (
    new.title is distinct from old.title
    or new.observation is distinct from old.observation
    or new.kind is distinct from old.kind
    or new.scope_note is distinct from old.scope_note
    or new.strategist_notes is distinct from old.strategist_notes
    or new.topic_id is distinct from old.topic_id
  ) then
    new.analysis_changed_at := pg_catalog.now();
  end if;

  return new;
end;
$$;

revoke all on function private.prepare_signal_correction_before_write()
from public, anon, authenticated, service_role;

create trigger prepare_signal_correction_before_write
before insert or update on public.signals
for each row execute function private.prepare_signal_correction_before_write();

create or replace function private.record_signal_revision_after_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed text[];
  revision_kind text := 'correction';
begin
  changed := pg_catalog.array_remove(array[
    case when new.title is distinct from old.title then 'title' end,
    case when new.observation is distinct from old.observation then 'observation' end,
    case when new.kind is distinct from old.kind then 'kind' end,
    case when new.status is distinct from old.status then 'status' end,
    case when new.movement is distinct from old.movement then 'movement' end,
    case when new.scope_note is distinct from old.scope_note then 'scope_note' end,
    case when new.strategist_notes is distinct from old.strategist_notes then 'strategist_notes' end,
    case when new.topic_id is distinct from old.topic_id then 'topic_id' end,
    case when new.superseded_by_signal_id is distinct from old.superseded_by_signal_id then 'superseded_by_signal_id' end,
    case when new.promoted_trend_id is distinct from old.promoted_trend_id then 'promoted_trend_id' end
  ], null);

  if cardinality(changed) = 0 then
    return new;
  end if;

  revision_kind := case
    when new.promoted_trend_id is distinct from old.promoted_trend_id then 'promotion'
    when new.superseded_by_signal_id is distinct from old.superseded_by_signal_id then 'merge'
    when new.topic_id is distinct from old.topic_id and cardinality(changed) = 1 then 'topic'
    when new.status is distinct from old.status and cardinality(changed) = 1 then 'status'
    else 'correction'
  end;

  insert into public.signal_revisions (
    project_id,
    signal_id,
    change_kind,
    changed_fields,
    before_state,
    after_state,
    changed_by
  ) values (
    new.project_id,
    new.id,
    revision_kind,
    changed,
    pg_catalog.to_jsonb(old),
    pg_catalog.to_jsonb(new),
    (select auth.uid())
  );

  return new;
end;
$$;

revoke all on function private.record_signal_revision_after_update()
from public, anon, authenticated, service_role;

create trigger record_signal_revision_after_update
after update on public.signals
for each row execute function private.record_signal_revision_after_update();

create or replace function private.bump_signal_analysis_after_evidence_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_signal_id uuid := coalesce(new.signal_id, old.signal_id);
  target_project_id uuid := coalesce(new.project_id, old.project_id);
begin
  update public.signals signal
  set analysis_changed_at = pg_catalog.now()
  where signal.id = target_signal_id
    and signal.project_id = target_project_id;
  return null;
end;
$$;

revoke all on function private.bump_signal_analysis_after_evidence_write()
from public, anon, authenticated, service_role;

create trigger bump_signal_analysis_after_evidence_write
after insert or update or delete on public.signal_evidence
for each row execute function private.bump_signal_analysis_after_evidence_write();

create or replace function private.prevent_locked_signal_evidence_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_signal_id uuid := coalesce(new.signal_id, old.signal_id);
  target_project_id uuid := coalesce(new.project_id, old.project_id);
begin
  if exists (
    select 1
    from public.signals signal
    where signal.id = target_signal_id
      and signal.project_id = target_project_id
      and (signal.status = 'promoted' or signal.superseded_by_signal_id is not null)
  ) then
    raise exception 'Promoted or superseded signal evidence is locked for provenance.'
      using errcode = '22023';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.prevent_locked_signal_evidence_write()
from public, anon, authenticated, service_role;

create trigger prevent_locked_signal_evidence_write
before insert or update or delete on public.signal_evidence
for each row execute function private.prevent_locked_signal_evidence_write();

create or replace function public.merge_signals(
  p_target_signal_id uuid,
  p_source_signal_ids uuid[]
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  target_signal public.signals%rowtype;
  requested_source_count integer;
  found_source_count integer;
begin
  if caller_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if coalesce((((select auth.jwt()) ->> 'is_anonymous'))::boolean, true) then
    raise exception 'A permanent account is required.' using errcode = '42501';
  end if;

  requested_source_count := cardinality(
    array(select distinct source_id from unnest(coalesce(p_source_signal_ids, '{}'::uuid[])) source_id)
  );
  if requested_source_count < 1 or requested_source_count > 20 then
    raise exception 'Choose between 1 and 20 source signals to merge.' using errcode = '22023';
  end if;
  if p_target_signal_id = any(coalesce(p_source_signal_ids, '{}'::uuid[])) then
    raise exception 'A signal cannot be merged into itself.' using errcode = '22023';
  end if;

  select signal.* into target_signal
  from public.signals signal
  where signal.id = p_target_signal_id;

  if target_signal.id is null
    or not target_signal.project_id = any(((select private.accessible_project_ids()))::uuid[])
  then
    raise exception 'Target signal is unavailable.' using errcode = '42501';
  end if;
  if target_signal.status = 'promoted' or target_signal.superseded_by_signal_id is not null then
    raise exception 'Promoted or superseded signals cannot receive a merge.' using errcode = '22023';
  end if;

  perform signal.id
  from public.signals signal
  where signal.project_id = target_signal.project_id
    and (signal.id = p_target_signal_id or signal.id = any(p_source_signal_ids))
  order by signal.id
  for update;

  select count(distinct signal.id)::integer into found_source_count
  from public.signals signal
  where signal.project_id = target_signal.project_id
    and signal.id = any(p_source_signal_ids)
    and signal.id <> p_target_signal_id
    and signal.status <> 'promoted'
    and signal.superseded_by_signal_id is null;

  if found_source_count <> requested_source_count then
    raise exception 'Every source signal must be available, unpromoted, and in the same project.'
      using errcode = '22023';
  end if;

  insert into public.signal_evidence (
    project_id,
    signal_id,
    evidence_type,
    evidence_id,
    relationship,
    weight,
    rationale,
    added_by
  )
  select
    source.project_id,
    p_target_signal_id,
    source.evidence_type,
    source.evidence_id,
    source.relationship,
    source.weight,
    source.rationale,
    caller_id
  from public.signal_evidence source
  where source.project_id = target_signal.project_id
    and source.signal_id = any(p_source_signal_ids)
  on conflict (signal_id, evidence_type, evidence_id, relationship) do nothing;

  insert into public.signal_lineage (
    project_id,
    source_signal_id,
    target_signal_id,
    relationship,
    created_by
  )
  select
    target_signal.project_id,
    source_id,
    p_target_signal_id,
    'merge',
    caller_id
  from unnest(p_source_signal_ids) source_id
  on conflict (source_signal_id, target_signal_id, relationship) do nothing;

  update public.signals signal
  set status = 'dismissed',
      superseded_by_signal_id = p_target_signal_id
  where signal.project_id = target_signal.project_id
    and signal.id = any(p_source_signal_ids);

  return p_target_signal_id;
end;
$$;

create or replace function public.split_signal(
  p_source_signal_id uuid,
  p_evidence_link_ids uuid[],
  p_title text,
  p_observation text,
  p_kind text,
  p_scope_note text,
  p_strategist_notes text default null,
  p_move_evidence boolean default true
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  source_signal public.signals%rowtype;
  new_signal_id uuid;
  requested_link_count integer;
  found_link_count integer;
begin
  if caller_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if coalesce((((select auth.jwt()) ->> 'is_anonymous'))::boolean, true) then
    raise exception 'A permanent account is required.' using errcode = '42501';
  end if;
  if p_kind not in ('signal', 'hypothesis', 'emerging_pattern') then
    raise exception 'A split must remain a working signal, hypothesis, or emerging pattern.'
      using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 1 and 200
    or char_length(btrim(coalesce(p_observation, ''))) not between 1 and 5000
    or char_length(btrim(coalesce(p_scope_note, ''))) not between 1 and 1000
    or char_length(coalesce(p_strategist_notes, '')) > 10000
  then
    raise exception 'Split signal fields are incomplete or too long.' using errcode = '22023';
  end if;

  requested_link_count := cardinality(
    array(select distinct link_id from unnest(coalesce(p_evidence_link_ids, '{}'::uuid[])) link_id)
  );
  if requested_link_count < 1 or requested_link_count > 100 then
    raise exception 'Choose between 1 and 100 evidence links for the split.' using errcode = '22023';
  end if;

  select signal.* into source_signal
  from public.signals signal
  where signal.id = p_source_signal_id
  for update;

  if source_signal.id is null
    or not source_signal.project_id = any(((select private.accessible_project_ids()))::uuid[])
  then
    raise exception 'Source signal is unavailable.' using errcode = '42501';
  end if;
  if source_signal.status = 'promoted' or source_signal.superseded_by_signal_id is not null then
    raise exception 'Promoted or superseded signals cannot be split.' using errcode = '22023';
  end if;

  perform link.id
  from public.signal_evidence link
  where link.project_id = source_signal.project_id
    and link.signal_id = p_source_signal_id
    and link.id = any(p_evidence_link_ids)
  order by link.id
  for update;

  select count(distinct link.id)::integer into found_link_count
  from public.signal_evidence link
  where link.project_id = source_signal.project_id
    and link.signal_id = p_source_signal_id
    and link.id = any(p_evidence_link_ids);

  if found_link_count <> requested_link_count then
    raise exception 'Every selected evidence link must belong to the source signal.'
      using errcode = '22023';
  end if;

  insert into public.signals (
    project_id,
    created_by,
    topic_id,
    title,
    observation,
    kind,
    status,
    origin,
    scope_note,
    strategist_notes
  ) values (
    source_signal.project_id,
    caller_id,
    source_signal.topic_id,
    btrim(p_title),
    btrim(p_observation),
    p_kind,
    'candidate',
    'strategist',
    btrim(p_scope_note),
    nullif(btrim(coalesce(p_strategist_notes, '')), '')
  )
  returning id into new_signal_id;

  insert into public.signal_evidence (
    project_id,
    signal_id,
    evidence_type,
    evidence_id,
    relationship,
    weight,
    rationale,
    added_by
  )
  select
    link.project_id,
    new_signal_id,
    link.evidence_type,
    link.evidence_id,
    link.relationship,
    link.weight,
    link.rationale,
    caller_id
  from public.signal_evidence link
  where link.project_id = source_signal.project_id
    and link.signal_id = p_source_signal_id
    and link.id = any(p_evidence_link_ids);

  insert into public.signal_lineage (
    project_id,
    source_signal_id,
    target_signal_id,
    relationship,
    metadata,
    created_by
  ) values (
    source_signal.project_id,
    p_source_signal_id,
    new_signal_id,
    'split',
    pg_catalog.jsonb_build_object('moved_evidence', p_move_evidence),
    caller_id
  );

  if p_move_evidence then
    delete from public.signal_evidence link
    where link.project_id = source_signal.project_id
      and link.signal_id = p_source_signal_id
      and link.id = any(p_evidence_link_ids);
  end if;

  return new_signal_id;
end;
$$;

create or replace function public.promote_signal_to_trend(
  p_signal_id uuid
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  candidate public.signals%rowtype;
  assessment public.signal_snapshots%rowtype;
  created_trend_id uuid;
  actual_supporting_count integer := 0;
  actual_contradicting_count integer := 0;
  actual_source_diversity integer := 0;
  actual_author_diversity integer := 0;
  supporting_mentions integer := 0;
  observed_platforms public.source_kind[] := '{}'::public.source_kind[];
begin
  if caller_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if coalesce((((select auth.jwt()) ->> 'is_anonymous'))::boolean, true) then
    raise exception 'A permanent account is required.' using errcode = '42501';
  end if;

  select signal.* into candidate
  from public.signals signal
  where signal.id = p_signal_id
  for update;

  if candidate.id is null
    or not candidate.project_id = any(((select private.accessible_project_ids()))::uuid[])
  then
    raise exception 'Signal is unavailable.' using errcode = '42501';
  end if;
  if candidate.promoted_trend_id is not null then
    return candidate.promoted_trend_id;
  end if;
  if candidate.status <> 'watching' then
    raise exception 'Move the signal to Watching before promotion.' using errcode = '22023';
  end if;
  if candidate.kind = 'hypothesis' then
    raise exception 'A hypothesis must be corrected into an observed signal before promotion.'
      using errcode = '22023';
  end if;
  if candidate.superseded_by_signal_id is not null then
    raise exception 'A superseded signal cannot be promoted.' using errcode = '22023';
  end if;

  select snapshot.* into assessment
  from public.signal_snapshots snapshot
  where snapshot.signal_id = p_signal_id
    and snapshot.project_id = candidate.project_id
  order by snapshot.created_at desc, snapshot.id desc
  limit 1;

  if assessment.id is null then
    raise exception 'Create a directional assessment before promotion.' using errcode = '22023';
  end if;
  if assessment.created_at < candidate.analysis_changed_at then
    raise exception 'Reassess this signal after its latest evidence or claim change.'
      using errcode = '22023';
  end if;

  with evidence_detail as (
    select
      link.relationship,
      case
        when mention.id is not null then mention.platform::text
        when research.id is not null then coalesce(
          nullif(pg_catalog.btrim(research.publication), ''),
          'Personal research'
        )
        when inspiration.id is not null then coalesce(
          nullif(pg_catalog.btrim(inspiration.brand_name), ''),
          nullif(pg_catalog.btrim(inspiration.item_type), ''),
          'Inspiration'
        )
      end as source_label,
      case
        when mention.id is not null then nullif(pg_catalog.btrim(mention.author), '')
        when research.id is not null then nullif(pg_catalog.btrim(research.author), '')
        when inspiration.id is not null then nullif(pg_catalog.btrim(inspiration.brand_name), '')
      end as source_author
    from public.signal_evidence link
    left join public.mentions mention
      on link.evidence_type = 'mention'::public.item_kind
     and mention.id = link.evidence_id
     and mention.project_id = link.project_id
    left join public.research_items research
      on link.evidence_type = 'research'::public.item_kind
     and research.id = link.evidence_id
     and research.project_id = link.project_id
    left join public.inspiration_items inspiration
      on link.evidence_type = 'inspiration'::public.item_kind
     and inspiration.id = link.evidence_id
     and inspiration.project_id = link.project_id
    where link.signal_id = p_signal_id
      and link.project_id = candidate.project_id
  )
  select
    count(*) filter (where relationship = 'support')::integer,
    count(*) filter (where relationship = 'contradict')::integer,
    count(distinct source_label) filter (
      where relationship = 'support' and source_label is not null
    )::integer,
    count(distinct source_author) filter (
      where relationship = 'support' and source_author is not null
    )::integer
  into
    actual_supporting_count,
    actual_contradicting_count,
    actual_source_diversity,
    actual_author_diversity
  from evidence_detail;

  if assessment.supporting_count <> actual_supporting_count
    or assessment.contradicting_count <> actual_contradicting_count
    or assessment.source_diversity <> actual_source_diversity
    or assessment.author_diversity <> actual_author_diversity
  then
    raise exception 'The latest assessment no longer matches the linked evidence. Reassess before promotion.'
      using errcode = '22023';
  end if;
  if assessment.evidence_sufficiency <> 'sufficient'
    or actual_supporting_count < 6
    or actual_source_diversity < 3
    or actual_author_diversity < 4
  then
    raise exception 'Promotion requires sufficient evidence, six supporting sources, three source origins, and four authors.'
      using errcode = '22023';
  end if;
  if assessment.movement = 'contradictory'
    or actual_contradicting_count > actual_supporting_count / 2
  then
    raise exception 'Contradictory evidence is too substantial for promotion.' using errcode = '22023';
  end if;

  select
    count(*)::integer,
    coalesce(array_agg(distinct mention.platform), '{}'::public.source_kind[])
  into supporting_mentions, observed_platforms
  from public.signal_evidence link
  join public.mentions mention
    on mention.id = link.evidence_id
   and mention.project_id = link.project_id
  where link.signal_id = p_signal_id
    and link.project_id = candidate.project_id
    and link.evidence_type = 'mention'::public.item_kind
    and link.relationship = 'support';

  insert into public.trends (
    project_id,
    topic_id,
    name,
    description,
    lifecycle,
    first_detected_at,
    mention_volume,
    growth_rate,
    trend_score,
    score_factors,
    platforms,
    intelligence
  ) values (
    candidate.project_id,
    candidate.topic_id,
    candidate.title,
    candidate.observation,
    'emerging'::public.lifecycle_stage,
    assessment.created_at,
    supporting_mentions,
    assessment.growth_rate,
    assessment.strength_score,
    assessment.factor_breakdown || pg_catalog.jsonb_build_object(
      'analysis_version', assessment.analysis_version,
      'signal_snapshot_id', assessment.id
    ),
    observed_platforms,
    pg_catalog.jsonb_build_object(
      'promotion_source', 'strategist_review',
      'signal_id', candidate.id,
      'signal_snapshot_id', assessment.id,
      'evidence_sufficiency', assessment.evidence_sufficiency,
      'scope_note', candidate.scope_note,
      'supporting_count', assessment.supporting_count,
      'contradicting_count', assessment.contradicting_count,
      'limitations', assessment.limitations,
      'research_gaps', assessment.research_gaps
    )
  ) returning id into created_trend_id;

  insert into public.trend_mentions (trend_id, mention_id, weight)
  select created_trend_id, link.evidence_id, link.weight
  from public.signal_evidence link
  where link.signal_id = p_signal_id
    and link.project_id = candidate.project_id
    and link.evidence_type = 'mention'::public.item_kind
    and link.relationship = 'support'
  on conflict (trend_id, mention_id) do nothing;

  update public.signals signal
  set kind = 'observed_trend',
      status = 'promoted',
      movement = assessment.movement,
      promoted_trend_id = created_trend_id
  where signal.id = p_signal_id
    and signal.project_id = candidate.project_id;

  return created_trend_id;
end;
$$;

revoke all on function public.merge_signals(uuid, uuid[])
from public, anon, authenticated, service_role;
revoke all on function public.split_signal(uuid, uuid[], text, text, text, text, text, boolean)
from public, anon, authenticated, service_role;
revoke all on function public.promote_signal_to_trend(uuid)
from public, anon, authenticated, service_role;

grant execute on function public.merge_signals(uuid, uuid[])
to authenticated, service_role;
grant execute on function public.split_signal(uuid, uuid[], text, text, text, text, text, boolean)
to authenticated, service_role;
grant execute on function public.promote_signal_to_trend(uuid)
to authenticated, service_role;

comment on column public.signals.analysis_changed_at is
  'Latest claim, topic, note, or evidence change; promotion requires a newer assessment.';
comment on column public.signals.superseded_by_signal_id is
  'Set only by the verified merge operation; the source signal remains for provenance.';
comment on column public.signals.promoted_trend_id is
  'Observed Trend created by the explicit evidence-sufficiency promotion review.';
comment on table public.signal_revisions is
  'Immutable before/after history for strategist corrections and controlled state changes.';
comment on table public.signal_lineage is
  'Immutable project-scoped provenance for merged and split signals.';
comment on function public.merge_signals(uuid, uuid[]) is
  'Atomically copies evidence into a target signal, dismisses the sources, and records merge lineage.';
comment on function public.split_signal(uuid, uuid[], text, text, text, text, text, boolean) is
  'Atomically derives a child signal from selected evidence and records split lineage.';
comment on function public.promote_signal_to_trend(uuid) is
  'Promotes only an assessment-current, sufficiently diverse watched signal into an observed Trend.';
