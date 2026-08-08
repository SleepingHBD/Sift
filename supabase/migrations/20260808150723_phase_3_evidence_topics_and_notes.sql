-- Phase 3: project-scoped strategist topics and editable evidence notes.
--
-- Strategist-created topics are deliberately separate from Radar's detected
-- topics. Source rows remain authoritative; notes update only their dedicated
-- annotation field and never rewrite preserved source content.

create table public.evidence_topics (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  slug text not null check (char_length(btrim(slug)) between 1 and 80),
  description text check (description is null or char_length(description) <= 500),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (project_id, slug),
  unique (id, project_id)
);

create table public.evidence_topic_assignments (
  project_id uuid not null references public.projects(id) on delete cascade,
  topic_id uuid not null,
  item_type public.item_kind not null check (
    item_type in (
      'mention'::public.item_kind,
      'research'::public.item_kind,
      'inspiration'::public.item_kind
    )
  ),
  item_id uuid not null,
  assigned_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (topic_id, item_type, item_id),
  foreign key (topic_id, project_id)
    references public.evidence_topics(id, project_id)
    on delete cascade
);

create index evidence_topics_project_name_idx
  on public.evidence_topics (project_id, name);

create index evidence_topics_created_by_idx
  on public.evidence_topics (created_by);

create index evidence_topics_search_idx
  on public.evidence_topics
  using gin (to_tsvector('english'::regconfig, name));

create index evidence_topic_assignments_item_lookup_idx
  on public.evidence_topic_assignments (project_id, item_type, item_id, topic_id);

create index evidence_topic_assignments_assigned_by_idx
  on public.evidence_topic_assignments (assigned_by);

create trigger set_evidence_topics_updated_at
  before update on public.evidence_topics
  for each row execute function public.set_updated_at();

alter table public.evidence_topics enable row level security;
alter table public.evidence_topic_assignments enable row level security;

create policy "project members manage evidence topics"
on public.evidence_topics
for all
to authenticated
using (public.can_access_project(project_id))
with check (public.can_access_project(project_id));

create policy "permanent authenticated users only"
on public.evidence_topics
as restrictive
for all
to authenticated
using (coalesce((((select auth.jwt()) ->> 'is_anonymous'))::boolean, true) is false)
with check (coalesce((((select auth.jwt()) ->> 'is_anonymous'))::boolean, true) is false);

create policy "project members manage evidence topic assignments"
on public.evidence_topic_assignments
for all
to authenticated
using (public.can_access_project(project_id))
with check (public.can_access_project(project_id));

create policy "evidence topic assignments match their source"
on public.evidence_topic_assignments
as restrictive
for all
to authenticated
using (
  (item_type = 'mention'::public.item_kind and exists (
    select 1 from public.mentions mention
    where mention.id = item_id
      and mention.project_id = evidence_topic_assignments.project_id
  ))
  or (item_type = 'research'::public.item_kind and exists (
    select 1 from public.research_items research
    where research.id = item_id
      and research.project_id = evidence_topic_assignments.project_id
  ))
  or (item_type = 'inspiration'::public.item_kind and exists (
    select 1 from public.inspiration_items inspiration
    where inspiration.id = item_id
      and inspiration.project_id = evidence_topic_assignments.project_id
  ))
)
with check (
  (item_type = 'mention'::public.item_kind and exists (
    select 1 from public.mentions mention
    where mention.id = item_id
      and mention.project_id = evidence_topic_assignments.project_id
  ))
  or (item_type = 'research'::public.item_kind and exists (
    select 1 from public.research_items research
    where research.id = item_id
      and research.project_id = evidence_topic_assignments.project_id
  ))
  or (item_type = 'inspiration'::public.item_kind and exists (
    select 1 from public.inspiration_items inspiration
    where inspiration.id = item_id
      and inspiration.project_id = evidence_topic_assignments.project_id
  ))
);

create policy "permanent authenticated users only"
on public.evidence_topic_assignments
as restrictive
for all
to authenticated
using (coalesce((((select auth.jwt()) ->> 'is_anonymous'))::boolean, true) is false)
with check (coalesce((((select auth.jwt()) ->> 'is_anonymous'))::boolean, true) is false);

grant select, insert, update, delete
  on public.evidence_topics, public.evidence_topic_assignments
  to authenticated, service_role;

