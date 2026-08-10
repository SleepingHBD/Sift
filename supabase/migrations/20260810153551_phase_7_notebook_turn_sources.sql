-- Phase 7 universal capture: let one conversational notebook turn preserve
-- the original evidence that was attached while the strategist was writing.

create table public.strategy_session_turn_sources (
  id uuid primary key default extensions.gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  session_id uuid not null,
  turn_id uuid not null,
  evidence_type public.item_kind not null check (
    evidence_type in (
      'mention'::public.item_kind,
      'research'::public.item_kind,
      'inspiration'::public.item_kind
    )
  ),
  evidence_id uuid not null,
  relationship text not null default 'context'
    check (relationship = 'context'),
  excerpt text check (excerpt is null or char_length(excerpt) <= 5000),
  rationale text check (rationale is null or char_length(rationale) <= 2000),
  added_by uuid not null default auth.uid()
    references auth.users(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  foreign key (turn_id, project_id, session_id)
    references public.strategy_session_turns(id, project_id, session_id)
    on delete cascade,
  unique (turn_id, evidence_type, evidence_id)
);

create index strategy_session_turn_sources_turn_timeline_idx
  on public.strategy_session_turn_sources (turn_id, project_id, created_at, id);
create index strategy_session_turn_sources_evidence_lookup_idx
  on public.strategy_session_turn_sources (evidence_type, evidence_id, project_id, turn_id);
create index strategy_session_turn_sources_added_by_idx
  on public.strategy_session_turn_sources (added_by);

alter table public.strategy_session_turn_sources enable row level security;

revoke all on table public.strategy_session_turn_sources
from public, anon, authenticated, service_role;

grant select, insert on table public.strategy_session_turn_sources
to authenticated;
grant select, insert, update, delete on table public.strategy_session_turn_sources
to service_role;

create policy "permanent authenticated users only"
on public.strategy_session_turn_sources
as restrictive
for all
to authenticated
using (
  coalesce((((select auth.jwt()) ->> 'is_anonymous'))::boolean, true) is false
)
with check (
  coalesce((((select auth.jwt()) ->> 'is_anonymous'))::boolean, true) is false
);

create policy "permanent accounts read accessible notebook sources"
on public.strategy_session_turn_sources
for select
to authenticated
using (
  project_id = any(((select private.accessible_project_ids()))::uuid[])
);

create policy "permanent accounts attach their own notebook sources"
on public.strategy_session_turn_sources
for insert
to authenticated
with check (
  added_by = (select auth.uid())
  and project_id = any(((select private.accessible_project_ids()))::uuid[])
  and private.strategy_original_evidence_exists(project_id, evidence_type, evidence_id)
);

create or replace function private.prepare_strategy_session_turn_source_before_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (
    new.project_id <> old.project_id
    or new.session_id <> old.session_id
    or new.turn_id <> old.turn_id
    or new.evidence_type <> old.evidence_type
    or new.evidence_id <> old.evidence_id
    or new.added_by <> old.added_by
    or new.created_at <> old.created_at
  ) then
    raise exception 'Notebook source identity cannot be changed.' using errcode = '22023';
  end if;

  if new.evidence_type = 'mention'::public.item_kind then
    perform pg_catalog.pg_advisory_xact_lock_shared(
      pg_catalog.hashtextextended(new.evidence_id::text, 40904)
    );
  end if;

  if not private.strategy_original_evidence_exists(
    new.project_id,
    new.evidence_type,
    new.evidence_id
  ) then
    raise exception 'A notebook citation must reference available evidence in the same project.'
      using errcode = '23503';
  end if;
  return new;
end;
$$;

revoke all on function private.prepare_strategy_session_turn_source_before_write()
from public, anon, authenticated, service_role;

create trigger prepare_strategy_session_turn_source_before_write
before insert or update on public.strategy_session_turn_sources
for each row execute function private.prepare_strategy_session_turn_source_before_write();

create or replace function public.add_strategy_conversation_turn(
  p_session_id uuid,
  p_project_id uuid,
  p_content text,
  p_sources jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  clean_content text := btrim(coalesce(p_content, ''));
  source_item jsonb;
  source_count integer;
  new_turn_id uuid;
  source_kind public.item_kind;
  source_id uuid;
  source_excerpt text;
begin
  if caller_id is null
    or coalesce((((select auth.jwt()) ->> 'is_anonymous'))::boolean, true) then
    raise exception 'A permanent authenticated account is required.'
      using errcode = '42501';
  end if;

  if not (p_project_id = any(((select private.accessible_project_ids()))::uuid[])) then
    raise exception 'The selected project is not available to this account.'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.strategy_sessions session
    where session.id = p_session_id
      and session.project_id = p_project_id
  ) then
    raise exception 'The selected notebook page is not available in this project.'
      using errcode = '23503';
  end if;

  if jsonb_typeof(coalesce(p_sources, '[]'::jsonb)) is distinct from 'array' then
    raise exception 'Notebook sources must be supplied as a JSON array.'
      using errcode = '22023';
  end if;

  source_count := jsonb_array_length(coalesce(p_sources, '[]'::jsonb));
  if source_count > 12 then
    raise exception 'Attach no more than 12 sources to one notebook entry.'
      using errcode = '22023';
  end if;

  if char_length(clean_content) > 10000 then
    raise exception 'A notebook entry can contain no more than 10000 characters.'
      using errcode = '22023';
  end if;

  if clean_content = '' and source_count = 0 then
    raise exception 'Write a thought or attach a source before saving.'
      using errcode = '22023';
  end if;

  insert into public.strategy_session_turns (
    project_id,
    session_id,
    role,
    origin,
    content,
    metadata,
    created_by
  ) values (
    p_project_id,
    p_session_id,
    'user',
    'strategist',
    case when clean_content = '' then 'Added source to this page.' else clean_content end,
    case when clean_content = '' then '{"capture_only":true}'::jsonb else '{}'::jsonb end,
    caller_id
  )
  returning id into new_turn_id;

  for source_item in
    select value from jsonb_array_elements(coalesce(p_sources, '[]'::jsonb))
  loop
    if jsonb_typeof(source_item) is distinct from 'object'
      or source_item ->> 'kind' not in ('mention', 'research', 'inspiration')
      or nullif(source_item ->> 'id', '') is null then
      raise exception 'One of the notebook source references is incomplete.'
        using errcode = '22023';
    end if;

    source_kind := (source_item ->> 'kind')::public.item_kind;
    source_id := (source_item ->> 'id')::uuid;
    source_excerpt := nullif(btrim(coalesce(source_item ->> 'excerpt', '')), '');

    if source_excerpt is not null and char_length(source_excerpt) > 5000 then
      raise exception 'A notebook source excerpt can contain no more than 5000 characters.'
        using errcode = '22023';
    end if;

    insert into public.strategy_session_turn_sources (
      project_id,
      session_id,
      turn_id,
      evidence_type,
      evidence_id,
      relationship,
      excerpt,
      added_by
    ) values (
      p_project_id,
      p_session_id,
      new_turn_id,
      source_kind,
      source_id,
      'context',
      source_excerpt,
      caller_id
    )
    on conflict (turn_id, evidence_type, evidence_id) do nothing;
  end loop;

  return new_turn_id;
end;
$$;

revoke all on function public.add_strategy_conversation_turn(uuid, uuid, text, jsonb)
from public, anon, authenticated, service_role;
grant execute on function public.add_strategy_conversation_turn(uuid, uuid, text, jsonb)
to authenticated, service_role;

create or replace function private.prevent_strategy_source_delete()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  source_kind public.item_kind;
begin
  source_kind := case tg_table_name
    when 'mentions' then 'mention'::public.item_kind
    when 'research_items' then 'research'::public.item_kind
    when 'inspiration_items' then 'inspiration'::public.item_kind
    else null
  end;

  if source_kind is not null
    and exists (select 1 from public.projects project where project.id = old.project_id)
    and (
      exists (
        select 1 from public.strategy_stage_sources source
        where source.project_id = old.project_id
          and source.evidence_type = source_kind
          and source.evidence_id = old.id
      )
      or exists (
        select 1 from public.strategy_session_piece_sources source
        where source.project_id = old.project_id
          and source.evidence_type = source_kind
          and source.evidence_id = old.id
      )
      or exists (
        select 1 from public.strategy_session_turn_sources source
        where source.project_id = old.project_id
          and source.evidence_type = source_kind
          and source.evidence_id = old.id
      )
    ) then
    raise exception 'Evidence is cited by strategy work. Remove its citation before deleting it.'
      using errcode = '23503';
  end if;
  return old;
end;
$$;

revoke all on function private.prevent_strategy_source_delete()
from public, anon, authenticated, service_role;

comment on table public.strategy_session_turn_sources is
  'Project-scoped original evidence attached to one append-only conversational notebook turn.';
comment on function public.add_strategy_conversation_turn(uuid, uuid, text, jsonb) is
  'Atomically saves a strategist notebook turn and up to twelve project-scoped evidence citations.';
