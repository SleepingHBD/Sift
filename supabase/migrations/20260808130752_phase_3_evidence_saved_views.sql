-- Phase 3: private, durable Evidence Inbox views.
-- A saved view stores only user-selected retrieval and presentation settings;
-- evidence remains authoritative in its existing source tables.

create table public.evidence_saved_views (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  search_query text not null default '',
  project_id uuid references public.projects(id) on delete set null,
  kind_filter text not null default 'all',
  view_filter text not null default 'all',
  sort_order text not null default 'newest',
  group_by text not null default 'none',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint evidence_saved_views_name_check
    check (char_length(btrim(name)) between 1 and 80),
  constraint evidence_saved_views_search_query_check
    check (char_length(search_query) <= 500),
  constraint evidence_saved_views_kind_filter_check
    check (kind_filter in ('all', 'mention', 'research', 'inspiration')),
  constraint evidence_saved_views_view_filter_check
    check (view_filter in ('all', 'needs-review', 'recent')),
  constraint evidence_saved_views_sort_order_check
    check (sort_order in ('newest', 'oldest', 'recently-reviewed', 'source', 'project')),
  constraint evidence_saved_views_group_by_check
    check (group_by in ('none', 'project', 'kind', 'status'))
);

create unique index evidence_saved_views_owner_name_idx
  on public.evidence_saved_views (owner_id, lower(btrim(name)));

create index evidence_saved_views_owner_updated_idx
  on public.evidence_saved_views (owner_id, updated_at desc, id);

create index evidence_saved_views_project_id_idx
  on public.evidence_saved_views (project_id);

create trigger set_evidence_saved_views_updated_at
before update on public.evidence_saved_views
for each row execute function public.set_updated_at();

alter table public.evidence_saved_views enable row level security;

create policy "users read own evidence saved views"
on public.evidence_saved_views
for select
to authenticated
using ((select auth.uid()) = owner_id);

create policy "users create own evidence saved views"
on public.evidence_saved_views
for insert
to authenticated
with check (
  (select auth.uid()) = owner_id
  and (
    project_id is null
    or (select public.can_access_project(project_id))
  )
);

create policy "users update own evidence saved views"
on public.evidence_saved_views
for update
to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and (
    project_id is null
    or (select public.can_access_project(project_id))
  )
);

create policy "users delete own evidence saved views"
on public.evidence_saved_views
for delete
to authenticated
using ((select auth.uid()) = owner_id);

revoke all on table public.evidence_saved_views from public, anon;
grant select, insert, update, delete on table public.evidence_saved_views to authenticated;

comment on table public.evidence_saved_views is
  'Private named Evidence Inbox retrieval and presentation settings; contains no copied evidence content.';
comment on column public.evidence_saved_views.project_id is
  'Optional source or linked-project filter. Null means all projects accessible to the owner.';
