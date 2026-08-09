-- Phase 4: server-authoritative Radar chart, topic, keyword, and spike analysis.
--
-- The function keeps calculations close to the complete RLS-scoped history and
-- returns compact JSON aggregates. Supporting mention identities preserve the
-- existing chart -> topic -> mention -> evidence interaction in the client.

create or replace function public.radar_monitor_analysis(
  p_monitor_id uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_previous_start timestamptz,
  p_previous_end timestamptz,
  p_bucket_seconds integer,
  p_topic text default null
)
returns table (
  volume jsonb,
  sentiment jsonb,
  topics jsonb,
  keywords jsonb,
  spikes jsonb
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  target_project_id uuid;
  clean_topic text := nullif(btrim(p_topic), '');
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if coalesce((((select auth.jwt()) ->> 'is_anonymous'))::boolean, true) then
    raise exception 'A permanent account is required.' using errcode = '42501';
  end if;

  if p_monitor_id is null
    or p_start is null
    or p_end is null
    or p_previous_start is null
    or p_previous_end is null then
    raise exception 'Monitor and date bounds are required.' using errcode = '22023';
  end if;

  if p_start >= p_end or p_previous_start >= p_previous_end then
    raise exception 'Radar date bounds are invalid.' using errcode = '22023';
  end if;

  if p_bucket_seconds not in (10800, 21600, 86400, 604800) then
    raise exception 'Radar bucket size is invalid.' using errcode = '22023';
  end if;

  select query.project_id
  into target_project_id
  from public.monitoring_queries query
  where query.id = p_monitor_id
    and query.project_id = any(((select private.accessible_project_ids()))::uuid[]);

  if target_project_id is null then
    raise exception 'This monitor is unavailable to the current account.' using errcode = '42501';
  end if;

  return query
  with scoped_mentions as materialized (
    select
      mention.id,
      coalesce(mention.external_id, mention.id::text) as external_id,
      mention.platform,
      mention.author,
      mention.engagement,
      mention.sentiment,
      mention.keywords,
      coalesce(mention.published_at, mention.created_at) as observed_at,
      coalesce(
        array_agg(topic.name order by topic.name) filter (where topic.id is not null),
        '{}'::text[]
      ) as topic_names
    from public.mentions mention
    left join public.mention_topics link on link.mention_id = mention.id
    left join public.topics topic
      on topic.id = link.topic_id
      and topic.project_id = target_project_id
    where mention.monitoring_query_id = p_monitor_id
      and mention.project_id = target_project_id
      and coalesce(mention.published_at, mention.created_at) >= p_previous_start
      and coalesce(mention.published_at, mention.created_at) <= p_end
      and (
        clean_topic is null
        or exists (
          select 1
          from public.mention_topics scope_link
          join public.topics scope_topic on scope_topic.id = scope_link.topic_id
          where scope_link.mention_id = mention.id
            and scope_topic.project_id = target_project_id
            and scope_topic.name = clean_topic
        )
      )
    group by mention.id
  ),
  parameters as (
    select make_interval(secs => p_bucket_seconds) as bucket_interval
  ),
  bins as (
    select
      generated.bucket_start,
      generated.ordinality::integer as bucket_index,
      least(
        generated.bucket_start + parameters.bucket_interval,
        p_end + interval '1 microsecond'
      ) as bucket_end,
      p_previous_start + ((generated.ordinality - 1)::integer * parameters.bucket_interval) as previous_bucket_start,
      least(
        p_previous_start + (generated.ordinality::integer * parameters.bucket_interval),
        p_previous_end + interval '1 microsecond'
      ) as previous_bucket_end
    from parameters
    cross join lateral generate_series(
      p_start,
      p_end - interval '1 microsecond',
      parameters.bucket_interval
    ) with ordinality as generated(bucket_start, ordinality)
  ),
  raw_bins as (
    select
      bin.bucket_start,
      bin.bucket_index,
      bin.bucket_end,
      bin.previous_bucket_start,
      bin.previous_bucket_end,
      count(current_mention.id) as current_count,
      count(current_mention.id) filter (
        where current_mention.sentiment = 'positive'::public.sentiment_kind
      ) as positive_count,
      count(current_mention.id) filter (
        where current_mention.sentiment in (
          'neutral'::public.sentiment_kind,
          'unknown'::public.sentiment_kind
        )
      ) as neutral_count,
      count(current_mention.id) filter (
        where current_mention.sentiment = 'negative'::public.sentiment_kind
      ) as negative_count,
      (
        select count(*)
        from scoped_mentions previous_mention
        where previous_mention.observed_at >= bin.previous_bucket_start
          and previous_mention.observed_at < bin.previous_bucket_end
      ) as previous_count
    from bins bin
    left join scoped_mentions current_mention
      on current_mention.observed_at >= bin.bucket_start
      and current_mention.observed_at < bin.bucket_end
    group by
      bin.bucket_start,
      bin.bucket_index,
      bin.bucket_end,
      bin.previous_bucket_start,
      bin.previous_bucket_end
  ),
  rolling_bins as (
    select
      raw.*,
      avg(raw.current_count) over (
        order by raw.bucket_index
        rows between 3 preceding and 1 preceding
      ) as rolling_count
    from raw_bins raw
  ),
  analyzed_bins as (
    select
      rolling.*,
      greatest(
        1,
        round((rolling.previous_count + coalesce(rolling.rolling_count, rolling.previous_count)) / 2.0)
      )::integer as baseline
    from rolling_bins rolling
  ),
  final_bins as (
    select
      analyzed.*,
      case
        when analyzed.previous_count <= 0 then
          case when analyzed.current_count > 0 then 100 else 0 end
        else round(
          ((analyzed.current_count - analyzed.previous_count)::numeric / analyzed.previous_count::numeric) * 100
        )::integer
      end as period_growth,
      case
        when analyzed.baseline <= 0 then
          case when analyzed.current_count > 0 then 100 else 0 end
        else round(
          ((analyzed.current_count - analyzed.baseline)::numeric / analyzed.baseline::numeric) * 100
        )::integer
      end as spike_growth,
      analyzed.current_count >= 4
        and round(
          ((analyzed.current_count - analyzed.baseline)::numeric / analyzed.baseline::numeric) * 100
        ) >= 75 as is_spike,
      'spike-' || to_char(analyzed.bucket_start at time zone 'UTC', 'YYYYMMDD-HH24MISS') as spike_id
    from analyzed_bins analyzed
  ),
  volume_result as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'timestamp', final.bucket_start,
          'mentions', final.current_count,
          'baseline', final.baseline,
          'spikeId', case when final.is_spike then final.spike_id else null end
        )
        order by final.bucket_index
      ),
      '[]'::jsonb
    ) as value
    from final_bins final
  ),
  sentiment_result as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'timestamp', final.bucket_start,
          'positive', case when final.current_count > 0 then round((final.positive_count::numeric / final.current_count::numeric) * 100)::integer else 0 end,
          'neutral', case when final.current_count > 0 then round((final.neutral_count::numeric / final.current_count::numeric) * 100)::integer else 0 end,
          'negative', case when final.current_count > 0 then round((final.negative_count::numeric / final.current_count::numeric) * 100)::integer else 0 end
        )
        order by final.bucket_index
      ),
      '[]'::jsonb
    ) as value
    from final_bins final
  ),
  topic_current as (
    select
      topic_name,
      count(*) as mention_count,
      coalesce(sum(mention.engagement), 0) as engagement,
      count(distinct coalesce(nullif(btrim(mention.author), ''), 'Unknown author')) as author_count,
      count(*) filter (where mention.sentiment = 'positive'::public.sentiment_kind) as positive_count,
      count(*) filter (where mention.sentiment = 'negative'::public.sentiment_kind) as negative_count
    from scoped_mentions mention
    cross join lateral unnest(mention.topic_names) as topic_name
    where mention.observed_at >= p_start
      and mention.observed_at <= p_end
    group by topic_name
  ),
  topic_previous as (
    select topic_name, count(*) as mention_count
    from scoped_mentions mention
    cross join lateral unnest(mention.topic_names) as topic_name
    where mention.observed_at >= p_previous_start
      and mention.observed_at <= p_previous_end
    group by topic_name
  ),
  topic_stats as (
    select
      current.topic_name,
      current.mention_count,
      case
        when coalesce(previous.mention_count, 0) <= 0 then 100
        else round(
          ((current.mention_count - previous.mention_count)::numeric / previous.mention_count::numeric) * 100
        )::integer
      end as growth,
      round(
        ((current.positive_count - current.negative_count)::numeric / greatest(1, current.mention_count)::numeric) * 100
      )::integer as sentiment_score,
      current.engagement,
      current.author_count,
      coalesce((
        select matching.platform::text
        from scoped_mentions matching
        where matching.observed_at >= p_start
          and matching.observed_at <= p_end
          and current.topic_name = any(matching.topic_names)
        group by matching.platform
        order by count(*) desc, matching.platform::text asc
        limit 1
      ), '') as top_source,
      coalesce((
        select jsonb_agg(example.identity order by example.engagement desc, example.cloud_id)
        from (
          select
            matching.id as cloud_id,
            matching.engagement,
            jsonb_build_object(
              'cloudId', matching.id,
              'platform', matching.platform::text,
              'externalId', matching.external_id
            ) as identity
          from scoped_mentions matching
          where matching.observed_at >= p_start
            and matching.observed_at <= p_end
            and current.topic_name = any(matching.topic_names)
          order by matching.engagement desc, matching.id
          limit 3
        ) example
      ), '[]'::jsonb) as examples
    from topic_current current
    left join topic_previous previous on previous.topic_name = current.topic_name
  ),
  topic_result as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'name', stat.topic_name,
          'mentions', stat.mention_count,
          'growth', stat.growth,
          'sentiment', stat.sentiment_score,
          'engagement', stat.engagement,
          'uniqueAuthors', stat.author_count,
          'topSource', stat.top_source,
          'exampleMentions', stat.examples
        )
        order by stat.mention_count desc, stat.topic_name asc
      ),
      '[]'::jsonb
    ) as value
    from topic_stats stat
  ),
  keyword_current as (
    select lower(btrim(keyword)) as keyword, count(*) as mention_count
    from scoped_mentions mention
    cross join lateral unnest(mention.keywords) as keyword
    where mention.observed_at >= p_start
      and mention.observed_at <= p_end
      and btrim(keyword) <> ''
    group by lower(btrim(keyword))
  ),
  keyword_previous as (
    select lower(btrim(keyword)) as keyword, count(*) as mention_count
    from scoped_mentions mention
    cross join lateral unnest(mention.keywords) as keyword
    where mention.observed_at >= p_previous_start
      and mention.observed_at <= p_previous_end
      and btrim(keyword) <> ''
    group by lower(btrim(keyword))
  ),
  keyword_result as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'keyword', ranked.keyword,
          'count', ranked.mention_count,
          'growth', ranked.growth
        )
        order by ranked.mention_count desc, ranked.keyword asc
      ),
      '[]'::jsonb
    ) as value
    from (
      select
        current.keyword,
        current.mention_count,
        case
          when coalesce(previous.mention_count, 0) <= 0 then 100
          else round(
            ((current.mention_count - previous.mention_count)::numeric / previous.mention_count::numeric) * 100
          )::integer
        end as growth
      from keyword_current current
      left join keyword_previous previous on previous.keyword = current.keyword
      order by current.mention_count desc, current.keyword asc
      limit 14
    ) ranked
  ),
  spike_details as (
    select
      final.spike_id,
      final.bucket_start,
      final.bucket_end,
      final.previous_bucket_start,
      final.previous_bucket_end,
      final.current_count,
      final.baseline,
      final.spike_growth,
      coalesce(topics.value, '[]'::jsonb) as top_topics,
      coalesce(sources.value, '[]'::jsonb) as top_sources,
      coalesce(unusual.value, '[]'::jsonb) as unusual_keywords,
      coalesce(top_mentions.value, '[]'::jsonb) as top_mentions,
      case
        when driver.topic_name is not null
          and driver.mention_count::numeric / greatest(1, final.current_count)::numeric >= 0.35
          and jsonb_array_length(coalesce(driver_mentions.value, '[]'::jsonb)) >= 2
        then jsonb_build_array(
          jsonb_build_object(
            'explanation', driver.topic_name || ' accounted for ' || round((driver.mention_count::numeric / final.current_count::numeric) * 100)::integer || '% of records in this spike.',
            'mentionIds', driver_mentions.value
          )
        )
        else '[]'::jsonb
      end as likely_drivers
    from final_bins final
    left join lateral (
      select jsonb_agg(
        jsonb_build_object('name', ranked.topic_name, 'mentions', ranked.mention_count)
        order by ranked.mention_count desc, ranked.topic_name asc
      ) as value
      from (
        select topic_name, count(*) as mention_count
        from scoped_mentions mention
        cross join lateral unnest(mention.topic_names) as topic_name
        where mention.observed_at >= final.bucket_start
          and mention.observed_at < final.bucket_end
        group by topic_name
        order by mention_count desc, topic_name asc
        limit 4
      ) ranked
    ) topics on true
    left join lateral (
      select jsonb_agg(
        jsonb_build_object('name', ranked.source_name, 'mentions', ranked.mention_count)
        order by ranked.mention_count desc, ranked.source_name asc
      ) as value
      from (
        select mention.platform::text as source_name, count(*) as mention_count
        from scoped_mentions mention
        where mention.observed_at >= final.bucket_start
          and mention.observed_at < final.bucket_end
        group by mention.platform
        order by mention_count desc, source_name asc
        limit 4
      ) ranked
    ) sources on true
    left join lateral (
      select jsonb_agg(ranked.keyword order by ranked.lift desc, ranked.mention_count desc, ranked.keyword asc) as value
      from (
        select
          current_keyword.keyword,
          current_keyword.mention_count,
          current_keyword.mention_count::numeric / greatest(1, coalesce(previous_keyword.mention_count, 0))::numeric as lift
        from (
          select lower(btrim(keyword)) as keyword, count(*) as mention_count
          from scoped_mentions mention
          cross join lateral unnest(mention.keywords) as keyword
          where mention.observed_at >= final.bucket_start
            and mention.observed_at < final.bucket_end
            and btrim(keyword) <> ''
          group by lower(btrim(keyword))
        ) current_keyword
        left join (
          select lower(btrim(keyword)) as keyword, count(*) as mention_count
          from scoped_mentions mention
          cross join lateral unnest(mention.keywords) as keyword
          where mention.observed_at >= final.previous_bucket_start
            and mention.observed_at < final.previous_bucket_end
            and btrim(keyword) <> ''
          group by lower(btrim(keyword))
        ) previous_keyword on previous_keyword.keyword = current_keyword.keyword
        order by lift desc, current_keyword.mention_count desc, current_keyword.keyword asc
        limit 6
      ) ranked
    ) unusual on true
    left join lateral (
      select jsonb_agg(ranked.identity order by ranked.engagement desc, ranked.cloud_id) as value
      from (
        select
          mention.id as cloud_id,
          mention.engagement,
          jsonb_build_object(
            'cloudId', mention.id,
            'platform', mention.platform::text,
            'externalId', mention.external_id
          ) as identity
        from scoped_mentions mention
        where mention.observed_at >= final.bucket_start
          and mention.observed_at < final.bucket_end
        order by mention.engagement desc, mention.id
        limit 4
      ) ranked
    ) top_mentions on true
    left join lateral (
      select topic_name, count(*) as mention_count
      from scoped_mentions mention
      cross join lateral unnest(mention.topic_names) as topic_name
      where mention.observed_at >= final.bucket_start
        and mention.observed_at < final.bucket_end
      group by topic_name
      order by mention_count desc, topic_name asc
      limit 1
    ) driver on true
    left join lateral (
      select jsonb_agg(ranked.identity order by ranked.engagement desc, ranked.cloud_id) as value
      from (
        select
          mention.id as cloud_id,
          mention.engagement,
          jsonb_build_object(
            'cloudId', mention.id,
            'platform', mention.platform::text,
            'externalId', mention.external_id
          ) as identity
        from scoped_mentions mention
        where mention.observed_at >= final.bucket_start
          and mention.observed_at < final.bucket_end
          and driver.topic_name = any(mention.topic_names)
        order by mention.engagement desc, mention.id
        limit 3
      ) ranked
    ) driver_mentions on true
    where final.is_spike
  ),
  spike_result as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', detail.spike_id,
          'timestamp', detail.bucket_start,
          'mentions', detail.current_count,
          'baseline', detail.baseline,
          'growth', detail.spike_growth,
          'topTopics', detail.top_topics,
          'topSources', detail.top_sources,
          'unusualKeywords', detail.unusual_keywords,
          'topMentions', detail.top_mentions,
          'likelyDrivers', detail.likely_drivers
        )
        order by detail.spike_growth desc, detail.bucket_start asc
      ),
      '[]'::jsonb
    ) as value
    from spike_details detail
  )
  select
    volume_result.value,
    sentiment_result.value,
    topic_result.value,
    keyword_result.value,
    spike_result.value
  from volume_result
  cross join sentiment_result
  cross join topic_result
  cross join keyword_result
  cross join spike_result;
end;
$$;

revoke all on function public.radar_monitor_analysis(
  uuid, timestamptz, timestamptz, timestamptz, timestamptz, integer, text
) from public, anon;

grant execute on function public.radar_monitor_analysis(
  uuid, timestamptz, timestamptz, timestamptz, timestamptz, integer, text
) to authenticated;

comment on function public.radar_monitor_analysis(
  uuid, timestamptz, timestamptz, timestamptz, timestamptz, integer, text
) is
  'Returns compact, RLS-scoped Radar timelines, topics, keywords, and evidence-linked spike analysis for a monitor.';
