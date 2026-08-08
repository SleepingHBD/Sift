-- Phase 1: cover the remaining relational foreign-key lookup paths.

create index if not exists competitor_group_members_competitor_id_idx
  on public.competitor_group_members (competitor_id);

create index if not exists project_members_user_id_idx
  on public.project_members (user_id);

create index if not exists trend_mentions_mention_id_idx
  on public.trend_mentions (mention_id);
