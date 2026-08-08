-- Phase 2: private screenshot and document evidence.
--
-- Files live in a private Storage bucket. The browser receives no privileged
-- key: authenticated requests are authorized by project membership and the
-- uploader-scoped path written by the client.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'evidence-assets',
  'evidence-assets',
  false,
  20971520,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table public.evidence_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  research_item_id uuid not null references public.research_items(id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  bucket_id text not null default 'evidence-assets'
    check (bucket_id = 'evidence-assets'),
  storage_path text not null
    check (length(storage_path) between 1 and 1024),
  original_filename text not null
    check (length(original_filename) between 1 and 255),
  mime_type text not null
    check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  byte_size bigint not null
    check (byte_size between 1 and 20971520),
  asset_kind text not null
    check (asset_kind in ('image', 'document')),
  processing_status text not null default 'ready'
    check (processing_status in ('pending', 'ready', 'failed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (bucket_id, storage_path)
);

comment on table public.evidence_assets is
  'Private file metadata for research evidence. Storage objects remain in the private evidence-assets bucket.';

create index evidence_assets_research_item_id_idx
  on public.evidence_assets (research_item_id);

create index evidence_assets_project_created_cursor_idx
  on public.evidence_assets (project_id, created_at desc, id desc);

create index evidence_assets_created_by_idx
  on public.evidence_assets (created_by);

create trigger set_evidence_assets_updated_at
before update on public.evidence_assets
for each row execute function public.set_updated_at();

alter table public.evidence_assets enable row level security;

-- Validate the project folder without ever casting attacker-controlled text
-- until it has passed a UUID shape check. The helper is used only by Storage
-- policies and reveals a boolean for the current caller.
create or replace function private.can_access_evidence_storage_path(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  folders text[];
  project_folder text;
begin
  if (select auth.uid()) is null then
    return false;
  end if;

  folders := storage.foldername(object_name);
  project_folder := folders[2];

  if project_folder is null
    or project_folder !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then
    return false;
  end if;

  return private.can_access_project(project_folder::uuid);
end;
$$;

revoke all on function private.can_access_evidence_storage_path(text)
  from public, anon, authenticated, service_role;
grant execute on function private.can_access_evidence_storage_path(text)
  to authenticated, service_role;

revoke all on table public.evidence_assets from public, anon;
grant select, insert, delete on table public.evidence_assets to authenticated, service_role;

create policy "project members read evidence assets"
on public.evidence_assets
for select
to authenticated
using (public.can_access_project(project_id));

create policy "project members create evidence assets"
on public.evidence_assets
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and public.can_access_project(project_id)
  and (storage.foldername(storage_path))[1] = (select auth.uid())::text
  and (storage.foldername(storage_path))[2] = project_id::text
  and private.can_access_evidence_storage_path(storage_path)
  and exists (
    select 1
    from public.research_items research
    where research.id = research_item_id
      and research.project_id = evidence_assets.project_id
  )
);

create policy "project members delete evidence assets"
on public.evidence_assets
for delete
to authenticated
using (public.can_access_project(project_id));

drop policy if exists "project members read evidence storage" on storage.objects;
create policy "project members read evidence storage"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'evidence-assets'
  and private.can_access_evidence_storage_path(name)
);

drop policy if exists "project members upload evidence storage" on storage.objects;
create policy "project members upload evidence storage"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'evidence-assets'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and private.can_access_evidence_storage_path(name)
);

drop policy if exists "project members delete evidence storage" on storage.objects;
create policy "project members delete evidence storage"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'evidence-assets'
  and private.can_access_evidence_storage_path(name)
);
