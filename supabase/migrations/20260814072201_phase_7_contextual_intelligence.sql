-- Phase 7 contextual intelligence.
-- Expose notebook citations through the shared Library relationship inspector
-- without weakening the existing source, project, or permanent-account checks.

create or replace function public.list_evidence_notebook_relationships(
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
  if not (p_project_id = any(((select private.accessible_project_ids()))::uuid[])) then
    raise exception 'The selected project is unavailable to this account.' using errcode = '42501';
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
    'notebook'::text,
    source.id,
    turn.id,
    turn.project_id,
    session.title::text,
    true,
    pg_catalog.jsonb_build_object(
      'session_id', session.id,
      'turn_id', turn.id,
      'relationship', source.relationship,
      'excerpt', source.excerpt,
      'entry_preview', pg_catalog.left(turn.content, 240),
      'entry_created_at', turn.created_at
    )
  from public.strategy_session_turn_sources source
  join public.strategy_session_turns turn
    on turn.id = source.turn_id
    and turn.project_id = source.project_id
    and turn.session_id = source.session_id
  join public.strategy_sessions session
    on session.id = source.session_id
    and session.project_id = source.project_id
  where source.project_id = p_project_id
    and source.evidence_type = p_kind
    and source.evidence_id = p_item_id;
end;
$$;

revoke all on function public.list_evidence_notebook_relationships(public.item_kind, uuid, uuid)
from public, anon, authenticated, service_role;
grant execute on function public.list_evidence_notebook_relationships(public.item_kind, uuid, uuid)
to authenticated;

comment on function public.list_evidence_notebook_relationships(public.item_kind, uuid, uuid) is
  'Lists RLS-visible notebook entries that cite one original evidence record for the permanent authenticated caller.';
