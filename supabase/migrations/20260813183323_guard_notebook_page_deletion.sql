-- Notebook pages are stored as strategy sessions. Keep permanent deletion explicit,
-- creator-owned, project-scoped, and RLS-enforced. Child notebook records
-- cascade with the page; original Library and Radar evidence rows do not.

drop policy if exists "permanent accounts delete accessible strategy sessions"
on public.strategy_sessions;
drop policy if exists "permanent accounts delete their own strategy sessions"
on public.strategy_sessions;

create policy "permanent accounts delete their own strategy sessions"
on public.strategy_sessions
for delete
to authenticated
using (
  created_by = (select auth.uid())
  and project_id = any(((select private.accessible_project_ids()))::uuid[])
);

create or replace function public.delete_notebook_page(
  p_session_id uuid,
  p_project_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  deleted_id uuid;
begin
  if caller_id is null
    or coalesce((((select auth.jwt()) ->> 'is_anonymous'))::boolean, true) then
    raise exception 'A permanent authenticated account is required.'
      using errcode = '42501';
  end if;

  if not (p_project_id = any(((select private.accessible_project_ids()))::uuid[])) then
    raise exception 'The selected notebook is not available to this account.'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.strategy_sessions session
    where session.id = p_session_id
      and session.project_id = p_project_id
      and session.created_by = caller_id
  ) then
    raise exception 'Only the person who created this notebook page can delete it.'
      using errcode = '42501';
  end if;

  delete from public.strategy_sessions session
  where session.id = p_session_id
    and session.project_id = p_project_id
    and session.created_by = caller_id
  returning session.id into deleted_id;

  if deleted_id is null then
    raise exception 'The notebook page could not be deleted.'
      using errcode = 'P0002';
  end if;

  return deleted_id;
end;
$$;

revoke all on function public.delete_notebook_page(uuid, uuid)
from public, anon, authenticated, service_role;
grant execute on function public.delete_notebook_page(uuid, uuid)
to authenticated, service_role;

comment on function public.delete_notebook_page(uuid, uuid) is
  'Permanently deletes a notebook page owned by the permanent authenticated caller. Page-owned turns, links, working pieces, and stages cascade; original evidence remains.';
