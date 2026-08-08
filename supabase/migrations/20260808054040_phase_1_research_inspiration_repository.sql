-- Phase 1: make Research and Inspiration safe cloud repositories.
-- Stable client references make browser-data imports idempotent while keeping
-- the existing project-scoped evidence tables and relationships intact.

alter table public.research_items
  add column if not exists client_ref text;

alter table public.inspiration_items
  add column if not exists client_ref text;

alter table public.research_items
  alter column created_by set default auth.uid();

alter table public.inspiration_items
  alter column created_by set default auth.uid();

comment on column public.research_items.client_ref is
  'Stable identifier supplied by Sift clients for retry-safe creation and browser-data migration.';

comment on column public.inspiration_items.client_ref is
  'Stable identifier supplied by Sift clients for retry-safe creation and browser-data migration.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'research_items_project_client_ref_key'
      and conrelid = 'public.research_items'::regclass
  ) then
    alter table public.research_items
      add constraint research_items_project_client_ref_key
      unique (project_id, client_ref);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'inspiration_items_project_client_ref_key'
      and conrelid = 'public.inspiration_items'::regclass
  ) then
    alter table public.inspiration_items
      add constraint inspiration_items_project_client_ref_key
      unique (project_id, client_ref);
  end if;
end
$$;

create index if not exists research_items_project_created_cursor_idx
  on public.research_items (project_id, created_at desc, id desc);

create index if not exists inspiration_items_project_created_cursor_idx
  on public.inspiration_items (project_id, created_at desc, id desc);

drop policy if exists "research insert creator is caller" on public.research_items;
create policy "research insert creator is caller"
on public.research_items
as restrictive
for insert
to authenticated
with check (created_by = (select auth.uid()));

drop policy if exists "inspiration insert creator is caller" on public.inspiration_items;
create policy "inspiration insert creator is caller"
on public.inspiration_items
as restrictive
for insert
to authenticated
with check (created_by = (select auth.uid()));
