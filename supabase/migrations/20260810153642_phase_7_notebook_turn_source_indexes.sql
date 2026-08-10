-- Cover both foreign-key access paths reported by the database advisor.

create index strategy_session_turn_sources_project_id_idx
  on public.strategy_session_turn_sources (project_id);

create index strategy_session_turn_sources_turn_project_session_idx
  on public.strategy_session_turn_sources (turn_id, project_id, session_id);
