-- Phase 3: safe, shared organization for normalized evidence.
--
-- Existing source rows remain authoritative. Project assignment is represented
-- by saved_items.destination_id, while user-created tags use tags/item_tags.
-- Restrictive policies keep every polymorphic link attached to an accessible,
-- project-matched source record.

drop policy if exists "saved mention belongs to its project"
  on public.saved_items;
drop policy if exists "saved evidence belongs to its source project"
  on public.saved_items;

create policy "saved evidence belongs to its source project"
on public.saved_items
as restrictive
for all
to authenticated
using (
  item_type not in (
    'mention'::public.item_kind,
    'research'::public.item_kind,
    'inspiration'::public.item_kind
  )
  or (item_type = 'mention'::public.item_kind and exists (
    select 1 from public.mentions mention
    where mention.id = item_id
      and mention.project_id = saved_items.project_id
      and public.can_access_project(mention.project_id)
  ))
  or (item_type = 'research'::public.item_kind and exists (
    select 1 from public.research_items research
    where research.id = item_id
      and research.project_id = saved_items.project_id
      and public.can_access_project(research.project_id)
  ))
  or (item_type = 'inspiration'::public.item_kind and exists (
    select 1 from public.inspiration_items inspiration
    where inspiration.id = item_id
      and inspiration.project_id = saved_items.project_id
      and public.can_access_project(inspiration.project_id)
  ))
)
with check (
  item_type not in (
    'mention'::public.item_kind,
    'research'::public.item_kind,
    'inspiration'::public.item_kind
  )
  or (item_type = 'mention'::public.item_kind and exists (
    select 1 from public.mentions mention
    where mention.id = item_id
      and mention.project_id = saved_items.project_id
      and public.can_access_project(mention.project_id)
  ))
  or (item_type = 'research'::public.item_kind and exists (
    select 1 from public.research_items research
    where research.id = item_id
      and research.project_id = saved_items.project_id
      and public.can_access_project(research.project_id)
  ))
  or (item_type = 'inspiration'::public.item_kind and exists (
    select 1 from public.inspiration_items inspiration
    where inspiration.id = item_id
      and inspiration.project_id = saved_items.project_id
      and public.can_access_project(inspiration.project_id)
  ))
);

drop policy if exists "project evidence links target an accessible project"
  on public.saved_items;

create policy "project evidence links target an accessible project"
on public.saved_items
as restrictive
for all
to authenticated
using (
  destination <> 'project'
  or destination_id is null
  or public.can_access_project(destination_id)
)
with check (
  destination <> 'project'
  or destination_id is null
  or public.can_access_project(destination_id)
);

drop policy if exists "evidence tags belong to their project"
  on public.item_tags;

create policy "evidence tags belong to their project"
on public.item_tags
as restrictive
for all
to authenticated
using (
  exists (
    select 1 from public.tags tag
    where tag.id = tag_id
      and tag.project_id = item_tags.project_id
  )
)
with check (
  exists (
    select 1 from public.tags tag
    where tag.id = tag_id
      and tag.project_id = item_tags.project_id
  )
);

drop policy if exists "evidence tag links match their source project"
  on public.item_tags;

create policy "evidence tag links match their source project"
on public.item_tags
as restrictive
for all
to authenticated
using (
  item_type not in (
    'mention'::public.item_kind,
    'research'::public.item_kind,
    'inspiration'::public.item_kind
  )
  or (item_type = 'mention'::public.item_kind and exists (
    select 1 from public.mentions mention
    where mention.id = item_id
      and mention.project_id = item_tags.project_id
  ))
  or (item_type = 'research'::public.item_kind and exists (
    select 1 from public.research_items research
    where research.id = item_id
      and research.project_id = item_tags.project_id
  ))
  or (item_type = 'inspiration'::public.item_kind and exists (
    select 1 from public.inspiration_items inspiration
    where inspiration.id = item_id
      and inspiration.project_id = item_tags.project_id
  ))
)
with check (
  item_type not in (
    'mention'::public.item_kind,
    'research'::public.item_kind,
    'inspiration'::public.item_kind
  )
  or (item_type = 'mention'::public.item_kind and exists (
    select 1 from public.mentions mention
    where mention.id = item_id
      and mention.project_id = item_tags.project_id
  ))
  or (item_type = 'research'::public.item_kind and exists (
    select 1 from public.research_items research
    where research.id = item_id
      and research.project_id = item_tags.project_id
  ))
  or (item_type = 'inspiration'::public.item_kind and exists (
    select 1 from public.inspiration_items inspiration
    where inspiration.id = item_id
      and inspiration.project_id = item_tags.project_id
  ))
);

create index if not exists item_tags_project_item_lookup_idx
  on public.item_tags (project_id, item_type, item_id, tag_id);

create index if not exists saved_items_project_links_lookup_idx
  on public.saved_items (user_id, project_id, item_type, item_id, destination_id)
  where destination = 'project';

comment on policy "saved evidence belongs to its source project"
  on public.saved_items is
  'Restricts supported evidence links to an accessible source row in the same source project.';
comment on policy "project evidence links target an accessible project"
  on public.saved_items is
  'Project evidence links may only target another project available to the current user.';
