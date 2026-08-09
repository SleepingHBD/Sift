-- Phase 6: authoritative evidence resolution and atomic, service-only storage
-- for cited Strategy AI responses.

alter table public.ai_conversations
  add column if not exists client_request_id uuid;

create unique index if not exists ai_conversations_user_client_request_key
  on public.ai_conversations (user_id, client_request_id)
  where client_request_id is not null;

alter table public.ai_messages
  add column if not exists structured_response jsonb not null default '{}'::jsonb;

alter table public.ai_messages
  drop constraint if exists ai_messages_structured_claims_array_check,
  drop constraint if exists ai_messages_citations_array_check,
  drop constraint if exists ai_messages_structured_response_object_check;

alter table public.ai_messages
  add constraint ai_messages_structured_claims_array_check
    check (jsonb_typeof(structured_claims) = 'array'),
  add constraint ai_messages_citations_array_check
    check (jsonb_typeof(citations) = 'array'),
  add constraint ai_messages_structured_response_object_check
    check (jsonb_typeof(structured_response) = 'object');

create or replace function public.resolve_strategy_evidence(
  p_project_id uuid,
  p_identities text[]
)
returns table (evidence jsonb)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'A permanent authenticated account is required.' using errcode = '42501';
  end if;

  if not public.can_access_project(p_project_id) then
    raise exception 'The selected project is not available to this account.' using errcode = '42501';
  end if;

  if cardinality(p_identities) < 1 or cardinality(p_identities) > 12 then
    raise exception 'Choose between 1 and 12 evidence sources.' using errcode = '22023';
  end if;

  return query
  with requested as (
    select request.identity, request.position
    from unnest(p_identities) with ordinality as request(identity, position)
  ), resolved as (
    select
      request.position,
      jsonb_build_object(
        'kind', 'mention',
        'item_id', mention.id,
        'project_id', mention.project_id,
        'title', case
          when nullif(btrim(mention.author), '') is not null
            then coalesce(source.name, initcap(replace(mention.platform::text, '_', ' '))) || ' · ' || mention.author
          else coalesce(source.name, initcap(replace(mention.platform::text, '_', ' ')))
        end,
        'author', mention.author,
        'source_label', coalesce(source.name, initcap(replace(mention.platform::text, '_', ' '))),
        'original_url', mention.url,
        'original_content', mention.content,
        'notes', nullif(mention.metadata ->> 'strategist_note', ''),
        'captured_at', mention.created_at,
        'review_status', mention.review_status,
        'metadata', mention.metadata
      ) as evidence
    from requested request
    join public.mentions mention
      on request.identity = 'mention:' || mention.id::text
    left join public.sources source on source.id = mention.source_id
    where mention.review_status not in ('irrelevant', 'archived')
      and (
        mention.project_id = p_project_id
        or exists (
          select 1
          from public.saved_items link
          where link.user_id = (select auth.uid())
            and link.project_id = mention.project_id
            and link.item_type = 'mention'::public.item_kind
            and link.item_id = mention.id
            and link.destination = 'project'
            and link.destination_id = p_project_id
        )
      )

    union all

    select
      request.position,
      jsonb_build_object(
        'kind', 'research',
        'item_id', research.id,
        'project_id', research.project_id,
        'title', research.title,
        'author', research.author,
        'source_label', coalesce(nullif(research.publication, ''), nullif(research.metadata ->> 'source_label', ''), 'Personal research'),
        'original_url', research.url,
        'original_content', coalesce(
          nullif(research.metadata ->> 'source_text', ''),
          nullif(research.metadata ->> 'sourceText', ''),
          nullif(research.metadata ->> 'quoted_text', ''),
          nullif(research.metadata ->> 'quotedText', '')
        ),
        'key_findings', research.key_findings,
        'notes', research.notes,
        'captured_at', research.created_at,
        'review_status', research.review_status,
        'metadata', research.metadata
      ) as evidence
    from requested request
    join public.research_items research
      on request.identity = 'research:' || research.id::text
    where research.review_status not in ('irrelevant', 'archived')
      and (
        research.project_id = p_project_id
        or exists (
          select 1
          from public.saved_items link
          where link.user_id = (select auth.uid())
            and link.project_id = research.project_id
            and link.item_type = 'research'::public.item_kind
            and link.item_id = research.id
            and link.destination = 'project'
            and link.destination_id = p_project_id
        )
      )

    union all

    select
      request.position,
      jsonb_build_object(
        'kind', 'inspiration',
        'item_id', inspiration.id,
        'project_id', inspiration.project_id,
        'title', inspiration.title,
        'author', nullif(inspiration.metadata ->> 'author', ''),
        'source_label', coalesce(nullif(inspiration.metadata ->> 'source_label', ''), nullif(inspiration.url, ''), 'Personal inspiration'),
        'original_url', inspiration.url,
        'original_content', coalesce(inspiration.extracted_text, nullif(inspiration.metadata ->> 'source_text', ''), nullif(inspiration.metadata ->> 'sourceText', '')),
        'notes', inspiration.notes,
        'captured_at', inspiration.created_at,
        'review_status', inspiration.review_status,
        'metadata', inspiration.metadata
      ) as evidence
    from requested request
    join public.inspiration_items inspiration
      on request.identity = 'inspiration:' || inspiration.id::text
    where inspiration.review_status not in ('irrelevant', 'archived')
      and (
        inspiration.project_id = p_project_id
        or exists (
          select 1
          from public.saved_items link
          where link.user_id = (select auth.uid())
            and link.project_id = inspiration.project_id
            and link.item_type = 'inspiration'::public.item_kind
            and link.item_id = inspiration.id
            and link.destination = 'project'
            and link.destination_id = p_project_id
        )
      )
  )
  select resolved.evidence
  from resolved
  order by resolved.position;
