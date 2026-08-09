-- Phase 4: complete-history Radar conversation browsing.
--
-- The browser receives only records visible through the caller's existing RLS
-- boundary. Stable keyset cursors avoid page drift as connectors add records.

create index if not exists mentions_query_engagement_cursor_idx
  on public.mentions (
    monitoring_query_id,
    engagement desc,
    coalesce(published_at, created_at) desc,
    id desc
  )
  where monitoring_query_id is not null;

create or replace function public.radar_conversation_page(
  p_monitor_id uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_search text default null,
  p_source text default null,
  p_sentiment text default null,
  p_topic text default null,
  p_keyword text default null,
  p_min_engagement numeric default 0,
  p_sort text default 'newest',
  p_cursor jsonb default null,
  p_page_size integer default 24
)
returns table (
  conversation jsonb,
  cursor_value jsonb,
  total_count bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  clean_search text := nullif(btrim(p_search), '');
  clean_source text := nullif(lower(btrim(p_source)), '');
  clean_sentiment text := nullif(lower(btrim(p_sentiment)), '');
  clean_topic text := nullif(lower(btrim(p_topic)), '');
  clean_keyword text := nullif(lower(btrim(p_keyword)), '');
  search_query tsquery;
  page_size integer := least(greatest(coalesce(p_page_size, 24), 1), 100);
  cursor_primary_time timestamptz;
  cursor_primary_numeric numeric;
  cursor_secondary_time timestamptz;
  cursor_key uuid;
begin
  if (select auth.uid()) is null
    or coalesce((((select auth.jwt()) ->> 'is_anonymous'))::boolean, true) then
    raise exception 'A permanent authenticated account is required.' using errcode = '42501';
  end if;

  if p_monitor_id is null or p_start is null or p_end is null or p_start > p_end then
    raise exception 'A valid monitor and date range are required.' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.monitoring_queries query
    where query.id = p_monitor_id
      and query.project_id = any(((select private.accessible_project_ids()))::uuid[])
  ) then
    raise exception 'The Radar monitor is not available.' using errcode = '42501';
  end if;

  if clean_source is not null
    and clean_source not in ('reddit', 'youtube', 'rss', 'news', 'manual', 'tiktok', 'instagram', 'facebook', 'linkedin', 'x') then
    raise exception 'Unsupported Radar source.' using errcode = '22023';
  end if;

  if clean_sentiment is not null and clean_sentiment not in ('positive', 'neutral', 'negative') then
    raise exception 'Unsupported sentiment filter.' using errcode = '22023';
  end if;

  if p_sort not in ('newest', 'oldest', 'engagement', 'relevance') then
    raise exception 'Unsupported conversation sort.' using errcode = '22023';
  end if;

  if coalesce(p_min_engagement, 0) < 0 then
    raise exception 'Minimum engagement cannot be negative.' using errcode = '22023';
  end if;

  if clean_search is not null then
    search_query := websearch_to_tsquery('english'::regconfig, clean_search);
    if numnode(search_query) = 0 then clean_search := null; end if;
  end if;

  if p_cursor is not null then
    if p_cursor ->> 'sort' is distinct from p_sort then
      raise exception 'The conversation cursor does not match the active sort.' using errcode = '22023';
    end if;
    begin
      cursor_key := (p_cursor ->> 'key')::uuid;
      if p_sort in ('newest', 'oldest') then
        cursor_primary_time := (p_cursor ->> 'primary')::timestamptz;
      else
        cursor_primary_numeric := (p_cursor ->> 'primary')::numeric;
        cursor_secondary_time := (p_cursor ->> 'secondary')::timestamptz;
      end if;
    exception when others then
      raise exception 'The conversation cursor is invalid.' using errcode = '22023';
    end;
    if cursor_key is null
      or (p_sort in ('newest', 'oldest') and cursor_primary_time is null)
      or (p_sort in ('engagement', 'relevance') and (cursor_primary_numeric is null or cursor_secondary_time is null)) then
      raise exception 'The conversation cursor is incomplete.' using errcode = '22023';
    end if;
  end if;

  return query
  with monitor_context as (
    select
      query.project_id,
      coalesce(array(
        select lower(btrim(term))
        from (
          select jsonb_array_elements_text(coalesce(query.parsed_query -> 'includeAll', '[]'::jsonb)) as term
          union all
          select jsonb_array_elements_text(coalesce(query.parsed_query -> 'includeAny', '[]'::jsonb)) as term
        ) terms
        where btrim(term) <> ''
      ), '{}'::text[]) as relevance_terms
    from public.monitoring_queries query
    where query.id = p_monitor_id
  ),
  filtered as (
    select
      mention.*,
      coalesce(mention.published_at, mention.created_at) as observed_at,
      coalesce(source.name, initcap(replace(mention.platform::text, '_', ' '))) as source_name,
      coalesce(topic_data.names, '{}'::text[]) as topic_names,
      case
        when cardinality(context.relevance_terms) = 0 then 70
        else greatest(25, least(100, round(
          100.0 * (
            select count(*)
            from unnest(context.relevance_terms) term
            where position(term in lower(mention.content)) > 0
          ) / cardinality(context.relevance_terms)
        )::integer))
      end as relevance_score
    from public.mentions mention
    join monitor_context context on context.project_id = mention.project_id
    left join public.sources source on source.id = mention.source_id
    left join lateral (
      select array_agg(topic.name order by topic.name) as names
      from public.mention_topics link
      join public.topics topic on topic.id = link.topic_id
      where link.mention_id = mention.id
    ) topic_data on true
    where mention.monitoring_query_id = p_monitor_id
      and coalesce(mention.published_at, mention.created_at) >= p_start
      and coalesce(mention.published_at, mention.created_at) <= p_end
      and mention.engagement >= coalesce(p_min_engagement, 0)
      and (
        clean_source is null
        or (clean_source = 'rss' and mention.platform in ('rss'::public.source_kind, 'blog'::public.source_kind))
        or (clean_source = 'manual' and mention.platform in ('manual_url'::public.source_kind, 'manual_note'::public.source_kind))
        or (clean_source not in ('rss', 'manual') and mention.platform::text = clean_source)
      )
      and (
        clean_sentiment is null
        or (clean_sentiment = 'neutral' and mention.sentiment in ('neutral'::public.sentiment_kind, 'unknown'::public.sentiment_kind))
        or mention.sentiment::text = clean_sentiment
      )
      and (
        clean_topic is null
        or exists (
          select 1
          from public.mention_topics topic_link
          join public.topics topic_filter on topic_filter.id = topic_link.topic_id
          where topic_link.mention_id = mention.id
            and lower(topic_filter.name) = clean_topic
        )
      )
      and (
        clean_keyword is null
        or lower(mention.content) like '%' || clean_keyword || '%'
        or exists (
          select 1 from unnest(mention.keywords) keyword
          where lower(keyword) like '%' || clean_keyword || '%'
        )
      )
      and (
        clean_search is null
        or mention.search_vector @@ search_query
        or to_tsvector('english'::regconfig, coalesce(source.name, '')) @@ search_query
        or to_tsvector('english'::regconfig, coalesce(array_to_json(mention.keywords)::text, '')) @@ search_query
        or exists (
          select 1
          from public.mention_topics search_link
          join public.topics search_topic on search_topic.id = search_link.topic_id
          where search_link.mention_id = mention.id
            and to_tsvector('english'::regconfig, search_topic.name) @@ search_query
        )
      )
  ),
  counted as (
    select filtered.*, count(*) over () as matching_count
    from filtered
  ),
  paged as (
    select *
    from counted item
    where p_cursor is null
      or (p_sort = 'newest' and (item.observed_at, item.id) < (cursor_primary_time, cursor_key))
      or (p_sort = 'oldest' and (item.observed_at, item.id) > (cursor_primary_time, cursor_key))
      or (p_sort = 'engagement' and (item.engagement, item.observed_at, item.id) < (cursor_primary_numeric, cursor_secondary_time, cursor_key))
      or (p_sort = 'relevance' and (item.relevance_score, item.observed_at, item.id) < (cursor_primary_numeric, cursor_secondary_time, cursor_key))
    order by
      case when p_sort = 'newest' then item.observed_at end desc,
      case when p_sort = 'newest' then item.id end desc,
      case when p_sort = 'oldest' then item.observed_at end asc,
      case when p_sort = 'oldest' then item.id end asc,
      case when p_sort = 'engagement' then item.engagement end desc,
      case when p_sort = 'engagement' then item.observed_at end desc,
      case when p_sort = 'engagement' then item.id end desc,
      case when p_sort = 'relevance' then item.relevance_score end desc,
      case when p_sort = 'relevance' then item.observed_at end desc,
      case when p_sort = 'relevance' then item.id end desc
    limit page_size + 1
  )
  select
    jsonb_build_object(
      'id', item.id,
      'project_id', item.project_id,
      'monitoring_query_id', item.monitoring_query_id,
      'platform', item.platform::text,
      'external_id', item.external_id,
      'author', item.author,
      'content', item.content,
      'url', item.url,
      'published_at', item.published_at,
      'likes', item.likes,
      'comments', item.comments,
      'shares', item.shares,
      'views', item.views,
      'engagement', item.engagement,
      'language', item.language,
      'sentiment', item.sentiment::text,
      'sentiment_score', item.sentiment_score,
      'keywords', to_jsonb(item.keywords),
      'metadata', item.metadata,
      'is_important', item.is_important,
      'review_status', item.review_status,
      'reviewed_at', item.reviewed_at,
      'created_at', item.created_at,
      'source_name', item.source_name,
      'topic_names', to_jsonb(item.topic_names),
      'relevance', item.relevance_score
    ),
    jsonb_build_object(
      'sort', p_sort,
      'primary', case when p_sort in ('newest', 'oldest') then item.observed_at::text else (case when p_sort = 'engagement' then item.engagement else item.relevance_score end)::text end,
      'secondary', case when p_sort in ('engagement', 'relevance') then item.observed_at::text else null end,
      'key', item.id::text
    ),
    item.matching_count
  from paged item;
