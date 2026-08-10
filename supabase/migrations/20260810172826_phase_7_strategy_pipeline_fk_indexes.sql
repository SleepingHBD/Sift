-- Cover every Phase 7 foreign-key access path in its declared column order.

create index strategy_stages_session_project_idx
  on public.strategy_stages (session_id, project_id);

create index strategy_session_inputs_session_project_idx
  on public.strategy_session_inputs (session_id, project_id);

create index strategy_stage_alternatives_project_idx
  on public.strategy_stage_alternatives (project_id);

create index strategy_stage_dependencies_project_idx
  on public.strategy_stage_dependencies (project_id);

create index strategy_stage_sources_project_idx
  on public.strategy_stage_sources (project_id);

drop index public.strategy_stage_revisions_alternative_idx;
create index strategy_stage_revisions_alternative_idx
  on public.strategy_stage_revisions (
    alternative_id,
    project_id,
    stage_id,
    created_at desc
  )
  where alternative_id is not null;

create index strategy_stage_revisions_project_idx
  on public.strategy_stage_revisions (project_id);
