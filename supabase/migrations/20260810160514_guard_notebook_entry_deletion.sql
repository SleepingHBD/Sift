-- Allow a permanent account to delete only its own handwritten notebook entry.
-- Imported assistant turns and turns already used by downstream working pieces
-- remain protected from browser deletion.

grant delete on table public.strategy_session_turns
to authenticated;

create policy "permanent accounts delete their own unused strategy turns"
on public.strategy_session_turns
for delete
to authenticated
using (
  created_by = (select auth.uid())
  and role = 'user'
  and origin = 'strategist'
  and ai_message_id is null
  and project_id = any(((select private.accessible_project_ids()))::uuid[])
  and not exists (
    select 1
    from public.strategy_session_pieces piece
    where piece.project_id = strategy_session_turns.project_id
      and piece.session_id = strategy_session_turns.session_id
      and piece.source_turn_id = strategy_session_turns.id
  )
);

create or replace function public.delete_strategy_conversation_turn(
  p_turn_id uuid,
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
  target_turn public.strategy_session_turns%rowtype;
  deleted_turn_id uuid;
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

  select turn.* into target_turn
  from public.strategy_session_turns turn
  where turn.id = p_turn_id
    and turn.session_id = p_session_id
    and turn.project_id = p_project_id;

  if not found then
    raise exception 'The selected notebook entry is not available.'
      using errcode = 'P0002';
  end if;

  if target_turn.created_by <> caller_id
    or target_turn.role <> 'user'
    or target_turn.origin <> 'strategist'
    or target_turn.ai_message_id is not null then
    raise exception 'Only your own handwritten notebook entries can be deleted.'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.strategy_session_pieces piece
    where piece.project_id = p_project_id
      and piece.session_id = p_session_id
      and piece.source_turn_id = p_turn_id
  ) then
    raise exception 'This entry is already used by a working piece and cannot be deleted.'
      using errcode = '23503';
  end if;

  delete from public.strategy_session_turns turn
  where turn.id = p_turn_id
    and turn.session_id = p_session_id
    and turn.project_id = p_project_id
    and turn.created_by = caller_id
    and turn.role = 'user'
    and turn.origin = 'strategist'
    and turn.ai_message_id is null
  returning turn.id into deleted_turn_id;

  if deleted_turn_id is null then
    raise exception 'The notebook entry could not be deleted.'
      using errcode = '42501';
  end if;

  update public.strategy_sessions session
  set updated_at = pg_catalog.now()
  where session.id = p_session_id
    and session.project_id = p_project_id;

  return deleted_turn_id;
end;
$$;

revoke all on function public.delete_strategy_conversation_turn(uuid, uuid, uuid)
from public, anon, authenticated, service_role;
grant execute on function public.delete_strategy_conversation_turn(uuid, uuid, uuid)
to authenticated, service_role;

comment on function public.delete_strategy_conversation_turn(uuid, uuid, uuid) is
  'Permanently deletes one unused strategist-authored notebook turn owned by the permanent authenticated caller; attached turn-source links cascade while original evidence remains.';
