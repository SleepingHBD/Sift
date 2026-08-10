-- Cover standalone foreign-key lookup paths introduced by the Strategy Session handoff.

create index strategy_session_pieces_project_id_idx
  on public.strategy_session_pieces (project_id);

create index strategy_session_piece_sources_project_id_idx
  on public.strategy_session_piece_sources (project_id);

create index strategy_session_turns_ai_message_id_idx
  on public.strategy_session_turns (ai_message_id)
  where ai_message_id is not null;
