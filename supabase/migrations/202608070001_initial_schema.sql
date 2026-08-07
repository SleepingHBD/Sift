-- Sift Creative Strategy Intelligence — initial relational schema
-- Apply with the Supabase CLI or paste into the Supabase SQL editor.

create extension if not exists pgcrypto;

create type public.source_kind as enum ('reddit', 'youtube', 'rss', 'news', 'blog', 'manual_url', 'manual_note', 'future_connector');
create type public.connector_mode as enum ('live', 'unavailable');
create type public.sentiment_kind as enum ('positive', 'neutral', 'negative', 'unknown');
create type public.lifecycle_stage as enum ('emerging', 'accelerating', 'mainstream', 'saturated', 'declining');
create type public.claim_kind as enum ('evidence', 'interpretation', 'hypothesis', 'recommendation');
create type public.item_kind as enum ('mention', 'trend', 'research', 'inspiration', 'insight', 'territory', 'brief');

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = timezone('utc', now()); return new; end;
$$;

create table public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  timezone text not null default 'Asia/Singapore',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  market text,
  focus text,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'editor' check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default timezone('utc', now()),
  primary key (project_id, user_id)
);

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  description text,
  target_audience text,
  market text,
  positioning text,
  tone text,
  objectives text,
  campaign_information text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.competitors (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  name text not null,
  website_url text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.competitor_groups (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.competitor_group_members (
  group_id uuid not null references public.competitor_groups(id) on delete cascade,
  competitor_id uuid not null references public.competitors(id) on delete cascade,
  primary key (group_id, competitor_id)
);

create table public.connector_configs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  source_kind public.source_kind not null,
  mode public.connector_mode not null default 'unavailable',
  display_name text not null,
  enabled boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (project_id, source_kind, display_name)
);

create table public.monitoring_queries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  query text not null,
  parsed_query jsonb,
  enabled boolean not null default true,
  platform_filters public.source_kind[] not null default '{}',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  connector_config_id uuid references public.connector_configs(id) on delete set null,
  kind public.source_kind not null,
  name text not null,
  url text,
  external_id text,
  mode public.connector_mode not null default 'unavailable',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.mentions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  monitoring_query_id uuid references public.monitoring_queries(id) on delete set null,
  source_id uuid not null references public.sources(id) on delete restrict,
  platform public.source_kind not null,
  external_id text,
  author text,
  content text not null,
  url text,
  published_at timestamptz,
  likes integer not null default 0 check (likes >= 0),
  comments integer not null default 0 check (comments >= 0),
  shares integer not null default 0 check (shares >= 0),
  views integer not null default 0 check (views >= 0),
  engagement numeric not null default 0 check (engagement >= 0),
  language text,
  sentiment public.sentiment_kind not null default 'unknown',
  sentiment_score numeric,
  keywords text[] not null default '{}',
  entities jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  is_important boolean not null default false,
  search_vector tsvector generated always as (to_tsvector('english', coalesce(author, '') || ' ' || coalesce(content, ''))) stored,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (source_id, external_id)
);

create index mentions_project_published_idx on public.mentions (project_id, published_at desc);
create index mentions_search_idx on public.mentions using gin (search_vector);
create index mentions_keywords_idx on public.mentions using gin (keywords);

create table public.topics (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (project_id, slug)
);

create table public.mention_topics (
  mention_id uuid not null references public.mentions(id) on delete cascade,
  topic_id uuid not null references public.topics(id) on delete cascade,
  confidence numeric check (confidence between 0 and 1),
  primary key (mention_id, topic_id)
);

create table public.trends (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  topic_id uuid references public.topics(id) on delete set null,
  name text not null,
  description text,
  lifecycle public.lifecycle_stage not null default 'emerging',
  first_detected_at timestamptz,
  mention_volume integer not null default 0,
  growth_rate numeric,
  trend_score numeric check (trend_score between 0 and 100),
  score_factors jsonb not null default '{}'::jsonb,
  audience text,
  platforms public.source_kind[] not null default '{}',
  related_keywords text[] not null default '{}',
  intelligence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.trend_mentions (
  trend_id uuid not null references public.trends(id) on delete cascade,
  mention_id uuid not null references public.mentions(id) on delete cascade,
  weight numeric not null default 1,
  primary key (trend_id, mention_id)
);

create table public.research_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  title text not null,
  url text,
  author text,
  publication text,
  published_at date,
  item_type text not null default 'article',
  notes text,
  key_findings text,
  ai_summary text,
  collection_name text,
  metadata jsonb not null default '{}'::jsonb,
  search_vector tsvector generated always as (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(notes, '') || ' ' || coalesce(key_findings, '') || ' ' || coalesce(ai_summary, ''))) stored,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);