end;
$$;

revoke all on function public.resolve_strategy_evidence(uuid, text[])
  from public, anon;
grant execute on function public.resolve_strategy_evidence(uuid, text[])
  to authenticated;

create or replace function public.persist_strategy_analysis(
  p_user_id uuid,
  p_project_id uuid,
  p_client_request_id uuid,
  p_title text,
  p_source_scope jsonb,
  p_question text,
  p_structured_response jsonb,
  p_structured_claims jsonb,
  p_citations jsonb,
  p_model text,
  p_request_id text,
  p_usage jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  conversation_id uuid;
  user_message_id uuid;
  assistant_message_id uuid;
  existing_assistant_id uuid;
begin
  if not exists (
    select 1 from public.projects project
    where project.id = p_project_id
      and (
        project.owner_id = p_user_id
        or exists (
          select 1 from public.project_members member
          where member.project_id = project.id and member.user_id = p_user_id
        )
      )
  ) then
    raise exception 'The user cannot access the selected project.' using errcode = '42501';
  end if;

  if jsonb_typeof(p_source_scope) is distinct from 'object'
    or p_source_scope ->> 'projectId' is distinct from p_project_id::text
    or p_source_scope ->> 'clientRequestId' is distinct from p_client_request_id::text
    or jsonb_typeof(p_source_scope -> 'evidenceIdentities') is distinct from 'array'
    or jsonb_array_length(p_source_scope -> 'evidenceIdentities') < 1
    or jsonb_array_length(p_source_scope -> 'evidenceIdentities') > 12 then
    raise exception 'The analysis source scope is invalid.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_structured_response) is distinct from 'object'
    or nullif(btrim(p_structured_response ->> 'summary'), '') is null
    or jsonb_typeof(p_structured_claims) is distinct from 'array'
    or jsonb_typeof(p_citations) is distinct from 'array'
    or jsonb_typeof(p_usage) is distinct from 'object' then
    raise exception 'The analysis payload is invalid.' using errcode = '22023';
  end if;
  if length(btrim(p_question)) < 3 or length(p_question) > 1000 then
    raise exception 'The strategic question is invalid.' using errcode = '22023';
  end if;
  if nullif(btrim(p_model), '') is null or nullif(btrim(p_request_id), '') is null then
    raise exception 'Model provenance is required.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_structured_claims) > 8
    or exists (
      select 1
      from jsonb_array_elements(p_structured_claims) claim
      where jsonb_typeof(claim) is distinct from 'object'
        or jsonb_typeof(claim -> 'evidenceIds') is distinct from 'array'
        or jsonb_array_length(claim -> 'evidenceIds') < 1
        or claim ->> 'classification' is null
        or claim ->> 'classification' not in ('measured_fact', 'interpretation', 'hypothesis', 'recommendation')
    ) then
    raise exception 'Every structured claim must be bounded, classified, and cited.' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_structured_claims) claim
    cross join jsonb_array_elements_text(claim -> 'evidenceIds') evidence_id
    where not exists (
      select 1
      from jsonb_array_elements_text(p_source_scope -> 'evidenceIdentities') scoped_id
      where scoped_id = evidence_id
    )
  ) then
    raise exception 'A claim cites evidence outside the authorized source scope.' using errcode = '22023';
  end if;

  select conversation.id into conversation_id
  from public.ai_conversations conversation
  where conversation.user_id = p_user_id
    and conversation.client_request_id = p_client_request_id;

  if conversation_id is not null then
    select message.id into existing_assistant_id
    from public.ai_messages message
    where message.conversation_id = conversation_id and message.role = 'assistant'
    order by message.created_at desc
    limit 1;
    return jsonb_build_object(
      'conversationId', conversation_id,
      'assistantMessageId', existing_assistant_id,
      'duplicate', true
    );
  end if;

  insert into public.ai_conversations (
    project_id, user_id, title, source_scope, analysis_mode, client_request_id
  ) values (
    p_project_id, p_user_id, left(nullif(btrim(p_title), ''), 160), p_source_scope, 'workspace_backed', p_client_request_id
  ) returning id into conversation_id;

  insert into public.ai_messages (conversation_id, role, content)
  values (conversation_id, 'user', btrim(p_question))
  returning id into user_message_id;

  insert into public.ai_messages (
    conversation_id,
    role,
    content,
    structured_response,
    structured_claims,
    citations,
    model,
    request_id,
    usage
  ) values (
    conversation_id,
    'assistant',
    p_structured_response ->> 'summary',
    p_structured_response,
    p_structured_claims,
    p_citations,
    p_model,
    p_request_id,
    p_usage
  ) returning id into assistant_message_id;

  return jsonb_build_object(
    'conversationId', conversation_id,
    'userMessageId', user_message_id,
    'assistantMessageId', assistant_message_id,
    'duplicate', false
  );
end;
$$;

revoke all on function public.persist_strategy_analysis(
  uuid, uuid, uuid, text, jsonb, text, jsonb, jsonb, jsonb, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.persist_strategy_analysis(
  uuid, uuid, uuid, text, jsonb, text, jsonb, jsonb, jsonb, text, text, jsonb
) to service_role;

comment on column public.ai_conversations.client_request_id is
  'User-scoped idempotency key generated before a Strategy AI model request.';
comment on column public.ai_messages.structured_response is
  'Complete server-validated structured Strategy AI response; claims and citations are also projected into dedicated columns.';
comment on function public.resolve_strategy_evidence(uuid, text[]) is
  'RLS-scoped authoritative resolver for strategist-selected stable evidence identities.';
comment on function public.persist_strategy_analysis(uuid, uuid, uuid, text, jsonb, text, jsonb, jsonb, jsonb, text, text, jsonb) is
  'Service-role-only atomic persistence for one validated, cited Strategy AI exchange.';
