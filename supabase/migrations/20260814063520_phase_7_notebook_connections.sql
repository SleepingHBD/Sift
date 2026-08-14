-- Phase 7 notebook-first connections.
--
-- Connections deliberately sit between notebook turns rather than formal
-- strategy stages. They preserve the gradual thinking trail while allowing a
-- strategist to mark relationships and retain transparent deterministic
-- suggestions. Emerging threads are derived from accepted connections in the
-- client, so the user does not need to maintain a second hierarchy.

create table public.strategy_session_connections (
  id uuid primary key default extensions.gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  session_id uuid not null,
  source_turn_id uuid not null,
  target_turn_id uuid not null,
  relationship text not null default 'related'
    check (relationship in ('related', 'reinforces', 'contradicts', 'opens_question')),
  origin text not null default 'strategist'
    check (origin in ('strategist', 'deterministic')),
  status text not null default 'accepted'
    check (status in ('accepted', 'dismissed')),
  rationale text
    check (rationale is null or char_length(rationale) <= 1000),
  factors text[] not null default '{}'
    check (cardinality(factors) <= 12),
  created_by uuid not null default auth.uid()
    references auth.users(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  foreign key (session_id, project_id)
    references public.strategy_sessions(id, project_id)
    on delete cascade,
  foreign key (source_turn_id, project_id, session_id)
    references public.strategy_session_turns(id, project_id, session_id)
    on delete cascade,
  foreign key (target_turn_id, project_id, session_id)
    references public.strategy_session_turns(id, project_id, session_id)
    on delete cascade,
  check (source_turn_id <> target_turn_id),
  check (source_turn_id::text < target_turn_id::text),
  check (
    (origin = 'strategist' and status = 'accepted')
    or origin = 'deterministic'
  ),
  unique (session_id, source_turn_id, target_turn_id, origin, created_by)
);

create index strategy_session_connections_session_project_idx
  on public.strategy_session_connections (session_id, project_id, status, created_at, id);
create index strategy_session_connections_project_session_idx
  on public.strategy_session_connections (project_id, session_id, status, created_at, id);
create index strategy_session_connections_source_turn_idx
  on public.strategy_session_connections (source_turn_id, project_id, session_id);
create index strategy_session_connections_target_turn_idx
  on public.strategy_session_connections (target_turn_id, project_id, session_id);
create index strategy_session_connections_created_by_idx
  on public.strategy_session_connections (created_by);

alter table public.strategy_session_connections enable row level security;

revoke all on table public.strategy_session_connections
from public, anon, authenticated, service_role;

grant select, insert, update, delete on table public.strategy_session_connections
to authenticated, service_role;

create policy "permanent authenticated users only"
on public.strategy_session_connections
as restrictive
for all
to authenticated
using (
  coalesce((((select auth.jwt()) ->> 'is_anonymous'))::boolean, true) is false
)
with check (
  coalesce((((select auth.jwt()) ->> 'is_anonymous'))::boolean, true) is false
);

create policy "permanent accounts read accessible notebook connections"
on public.strategy_session_connections
for select
to authenticated
using (
  project_id = any(((select private.accessible_project_ids()))::uuid[])
);

create policy "permanent accounts add their own notebook connections"
on public.strategy_session_connections
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and project_id = any(((select private.accessible_project_ids()))::uuid[])
);

create policy "permanent accounts change their own notebook connections"
on public.strategy_session_connections
for update
to authenticated
using (
  created_by = (select auth.uid())
  and project_id = any(((select private.accessible_project_ids()))::uuid[])
)
with check (
  created_by = (select auth.uid())
  and project_id = any(((select private.accessible_project_ids()))::uuid[])
);

create policy "permanent accounts remove their own notebook connections"
on public.strategy_session_connections
for delete
to authenticated
using (
  created_by = (select auth.uid())
  and project_id = any(((select private.accessible_project_ids()))::uuid[])
);

create trigger set_strategy_session_connections_updated_at
before update on public.strategy_session_connections
for each row execute function public.set_updated_at();

create or replace function private.touch_strategy_session_from_connection()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    update public.strategy_sessions
    set updated_at = pg_catalog.now()
    where id = old.session_id
      and project_id = old.project_id;
    return old;
  end if;

  update public.strategy_sessions
  set updated_at = pg_catalog.now()
  where id = new.session_id
    and project_id = new.project_id;
  return new;
end;
$$;

revoke all on function private.touch_strategy_session_from_connection()
from public, anon, authenticated, service_role;

create trigger touch_strategy_session_from_connection
after insert or update or delete on public.strategy_session_connections
for each row execute function private.touch_strategy_session_from_connection();

