-- Phase 3: inspect the evidence graph before deletion and keep strategic
-- citations protected. Both functions execute as the caller so existing RLS
-- remains the authorization boundary.

create index if not exists insight_sources_source_lookup_idx
  on public.insight_sources (source_type, source_id, insight_id);

create index if not exists brief_sources_source_lookup_idx
  on public.brief_sources (source_type, source_id, brief_id);

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
  select relationship.*
  from (
    select
      'tag'::text as relationship_type,
      item_tag.id as relationship_id,
      tag.id as target_id,
      item_tag.project_id as target_project_id,
      tag.name::text as label,
      false as blocking,
      '{}'::jsonb as metadata
    from public.item_tags item_tag
    join public.tags tag on tag.id = item_tag.tag_id
    where item_tag.project_id = p_project_id
      and item_tag.item_type = p_kind
      and item_tag.item_id = p_item_id

    union all

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
      jsonb_build_object(
        'destination', saved.destination,
        'note', saved.note,
        'source_excerpt', saved.source_excerpt
      )
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
      and saved.user_id = (select auth.uid())

    union all

    select
      'insight'::text,
      source.id,
      insight.id,
      insight.project_id,
      insight.title::text,
      true,
      jsonb_build_object(
        'claim_type', source.claim_type,
        'excerpt', source.excerpt
      )
    from public.insight_sources source
    join public.insights insight on insight.id = source.insight_id
    where source.source_type = p_kind
      and source.source_id = p_item_id

    union all

    select
      'brief'::text,
      source.id,
      brief.id,
      brief.project_id,
      brief.title::text,
      true,
      jsonb_build_object('excerpt', source.excerpt)
    from public.brief_sources source
    join public.briefs brief on brief.id = source.brief_id
    where source.source_type = p_kind
      and source.source_id = p_item_id

    union all

    select
      'asset'::text,
      asset.id,
      asset.id,
      asset.project_id,
      asset.original_filename::text,
      false,
      jsonb_build_object(
        'asset_kind', asset.asset_kind,
        'mime_type', asset.mime_type,
        'byte_size', asset.byte_size
      )
    from public.evidence_assets asset
    where p_kind = 'research'::public.item_kind
      and asset.project_id = p_project_id
      and asset.research_item_id = p_item_id

    union all

    select
      'note'::text,
      note.id,
      note.id,
      note.project_id,
      'Conversation note'::text,
      false,
      jsonb_build_object('preview', left(note.content, 180))
    from public.mention_notes note
    where p_kind = 'mention'::public.item_kind
      and note.project_id = p_project_id
      and note.mention_id = p_item_id
      and note.user_id = (select auth.uid())

    union all

    select
      'trend'::text,
      link.id,
      trend.id,
      trend.project_id,
      trend.name::text,
      false,
      jsonb_build_object('relationship', 'trend evidence')
    from public.trend_mentions link
    join public.trends trend on trend.id = link.trend_id
    where p_kind = 'mention'::public.item_kind
      and link.mention_id = p_item_id
  ) relationship
  order by relationship.blocking desc, relationship.relationship_type, relationship.label, relationship.relationship_id;
end;
$$;

create or replace function public.delete_evidence_item(
  p_kind public.item_kind,
  p_item_id uuid,
  p_project_id uuid
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  deleted_id uuid;
  blocking_count integer := 0;
  source_visible boolean := false;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if coalesce((((select auth.jwt()) ->> 'is_anonymous'))::boolean, true) then
    raise exception 'A permanent account is required.' using errcode = '42501';
  end if;

  if p_kind not in ('research'::public.item_kind, 'inspiration'::public.item_kind) then
    raise exception 'Only Research and Inspiration evidence can be deleted individually.' using errcode = '22023';
  end if;

  source_visible := case
    when p_kind = 'research'::public.item_kind then exists (
      select 1 from public.research_items source
      where source.id = p_item_id and source.project_id = p_project_id
      for update
    )
    when p_kind = 'inspiration'::public.item_kind then exists (
      select 1 from public.inspiration_items source
      where source.id = p_item_id and source.project_id = p_project_id
      for update
    )
    else false
  end;

  if not source_visible then
    raise exception 'Evidence is unavailable to this account.' using errcode = '42501';
  end if;

  select count(*)::integer
  into blocking_count
  from public.list_evidence_relationships(p_kind, p_item_id, p_project_id)
  where blocking;

  if blocking_count > 0 then
    raise exception 'Evidence is still cited by % protected relationship(s). Remove those citations before deleting it.', blocking_count
      using errcode = '23503';
  end if;

  delete from public.item_tags
  where project_id = p_project_id
    and item_type = p_kind
    and item_id = p_item_id;

  delete from public.saved_items
  where project_id = p_project_id
    and item_type = p_kind
    and item_id = p_item_id
    and user_id = (select auth.uid());

  if p_kind = 'research'::public.item_kind then
    delete from public.research_items
    where id = p_item_id and project_id = p_project_id
    returning id into deleted_id;
  else
    delete from public.inspiration_items
    where id = p_item_id and project_id = p_project_id
    returning id into deleted_id;
  end if;

  if deleted_id is null then
    raise exception 'Evidence deletion was not permitted for this account.' using errcode = '42501';
  end if;

  return deleted_id;
end;
$$;

revoke all on function public.list_evidence_relationships(public.item_kind, uuid, uuid)
from public, anon;
revoke all on function public.delete_evidence_item(public.item_kind, uuid, uuid)
from public, anon;

grant execute on function public.list_evidence_relationships(public.item_kind, uuid, uuid)
to authenticated;
grant execute on function public.delete_evidence_item(public.item_kind, uuid, uuid)
to authenticated;

comment on function public.list_evidence_relationships(public.item_kind, uuid, uuid) is
  'Returns RLS-visible organization and strategic relationships for one evidence source.';
comment on function public.delete_evidence_item(public.item_kind, uuid, uuid) is
  'Deletes Research or Inspiration evidence only when no RLS-visible strategic citation remains; organization links are removed atomically.';
