-- Phase 7 conversational transition: attach a verified manual ChatGPT handoff
-- to a strategy conversation and preserve its suggestions as optional working pieces.

alter table public.strategy_session_turns
  add column ai_message_id uuid references public.ai_messages(id) on delete restrict,
  add constraint strategy_session_turns_ai_message_origin_check check (
    (origin = 'chatgpt_manual' and role = 'assistant' and ai_message_id is not null)
    or (origin <> 'chatgpt_manual' and ai_message_id is null)
  ),
  add constraint strategy_session_turns_identity_project_session_key
    unique (id, project_id, session_id);

create unique index strategy_session_turns_session_ai_message_key
  on public.strategy_session_turns (session_id, ai_message_id)
  where ai_message_id is not null;

create table public.strategy_session_pieces (
  id uuid primary key default extensions.gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  session_id uuid not null,
  source_turn_id uuid not null,
  kind text not null check (
    kind in ('observation', 'question', 'interpretation', 'tension', 'hypothesis', 'opportunity')
  ),
  origin text not null check (origin in ('strategist', 'chatgpt_manual')),
  external_ref text not null check (char_length(btrim(external_ref)) between 1 and 80),
  content text not null check (char_length(btrim(content)) between 1 and 2000),
  why_it_matters text check (why_it_matters is null or char_length(why_it_matters) <= 2000),
  confidence text check (confidence is null or confidence in ('low', 'medium', 'high')),
  caveat text check (caveat is null or char_length(caveat) <= 1000),
  status text not null default 'active' check (status in ('active', 'dismissed', 'shaped')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  foreign key (session_id, project_id)
    references public.strategy_sessions(id, project_id)
    on delete cascade,
  foreign key (source_turn_id, project_id, session_id)
    references public.strategy_session_turns(id, project_id, session_id)
    on delete cascade,
  unique (id, project_id),
  unique (session_id, source_turn_id, external_ref)
);

create table public.strategy_session_piece_sources (
  id uuid primary key default extensions.gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  piece_id uuid not null,
  evidence_type public.item_kind not null check (
    evidence_type in (
      'mention'::public.item_kind,
      'research'::public.item_kind,
      'inspiration'::public.item_kind
    )
  ),
  evidence_id uuid not null,
  relationship text not null default 'support'
    check (relationship in ('support', 'contradict', 'context')),
  excerpt text check (excerpt is null or char_length(excerpt) <= 5000),
  rationale text check (rationale is null or char_length(rationale) <= 2000),
  created_at timestamptz not null default pg_catalog.now(),
  foreign key (piece_id, project_id)
    references public.strategy_session_pieces(id, project_id)
    on delete cascade,
  unique (piece_id, evidence_type, evidence_id, relationship)
);

create index strategy_session_pieces_session_status_created_idx
  on public.strategy_session_pieces (session_id, project_id, status, created_at, id);
create index strategy_session_pieces_source_turn_idx
  on public.strategy_session_pieces (source_turn_id, project_id, session_id);
create index strategy_session_pieces_created_by_idx
  on public.strategy_session_pieces (created_by);
create index strategy_session_piece_sources_piece_project_idx
  on public.strategy_session_piece_sources (piece_id, project_id, created_at, id);
create index strategy_session_piece_sources_evidence_lookup_idx
  on public.strategy_session_piece_sources (evidence_type, evidence_id, project_id, piece_id);

alter table public.strategy_session_pieces enable row level security;
alter table public.strategy_session_piece_sources enable row level security;

revoke all on table public.strategy_session_pieces
from public, anon, authenticated, service_role;
revoke all on table public.strategy_session_piece_sources
from public, anon, authenticated, service_role;

grant select on table public.strategy_session_pieces to authenticated;
grant update (status) on table public.strategy_session_pieces to authenticated;
grant select on table public.strategy_session_piece_sources to authenticated;
grant select, insert, update, delete on table public.strategy_session_pieces to service_role;
grant select, insert, update, delete on table public.strategy_session_piece_sources to service_role;

create policy "permanent authenticated users only"
on public.strategy_session_pieces
as restrictive
for all
to authenticated
using (
  coalesce((((select auth.jwt()) ->> 'is_anonymous'))::boolean, true) is false
)
with check (
  coalesce((((select auth.jwt()) ->> 'is_anonymous'))::boolean, true) is false
);

create policy "permanent accounts read accessible strategy pieces"
on public.strategy_session_pieces
for select
to authenticated
using (
  project_id = any(((select private.accessible_project_ids()))::uuid[])
);

create policy "permanent accounts change strategy piece status"
on public.strategy_session_pieces
for update
to authenticated
using (
  project_id = any(((select private.accessible_project_ids()))::uuid[])
)
with check (
  project_id = any(((select private.accessible_project_ids()))::uuid[])
);

create policy "permanent authenticated users only"
on public.strategy_session_piece_sources
as restrictive
for select
to authenticated
using (
  coalesce((((select auth.jwt()) ->> 'is_anonymous'))::boolean, true) is false
);

create policy "permanent accounts read accessible strategy piece sources"
on public.strategy_session_piece_sources
for select
to authenticated
using (
  project_id = any(((select private.accessible_project_ids()))::uuid[])
);

create or replace function private.prepare_strategy_session_piece_before_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.project_id <> old.project_id
    or new.session_id <> old.session_id
    or new.source_turn_id <> old.source_turn_id
    or new.kind <> old.kind
    or new.origin <> old.origin
    or new.external_ref <> old.external_ref
    or new.content <> old.content
    or new.why_it_matters is distinct from old.why_it_matters
    or new.confidence is distinct from old.confidence
    or new.caveat is distinct from old.caveat
    or new.created_by <> old.created_by
    or new.created_at <> old.created_at then
    raise exception 'Only the working-piece status can be changed.' using errcode = '22023';
  end if;
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

create or replace function private.prepare_strategy_session_piece_source_before_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not private.strategy_original_evidence_exists(
    new.project_id,
    new.evidence_type,
    new.evidence_id
  ) then
    raise exception 'A working-piece citation must reference available evidence in the same project.'
      using errcode = '23503';
  end if;
  return new;
end;
$$;

revoke all on function private.prepare_strategy_session_piece_before_update()
from public, anon, authenticated, service_role;
revoke all on function private.prepare_strategy_session_piece_source_before_write()
from public, anon, authenticated, service_role;

create trigger prepare_strategy_session_piece_before_update
before update on public.strategy_session_pieces
for each row execute function private.prepare_strategy_session_piece_before_update();

create trigger prepare_strategy_session_piece_source_before_write
before insert or update on public.strategy_session_piece_sources
for each row execute function private.prepare_strategy_session_piece_source_before_write();

create or replace function public.attach_strategy_analysis_to_session(
  p_user_id uuid,
  p_project_id uuid,
  p_session_id uuid,
  p_ai_message_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_response jsonb;
  saved_citations jsonb;
  saved_summary text;
  conversation_id uuid;
  handoff_turn_id uuid;
  claim jsonb;
  tension jsonb;
  citation jsonb;
  item_text text;
  item_index integer;
  piece_id uuid;
  piece_kind text;
  piece_count integer;
  was_duplicate boolean := false;
begin
  if not exists (
    select 1
    from public.projects project
    where project.id = p_project_id
      and (
        project.owner_id = p_user_id
        or exists (
          select 1
          from public.project_members member
          where member.project_id = project.id
            and member.user_id = p_user_id
        )
      )
  ) then
    raise exception 'The user cannot access the selected project.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.strategy_sessions session
    where session.id = p_session_id
      and session.project_id = p_project_id
  ) then
    raise exception 'The selected strategy conversation is not available in this project.' using errcode = '23503';
  end if;

  select
    message.structured_response,
    message.citations,
    message.content,
    conversation.id
  into
    saved_response,
    saved_citations,
    saved_summary,
    conversation_id
  from public.ai_messages message
  join public.ai_conversations conversation
    on conversation.id = message.conversation_id
  where message.id = p_ai_message_id
    and message.role = 'assistant'
    and conversation.project_id = p_project_id
    and conversation.user_id = p_user_id
    and message.model = 'ChatGPT manual handoff'
    and message.request_id like 'manual:%';

  if conversation_id is null
    or jsonb_typeof(saved_response) is distinct from 'object'
    or jsonb_typeof(saved_citations) is distinct from 'array'
    or nullif(btrim(saved_summary), '') is null then
    raise exception 'The saved analysis is not an eligible verified ChatGPT handoff.' using errcode = '23503';
  end if;

  insert into public.strategy_session_inputs (
    project_id, session_id, input_type, input_id, role, rationale, added_by
  ) values (
    p_project_id, p_session_id, 'ai_message', p_ai_message_id, 'context',
    'Verified manual ChatGPT handoff attached to the strategy conversation.', p_user_id
  ) on conflict (session_id, input_type, input_id) do nothing;

  insert into public.strategy_session_turns (
    project_id, session_id, role, origin, content, metadata, created_by, ai_message_id
  ) values (
    p_project_id,
    p_session_id,
    'assistant',
    'chatgpt_manual',
    btrim(saved_summary),
    jsonb_build_object(
      'conversationId', conversation_id,
      'assistantMessageId', p_ai_message_id,
      'workingPieceSource', true
    ),
    p_user_id,
    p_ai_message_id
  )
  on conflict (session_id, ai_message_id) where ai_message_id is not null do nothing
  returning id into handoff_turn_id;

  if handoff_turn_id is null then
    was_duplicate := true;
    select turn.id into handoff_turn_id
    from public.strategy_session_turns turn
    where turn.session_id = p_session_id
      and turn.ai_message_id = p_ai_message_id;
  end if;

  for claim in
    select value from jsonb_array_elements(saved_response -> 'claims')
  loop
    piece_kind := case claim ->> 'classification'
      when 'measured_fact' then 'observation'
      when 'interpretation' then 'interpretation'
      when 'hypothesis' then 'hypothesis'
      when 'recommendation' then 'opportunity'
      else null
    end;
    if piece_kind is null then
      continue;
    end if;

    insert into public.strategy_session_pieces (
      project_id, session_id, source_turn_id, kind, origin, external_ref,
      content, why_it_matters, confidence, caveat, created_by
    ) values (
      p_project_id, p_session_id, handoff_turn_id, piece_kind, 'chatgpt_manual',
      claim ->> 'id', claim ->> 'statement', nullif(claim ->> 'whyItMatters', ''),
      nullif(claim ->> 'confidence', ''), nullif(claim ->> 'caveat', ''), p_user_id
    )
    on conflict (session_id, source_turn_id, external_ref) do nothing
    returning id into piece_id;

    if piece_id is null then
      select piece.id into piece_id
      from public.strategy_session_pieces piece
      where piece.session_id = p_session_id
        and piece.source_turn_id = handoff_turn_id
        and piece.external_ref = claim ->> 'id';
    end if;

    for citation in
      select value
      from jsonb_array_elements(saved_citations)
      where value ->> 'claimId' = claim ->> 'id'
    loop
      insert into public.strategy_session_piece_sources (
        project_id, piece_id, evidence_type, evidence_id, relationship, rationale
      ) values (
        p_project_id,
        piece_id,
        (citation ->> 'evidenceKind')::public.item_kind,
        (citation ->> 'evidenceId')::uuid,
        'support',
        'Cited by the verified ChatGPT handoff.'
      ) on conflict (piece_id, evidence_type, evidence_id, relationship) do nothing;
    end loop;
    piece_id := null;
  end loop;

  item_index := 0;
  for tension in
    select value from jsonb_array_elements(saved_response -> 'tensions')
  loop
    item_index := item_index + 1;
    insert into public.strategy_session_pieces (
      project_id, session_id, source_turn_id, kind, origin, external_ref,
      content, why_it_matters, created_by
    ) values (
      p_project_id, p_session_id, handoff_turn_id, 'tension', 'chatgpt_manual',
      'tension_' || item_index, tension ->> 'description',
      nullif(tension ->> 'implication', ''), p_user_id
    )
    on conflict (session_id, source_turn_id, external_ref) do nothing
    returning id into piece_id;

    if piece_id is null then
      select piece.id into piece_id
      from public.strategy_session_pieces piece
      where piece.session_id = p_session_id
        and piece.source_turn_id = handoff_turn_id
        and piece.external_ref = 'tension_' || item_index;
    end if;

    for citation in
      select value
      from jsonb_array_elements(saved_citations)
      where value ->> 'claimId' = 'tension_' || item_index
    loop
      insert into public.strategy_session_piece_sources (
        project_id, piece_id, evidence_type, evidence_id, relationship, rationale
      ) values (
        p_project_id,
        piece_id,
        (citation ->> 'evidenceKind')::public.item_kind,
        (citation ->> 'evidenceId')::uuid,
        'support',
        'Cited by the verified ChatGPT handoff.'
      ) on conflict (piece_id, evidence_type, evidence_id, relationship) do nothing;
    end loop;
    piece_id := null;
  end loop;

  item_index := 0;
  for item_text in
    select value from jsonb_array_elements_text(saved_response -> 'evidenceGaps')
  loop
    item_index := item_index + 1;
    insert into public.strategy_session_pieces (
      project_id, session_id, source_turn_id, kind, origin, external_ref, content, created_by
    ) values (
      p_project_id, p_session_id, handoff_turn_id, 'question', 'chatgpt_manual',
      'evidence_gap_' || item_index, item_text, p_user_id
    ) on conflict (session_id, source_turn_id, external_ref) do nothing;
  end loop;

  item_index := 0;
  for item_text in
    select value from jsonb_array_elements_text(saved_response -> 'nextQuestions')
  loop
    item_index := item_index + 1;
    insert into public.strategy_session_pieces (
      project_id, session_id, source_turn_id, kind, origin, external_ref, content, created_by
    ) values (
      p_project_id, p_session_id, handoff_turn_id, 'question', 'chatgpt_manual',
      'next_question_' || item_index, item_text, p_user_id
    ) on conflict (session_id, source_turn_id, external_ref) do nothing;
  end loop;

  select count(*)::integer into piece_count
  from public.strategy_session_pieces piece
  where piece.session_id = p_session_id
    and piece.source_turn_id = handoff_turn_id;

  update public.strategy_session_turns
  set metadata = metadata || jsonb_build_object('workingPieceCount', piece_count)
  where id = handoff_turn_id;

  return jsonb_build_object(
    'turnId', handoff_turn_id,
    'pieceCount', piece_count,
    'duplicate', was_duplicate
  );
end;
$$;

revoke all on function public.attach_strategy_analysis_to_session(uuid, uuid, uuid, uuid)
from public, anon, authenticated, service_role;
grant execute on function public.attach_strategy_analysis_to_session(uuid, uuid, uuid, uuid)
to service_role;

comment on table public.strategy_session_pieces is
  'Optional observations, questions, interpretations, tensions, hypotheses, and opportunities emerging from a strategy conversation. Pieces are not approved formal strategy.';
comment on table public.strategy_session_piece_sources is
  'Original evidence citations for one conversational working piece.';
comment on function public.attach_strategy_analysis_to_session(uuid, uuid, uuid, uuid) is
  'Service-role-only idempotent attachment of a persisted, verified manual ChatGPT analysis to one accessible strategy session.';