create or replace function public.set_strategy_session_connection(
  p_session_id uuid,
  p_project_id uuid,
  p_source_turn_id uuid,
  p_target_turn_id uuid,
  p_relationship text default 'related',
  p_origin text default 'strategist',
  p_status text default 'accepted',
  p_rationale text default null,
  p_factors text[] default '{}'
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  left_turn_id uuid;
  right_turn_id uuid;
  saved_id uuid;
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

  if p_source_turn_id is null
    or p_target_turn_id is null
    or p_source_turn_id = p_target_turn_id then
    raise exception 'Choose two different notebook entries to connect.'
      using errcode = '22023';
  end if;

  if p_relationship not in ('related', 'reinforces', 'contradicts', 'opens_question') then
    raise exception 'Choose a supported connection type.'
      using errcode = '22023';
  end if;

  if p_origin not in ('strategist', 'deterministic')
    or p_status not in ('accepted', 'dismissed')
    or (p_origin = 'strategist' and p_status <> 'accepted') then
    raise exception 'This connection state is not supported.'
      using errcode = '22023';
  end if;

  if char_length(coalesce(p_rationale, '')) > 1000
    or cardinality(coalesce(p_factors, '{}')) > 12 then
    raise exception 'Keep the connection note concise.'
      using errcode = '22023';
  end if;

  if (
    select count(*)
    from public.strategy_session_turns turn
    where turn.id in (p_source_turn_id, p_target_turn_id)
      and turn.session_id = p_session_id
      and turn.project_id = p_project_id
  ) <> 2 then
    raise exception 'Both entries must belong to the open notebook page.'
      using errcode = '23503';
  end if;

  if p_source_turn_id::text < p_target_turn_id::text then
    left_turn_id := p_source_turn_id;
    right_turn_id := p_target_turn_id;
  else
    left_turn_id := p_target_turn_id;
    right_turn_id := p_source_turn_id;
  end if;

  insert into public.strategy_session_connections (
    project_id,
    session_id,
    source_turn_id,
    target_turn_id,
    relationship,
    origin,
    status,
    rationale,
    factors,
    created_by
  ) values (
    p_project_id,
    p_session_id,
    left_turn_id,
    right_turn_id,
    p_relationship,
    p_origin,
    p_status,
    nullif(btrim(coalesce(p_rationale, '')), ''),
    coalesce(p_factors, '{}'),
    caller_id
  )
  on conflict (session_id, source_turn_id, target_turn_id, origin, created_by)
  do update set
    relationship = excluded.relationship,
    status = excluded.status,
    rationale = excluded.rationale,
    factors = excluded.factors
  returning id into saved_id;

  return saved_id;
end;
$$;

revoke all on function public.set_strategy_session_connection(uuid, uuid, uuid, uuid, text, text, text, text, text[])
from public, anon, authenticated, service_role;
grant execute on function public.set_strategy_session_connection(uuid, uuid, uuid, uuid, text, text, text, text, text[])
to authenticated, service_role;

create or replace function public.remove_strategy_session_connection(
  p_connection_id uuid,
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
  target_connection public.strategy_session_connections%rowtype;
begin
  if caller_id is null
    or coalesce((((select auth.jwt()) ->> 'is_anonymous'))::boolean, true) then
    raise exception 'A permanent authenticated account is required.'
      using errcode = '42501';
  end if;

  select connection.* into target_connection
  from public.strategy_session_connections connection
  where connection.id = p_connection_id
    and connection.session_id = p_session_id
    and connection.project_id = p_project_id
    and connection.created_by = caller_id;

  if not found then
    raise exception 'This connection is no longer available.'
      using errcode = 'P0002';
  end if;

  if target_connection.origin = 'deterministic' then
    update public.strategy_session_connections connection
    set status = 'dismissed'
    where connection.id = target_connection.id;
  else
    delete from public.strategy_session_connections connection
    where connection.id = target_connection.id;
  end if;

  return target_connection.id;
end;
$$;

revoke all on function public.remove_strategy_session_connection(uuid, uuid, uuid)
from public, anon, authenticated, service_role;
grant execute on function public.remove_strategy_session_connection(uuid, uuid, uuid)
to authenticated, service_role;

comment on table public.strategy_session_connections is
  'Private, project-scoped relationships between notebook entries. Accepted relationships form emerging threads; dismissed deterministic suggestions remain hidden without becoming strategist claims.';

comment on function public.set_strategy_session_connection(uuid, uuid, uuid, uuid, text, text, text, text, text[]) is
  'Creates or updates one canonical notebook-entry connection for the permanent authenticated caller after validating project and page ownership.';

comment on function public.remove_strategy_session_connection(uuid, uuid, uuid) is
  'Removes a strategist-authored connection or dismisses a deterministic suggestion so it does not immediately reappear.';
