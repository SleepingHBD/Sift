-- Phase 3 acceptance remediation: deletion integrity and RLS query performance.
--
-- Cache the caller's accessible project identifiers once per statement so
-- large Evidence queries do not repeat the same membership lookup for every
-- source row. The helper remains in the unexposed private schema, derives its
-- result from the verified JWT identity, and returns only projects available
-- to that caller.

create or replace function private.accessible_project_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  with caller as (
    select
      (select auth.uid()) as user_id,
      coalesce((((select auth.jwt()) ->> 'is_anonymous'))::boolean, true) as is_anonymous
  ), accessible as (
    select project.id as project_id
    from public.projects project
    cross join caller
    where caller.user_id is not null
      and not caller.is_anonymous
      and project.owner_id = caller.user_id

    union

    select membership.project_id
    from public.project_members membership
    cross join caller
    where caller.user_id is not null
      and not caller.is_anonymous
      and membership.user_id = caller.user_id
  )
  select coalesce(
    array_agg(accessible.project_id order by accessible.project_id),
    '{}'::uuid[]
  )
  from accessible;
$$;

revoke all on function private.accessible_project_ids()
  from public, anon, authenticated, service_role;
grant execute on function private.accessible_project_ids()
  to authenticated, service_role;

comment on function private.accessible_project_ids() is
  'Returns the permanent caller project IDs for statement-cached RLS checks in the private schema.';

-- Supabase recommends comparing row columns to a fixed, indexed set instead
-- of invoking a row-dependent membership function for every scanned row.
alter policy "members read projects"
  on public.projects
  using (
    owner_id = (select auth.uid())
    or id = any(((select private.accessible_project_ids()))::uuid[])
  );

alter policy "project members manage mentions"
  on public.mentions
  using (
    project_id = any(((select private.accessible_project_ids()))::uuid[])
  )
  with check (
    project_id = any(((select private.accessible_project_ids()))::uuid[])
  );

alter policy "project members manage research_items"
  on public.research_items
  using (
    project_id = any(((select private.accessible_project_ids()))::uuid[])
  )
  with check (
    project_id = any(((select private.accessible_project_ids()))::uuid[])
  );

alter policy "project members manage inspiration_items"
  on public.inspiration_items
  using (
    project_id = any(((select private.accessible_project_ids()))::uuid[])
  )
  with check (
    project_id = any(((select private.accessible_project_ids()))::uuid[])
  );

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

  -- Manual strategist topics are organizational metadata, not protected
  -- citations. Remove them while the source still exists so the restrictive
  -- source-matching RLS policy can authorize the cleanup.
  delete from public.evidence_topic_assignments
  where project_id = p_project_id
    and item_type = p_kind
    and item_id = p_item_id;

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

revoke all on function public.delete_evidence_item(public.item_kind, uuid, uuid)
  from public, anon;
grant execute on function public.delete_evidence_item(public.item_kind, uuid, uuid)
  to authenticated;

comment on function public.delete_evidence_item(public.item_kind, uuid, uuid) is
  'Deletes uncited Research or Inspiration evidence and its organizational links atomically under RLS.';
