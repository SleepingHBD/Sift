-- Cover the composite session/project foreign key in its declared column order.
-- The trailing timeline columns also support deterministic turn hydration.

create index strategy_session_turns_session_project_timeline_idx
  on public.strategy_session_turns (session_id, project_id, created_at, id);
