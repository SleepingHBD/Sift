-- Cover the Phase 5 composite signal foreign keys in their declared order.
-- The original project-first indexes serve project-scoped reads; these two
-- indexes serve referential checks and signal-first joins.

create index signal_evidence_signal_project_idx
  on public.signal_evidence (signal_id, project_id);

create index signal_snapshots_signal_project_idx
  on public.signal_snapshots (signal_id, project_id);
