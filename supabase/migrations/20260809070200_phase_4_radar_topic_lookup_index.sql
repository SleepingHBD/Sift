-- Remove the first iteration of the topic-name index. Radar reaches topic
-- names through mention_topics' primary-key path, so this extra index does not
-- improve the monitor-scoped predicate.
drop index if exists public.topics_project_name_idx;
