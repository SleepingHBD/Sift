-- Phase 0 security and performance foundation.
--
-- This migration is intentionally additive. It preserves existing user data,
-- keeps anonymous authenticated sessions working until Phase 1 introduces
-- permanent identity, and narrows the directly exposed database surface.

create schema if not exists private;

revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

-- Keep the RLS membership lookup out of the exposed API schema. SECURITY
-- DEFINER is required here to avoid recursive RLS checks while reading the
-- projects and project_members tables. The caller identity remains explicit.
create or replace function private.can_access_project(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.projects p
      where p.id = target_project_id
        and p.owner_id = (select auth.uid())
      union all
      select 1
      from public.project_members pm
      where pm.project_id = target_project_id
        and pm.user_id = (select auth.uid())
    );
$$;

revoke all on function private.can_access_project(uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.can_access_project(uuid)
  to authenticated, service_role;

-- Retain the existing public function signature so current policies do not
-- need a destructive rewrite. This wrapper is invoker-safe and exposes only a
-- boolean answer for the current caller.
create or replace function public.can_access_project(target_project_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.can_access_project(target_project_id);
$$;

revoke all on function public.can_access_project(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.can_access_project(uuid)
  to authenticated, service_role;

-- Trigger helpers do not need to resolve objects through a mutable path or be
-- callable through the Data API.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.timezone('utc', pg_catalog.now());
  return new;
end;
$$;

revoke all on function public.set_updated_at()
  from public, anon, authenticated, service_role;

-- Supabase creates this event-trigger helper on hosted projects to enable RLS
-- automatically on new public tables. The event trigger continues to work as
-- its owner; client roles do not need direct EXECUTE permission. Guard the
-- statement so the migration also runs in environments without that helper.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke all on function public.rls_auto_enable() from public, anon, authenticated, service_role';
  end if;
end;
$$;

-- Existing policies were created without an explicit role and therefore
-- defaulted to PUBLIC. The application has no unauthenticated data surface, so
-- restrict those policies to authenticated sessions. Anonymous Auth users
-- still carry the authenticated Postgres role until Phase 1 migration.
do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and roles = array['public']::name[]
  loop
    execute format(
      'alter policy %I on %I.%I to authenticated',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end;
$$;

-- Cache auth.uid() once per statement in the policies that use it directly.
alter policy "users manage own profile"
  on public.user_profiles
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

alter policy "owners create projects"
  on public.projects
  with check (owner_id = (select auth.uid()));

alter policy "owners update projects"
  on public.projects
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

alter policy "owners delete projects"
  on public.projects
  using (owner_id = (select auth.uid()));

alter policy "project members manage mention notes"
  on public.mention_notes
  using (
    public.can_access_project(project_id)
    and user_id = (select auth.uid())
  )
  with check (
    public.can_access_project(project_id)
    and user_id = (select auth.uid())
  );

-- Avoid overlapping permissive SELECT policies on project_members while
-- preserving the original owner-management behavior.
drop policy if exists "owners manage membership" on public.project_members;
drop policy if exists "owners insert membership" on public.project_members;
drop policy if exists "owners update membership" on public.project_members;
drop policy if exists "owners delete membership" on public.project_members;

create policy "owners insert membership"
  on public.project_members
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.projects p
      where p.id = project_id
        and p.owner_id = (select auth.uid())
    )
  );

create policy "owners update membership"
  on public.project_members
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.projects p
      where p.id = project_id
        and p.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.projects p
      where p.id = project_id
        and p.owner_id = (select auth.uid())
    )
  );

create policy "owners delete membership"
  on public.project_members
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.projects p
      where p.id = project_id
        and p.owner_id = (select auth.uid())
    )
  );

-- Postgres does not create indexes for foreign keys automatically. These
-- indexes cover the live advisor findings and the project-scoped access paths
-- that Phase 1 repositories will use.
create index if not exists ai_conversations_project_id_idx
  on public.ai_conversations (project_id);
create index if not exists ai_conversations_user_id_idx
  on public.ai_conversations (user_id);
create index if not exists ai_messages_conversation_id_idx
  on public.ai_messages (conversation_id);
create index if not exists brands_project_id_idx
  on public.brands (project_id);
create index if not exists briefs_created_by_idx
  on public.briefs (created_by);
create index if not exists briefs_project_id_idx
  on public.briefs (project_id);
create index if not exists competitor_groups_project_id_idx
  on public.competitor_groups (project_id);
create index if not exists competitors_brand_id_idx
  on public.competitors (brand_id);
create index if not exists competitors_project_id_idx
  on public.competitors (project_id);
create index if not exists creative_territories_insight_id_idx
  on public.creative_territories (insight_id);
create index if not exists creative_territories_project_id_idx
  on public.creative_territories (project_id);
create index if not exists creative_territories_strategy_session_id_idx
  on public.creative_territories (strategy_session_id);
create index if not exists insights_created_by_idx
  on public.insights (created_by);
create index if not exists insights_project_id_idx
  on public.insights (project_id);
create index if not exists inspiration_items_created_by_idx
  on public.inspiration_items (created_by);
create index if not exists inspiration_items_project_id_idx
  on public.inspiration_items (project_id);
create index if not exists item_tags_project_id_idx
  on public.item_tags (project_id);
create index if not exists mention_notes_project_id_idx
  on public.mention_notes (project_id);
create index if not exists monitor_runs_connector_config_id_idx
  on public.monitor_runs (connector_config_id);
create index if not exists monitor_runs_project_id_idx
  on public.monitor_runs (project_id);
create index if not exists monitoring_queries_brand_id_idx
  on public.monitoring_queries (brand_id);
create index if not exists research_items_created_by_idx
  on public.research_items (created_by);
create index if not exists research_items_project_id_idx
  on public.research_items (project_id);
create index if not exists sources_connector_config_id_idx
  on public.sources (connector_config_id);
create index if not exists strategy_sessions_created_by_idx
  on public.strategy_sessions (created_by);
create index if not exists strategy_sessions_project_id_idx
  on public.strategy_sessions (project_id);
create index if not exists trends_project_id_idx
  on public.trends (project_id);
create index if not exists trends_topic_id_idx
  on public.trends (topic_id);

-- Future public-schema functions are private by default until explicitly
-- granted to a client role in the migration that creates them.
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;