create index research_search_idx on public.research_items using gin (search_vector);

create table public.inspiration_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  title text not null,
  item_type text not null,
  url text,
  thumbnail_url text,
  brand_name text,
  notes text,
  extracted_text text,
  auto_tags text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  search_vector tsvector generated always as (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(brand_name, '') || ' ' || coalesce(notes, '') || ' ' || coalesce(extracted_text, ''))) stored,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);
create index inspiration_search_idx on public.inspiration_items using gin (search_vector);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  color text,
  created_at timestamptz not null default timezone('utc', now()),
  unique (project_id, name)
);

create table public.item_tags (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  item_type public.item_kind not null,
  item_id uuid not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (tag_id, item_type, item_id)
);

create table public.insights (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  title text not null,
  observation text,
  behaviour text,
  tension text,
  insight text not null,
  opportunity text,
  confidence text not null default 'hypothesis' check (confidence in ('strong_signal', 'developing_signal', 'hypothesis')),
  status text not null default 'draft' check (status in ('draft', 'validated', 'archived')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.insight_sources (
  id uuid primary key default gen_random_uuid(),
  insight_id uuid not null references public.insights(id) on delete cascade,
  source_type public.item_kind not null,
  source_id uuid not null,
  claim_type public.claim_kind not null default 'evidence',
  excerpt text,
  created_at timestamptz not null default timezone('utc', now()),
  unique (insight_id, source_type, source_id)
);

create table public.strategy_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  title text not null,
  source_scope jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'complete', 'archived')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.strategy_stages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.strategy_sessions(id) on delete cascade,
  stage text not null check (stage in ('observation', 'pattern', 'tension', 'insight', 'opportunity', 'strategic_proposition')),
  content text not null,
  claim_type public.claim_kind not null,
  position integer not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (session_id, stage)
);