revoke all
  on public.evidence_topics, public.evidence_topic_assignments
  from anon;

create or replace function public.update_evidence_note(
  p_item_type text,
  p_item_id uuid,
  p_project_id uuid,
  p_note text
)
returns table (notes text)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  clean_note text := nullif(btrim(coalesce(p_note, '')), '');
  affected_rows integer := 0;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if p_item_type not in ('mention', 'research', 'inspiration') then
    raise exception 'Unsupported evidence kind.' using errcode = '22023';
  end if;

  if char_length(coalesce(p_note, '')) > 10000 then
    raise exception 'Strategist notes must be 10,000 characters or fewer.' using errcode = '22023';
  end if;

  if p_item_type = 'mention' then
    update public.mentions
    set metadata = case
      when clean_note is null then metadata - 'strategist_note'
      else jsonb_set(metadata, '{strategist_note}', to_jsonb(clean_note), true)
    end
    where id = p_item_id
      and project_id = p_project_id;
  elsif p_item_type = 'research' then
    update public.research_items
    set notes = clean_note
    where id = p_item_id
      and project_id = p_project_id;
  else
    update public.inspiration_items
    set notes = clean_note
    where id = p_item_id
      and project_id = p_project_id;
  end if;

  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    raise exception 'The evidence note could not be updated for this project.' using errcode = '42501';
  end if;

  return query select clean_note;
end;
$$;

revoke all on function public.update_evidence_note(text, uuid, uuid, text)
  from public, anon;
grant execute on function public.update_evidence_note(text, uuid, uuid, text)
  to authenticated;

comment on table public.evidence_topics is
  'Project-scoped strategist taxonomy, separate from detected Radar topics.';
comment on table public.evidence_topic_assignments is
  'RLS-scoped manual topic assignments that reference authoritative evidence rows.';
comment on function public.update_evidence_note(text, uuid, uuid, text) is
  'RLS-invoker mutation for strategist notes without rewriting preserved source content.';

