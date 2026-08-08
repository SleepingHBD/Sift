-- Phase 1: durable, per-user Radar annotations and evidence routing.

alter table public.mention_notes
  alter column user_id set default auth.uid();

alter table public.saved_items
  alter column user_id set default auth.uid();

alter table public.saved_items
  drop constraint if exists saved_items_project_id_user_id_item_type_item_id_destinatio_key;

drop index if exists public.saved_items_destination_idx;

alter table public.saved_items
  drop constraint if exists saved_items_destination_check;

alter table public.saved_items
  add constraint saved_items_destination_check
  check (
    destination = any (array[
      'saved',
      'project',
      'research',
      'inspiration',
      'insight_evidence',
      'insight_seed',
      'brief'
    ])
  );

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'saved_items_destination_key'
      and conrelid = 'public.saved_items'::regclass
  ) then
    alter table public.saved_items
      add constraint saved_items_destination_key
      unique nulls not distinct (
        project_id,
        user_id,
        item_type,
        item_id,
        destination,
        destination_id
      );
  end if;
end
$$;

alter policy "project members manage saved_items"
  on public.saved_items
  using (
    public.can_access_project(project_id)
    and user_id = (select auth.uid())
  )
  with check (
    public.can_access_project(project_id)
    and user_id = (select auth.uid())
  );

drop policy if exists "saved mention belongs to its project"
  on public.saved_items;

create policy "saved mention belongs to its project"
  on public.saved_items
  as restrictive
  for all
  to authenticated
  using (
    item_type <> 'mention'::public.item_kind
    or exists (
      select 1
      from public.mentions mention
      where mention.id = item_id
        and mention.project_id = saved_items.project_id
    )
  )
  with check (
    item_type <> 'mention'::public.item_kind
    or exists (
      select 1
      from public.mentions mention
      where mention.id = item_id
        and mention.project_id = saved_items.project_id
    )
  );

alter policy "project members manage mention notes"
  on public.mention_notes
  using (
    public.can_access_project(project_id)
    and user_id = (select auth.uid())
    and exists (
      select 1
      from public.mentions mention
      where mention.id = mention_id
        and mention.project_id = mention_notes.project_id
    )
  )
  with check (
    public.can_access_project(project_id)
    and user_id = (select auth.uid())
    and exists (
      select 1
      from public.mentions mention
      where mention.id = mention_id
        and mention.project_id = mention_notes.project_id
    )
  );

create index if not exists mention_notes_user_project_updated_cursor_idx
  on public.mention_notes (user_id, project_id, updated_at desc, id desc);

create index if not exists saved_items_user_project_kind_created_cursor_idx
  on public.saved_items (user_id, project_id, item_type, created_at desc, id desc);

comment on constraint saved_items_destination_key on public.saved_items is
  'One per-user routing relationship per source and optional destination record; NULL destination IDs compare as equal.';