create table public.creative_territories (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  strategy_session_id uuid references public.strategy_sessions(id) on delete set null,
  insight_id uuid references public.insights(id) on delete set null,
  name text not null,
  core_thought text not null,
  cultural_connection text,
  brand_role text,
  audience_truth text,
  possible_executions text,
  social_content_ideas text,
  campaign_idea text,
  tone text,
  risks text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.briefs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  title text not null,
  client text,
  brand text,
  market text,
  business_problem text,
  communication_problem text,
  target_audience text,
  cultural_context text,
  audience_observation text,
  consumer_tension text,
  insight text,
  strategic_opportunity text,
  proposition text,
  reasons_to_believe text,
  tone text,
  mandatories text,
  status text not null default 'draft' check (status in ('draft', 'approved', 'archived')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.brief_sources (
  id uuid primary key default gen_random_uuid(),
  brief_id uuid not null references public.briefs(id) on delete cascade,
  source_type public.item_kind not null,
  source_id uuid not null,
  excerpt text,
  created_at timestamptz not null default timezone('utc', now()),
  unique (brief_id, source_type, source_id)
);

create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  source_scope jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  structured_claims jsonb not null default '[]'::jsonb,
  citations jsonb not null default '[]'::jsonb,
  model text,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.saved_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  item_type public.item_kind not null,
  item_id uuid not null,
  destination text not null default 'project' check (destination in ('project', 'research', 'inspiration', 'insight_evidence', 'brief')),
  note text,
  created_at timestamptz not null default timezone('utc', now()),
  unique (project_id, user_id, item_type, item_id, destination)
);

create or replace function public.can_access_project(target_project_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.projects p where p.id = target_project_id and p.owner_id = auth.uid()
    union all
    select 1 from public.project_members pm where pm.project_id = target_project_id and pm.user_id = auth.uid()
  );
$$;

alter table public.user_profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;

create policy "users manage own profile" on public.user_profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy "members read projects" on public.projects for select using (public.can_access_project(id));
create policy "owners create projects" on public.projects for insert with check (owner_id = auth.uid());
create policy "owners update projects" on public.projects for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owners delete projects" on public.projects for delete using (owner_id = auth.uid());
create policy "members read membership" on public.project_members for select using (public.can_access_project(project_id));
create policy "owners manage membership" on public.project_members for all using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid())) with check (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'brands','competitors','competitor_groups','connector_configs','monitoring_queries','sources','mentions','topics','trends',
    'research_items','inspiration_items','tags','item_tags','insights','strategy_sessions','creative_territories','briefs','ai_conversations','saved_items'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('create policy "project members manage %1$s" on public.%1$I for all using (public.can_access_project(project_id)) with check (public.can_access_project(project_id))', table_name);
  end loop;
end $$;

-- Join tables inherit authorization from their parent records.
alter table public.competitor_group_members enable row level security;
alter table public.mention_topics enable row level security;
alter table public.trend_mentions enable row level security;
alter table public.insight_sources enable row level security;
alter table public.strategy_stages enable row level security;
alter table public.brief_sources enable row level security;
alter table public.ai_messages enable row level security;

create policy "access competitor group members" on public.competitor_group_members for all using (exists (select 1 from public.competitor_groups g where g.id = group_id and public.can_access_project(g.project_id))) with check (exists (select 1 from public.competitor_groups g where g.id = group_id and public.can_access_project(g.project_id)));
create policy "access mention topics" on public.mention_topics for all using (exists (select 1 from public.mentions m where m.id = mention_id and public.can_access_project(m.project_id))) with check (exists (select 1 from public.mentions m where m.id = mention_id and public.can_access_project(m.project_id)));
create policy "access trend mentions" on public.trend_mentions for all using (exists (select 1 from public.trends t where t.id = trend_id and public.can_access_project(t.project_id))) with check (exists (select 1 from public.trends t where t.id = trend_id and public.can_access_project(t.project_id)));
create policy "access insight sources" on public.insight_sources for all using (exists (select 1 from public.insights i where i.id = insight_id and public.can_access_project(i.project_id))) with check (exists (select 1 from public.insights i where i.id = insight_id and public.can_access_project(i.project_id)));
create policy "access strategy stages" on public.strategy_stages for all using (exists (select 1 from public.strategy_sessions s where s.id = session_id and public.can_access_project(s.project_id))) with check (exists (select 1 from public.strategy_sessions s where s.id = session_id and public.can_access_project(s.project_id)));
create policy "access brief sources" on public.brief_sources for all using (exists (select 1 from public.briefs b where b.id = brief_id and public.can_access_project(b.project_id))) with check (exists (select 1 from public.briefs b where b.id = brief_id and public.can_access_project(b.project_id)));
create policy "access ai messages" on public.ai_messages for all using (exists (select 1 from public.ai_conversations c where c.id = conversation_id and public.can_access_project(c.project_id))) with check (exists (select 1 from public.ai_conversations c where c.id = conversation_id and public.can_access_project(c.project_id)));

do $$
declare table_name text;
begin
  foreach table_name in array array['user_profiles','projects','brands','competitors','competitor_groups','connector_configs','monitoring_queries','sources','mentions','topics','trends','research_items','inspiration_items','insights','strategy_sessions','strategy_stages','creative_territories','briefs','ai_conversations'] loop
    execute format('create trigger set_%1$s_updated_at before update on public.%1$I for each row execute function public.set_updated_at()', table_name);
  end loop;
end $$;

comment on column public.trends.trend_score is 'Directional 0–100 score. Not a scientific or causal measure; inspect score_factors.';
comment on table public.insight_sources is 'Evidence links for each insight. Polymorphic source_id integrity is enforced in application services.';
comment on table public.item_tags is 'Cross-library tag links. Polymorphic item_id integrity is enforced in application services.';
comment on table public.saved_items is 'Global save destinations connecting the knowledge graph.';
