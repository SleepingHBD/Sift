-- Phase 7 conversational transition: preserve gradual strategist thinking
-- without weakening the existing formal strategy-stage audit layer.

create table public.strategy_session_turns (
  id uuid primary key default extensions.gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  session_id uuid not null,
  role text not null check (role in ('user', 'assistant')),
  origin text not null default 'strategist'
    check (origin in ('strategist', 'chatgpt_manual', 'sift_guidance')),
  content text not null
    check (char_length(btrim(content)) between 1 and 10000),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_by uuid not null default auth.uid()
    references auth.users(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  foreign key (session_id, project_id)
    references public.strategy_sessions(id, project_id)
    on delete cascade
);

create index strategy_session_turns_session_timeline_idx
  on public.strategy_session_turns (session_id, created_at, id);
create index strategy_session_turns_project_session_idx
  on public.strategy_session_turns (project_id, session_id);
create index strategy_session_turns_created_by_idx
  on public.strategy_session_turns (created_by);

alter table public.strategy_session_turns enable row level security;

revoke all on table public.strategy_session_turns
from public, anon, authenticated, service_role;

grant select, insert on table public.strategy_session_turns
to authenticated;
grant select, insert, update, delete on table public.strategy_session_turns
to service_role;

create policy "permanent authenticated users only"
on public.strategy_session_turns
as restrictive
for all
to authenticated
using (
  coalesce((((select auth.jwt()) ->> 'is_anonymous'))::boolean, true) is false
)
with check (
  coalesce((((select auth.jwt()) ->> 'is_anonymous'))::boolean, true) is false
);

create policy "permanent accounts read accessible strategy turns"
on public.strategy_session_turns
for select
to authenticated
using (
  project_id = any(((select private.accessible_project_ids()))::uuid[])
);

create policy "permanent accounts add their own strategy turns"
on public.strategy_session_turns
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and role = 'user'
  and origin = 'strategist'
  and project_id = any(((select private.accessible_project_ids()))::uuid[])
);

create or replace function private.touch_strategy_session_from_turn()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.strategy_sessions
  set updated_at = pg_catalog.now()
  where id = new.session_id
    and project_id = new.project_id;
  return new;
end;
$$;

revoke all on function private.touch_strategy_session_from_turn()
from public, anon, authenticated, service_role;

create trigger touch_strategy_session_from_turn
after insert on public.strategy_session_turns
for each row execute function private.touch_strategy_session_from_turn();

create or replace function public.start_strategy_conversation(
  p_project_id uuid,
  p_opening_message text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  clean_message text := btrim(coalesce(p_opening_message, ''));
  generated_title text;
  new_session_id uuid;
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

  if char_length(clean_message) < 1 or char_length(clean_message) > 10000 then
    raise exception 'Write between 1 and 10000 characters to begin the conversation.'
      using errcode = '22023';
  end if;

  generated_title := left(
    regexp_replace(clean_message, E'\\s+', ' ', 'g'),
    160
  );

  insert into public.strategy_sessions (
    project_id,
    created_by,
    title,
    source_scope,
    status,
    origin
  ) values (
    p_project_id,
    caller_id,
    generated_title,
    '{"workflow":"conversation"}'::jsonb,
    'active',
    'strategist'
  )
  returning id into new_session_id;

  insert into public.strategy_session_turns (
    project_id,
    session_id,
    role,
    origin,
    content,
    created_by
  ) values (
    p_project_id,
    new_session_id,
    'user',
    'strategist',
    clean_message,
    caller_id
  );

  return new_session_id;
end;
$$;

revoke all on function public.start_strategy_conversation(uuid, text)
from public, anon, authenticated, service_role;
grant execute on function public.start_strategy_conversation(uuid, text)
to authenticated, service_role;

comment on table public.strategy_session_turns is
  'Append-only conversational thinking attached to a strategy session. Browser clients may add only their own strategist-authored user turns; verified ChatGPT turns require a trusted server path.';

comment on function public.start_strategy_conversation(uuid, text) is
  'Atomically creates a project-scoped strategy session and its first strategist-authored conversational turn for a permanent authenticated account.';
