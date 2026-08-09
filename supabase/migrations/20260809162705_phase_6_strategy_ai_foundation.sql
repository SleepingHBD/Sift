-- Phase 6: establish a private, server-written Strategy AI boundary before
-- any model credential is connected.
--
-- The existing AI tables are reused. Authenticated browsers may read only
-- their own conversations; they cannot forge assistant messages, citations,
-- model names, or usage records through the Data API. The authenticated Edge
-- Function will retrieve evidence with the caller's RLS context and the
-- trusted server client will persist model output in a later increment.

alter table public.ai_conversations
  alter column user_id set default auth.uid();

alter table public.ai_conversations
  add column if not exists analysis_mode text not null default 'workspace_backed';

alter table public.ai_conversations
  drop constraint if exists ai_conversations_analysis_mode_check;

alter table public.ai_conversations
  add constraint ai_conversations_analysis_mode_check
  check (analysis_mode in ('workspace_backed', 'mixed', 'general'));

alter table public.ai_conversations
  drop constraint if exists ai_conversations_source_scope_object_check;

alter table public.ai_conversations
  add constraint ai_conversations_source_scope_object_check
  check (jsonb_typeof(source_scope) = 'object');

alter table public.ai_messages
  add column if not exists request_id text,
  add column if not exists usage jsonb not null default '{}'::jsonb;

alter table public.ai_messages
  drop constraint if exists ai_messages_usage_object_check;

alter table public.ai_messages
  add constraint ai_messages_usage_object_check
  check (jsonb_typeof(usage) = 'object');

drop policy if exists "project members manage ai_conversations"
  on public.ai_conversations;
drop policy if exists "users read own ai conversations"
  on public.ai_conversations;

create policy "users read own ai conversations"
  on public.ai_conversations
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    and public.can_access_project(project_id)
  );

drop policy if exists "access ai messages"
  on public.ai_messages;
drop policy if exists "users read own ai messages"
  on public.ai_messages;

create policy "users read own ai messages"
  on public.ai_messages
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.ai_conversations conversation
      where conversation.id = ai_messages.conversation_id
        and conversation.user_id = (select auth.uid())
        and public.can_access_project(conversation.project_id)
    )
  );

revoke insert, update, delete
  on table public.ai_conversations, public.ai_messages
  from authenticated;

grant select
  on table public.ai_conversations, public.ai_messages
  to authenticated;

comment on column public.ai_conversations.analysis_mode is
  'Visible response boundary: workspace_backed, mixed, or general. Set only by the trusted Strategy AI server path.';
comment on column public.ai_conversations.source_scope is
  'Inspectable project, query, filters, and stable evidence identities used for the conversation.';
comment on column public.ai_messages.request_id is
  'OpenAI or client request identifier retained for server-side troubleshooting; never treated as evidence.';
comment on column public.ai_messages.usage is
  'Server-recorded model token usage and cost-control metadata.';
