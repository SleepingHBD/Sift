-- Keep privileged, atomic Signal operations outside the exposed Data API schema.
-- Public RPC names remain stable, but their wrappers run as the authenticated
-- caller and can reach only the specifically granted private implementation.

alter function public.merge_signals(uuid, uuid[]) set schema private;
alter function private.merge_signals(uuid, uuid[]) rename to merge_signals_internal;

alter function public.split_signal(uuid, uuid[], text, text, text, text, text, boolean)
  set schema private;
alter function private.split_signal(uuid, uuid[], text, text, text, text, text, boolean)
  rename to split_signal_internal;

alter function public.promote_signal_to_trend(uuid) set schema private;
alter function private.promote_signal_to_trend(uuid) rename to promote_signal_to_trend_internal;

revoke all on function private.merge_signals_internal(uuid, uuid[])
from public, anon;
revoke all on function private.split_signal_internal(uuid, uuid[], text, text, text, text, text, boolean)
from public, anon;
revoke all on function private.promote_signal_to_trend_internal(uuid)
from public, anon;

grant execute on function private.merge_signals_internal(uuid, uuid[])
to authenticated, service_role;
grant execute on function private.split_signal_internal(uuid, uuid[], text, text, text, text, text, boolean)
to authenticated, service_role;
grant execute on function private.promote_signal_to_trend_internal(uuid)
to authenticated, service_role;

create or replace function public.merge_signals(
  p_target_signal_id uuid,
  p_source_signal_ids uuid[]
)
returns uuid
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.merge_signals_internal(p_target_signal_id, p_source_signal_ids);
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
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.split_signal_internal(
    p_source_signal_id,
    p_evidence_link_ids,
    p_title,
    p_observation,
    p_kind,
    p_scope_note,
    p_strategist_notes,
    p_move_evidence
  );
$$;

create or replace function public.promote_signal_to_trend(
  p_signal_id uuid
)
returns uuid
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.promote_signal_to_trend_internal(p_signal_id);
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

comment on function public.merge_signals(uuid, uuid[]) is
  'RLS-caller wrapper for the private, authorization-checked atomic merge operation.';
comment on function public.split_signal(uuid, uuid[], text, text, text, text, text, boolean) is
  'RLS-caller wrapper for the private, authorization-checked atomic split operation.';
comment on function public.promote_signal_to_trend(uuid) is
  'RLS-caller wrapper for the private, authorization-checked promotion operation.';
