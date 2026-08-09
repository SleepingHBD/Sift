-- Phase 4: coverage-aware, server-authoritative Radar headline analytics.
--
-- The browser previously calculated every headline metric from a bounded
-- hydration window. This read-only RPC evaluates the selected and comparison
-- periods inside Postgres under the caller's existing RLS policies.

create index if not exists mentions_query_observed_cursor_idx
  on public.mentions (
    monitoring_query_id,
    (coalesce(published_at, created_at)) desc,
    id desc
  )
  where monitoring_query_id is not null;

create or replace function public.radar_monitor_summary(
  p_monitor_id uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_previous_start timestamptz,
  p_previous_end timestamptz,
  p_topic text default null
)
returns table (
  monitor_id uuid,
  scope_topic text,
  range_start timestamptz,
  range_end timestamptz,
  current_mentions bigint,
  previous_mentions bigint,
  all_time_mentions bigint,
  mention_growth integer,
  estimated_engagement numeric,
  positive_percent integer,
  neutral_percent integer,
  negative_percent integer,
  unique_authors bigint,
  active_sources bigint,
  range_first_observed_at timestamptz,
  range_last_observed_at timestamptz,
  first_observed_at timestamptz,
  last_observed_at timestamptz,
  source_counts jsonb,
  last_run_at timestamptz,
  last_successful_run_at timestamptz,
  latest_run_status text
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
      mention.platform,
      mention.author,
      mention.engagement,
      mention.sentiment,
      coalesce(mention.published_at, mention.created_at) as observed_at
    from public.mentions mention
    where mention.monitoring_query_id = p_monitor_id
      and mention.project_id = target_project_id
      and (
        clean_topic is null
        or exists (
          select 1
          from public.mention_topics link
          join public.topics topic on topic.id = link.topic_id
          where link.mention_id = mention.id
            and topic.project_id = target_project_id
            and topic.name = clean_topic
        )
      )
  ),
  raw_stats as (
    select
      count(*) filter (
        where observed_at >= p_start and observed_at <= p_end
      ) as current_count,
      count(*) filter (
        where observed_at >= p_previous_start and observed_at <= p_previous_end
      ) as previous_count,
      count(*) as all_time_count,
      coalesce(sum(engagement) filter (
        where observed_at >= p_start and observed_at <= p_end
      ), 0) as current_engagement,
      count(*) filter (
        where observed_at >= p_start and observed_at <= p_end
          and sentiment = 'positive'::public.sentiment_kind
      ) as positive_count,
      count(*) filter (
        where observed_at >= p_start and observed_at <= p_end
          and sentiment in ('neutral'::public.sentiment_kind, 'unknown'::public.sentiment_kind)
      ) as neutral_count,
      count(*) filter (
        where observed_at >= p_start and observed_at <= p_end
          and sentiment = 'negative'::public.sentiment_kind
      ) as negative_count,
      count(distinct case
        when observed_at >= p_start and observed_at <= p_end
          then coalesce(nullif(btrim(author), ''), 'Unknown author')
      end) as author_count,
      count(distinct case
        when observed_at >= p_start and observed_at <= p_end then platform
      end) as source_count,
      min(observed_at) filter (
        where observed_at >= p_start and observed_at <= p_end
      ) as range_first_at,
      max(observed_at) filter (
        where observed_at >= p_start and observed_at <= p_end
      ) as range_last_at,
      min(observed_at) as first_at,
      max(observed_at) as last_at
    from scoped_mentions
  ),
  current_sources as (
    select
      scoped.platform::text as source,
      case scoped.platform::text
        when 'youtube' then 'YouTube'
        when 'rss' then 'RSS & Atom'
        when 'blog' then 'RSS & Atom'
        when 'manual_url' then 'Manual URL'
        when 'manual_note' then 'Manual note'
        when 'reddit' then 'Reddit'
        when 'news' then 'News'
        when 'instagram' then 'Instagram'
        when 'tiktok' then 'TikTok'
        when 'facebook' then 'Facebook'
        when 'linkedin' then 'LinkedIn'
        when 'x' then 'X'
        else 'Other source'
      end as label,
      count(*) as record_count,
      coalesce(sum(scoped.engagement), 0) as engagement,
      min(scoped.observed_at) as first_at,
      max(scoped.observed_at) as last_at
    from scoped_mentions scoped
    where scoped.observed_at >= p_start
      and scoped.observed_at <= p_end
    group by scoped.platform
  ),
  source_summary as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'source', source,
          'label', label,
          'records', record_count,
          'engagement', engagement,
          'firstObservedAt', first_at,
          'lastObservedAt', last_at
        )
        order by record_count desc, label asc
      ),
      '[]'::jsonb
    ) as counts
    from current_sources
  ),
  run_summary as (
    select
      max(coalesce(run.completed_at, run.started_at)) as latest_run_at,
      max(coalesce(run.completed_at, run.started_at)) filter (
        where run.status = 'completed'
      ) as latest_success_at
    from public.monitor_runs run
    where run.monitoring_query_id = p_monitor_id
      and run.project_id = target_project_id
  ),
  latest_run as (
    select run.status
    from public.monitor_runs run
    where run.monitoring_query_id = p_monitor_id
      and run.project_id = target_project_id
    order by run.started_at desc, run.id desc
    limit 1
  )
  select
    p_monitor_id,
    clean_topic,
    p_start,
    p_end,
    stats.current_count,
    stats.previous_count,
    stats.all_time_count,
    case
      when stats.previous_count <= 0 then
        case when stats.current_count > 0 then 100 else 0 end
      else round(
        ((stats.current_count - stats.previous_count)::numeric / stats.previous_count::numeric) * 100
      )::integer
    end,
    stats.current_engagement,
    case when stats.current_count > 0
      then round((stats.positive_count::numeric / stats.current_count::numeric) * 100)::integer
      else 0
    end,
    case when stats.current_count > 0
      then round((stats.neutral_count::numeric / stats.current_count::numeric) * 100)::integer
      else 0
    end,
    case when stats.current_count > 0
      then round((stats.negative_count::numeric / stats.current_count::numeric) * 100)::integer
      else 0
    end,
    stats.author_count,
    stats.source_count,
    stats.range_first_at,
    stats.range_last_at,
    stats.first_at,
    stats.last_at,
    sources.counts,
    runs.latest_run_at,
    runs.latest_success_at,
    latest.status
  from raw_stats stats
  cross join source_summary sources
  cross join run_summary runs
  left join latest_run latest on true;
end;
$$;

revoke all on function public.radar_monitor_summary(
  uuid, timestamptz, timestamptz, timestamptz, timestamptz, text
) from public, anon;

grant execute on function public.radar_monitor_summary(
  uuid, timestamptz, timestamptz, timestamptz, timestamptz, text
) to authenticated;

comment on function public.radar_monitor_summary(
  uuid, timestamptz, timestamptz, timestamptz, timestamptz, text
) is
  'Returns RLS-scoped Radar coverage and headline analytics for a monitor, date range, and optional detected topic.';
