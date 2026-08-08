-- Cover the reverse lookups used when Radar topics and competitor context are
-- deleted or joined. The primary keys cover the opposite column order only.

create index if not exists mention_topics_topic_id_idx
  on public.mention_topics (topic_id);

create index if not exists monitoring_query_competitors_competitor_id_idx
  on public.monitoring_query_competitors (competitor_id);
