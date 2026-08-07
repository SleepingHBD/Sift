-- Radar core: additive changes only. Reuses monitoring_queries, sources,
-- mentions, topics, mention_topics, connector_configs, and saved_items.

alter table public.monitoring_queries
  add column if not exists description text,
  add column if not exists brand_id uuid references public.brands(id) on delete set null,
  add column if not exists language text,
  add column if not exists market text,
  add column if not exists keywords text[] not null default '{}',
  add column if not exists excluded_keywords text[] not null default '{}',
  add column if not exists last_run_at timestamptz;

create table if not exists public.monitoring_query_competitors (
  monitoring_query_id uuid not null references public.monitoring_queries(id) on delete cascade,
  competitor_id uuid not null references public.competitors(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (monitoring_query_id, competitor_id)
);

create table if not exists public.monitor_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  monitoring_query_id uuid not null references public.monitoring_queries(id) on delete cascade,
  connector_config_id uuid references public.connector_configs(id) on delete set null,
  status text not null default 'running' check (status in ('running', 'completed', 'failed', 'cancelled')),
  started_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  mentions_fetched integer not null default 0 check (mentions_fetched >= 0),
  mentions_created integer not null default 0 check (mentions_created >= 0),
  mentions_updated integer not null default 0 check (mentions_updated >= 0),
  error_message text,
  cursor jsonb,
  run_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists monitor_runs_query_started_idx
  on public.monitor_runs (monitoring_query_id, started_at desc);

create index if not exists mentions_query_engagement_idx
  on public.mentions (monitoring_query_id, engagement desc);

create table if not exists public.mention_notes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  mention_id uuid not null references public.mentions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (mention_id, user_id)
);

alter table public.saved_items
  add column if not exists destination_id uuid,
  add column if not exists source_excerpt text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.saved_items
  drop constraint if exists saved_items_project_id_user_id_item_type_item_id_destination_key;

create unique index if not exists saved_items_destination_idx
  on public.saved_items (
    project_id,
    user_id,
    item_type,
    item_id,
    destination,
    coalesce(destination_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

alter table public.monitoring_query_competitors enable row level security;
alter table public.monitor_runs enable row level security;
alter table public.mention_notes enable row level security;

create policy "project members manage monitor runs"
  on public.monitor_runs for all
  using (public.can_access_project(project_id))
  with check (public.can_access_project(project_id));

create policy "project members manage mention notes"
  on public.mention_notes for all
  using (public.can_access_project(project_id) and user_id = auth.uid())
  with check (public.can_access_project(project_id) and user_id = auth.uid());

create policy "project members manage query competitors"
  on public.monitoring_query_competitors for all
  using (
    exists (
      select 1 from public.monitoring_queries query
      where query.id = monitoring_query_id
        and public.can_access_project(query.project_id)
    )
  )
  with check (
    exists (
      select 1 from public.monitoring_queries query
      where query.id = monitoring_query_id
        and public.can_access_project(query.project_id)
    )
  );

create trigger set_monitor_runs_updated_at
  before update on public.monitor_runs
  for each row execute function public.set_updated_at();

create trigger set_mention_notes_updated_at
  before update on public.mention_notes
  for each row execute function public.set_updated_at();

comment on table public.monitor_runs is 'Auditable connector executions for a monitoring query.';
comment on column public.monitoring_queries.parsed_query is 'Canonical query-builder representation: includeAll, includeAny, and exclude arrays.';
comment on column public.saved_items.destination_id is 'Optional target record for evidence destinations such as an insight or brief.';