end;
$$;

create or replace function public.radar_mentions_by_ids(
  p_monitor_id uuid,
  p_mention_ids uuid[]
)
returns table (conversation jsonb)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
    or coalesce((((select auth.jwt()) ->> 'is_anonymous'))::boolean, true) then
    raise exception 'A permanent authenticated account is required.' using errcode = '42501';
  end if;
  if p_monitor_id is null or p_mention_ids is null or cardinality(p_mention_ids) = 0 or cardinality(p_mention_ids) > 50 then
    raise exception 'Provide between 1 and 50 supporting record IDs.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.monitoring_queries query
    where query.id = p_monitor_id
      and query.project_id = any(((select private.accessible_project_ids()))::uuid[])
  ) then
    raise exception 'The Radar monitor is not available.' using errcode = '42501';
  end if;

  return query
  select jsonb_build_object(
    'id', mention.id,
    'project_id', mention.project_id,
    'monitoring_query_id', mention.monitoring_query_id,
    'platform', mention.platform::text,
    'external_id', mention.external_id,
    'author', mention.author,
    'content', mention.content,
    'url', mention.url,
    'published_at', mention.published_at,
    'likes', mention.likes,
    'comments', mention.comments,
    'shares', mention.shares,
    'views', mention.views,
    'engagement', mention.engagement,
    'language', mention.language,
    'sentiment', mention.sentiment::text,
    'sentiment_score', mention.sentiment_score,
    'keywords', to_jsonb(mention.keywords),
    'metadata', mention.metadata,
    'is_important', mention.is_important,
    'review_status', mention.review_status,
    'reviewed_at', mention.reviewed_at,
    'created_at', mention.created_at,
    'source_name', coalesce(source.name, initcap(replace(mention.platform::text, '_', ' '))),
    'topic_names', coalesce(topic_data.names, '[]'::jsonb),
    'relevance', 70
  )
  from public.mentions mention
  left join public.sources source on source.id = mention.source_id
  left join lateral (
    select jsonb_agg(topic.name order by topic.name) as names
    from public.mention_topics link
    join public.topics topic on topic.id = link.topic_id
    where link.mention_id = mention.id
  ) topic_data on true
  where mention.monitoring_query_id = p_monitor_id
    and mention.id = any(p_mention_ids)
  order by array_position(p_mention_ids, mention.id);
end;
$$;

revoke all on function public.radar_conversation_page(uuid, timestamptz, timestamptz, text, text, text, text, text, numeric, text, jsonb, integer) from public, anon;
grant execute on function public.radar_conversation_page(uuid, timestamptz, timestamptz, text, text, text, text, text, numeric, text, jsonb, integer) to authenticated;

revoke all on function public.radar_mentions_by_ids(uuid, uuid[]) from public, anon;
grant execute on function public.radar_mentions_by_ids(uuid, uuid[]) to authenticated;

comment on function public.radar_conversation_page(uuid, timestamptz, timestamptz, text, text, text, text, text, numeric, text, jsonb, integer) is
  'Returns an RLS-scoped, filterable Radar conversation page using a stable keyset cursor.';

comment on function public.radar_mentions_by_ids(uuid, uuid[]) is
  'Returns RLS-scoped supporting Radar records by database identity for topic and spike evidence trails.';