create or replace function public.search_evidence_page(
  p_search text default null,
  p_project_id uuid default null,
  p_kind text default null,
  p_review_status text default null,
  p_recent_after timestamptz default null,
  p_sort text default 'newest',
  p_cursor jsonb default null,
  p_page_size integer default 50
)
returns table (
  evidence jsonb,
  cursor_value jsonb
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  clean_search text := nullif(btrim(p_search), '');
  search_query tsquery;
  page_size integer := least(greatest(coalesce(p_page_size, 50), 1), 100);
  cursor_primary_text text;
  cursor_primary_time timestamptz;
  cursor_secondary_time timestamptz;
  cursor_key_value text;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if p_kind is not null and p_kind not in ('mention', 'research', 'inspiration') then
    raise exception 'Unsupported evidence kind.' using errcode = '22023';
  end if;

  if p_review_status is not null
    and p_review_status not in ('unreviewed', 'relevant', 'irrelevant', 'archived') then
    raise exception 'Unsupported review status.' using errcode = '22023';
  end if;

  if p_sort not in ('newest', 'oldest', 'recently-reviewed', 'source', 'project') then
    raise exception 'Unsupported evidence sort.' using errcode = '22023';
  end if;

  if clean_search is not null then
    search_query := websearch_to_tsquery('english'::regconfig, clean_search);
    if numnode(search_query) = 0 then
      clean_search := null;
    end if;
  end if;

  if p_cursor is not null then
    if p_cursor ->> 'sort' is distinct from p_sort then
      raise exception 'The evidence cursor does not match the active sort.' using errcode = '22023';
    end if;

    cursor_primary_text := p_cursor ->> 'primary';
    cursor_key_value := p_cursor ->> 'key';
    if cursor_primary_text is null or cursor_key_value is null then
      raise exception 'The evidence cursor is incomplete.' using errcode = '22023';
    end if;

    begin
      if p_sort in ('newest', 'oldest', 'recently-reviewed') then
        cursor_primary_time := cursor_primary_text::timestamptz;
      end if;
      if p_sort in ('recently-reviewed', 'source', 'project') then
        cursor_secondary_time := (p_cursor ->> 'secondary')::timestamptz;
      end if;
    exception when invalid_datetime_format then
      raise exception 'The evidence cursor contains an invalid timestamp.' using errcode = '22023';
    end;
  end if;

  return query
  with source_evidence as (
    select
      'mention'::text as kind,
      mention.id as item_id,
      mention.external_id as client_ref,
      mention.project_id,
      project.name as project_name,
      case
        when nullif(btrim(mention.author), '') is not null
          then coalesce(source.name, initcap(replace(mention.platform::text, '_', ' '))) || ' Â· ' || mention.author
        else coalesce(source.name, initcap(replace(mention.platform::text, '_', ' ')))
      end as title,
      mention.author,
      coalesce(source.name, initcap(replace(mention.platform::text, '_', ' '))) as source_label,
      mention.url as original_url,
      mention.content as original_content,
      mention.published_at::text as published_at,
      mention.created_at as captured_at,
      nullif(mention.metadata ->> 'strategist_note', '') as notes,
      mention.keywords as source_tags,
      mention.language,
      coalesce(nullif(mention.metadata ->> 'processing_status', ''), 'processed') as processing_status,
      mention.review_status,
      mention.reviewed_at,
      mention.metadata,
      null::text as item_type,
      null::text as collection_name,
      null::text as key_findings,
      null::text as ai_summary,
      null::text as brand_name,
      null::text as thumbnail_url,
      mention.monitoring_query_id::text as monitor_id,
      mention.platform::text as platform,
      coalesce(mention.external_id, mention.id::text) as external_id,
      mention.engagement,
      mention.sentiment::text as sentiment
    from public.mentions mention
    join public.projects project on project.id = mention.project_id
    left join public.sources source on source.id = mention.source_id
    where project.client_ref is distinct from 'personal-radar'
      and (p_kind is null or p_kind = 'mention')
      and (p_review_status is null or mention.review_status = p_review_status)
      and (p_recent_after is null or mention.created_at >= p_recent_after)
      and (
        p_project_id is null
        or mention.project_id = p_project_id
        or exists (
          select 1
          from public.saved_items link
          where link.user_id = (select auth.uid())
            and link.project_id = mention.project_id
            and link.item_type = 'mention'::public.item_kind
            and link.item_id = mention.id
            and link.destination = 'project'
            and link.destination_id = p_project_id
        )
      )
      and (
        clean_search is null
        or mention.search_vector @@ search_query
        or to_tsvector('english'::regconfig, coalesce(mention.metadata ->> 'strategist_note', '')) @@ search_query
        or to_tsvector('english'::regconfig, coalesce(source.name, '')) @@ search_query
        or to_tsvector('english'::regconfig, coalesce(array_to_json(mention.keywords)::text, '')) @@ search_query
        or exists (
          select 1
          from public.mention_topics mention_topic
          join public.topics topic on topic.id = mention_topic.topic_id
          where mention_topic.mention_id = mention.id
            and to_tsvector('english'::regconfig, topic.name) @@ search_query
        )
        or exists (
          select 1
          from public.item_tags item_tag
          join public.tags tag on tag.id = item_tag.tag_id
          where item_tag.project_id = mention.project_id
            and item_tag.item_type = 'mention'::public.item_kind
            and item_tag.item_id = mention.id
            and to_tsvector('english'::regconfig, tag.name) @@ search_query
        )
        or exists (
          select 1
          from public.evidence_topic_assignments assignment
          join public.evidence_topics evidence_topic on evidence_topic.id = assignment.topic_id
          where assignment.project_id = mention.project_id
            and assignment.item_type = 'mention'::public.item_kind
            and assignment.item_id = mention.id
            and to_tsvector('english'::regconfig, evidence_topic.name) @@ search_query
        )
      )

    union all

    select
      'research'::text,
      research.id,
      research.client_ref,
      research.project_id,
      project.name,
      research.title,
      research.author,
      coalesce(nullif(research.publication, ''), nullif(research.metadata ->> 'source_label', ''), 'Personal research'),
      research.url,
      coalesce(
        nullif(research.metadata ->> 'source_text', ''),
        nullif(research.metadata ->> 'sourceText', ''),
        nullif(research.metadata ->> 'quoted_text', ''),
        nullif(research.metadata ->> 'quotedText', '')
      ),
      research.published_at::text,
      research.created_at,
      coalesce(research.notes, research.key_findings, research.ai_summary),
      coalesce(
        array(
          select jsonb_array_elements_text(
            case when jsonb_typeof(research.metadata -> 'tags') = 'array'
              then research.metadata -> 'tags'
              else '[]'::jsonb
            end
          )
        ),
        '{}'::text[]
      ),
      nullif(research.metadata ->> 'language', ''),
      coalesce(
        nullif(research.metadata ->> 'processing_status', ''),
        case when research.ai_summary is null then 'unprocessed' else 'processed' end
      ),
      research.review_status,
      research.reviewed_at,
      research.metadata,
      research.item_type,
      coalesce(research.collection_name, 'Unsorted'),
      research.key_findings,
      research.ai_summary,
      null::text,
      null::text,
      null::text,
      null::text,
      research.id::text,
      0::numeric,
      null::text
    from public.research_items research
    join public.projects project on project.id = research.project_id
    where project.client_ref is distinct from 'personal-radar'
      and (p_kind is null or p_kind = 'research')
      and (p_review_status is null or research.review_status = p_review_status)
      and (p_recent_after is null or research.created_at >= p_recent_after)
      and (
        p_project_id is null
        or research.project_id = p_project_id
        or exists (
          select 1
          from public.saved_items link
          where link.user_id = (select auth.uid())
            and link.project_id = research.project_id
            and link.item_type = 'research'::public.item_kind
            and link.item_id = research.id
            and link.destination = 'project'
            and link.destination_id = p_project_id
        )
      )
      and (
        clean_search is null
        or research.search_vector @@ search_query
        or to_tsvector(
          'english'::regconfig,
          concat_ws(' ', research.author, research.publication, research.collection_name,
            research.metadata ->> 'source_text', research.metadata ->> 'sourceText', research.metadata ->> 'tags')
        ) @@ search_query
        or exists (
          select 1
          from public.item_tags item_tag
          join public.tags tag on tag.id = item_tag.tag_id
          where item_tag.project_id = research.project_id
            and item_tag.item_type = 'research'::public.item_kind
            and item_tag.item_id = research.id
            and to_tsvector('english'::regconfig, tag.name) @@ search_query
        )
        or exists (
          select 1
          from public.evidence_topic_assignments assignment
          join public.evidence_topics evidence_topic on evidence_topic.id = assignment.topic_id
          where assignment.project_id = research.project_id
            and assignment.item_type = 'research'::public.item_kind
            and assignment.item_id = research.id
            and to_tsvector('english'::regconfig, evidence_topic.name) @@ search_query
        )
      )

    union all

    select
      'inspiration'::text,
      inspiration.id,
      inspiration.client_ref,
      inspiration.project_id,
      project.name,
      inspiration.title,
      nullif(inspiration.metadata ->> 'author', ''),
      coalesce(nullif(inspiration.metadata ->> 'source_label', ''), nullif(inspiration.url, ''), 'Personal inspiration'),
      inspiration.url,
      coalesce(inspiration.extracted_text, nullif(inspiration.metadata ->> 'source_text', ''), nullif(inspiration.metadata ->> 'sourceText', '')),
      coalesce(nullif(inspiration.metadata ->> 'published_at', ''), nullif(inspiration.metadata ->> 'publishedAt', '')),
      inspiration.created_at,
      inspiration.notes,
      inspiration.auto_tags,
      nullif(inspiration.metadata ->> 'language', ''),
      coalesce(
        nullif(inspiration.metadata ->> 'processing_status', ''),
        case when inspiration.extracted_text is null then 'unprocessed' else 'processed' end
      ),
      inspiration.review_status,
      inspiration.reviewed_at,
      inspiration.metadata,
      inspiration.item_type,
      null::text,
      null::text,
      null::text,
      coalesce(inspiration.brand_name, 'Personal workspace'),
      inspiration.thumbnail_url,
      null::text,
      null::text,
      inspiration.id::text,
      0::numeric,
      null::text
    from public.inspiration_items inspiration
    join public.projects project on project.id = inspiration.project_id
    where project.client_ref is distinct from 'personal-radar'
      and (p_kind is null or p_kind = 'inspiration')
      and (p_review_status is null or inspiration.review_status = p_review_status)
      and (p_recent_after is null or inspiration.created_at >= p_recent_after)
      and (
        p_project_id is null
        or inspiration.project_id = p_project_id
        or exists (
          select 1
          from public.saved_items link
          where link.user_id = (select auth.uid())
            and link.project_id = inspiration.project_id
            and link.item_type = 'inspiration'::public.item_kind
            and link.item_id = inspiration.id
            and link.destination = 'project'
            and link.destination_id = p_project_id
        )
      )
      and (
        clean_search is null
        or inspiration.search_vector @@ search_query
        or to_tsvector(
          'english'::regconfig,
          concat_ws(' ', inspiration.metadata ->> 'source_label', inspiration.metadata ->> 'author', array_to_json(inspiration.auto_tags)::text)
        ) @@ search_query
        or exists (
          select 1
          from public.item_tags item_tag
          join public.tags tag on tag.id = item_tag.tag_id
          where item_tag.project_id = inspiration.project_id
            and item_tag.item_type = 'inspiration'::public.item_kind
            and item_tag.item_id = inspiration.id
            and to_tsvector('english'::regconfig, tag.name) @@ search_query
        )
        or exists (
          select 1
          from public.evidence_topic_assignments assignment
          join public.evidence_topics evidence_topic on evidence_topic.id = assignment.topic_id
          where assignment.project_id = inspiration.project_id
            and assignment.item_type = 'inspiration'::public.item_kind
            and assignment.item_id = inspiration.id
            and to_tsvector('english'::regconfig, evidence_topic.name) @@ search_query
        )
      )
  ),
  prepared as (
    select
      source_evidence.*,
      coalesce(reviewed_at, '-infinity'::timestamptz) as review_sort,
      lower(source_label) as source_sort,
      lower(project_name) as project_sort,
      kind || ':' || item_id::text as cursor_key
    from source_evidence
  ),
  page as (
    select prepared.*
    from prepared
    where p_cursor is null
      or (
        p_sort = 'newest'
        and (
          captured_at < cursor_primary_time
          or (captured_at = cursor_primary_time and cursor_key > cursor_key_value)
        )
      )
      or (
        p_sort = 'oldest'
        and (
          captured_at > cursor_primary_time
          or (captured_at = cursor_primary_time and cursor_key > cursor_key_value)
        )
      )
      or (
        p_sort = 'recently-reviewed'
        and (
          review_sort < cursor_primary_time
          or (review_sort = cursor_primary_time and captured_at < cursor_secondary_time)
          or (review_sort = cursor_primary_time and captured_at = cursor_secondary_time and cursor_key > cursor_key_value)
        )
      )
      or (
        p_sort = 'source'
        and (
          source_sort > cursor_primary_text
          or (source_sort = cursor_primary_text and captured_at < cursor_secondary_time)
          or (source_sort = cursor_primary_text and captured_at = cursor_secondary_time and cursor_key > cursor_key_value)
        )
      )
      or (
        p_sort = 'project'
        and (
          project_sort > cursor_primary_text
          or (project_sort = cursor_primary_text and captured_at < cursor_secondary_time)
          or (project_sort = cursor_primary_text and captured_at = cursor_secondary_time and cursor_key > cursor_key_value)
        )
      )
    order by
      case when p_sort = 'newest' then captured_at end desc,
      case when p_sort = 'oldest' then captured_at end asc,
      case when p_sort = 'recently-reviewed' then review_sort end desc,
      case when p_sort = 'recently-reviewed' then captured_at end desc,
      case when p_sort = 'source' then source_sort end asc,
      case when p_sort = 'source' then captured_at end desc,
      case when p_sort = 'project' then project_sort end asc,
      case when p_sort = 'project' then captured_at end desc,
      cursor_key asc
    limit page_size + 1
  )
  select
    jsonb_build_object(
      'kind', page.kind,
      'item_id', page.item_id,
      'client_ref', page.client_ref,
      'project_id', page.project_id,
      'project_name', page.project_name,
      'title', page.title,
      'author', page.author,
      'source_label', page.source_label,
      'original_url', page.original_url,
      'canonical_url', coalesce(nullif(page.metadata ->> 'canonical_url', ''), nullif(page.metadata ->> 'canonicalUrl', ''), page.original_url),
      'original_content', page.original_content,
      'published_at', page.published_at,
      'captured_at', page.captured_at,
      'notes', page.notes,
      'source_tags', to_jsonb(page.source_tags),
      'organization_tags', to_jsonb(coalesce(array(
        select distinct tag.name
        from public.item_tags item_tag
        join public.tags tag on tag.id = item_tag.tag_id
        where item_tag.project_id = page.project_id
          and item_tag.item_type = page.kind::public.item_kind
          and item_tag.item_id = page.item_id
        order by tag.name
      ), '{}'::text[])),
      'organization_topics', to_jsonb(coalesce(array(
        select distinct evidence_topic.name
        from public.evidence_topic_assignments assignment
        join public.evidence_topics evidence_topic on evidence_topic.id = assignment.topic_id
        where assignment.project_id = page.project_id
          and assignment.item_type = page.kind::public.item_kind
          and assignment.item_id = page.item_id
        order by evidence_topic.name
      ), '{}'::text[])),
      'topics', to_jsonb(case when page.kind = 'mention' then coalesce(array(
        select distinct topic.name
        from public.mention_topics mention_topic
        join public.topics topic on topic.id = mention_topic.topic_id
        where mention_topic.mention_id = page.item_id
        order by topic.name
      ), '{}'::text[]) else '{}'::text[] end),
      'associated_project_ids', to_jsonb(coalesce(array(
        select distinct project_id
        from (
          select page.project_id as project_id
          union all
          select link.destination_id
          from public.saved_items link
          where link.user_id = (select auth.uid())
            and link.project_id = page.project_id
            and link.item_type = page.kind::public.item_kind
            and link.item_id = page.item_id
            and link.destination = 'project'
            and link.destination_id is not null
        ) associated
        order by project_id
      ), array[page.project_id])),
      'language', page.language,
      'processing_status', page.processing_status,
      'review_status', page.review_status,
      'reviewed_at', page.reviewed_at,
      'attachments', case
        when page.kind = 'research' then coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', asset.id,
            'bucket', asset.bucket_id,
            'path', asset.storage_path,
            'name', asset.original_filename,
            'mime_type', asset.mime_type,
            'size', asset.byte_size,
            'kind', case when asset.asset_kind = 'image' then 'image' else 'document' end
          ) order by asset.created_at, asset.id)
          from public.evidence_assets asset
          where asset.research_item_id = page.item_id
        ), '[]'::jsonb)
        else coalesce(page.metadata -> 'attachments', '[]'::jsonb)
      end,
      'metadata', page.metadata,
      'item_type', page.item_type,
      'collection_name', page.collection_name,
      'key_findings', page.key_findings,
      'ai_summary', page.ai_summary,
      'brand_name', page.brand_name,
      'thumbnail_url', page.thumbnail_url,
      'monitor_id', page.monitor_id,
      'platform', page.platform,
      'external_id', page.external_id,
      'engagement', page.engagement,
      'sentiment', page.sentiment
    ) as evidence,
    jsonb_build_object(
      'sort', p_sort,
      'primary', case
        when p_sort in ('newest', 'oldest') then page.captured_at::text
        when p_sort = 'recently-reviewed' then page.review_sort::text
        when p_sort = 'source' then page.source_sort
        else page.project_sort
      end,
      'secondary', case
        when p_sort in ('recently-reviewed', 'source', 'project') then page.captured_at::text
        else null
      end,
      'key', page.cursor_key
    ) as cursor_value
  from page
  order by
    case when p_sort = 'newest' then page.captured_at end desc,
    case when p_sort = 'oldest' then page.captured_at end asc,
    case when p_sort = 'recently-reviewed' then page.review_sort end desc,
    case when p_sort = 'recently-reviewed' then page.captured_at end desc,
    case when p_sort = 'source' then page.source_sort end asc,
    case when p_sort = 'source' then page.captured_at end desc,
    case when p_sort = 'project' then page.project_sort end asc,
    case when p_sort = 'project' then page.captured_at end desc,
    page.cursor_key asc;
end;
$$;

revoke all on function public.search_evidence_page(text, uuid, text, text, timestamptz, text, jsonb, integer)
  from public, anon;
grant execute on function public.search_evidence_page(text, uuid, text, text, timestamptz, text, jsonb, integer)
  to authenticated;

comment on function public.search_evidence_page(text, uuid, text, text, timestamptz, text, jsonb, integer) is
  'RLS-filtered normalized Evidence inbox retrieval with searchable strategist notes, tags, topics, and keyset pagination.';
