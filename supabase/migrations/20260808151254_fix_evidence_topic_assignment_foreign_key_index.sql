-- Cover the composite topic/project foreign key in its declared order so
-- topic deletion and integrity checks do not scan all assignments.

create index evidence_topic_assignments_topic_project_idx
  on public.evidence_topic_assignments (topic_id, project_id);
