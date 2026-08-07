-- Stable client references let the static personal workspace map to
-- authenticated cloud records without assuming local IDs are UUIDs.

alter table public.projects
  add column if not exists client_ref text;

create unique index if not exists projects_owner_client_ref_idx
  on public.projects (owner_id, client_ref)
  where client_ref is not null;

alter table public.monitoring_queries
  add column if not exists client_ref text;

create unique index if not exists monitoring_queries_project_client_ref_idx
  on public.monitoring_queries (project_id, client_ref)
  where client_ref is not null;

create unique index if not exists sources_project_kind_external_idx
  on public.sources (project_id, kind, external_id)
  where external_id is not null;

comment on column public.projects.client_ref is 'Stable identifier from a client workspace; scoped to the authenticated owner.';
comment on column public.monitoring_queries.client_ref is 'Stable identifier from a client-created Radar monitor; scoped to its project.';
