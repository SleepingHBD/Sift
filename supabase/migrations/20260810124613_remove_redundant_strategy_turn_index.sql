-- The composite session/project timeline index introduced by the previous
-- migration covers this narrower timeline path and the declared foreign key.

drop index if exists public.strategy_session_turns_session_timeline_idx;
