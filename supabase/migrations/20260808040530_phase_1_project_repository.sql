-- Phase 1: make authenticated project records safe for direct Data API CRUD
-- and idempotent browser-storage migration.

-- Client code must not need to supply its own owner identifier. RLS still
-- checks the resulting value against the verified JWT for every write.
alter table public.projects
  alter column owner_id set default auth.uid();

-- A full unique constraint supports PostgREST ON CONFLICT. PostgreSQL permits
-- multiple NULL client references, while every imported or newly created Sift
-- project receives a stable non-null client reference.
drop index if exists public.projects_owner_client_ref_idx;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'projects_owner_client_ref_key'
      and conrelid = 'public.projects'::regclass
  ) then
    alter table public.projects
      add constraint projects_owner_client_ref_key unique (owner_id, client_ref);
  end if;
end
$$;

-- Covers the repository's owner/status ordering path and ownership policies.
create index if not exists projects_owner_status_created_idx
  on public.projects (owner_id, status, created_at desc);

comment on column public.projects.owner_id is
  'Permanent Sift owner. Defaults to the authenticated JWT identity and is enforced by RLS.';
