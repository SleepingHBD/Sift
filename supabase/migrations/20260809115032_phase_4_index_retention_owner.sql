-- Cover the audit owner foreign key so account deletion and owner-scoped
-- maintenance do not scan the complete Radar retention history.
create index radar_retention_runs_owner_started_idx
  on public.radar_retention_runs (owner_id, started_at desc)
  where owner_id is not null;
