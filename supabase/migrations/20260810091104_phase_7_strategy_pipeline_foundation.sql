-- Phase 7: trusted strategy-pipeline foundation.
--
-- The existing strategy_sessions and strategy_stages tables remain the
-- authoritative working pipeline. This migration adds project-safe inputs,
-- original-evidence citations, dependencies, retained alternatives, approval
-- state, and immutable revisions before the Insight Builder writes records.

alter table public.strategy_sessions
  alter column created_by set default auth.uid(),
  add column origin text not null default 'strategist',
  add constraint strategy_sessions_title_length_check
    check (char_length(btrim(title)) between 1 and 200),
  add constraint strategy_sessions_source_scope_object_check
    check (jsonb_typeof(source_scope) = 'object'),
  add constraint strategy_sessions_origin_check
    check (origin in ('strategist', 'signal_assisted', 'ai_assisted', 'mixed')),
  add constraint strategy_sessions_id_project_id_key unique (id, project_id);

alter table public.strategy_stages
  add column project_id uuid,
  add column created_by uuid,
  add column status text not null default 'draft',
  add column confidence text not null default 'low',
  add column research_gaps text[] not null default '{}',
  add column approval_note text,
  add column approved_at timestamptz,
  add column approved_by uuid references auth.users(id) on delete set null;

update public.strategy_stages stage
set
  project_id = session.project_id,
  created_by = session.created_by
from public.strategy_sessions session
where session.id = stage.session_id;

alter table public.strategy_stages
  alter column project_id set not null,
  alter column created_by set not null,
  alter column created_by set default auth.uid(),
  add constraint strategy_stages_project_id_fkey
    foreign key (project_id) references public.projects(id) on delete cascade,
  add constraint strategy_stages_session_project_fkey
    foreign key (session_id, project_id)
    references public.strategy_sessions(id, project_id)
    on delete cascade,
  add constraint strategy_stages_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete restrict,
  add constraint strategy_stages_id_project_id_key unique (id, project_id),
  add constraint strategy_stages_content_length_check
    check (char_length(btrim(content)) between 1 and 10000),
  add constraint strategy_stages_position_check
    check (position between 1 and 100),
  add constraint strategy_stages_status_check
    check (status in ('draft', 'ready', 'approved')),
  add constraint strategy_stages_confidence_check
    check (confidence in ('low', 'medium', 'high')),
  add constraint strategy_stages_research_gaps_check
    check (cardinality(research_gaps) <= 20),
  add constraint strategy_stages_approval_note_length_check
    check (approval_note is null or char_length(approval_note) <= 2000),
  add constraint strategy_stages_approval_state_check
    check (
      (status = 'approved' and approved_at is not null and approved_by is not null)
      or
      (status <> 'approved' and approved_at is null and approved_by is null)
    );

create table public.strategy_session_inputs (
  id uuid primary key default extensions.gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  session_id uuid not null,
  input_type text not null check (input_type in ('signal', 'ai_message')),
  input_id uuid not null,
  role text not null default 'starting_point' check (role in ('starting_point', 'context')),
  rationale text check (rationale is null or char_length(rationale) <= 2000),
  added_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  foreign key (session_id, project_id)
    references public.strategy_sessions(id, project_id)
    on delete cascade,
  unique (session_id, input_type, input_id)
);

create table public.strategy_stage_alternatives (
  id uuid primary key default extensions.gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  stage_id uuid not null,
  content text not null check (char_length(btrim(content)) between 1 and 10000),
  claim_type public.claim_kind not null,
  confidence text not null default 'low' check (confidence in ('low', 'medium', 'high')),
  status text not null default 'considering' check (status in ('considering', 'retained', 'rejected')),
  rationale text check (rationale is null or char_length(rationale) <= 2000),
  research_gaps text[] not null default '{}' check (cardinality(research_gaps) <= 20),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  foreign key (stage_id, project_id)
    references public.strategy_stages(id, project_id)
    on delete cascade,
  unique (id, project_id, stage_id)
);

create table public.strategy_stage_sources (
  id uuid primary key default extensions.gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  stage_id uuid not null,
  alternative_id uuid,
  evidence_type public.item_kind not null check (
    evidence_type in (
      'mention'::public.item_kind,
      'research'::public.item_kind,
      'inspiration'::public.item_kind
    )
  ),
  evidence_id uuid not null,
  relationship text not null check (relationship in ('support', 'contradict', 'context')),
  excerpt text check (excerpt is null or char_length(excerpt) <= 5000),
  rationale text check (rationale is null or char_length(rationale) <= 2000),
  added_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  foreign key (stage_id, project_id)
    references public.strategy_stages(id, project_id)
    on delete cascade,
  foreign key (alternative_id, project_id, stage_id)
    references public.strategy_stage_alternatives(id, project_id, stage_id)
    on delete cascade,
  unique nulls not distinct (
    stage_id,
    alternative_id,
    evidence_type,
    evidence_id,
    relationship
  )
);

create table public.strategy_stage_dependencies (
  id uuid primary key default extensions.gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  stage_id uuid not null,
  depends_on_stage_id uuid not null,
  relationship text not null default 'derives_from'
    check (relationship in ('derives_from', 'qualifies', 'challenges')),
  rationale text check (rationale is null or char_length(rationale) <= 2000),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  foreign key (stage_id, project_id)
    references public.strategy_stages(id, project_id)
    on delete cascade,
  foreign key (depends_on_stage_id, project_id)
    references public.strategy_stages(id, project_id)
    on delete cascade,
  check (stage_id <> depends_on_stage_id),
  unique (stage_id, depends_on_stage_id, relationship)
);

create table public.strategy_stage_revisions (
  id uuid primary key default extensions.gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  stage_id uuid not null,
  alternative_id uuid,
  entity_type text not null check (entity_type in ('stage', 'alternative')),
  change_kind text not null check (change_kind in ('correction', 'status', 'approval', 'order', 'research_gaps')),
  changed_fields text[] not null check (cardinality(changed_fields) between 1 and 32),
  before_state jsonb not null check (jsonb_typeof(before_state) = 'object'),
  after_state jsonb not null check (jsonb_typeof(after_state) = 'object'),
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default pg_catalog.now(),
  foreign key (stage_id, project_id)
    references public.strategy_stages(id, project_id)
    on delete cascade,
  foreign key (alternative_id, project_id, stage_id)
    references public.strategy_stage_alternatives(id, project_id, stage_id)
    on delete cascade,
  check (
    (entity_type = 'stage' and alternative_id is null)
    or
    (entity_type = 'alternative' and alternative_id is not null)
  )
);

create index strategy_sessions_project_updated_idx
  on public.strategy_sessions (project_id, updated_at desc, id desc);
create index strategy_stages_project_session_position_idx
  on public.strategy_stages (project_id, session_id, position, id);
create index strategy_stages_created_by_idx
  on public.strategy_stages (created_by);
create index strategy_stages_approved_by_idx
  on public.strategy_stages (approved_by)
  where approved_by is not null;
create index strategy_session_inputs_project_session_idx
  on public.strategy_session_inputs (project_id, session_id, created_at desc, id desc);
create index strategy_session_inputs_source_lookup_idx
  on public.strategy_session_inputs (input_type, input_id, session_id);
create index strategy_session_inputs_added_by_idx
  on public.strategy_session_inputs (added_by);
create index strategy_stage_alternatives_stage_project_idx
  on public.strategy_stage_alternatives (stage_id, project_id, status, updated_at desc, id desc);
create index strategy_stage_alternatives_created_by_idx
  on public.strategy_stage_alternatives (created_by);
create index strategy_stage_sources_stage_project_idx
  on public.strategy_stage_sources (stage_id, project_id, relationship, created_at desc, id desc);
create index strategy_stage_sources_source_lookup_idx
  on public.strategy_stage_sources (evidence_type, evidence_id, project_id, stage_id);
create index strategy_stage_sources_alternative_idx
  on public.strategy_stage_sources (alternative_id, project_id, stage_id)
  where alternative_id is not null;
create index strategy_stage_sources_added_by_idx
  on public.strategy_stage_sources (added_by);
create index strategy_stage_dependencies_stage_project_idx
  on public.strategy_stage_dependencies (stage_id, project_id, created_at desc, id desc);
create index strategy_stage_dependencies_upstream_project_idx
  on public.strategy_stage_dependencies (depends_on_stage_id, project_id, stage_id);
create index strategy_stage_dependencies_created_by_idx
  on public.strategy_stage_dependencies (created_by);
create index strategy_stage_revisions_stage_project_created_idx
  on public.strategy_stage_revisions (stage_id, project_id, created_at desc, id desc);
create index strategy_stage_revisions_alternative_idx
  on public.strategy_stage_revisions (alternative_id, project_id, created_at desc)
  where alternative_id is not null;
create index strategy_stage_revisions_changed_by_idx
  on public.strategy_stage_revisions (changed_by)
  where changed_by is not null;

alter table public.strategy_session_inputs enable row level security;
alter table public.strategy_stage_alternatives enable row level security;
alter table public.strategy_stage_sources enable row level security;
alter table public.strategy_stage_dependencies enable row level security;
alter table public.strategy_stage_revisions enable row level security;

create or replace function private.strategy_original_evidence_exists(
  p_project_id uuid,
  p_evidence_type public.item_kind,
  p_evidence_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select case p_evidence_type
    when 'mention'::public.item_kind then exists (
      select 1 from public.mentions source
      where source.id = p_evidence_id and source.project_id = p_project_id
    )
    when 'research'::public.item_kind then exists (
      select 1 from public.research_items source
      where source.id = p_evidence_id and source.project_id = p_project_id
    )
    when 'inspiration'::public.item_kind then exists (
      select 1 from public.inspiration_items source
      where source.id = p_evidence_id and source.project_id = p_project_id
    )
    else false
  end;
$$;

create or replace function private.strategy_input_exists(
  p_project_id uuid,
  p_input_type text,
  p_input_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select case p_input_type
    when 'signal' then exists (
      select 1 from public.signals source
      where source.id = p_input_id and source.project_id = p_project_id
    )
    when 'ai_message' then exists (
      select 1
      from public.ai_messages message
      join public.ai_conversations conversation
        on conversation.id = message.conversation_id
      where message.id = p_input_id
        and message.role = 'assistant'
        and conversation.project_id = p_project_id
        and conversation.user_id = (select auth.uid())
    )
    else false
  end;
$$;

revoke all on function private.strategy_original_evidence_exists(uuid, public.item_kind, uuid)
from public, anon, authenticated, service_role;
revoke all on function private.strategy_input_exists(uuid, text, uuid)
from public, anon, authenticated, service_role;
grant execute on function private.strategy_original_evidence_exists(uuid, public.item_kind, uuid)
to authenticated, service_role;
grant execute on function private.strategy_input_exists(uuid, text, uuid)
to authenticated, service_role;

create or replace function private.prepare_strategy_session_before_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (
    new.project_id <> old.project_id
    or new.created_by <> old.created_by
    or new.created_at <> old.created_at
  ) then
    raise exception 'Strategy session ownership cannot be changed.' using errcode = '22023';
  end if;
  return new;
end;
$$;

create or replace function private.prepare_strategy_session_input_before_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (
    new.project_id <> old.project_id
    or new.session_id <> old.session_id
    or new.input_type <> old.input_type
    or new.input_id <> old.input_id
    or new.added_by <> old.added_by
    or new.created_at <> old.created_at
  ) then
    raise exception 'Strategy input identity cannot be changed.' using errcode = '22023';
  end if;

  if not private.strategy_input_exists(new.project_id, new.input_type, new.input_id) then
    raise exception 'Strategy input must reference an available Signal or saved assistant analysis in the same project.'
      using errcode = '23503';
  end if;
  return new;
end;
$$;

create or replace function private.prepare_strategy_stage_alternative_before_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (
    new.project_id <> old.project_id
    or new.stage_id <> old.stage_id
    or new.created_by <> old.created_by
    or new.created_at <> old.created_at
  ) then
    raise exception 'Strategy alternative identity cannot be changed.' using errcode = '22023';
  end if;
  return new;
end;
$$;

create or replace function private.prepare_strategy_stage_source_before_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (
    new.project_id <> old.project_id
    or new.stage_id <> old.stage_id
    or new.alternative_id is distinct from old.alternative_id
    or new.evidence_type <> old.evidence_type
    or new.evidence_id <> old.evidence_id
    or new.added_by <> old.added_by
    or new.created_at <> old.created_at
  ) then
    raise exception 'Strategy evidence identity cannot be changed.' using errcode = '22023';
  end if;

  if new.evidence_type = 'mention'::public.item_kind then
    perform pg_catalog.pg_advisory_xact_lock_shared(
      pg_catalog.hashtextextended(new.evidence_id::text, 40904)
    );
  end if;

  if not private.strategy_original_evidence_exists(
    new.project_id,
    new.evidence_type,
    new.evidence_id
  ) then
    raise exception 'Strategy evidence must reference an available source in the same project.'
      using errcode = '23503';
  end if;
  return new;
end;
$$;

create or replace function private.prepare_strategy_stage_dependency_before_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_session_id uuid;
  upstream_session_id uuid;
begin
  if tg_op = 'UPDATE' and (
    new.project_id <> old.project_id
    or new.stage_id <> old.stage_id
    or new.depends_on_stage_id <> old.depends_on_stage_id
    or new.created_by <> old.created_by
    or new.created_at <> old.created_at
  ) then
    raise exception 'Strategy dependency identity cannot be changed.' using errcode = '22023';
  end if;

  select stage.session_id into target_session_id
  from public.strategy_stages stage
  where stage.id = new.stage_id and stage.project_id = new.project_id;

  select stage.session_id into upstream_session_id
  from public.strategy_stages stage
  where stage.id = new.depends_on_stage_id and stage.project_id = new.project_id;

  if target_session_id is null or upstream_session_id is null
    or target_session_id <> upstream_session_id then
    raise exception 'Strategy dependencies must connect stages in the same session.'
      using errcode = '23503';
  end if;

  if tg_op = 'INSERT' and exists (
    with recursive ancestry(stage_id) as (
      select new.depends_on_stage_id
      union
      select dependency.depends_on_stage_id
      from public.strategy_stage_dependencies dependency
      join ancestry current_stage on dependency.stage_id = current_stage.stage_id
      where dependency.project_id = new.project_id
    )
    select 1 from ancestry where stage_id = new.stage_id
  ) then
    raise exception 'Strategy stage dependencies cannot contain a cycle.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function private.prepare_strategy_stage_before_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  material_changed boolean := false;
  caller_id uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    if new.status = 'approved' then
      raise exception 'Save the strategy stage before approving it.' using errcode = '22023';
    end if;
  else
    if new.project_id <> old.project_id
      or new.session_id <> old.session_id
      or new.stage <> old.stage
      or new.created_by <> old.created_by
      or new.created_at <> old.created_at then
      raise exception 'Strategy stage identity cannot be changed.' using errcode = '22023';
    end if;

    material_changed :=
      new.content is distinct from old.content
      or new.claim_type is distinct from old.claim_type
      or new.position is distinct from old.position
      or new.confidence is distinct from old.confidence
      or new.research_gaps is distinct from old.research_gaps;

    if material_changed then
      new.status := 'draft';
      new.approved_at := null;
      new.approved_by := null;
    end if;
  end if;

  if new.stage = 'strategic_proposition' and not exists (
    select 1
    from public.strategy_stages opportunity
    where opportunity.session_id = new.session_id
      and opportunity.project_id = new.project_id
      and opportunity.stage = 'opportunity'
      and nullif(btrim(opportunity.content), '') is not null
  ) then
    raise exception 'Record an explicit Opportunity before adding a Strategic Proposition.'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' and new.status = 'approved' and old.status <> 'approved' then
    if caller_id is null then
      raise exception 'An authenticated strategist is required to approve a stage.' using errcode = '42501';
    end if;

    if (
      new.claim_type = 'evidence'::public.claim_kind
      or new.stage in ('observation', 'insight')
    ) and not exists (
      select 1
      from public.strategy_stage_sources source
      where source.stage_id = new.id
        and source.project_id = new.project_id
        and source.alternative_id is null
        and source.relationship = 'support'
    ) then
      raise exception 'Measured observations and workspace-backed insights require supporting original evidence before approval.'
        using errcode = '23514';
    end if;

    if new.stage <> 'observation' and not exists (
      select 1
      from public.strategy_stage_dependencies dependency
      where dependency.stage_id = new.id
        and dependency.project_id = new.project_id
    ) then
      raise exception 'Approve at least one earlier claim dependency before approving this stage.'
        using errcode = '23514';
    end if;

    if new.stage = 'strategic_proposition' and not exists (
      select 1
      from public.strategy_stage_dependencies dependency
      join public.strategy_stages opportunity
        on opportunity.id = dependency.depends_on_stage_id
       and opportunity.project_id = dependency.project_id
      where dependency.stage_id = new.id
        and dependency.project_id = new.project_id
        and opportunity.stage = 'opportunity'
    ) then
      raise exception 'A Strategic Proposition must depend directly on an explicit Opportunity.'
        using errcode = '23514';
    end if;

    new.approved_by := caller_id;
    new.approved_at := pg_catalog.now();
  elsif new.status <> 'approved' then
    new.approved_by := null;
    new.approved_at := null;
  else
    new.approved_by := old.approved_by;
    new.approved_at := old.approved_at;
  end if;

  return new;
end;
$$;

create or replace function private.record_strategy_stage_revision_after_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_payload jsonb := pg_catalog.to_jsonb(old);
  after_payload jsonb := pg_catalog.to_jsonb(new);
  changed_columns text[];
  revision_kind text := 'correction';
  target_stage_id uuid;
  target_alternative_id uuid;
  target_entity_type text;
begin
  select coalesce(pg_catalog.array_agg(field_name order by field_name), '{}'::text[])
  into changed_columns
  from (
    select field_name
    from pg_catalog.jsonb_object_keys(before_payload || after_payload) as fields(field_name)
    where before_payload -> field_name is distinct from after_payload -> field_name
      and field_name <> 'updated_at'
  ) changed;

  if cardinality(changed_columns) = 0 then
    return new;
  end if;

  revision_kind := case
    when 'approved_at' = any(changed_columns)
      or 'approved_by' = any(changed_columns) then 'approval'
    when 'status' = any(changed_columns) then 'status'
    when 'position' = any(changed_columns) then 'order'
    when 'research_gaps' = any(changed_columns) then 'research_gaps'
    else 'correction'
  end;

  if tg_table_name = 'strategy_stages' then
    target_stage_id := new.id;
    target_alternative_id := null;
    target_entity_type := 'stage';
  else
    target_stage_id := new.stage_id;
    target_alternative_id := new.id;
    target_entity_type := 'alternative';
  end if;

  insert into public.strategy_stage_revisions (
    project_id,
    stage_id,
    alternative_id,
    entity_type,
    change_kind,
    changed_fields,
    before_state,
    after_state,
    changed_by
  ) values (
    new.project_id,
    target_stage_id,
    target_alternative_id,
    target_entity_type,
    revision_kind,
    changed_columns,
    before_payload,
    after_payload,
    (select auth.uid())
  );
  return new;
end;
$$;

create or replace function private.prevent_strategy_source_delete()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  source_kind public.item_kind;
begin
  source_kind := case tg_table_name
    when 'mentions' then 'mention'::public.item_kind
    when 'research_items' then 'research'::public.item_kind
    when 'inspiration_items' then 'inspiration'::public.item_kind
    else null
  end;

  if source_kind is not null
    and exists (select 1 from public.projects project where project.id = old.project_id)
    and exists (
      select 1
      from public.strategy_stage_sources source
      where source.project_id = old.project_id
        and source.evidence_type = source_kind
        and source.evidence_id = old.id
    ) then
    raise exception 'Evidence is cited by a strategy stage. Remove the stage citation before deleting it.'
      using errcode = '23503';
  end if;
  return old;
end;
$$;

revoke all on function private.prepare_strategy_session_before_write()
from public, anon, authenticated, service_role;
revoke all on function private.prepare_strategy_session_input_before_write()
from public, anon, authenticated, service_role;
revoke all on function private.prepare_strategy_stage_before_write()
from public, anon, authenticated, service_role;
revoke all on function private.prepare_strategy_stage_alternative_before_write()
from public, anon, authenticated, service_role;
revoke all on function private.prepare_strategy_stage_source_before_write()
from public, anon, authenticated, service_role;
revoke all on function private.prepare_strategy_stage_dependency_before_write()
from public, anon, authenticated, service_role;
revoke all on function private.record_strategy_stage_revision_after_update()
from public, anon, authenticated, service_role;
revoke all on function private.prevent_strategy_source_delete()
from public, anon, authenticated, service_role;

create trigger prepare_strategy_session_before_write
before insert or update on public.strategy_sessions
for each row execute function private.prepare_strategy_session_before_write();

create trigger prepare_strategy_session_input_before_write
before insert or update on public.strategy_session_inputs
for each row execute function private.prepare_strategy_session_input_before_write();

create trigger prepare_strategy_stage_before_write
before insert or update on public.strategy_stages
for each row execute function private.prepare_strategy_stage_before_write();

create trigger prepare_strategy_stage_alternative_before_write
before insert or update on public.strategy_stage_alternatives
for each row execute function private.prepare_strategy_stage_alternative_before_write();

create trigger set_strategy_stage_alternatives_updated_at
before update on public.strategy_stage_alternatives
for each row execute function public.set_updated_at();

create trigger prepare_strategy_stage_source_before_write
before insert or update on public.strategy_stage_sources
for each row execute function private.prepare_strategy_stage_source_before_write();

create trigger prepare_strategy_stage_dependency_before_write
before insert or update on public.strategy_stage_dependencies
for each row execute function private.prepare_strategy_stage_dependency_before_write();

create trigger record_strategy_stage_revision_after_update
after update on public.strategy_stages
for each row execute function private.record_strategy_stage_revision_after_update();

create trigger record_strategy_alternative_revision_after_update
after update on public.strategy_stage_alternatives
for each row execute function private.record_strategy_stage_revision_after_update();

create trigger prevent_strategy_mention_delete
before delete on public.mentions
for each row execute function private.prevent_strategy_source_delete();

create trigger prevent_strategy_research_delete
before delete on public.research_items
for each row execute function private.prevent_strategy_source_delete();

create trigger prevent_strategy_inspiration_delete
before delete on public.inspiration_items
for each row execute function private.prevent_strategy_source_delete();

revoke all on table
  public.strategy_sessions,
  public.strategy_stages,
  public.strategy_session_inputs,
  public.strategy_stage_alternatives,
  public.strategy_stage_sources,
  public.strategy_stage_dependencies,
  public.strategy_stage_revisions
from public, anon, authenticated, service_role;

grant select, insert, update, delete on table public.strategy_sessions
to authenticated;
grant select, insert, update on table public.strategy_stages
to authenticated;
grant select, insert, update, delete on table
  public.strategy_session_inputs,
  public.strategy_stage_sources,
  public.strategy_stage_dependencies
to authenticated;
grant select, insert, update on table public.strategy_stage_alternatives
to authenticated;
grant select on table public.strategy_stage_revisions
to authenticated;

grant select, insert, update, delete on table
  public.strategy_sessions,
  public.strategy_stages,
  public.strategy_session_inputs,
  public.strategy_stage_alternatives,
  public.strategy_stage_sources,
  public.strategy_stage_dependencies,
  public.strategy_stage_revisions
to service_role;

drop policy if exists "project members manage strategy_sessions"
on public.strategy_sessions;
drop policy if exists "access strategy stages"
on public.strategy_stages;
drop policy if exists "permanent authenticated users only"
on public.strategy_sessions;
drop policy if exists "permanent authenticated users only"
on public.strategy_stages;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'strategy_sessions',
    'strategy_stages',
    'strategy_session_inputs',
    'strategy_stage_alternatives',
    'strategy_stage_sources',
    'strategy_stage_dependencies',
    'strategy_stage_revisions'
  ] loop
    execute format(
      'create policy "permanent authenticated users only" on public.%I as restrictive for all to authenticated using (coalesce((((select auth.jwt()) ->> ''is_anonymous''))::boolean, true) is false) with check (coalesce((((select auth.jwt()) ->> ''is_anonymous''))::boolean, true) is false)',
      table_name
    );
  end loop;
end
$$;

create policy "permanent accounts read accessible strategy sessions"
on public.strategy_sessions for select to authenticated
using (
  (select auth.uid()) is not null
  and project_id = any(((select private.accessible_project_ids()))::uuid[])
);
create policy "permanent accounts create accessible strategy sessions"
on public.strategy_sessions for insert to authenticated
with check (
  created_by = (select auth.uid())
  and project_id = any(((select private.accessible_project_ids()))::uuid[])
);
create policy "permanent accounts update accessible strategy sessions"
on public.strategy_sessions for update to authenticated
using (project_id = any(((select private.accessible_project_ids()))::uuid[]))
with check (project_id = any(((select private.accessible_project_ids()))::uuid[]));
create policy "permanent accounts delete accessible strategy sessions"
on public.strategy_sessions for delete to authenticated
using (project_id = any(((select private.accessible_project_ids()))::uuid[]));

create policy "permanent accounts read accessible strategy stages"
on public.strategy_stages for select to authenticated
using (project_id = any(((select private.accessible_project_ids()))::uuid[]));
create policy "permanent accounts create accessible strategy stages"
on public.strategy_stages for insert to authenticated
with check (
  created_by = (select auth.uid())
  and project_id = any(((select private.accessible_project_ids()))::uuid[])
);
create policy "permanent accounts update accessible strategy stages"
on public.strategy_stages for update to authenticated
using (project_id = any(((select private.accessible_project_ids()))::uuid[]))
with check (project_id = any(((select private.accessible_project_ids()))::uuid[]));

create policy "permanent accounts read accessible strategy inputs"
on public.strategy_session_inputs for select to authenticated
using (project_id = any(((select private.accessible_project_ids()))::uuid[]));
create policy "permanent accounts create accessible strategy inputs"
on public.strategy_session_inputs for insert to authenticated
with check (
  added_by = (select auth.uid())
  and project_id = any(((select private.accessible_project_ids()))::uuid[])
  and private.strategy_input_exists(project_id, input_type, input_id)
);
create policy "permanent accounts update accessible strategy inputs"
on public.strategy_session_inputs for update to authenticated
using (project_id = any(((select private.accessible_project_ids()))::uuid[]))
with check (
  project_id = any(((select private.accessible_project_ids()))::uuid[])
  and private.strategy_input_exists(project_id, input_type, input_id)
);
create policy "permanent accounts delete accessible strategy inputs"
on public.strategy_session_inputs for delete to authenticated
using (project_id = any(((select private.accessible_project_ids()))::uuid[]));

create policy "permanent accounts read accessible strategy alternatives"
on public.strategy_stage_alternatives for select to authenticated
using (project_id = any(((select private.accessible_project_ids()))::uuid[]));
create policy "permanent accounts create accessible strategy alternatives"
on public.strategy_stage_alternatives for insert to authenticated
with check (
  created_by = (select auth.uid())
  and project_id = any(((select private.accessible_project_ids()))::uuid[])
);
create policy "permanent accounts update accessible strategy alternatives"
on public.strategy_stage_alternatives for update to authenticated
using (project_id = any(((select private.accessible_project_ids()))::uuid[]))
with check (project_id = any(((select private.accessible_project_ids()))::uuid[]));

create policy "permanent accounts read accessible strategy sources"
on public.strategy_stage_sources for select to authenticated
using (project_id = any(((select private.accessible_project_ids()))::uuid[]));
create policy "permanent accounts create accessible strategy sources"
on public.strategy_stage_sources for insert to authenticated
with check (
  added_by = (select auth.uid())
  and project_id = any(((select private.accessible_project_ids()))::uuid[])
  and private.strategy_original_evidence_exists(project_id, evidence_type, evidence_id)
);
create policy "permanent accounts update accessible strategy sources"
on public.strategy_stage_sources for update to authenticated
using (project_id = any(((select private.accessible_project_ids()))::uuid[]))
with check (
  project_id = any(((select private.accessible_project_ids()))::uuid[])
  and private.strategy_original_evidence_exists(project_id, evidence_type, evidence_id)
);
create policy "permanent accounts delete accessible strategy sources"
on public.strategy_stage_sources for delete to authenticated
using (project_id = any(((select private.accessible_project_ids()))::uuid[]));

create policy "permanent accounts read accessible strategy dependencies"
on public.strategy_stage_dependencies for select to authenticated
using (project_id = any(((select private.accessible_project_ids()))::uuid[]));
create policy "permanent accounts create accessible strategy dependencies"
on public.strategy_stage_dependencies for insert to authenticated
with check (
  created_by = (select auth.uid())
  and project_id = any(((select private.accessible_project_ids()))::uuid[])
);
create policy "permanent accounts update accessible strategy dependencies"
on public.strategy_stage_dependencies for update to authenticated
using (project_id = any(((select private.accessible_project_ids()))::uuid[]))
with check (project_id = any(((select private.accessible_project_ids()))::uuid[]));
create policy "permanent accounts delete accessible strategy dependencies"
on public.strategy_stage_dependencies for delete to authenticated
using (project_id = any(((select private.accessible_project_ids()))::uuid[]));

create policy "permanent accounts read accessible strategy revisions"
on public.strategy_stage_revisions for select to authenticated
using (project_id = any(((select private.accessible_project_ids()))::uuid[]));

-- Keep stage-cited Radar conversations outside automatic retention.
create or replace function private.radar_retention_candidates(
  p_monitor_id uuid,
  p_cutoff timestamptz
)
returns table (
  mention_id uuid,
  project_id uuid,
  observed_at timestamptz,
  protection_reasons text[]
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    mention.id,
    mention.project_id,
    coalesce(mention.published_at, mention.created_at),
    pg_catalog.array_remove(array[
      case when mention.is_important then 'important'::text end,
      case when mention.review_status <> 'unreviewed' then 'reviewed'::text end,
      case when exists (
        select 1 from public.mention_notes note
        where note.mention_id = mention.id and note.project_id = mention.project_id
      ) then 'note'::text end,
      case when exists (
        select 1 from public.saved_items saved
        where saved.item_type = 'mention'::public.item_kind
          and saved.item_id = mention.id and saved.project_id = mention.project_id
      ) then 'saved'::text end,
      case when exists (
        select 1 from public.item_tags tag_link
        where tag_link.item_type = 'mention'::public.item_kind
          and tag_link.item_id = mention.id and tag_link.project_id = mention.project_id
      ) then 'tagged'::text end,
      case when exists (
        select 1 from public.evidence_topic_assignments topic_link
        where topic_link.item_type = 'mention'::public.item_kind
          and topic_link.item_id = mention.id and topic_link.project_id = mention.project_id
      ) then 'strategist_topic'::text end,
      case when exists (
        select 1 from public.insight_sources source
        join public.insights insight on insight.id = source.insight_id
        where source.source_type = 'mention'::public.item_kind
          and source.source_id = mention.id and insight.project_id = mention.project_id
      ) then 'insight_citation'::text end,
      case when exists (
        select 1 from public.brief_sources source
        join public.briefs brief on brief.id = source.brief_id
        where source.source_type = 'mention'::public.item_kind
          and source.source_id = mention.id and brief.project_id = mention.project_id
      ) then 'brief_citation'::text end,
      case when exists (
        select 1 from public.trend_mentions trend_link
        join public.trends trend on trend.id = trend_link.trend_id
        where trend_link.mention_id = mention.id and trend.project_id = mention.project_id
      ) then 'trend_evidence'::text end,
      case when exists (
        select 1 from public.signal_evidence signal_link
        where signal_link.evidence_type = 'mention'::public.item_kind
          and signal_link.evidence_id = mention.id
          and signal_link.project_id = mention.project_id
      ) then 'signal_evidence'::text end,
      case when exists (
        select 1 from public.strategy_stage_sources stage_link
        where stage_link.evidence_type = 'mention'::public.item_kind
          and stage_link.evidence_id = mention.id
          and stage_link.project_id = mention.project_id
      ) then 'strategy_stage_evidence'::text end
    ]::text[], null::text)
  from public.mentions mention
  where mention.monitoring_query_id = p_monitor_id
    and coalesce(mention.published_at, mention.created_at) < p_cutoff;
$$;

revoke all on function private.radar_retention_candidates(uuid, timestamptz)
from public, anon, authenticated, service_role;
grant execute on function private.radar_retention_candidates(uuid, timestamptz)
to authenticated, service_role;

-- Add stage citations to the shared relationship inspector. The existing
-- guarded evidence deletion function already refuses every blocking row.
create or replace function public.list_evidence_relationships(
  p_kind public.item_kind,
  p_item_id uuid,
  p_project_id uuid
)
returns table (
  relationship_type text,
  relationship_id uuid,
  target_id uuid,
  target_project_id uuid,
  label text,
  blocking boolean,
  metadata jsonb
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  source_visible boolean := false;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if coalesce((((select auth.jwt()) ->> 'is_anonymous'))::boolean, true) then
    raise exception 'A permanent account is required.' using errcode = '42501';
  end if;
  if p_kind not in (
    'mention'::public.item_kind,
    'research'::public.item_kind,
    'inspiration'::public.item_kind
  ) then
    raise exception 'Unsupported evidence kind.' using errcode = '22023';
  end if;

  source_visible := case
    when p_kind = 'mention'::public.item_kind then exists (
      select 1 from public.mentions source
      where source.id = p_item_id and source.project_id = p_project_id
    )
    when p_kind = 'research'::public.item_kind then exists (
      select 1 from public.research_items source
      where source.id = p_item_id and source.project_id = p_project_id
    )
    when p_kind = 'inspiration'::public.item_kind then exists (
      select 1 from public.inspiration_items source
      where source.id = p_item_id and source.project_id = p_project_id
    )
    else false
  end;
  if not source_visible then
    raise exception 'Evidence is unavailable to this account.' using errcode = '42501';
  end if;

  return query
  select
    'signal'::text,
    link.id,
    signal.id,
    signal.project_id,
    signal.title::text,
    true,
    pg_catalog.jsonb_build_object(
      'relationship', link.relationship,
      'rationale', link.rationale,
      'signal_kind', signal.kind,
      'signal_status', signal.status
    )
  from public.signal_evidence link
  join public.signals signal on signal.id = link.signal_id
  where link.project_id = p_project_id
    and link.evidence_type = p_kind
    and link.evidence_id = p_item_id;

  return query
  select
    'strategy_stage'::text,
    source.id,
    stage.id,
    stage.project_id,
    (session.title || ' - ' || initcap(replace(stage.stage, '_', ' ')))::text,
    true,
    pg_catalog.jsonb_build_object(
      'relationship', source.relationship,
      'rationale', source.rationale,
      'excerpt', source.excerpt,
      'stage', stage.stage,
      'stage_status', stage.status,
      'claim_type', stage.claim_type,
      'alternative_id', source.alternative_id
    )
  from public.strategy_stage_sources source
  join public.strategy_stages stage on stage.id = source.stage_id
  join public.strategy_sessions session on session.id = stage.session_id
  where source.project_id = p_project_id
    and source.evidence_type = p_kind
    and source.evidence_id = p_item_id;

  return query
  select
    'insight'::text,
    source.id,
    insight.id,
    insight.project_id,
    insight.title::text,
    true,
    pg_catalog.jsonb_build_object('claim_type', source.claim_type, 'excerpt', source.excerpt)
  from public.insight_sources source
  join public.insights insight on insight.id = source.insight_id
  where source.source_type = p_kind and source.source_id = p_item_id;

  return query
  select
    'brief'::text,
    source.id,
    brief.id,
    brief.project_id,
    brief.title::text,
    true,
    pg_catalog.jsonb_build_object('excerpt', source.excerpt)
  from public.brief_sources source
  join public.briefs brief on brief.id = source.brief_id
  where source.source_type = p_kind and source.source_id = p_item_id;

  return query
  select
    case
      when saved.destination in ('insight_evidence', 'insight_seed') then 'insight'
      when saved.destination = 'brief' then 'brief'
      when saved.destination = 'project' then 'project'
      else 'saved'
    end::text,
    saved.id,
    saved.destination_id,
    coalesce(target_project.id, target_insight.project_id, target_brief.project_id, saved.project_id),
    case
      when saved.destination = 'project' then coalesce(target_project.name, 'Linked project')
      when saved.destination in ('insight_evidence', 'insight_seed') then coalesce(target_insight.title, 'Insight evidence')
      when saved.destination = 'brief' then coalesce(target_brief.title, 'Brief evidence')
      when saved.destination = 'research' then 'Research library'
      when saved.destination = 'inspiration' then 'Inspiration library'
      else 'Saved marker'
    end::text,
    saved.destination in ('insight_evidence', 'insight_seed', 'brief'),
    pg_catalog.jsonb_build_object('destination', saved.destination, 'note', saved.note, 'source_excerpt', saved.source_excerpt)
  from public.saved_items saved
  left join public.projects target_project
    on saved.destination = 'project' and target_project.id = saved.destination_id
  left join public.insights target_insight
    on saved.destination in ('insight_evidence', 'insight_seed') and target_insight.id = saved.destination_id
  left join public.briefs target_brief
    on saved.destination = 'brief' and target_brief.id = saved.destination_id
  where saved.project_id = p_project_id
    and saved.item_type = p_kind
    and saved.item_id = p_item_id
    and saved.user_id = (select auth.uid());

  return query
  select
    'tag'::text,
    item_tag.id,
    tag.id,
    item_tag.project_id,
    tag.name::text,
    false,
    '{}'::jsonb
  from public.item_tags item_tag
  join public.tags tag on tag.id = item_tag.tag_id
  where item_tag.project_id = p_project_id
    and item_tag.item_type = p_kind
    and item_tag.item_id = p_item_id;

  return query
  select
    'asset'::text,
    asset.id,
    asset.id,
    asset.project_id,
    asset.original_filename::text,
    false,
    pg_catalog.jsonb_build_object(
      'asset_kind', asset.asset_kind,
      'mime_type', asset.mime_type,
      'byte_size', asset.byte_size
    )
  from public.evidence_assets asset
  where p_kind = 'research'::public.item_kind
    and asset.project_id = p_project_id
    and asset.research_item_id = p_item_id;

  return query
  select
    'note'::text,
    note.id,
    note.id,
    note.project_id,
    'Conversation note'::text,
    false,
    pg_catalog.jsonb_build_object('preview', pg_catalog.left(note.content, 180))
  from public.mention_notes note
  where p_kind = 'mention'::public.item_kind
    and note.project_id = p_project_id
    and note.mention_id = p_item_id
    and note.user_id = (select auth.uid());

  return query
  select
    'trend'::text,
    trend.id,
    trend.id,
    trend.project_id,
    trend.name::text,
    false,
    pg_catalog.jsonb_build_object('relationship', 'trend evidence')
  from public.trend_mentions link
  join public.trends trend on trend.id = link.trend_id
  where p_kind = 'mention'::public.item_kind and link.mention_id = p_item_id;
end;
$$;

revoke all on function public.list_evidence_relationships(public.item_kind, uuid, uuid)
from public, anon, authenticated, service_role;
grant execute on function public.list_evidence_relationships(public.item_kind, uuid, uuid)
to authenticated;

comment on table public.strategy_sessions is
  'Project-scoped containers for an inspectable evidence-to-strategy argument.';
comment on table public.strategy_stages is
  'Current selected Observation through Strategic Proposition stages; edits are revisioned.';
comment on table public.strategy_session_inputs is
  'Signals and saved assistant analyses used as derivation provenance, never as original evidence.';
comment on table public.strategy_stage_sources is
  'Project-safe original evidence supporting, contradicting, or contextualizing a strategy stage or retained alternative.';
comment on table public.strategy_stage_dependencies is
  'Acyclic same-session claim dependencies that make strategic reasoning traceable.';
comment on table public.strategy_stage_alternatives is
  'Retained competing readings that can be considered or rejected without overwriting the selected stage.';
comment on table public.strategy_stage_revisions is
  'Immutable before/after history for material stage and alternative edits.';
comment on function public.list_evidence_relationships(public.item_kind, uuid, uuid) is
  'Returns RLS-visible organization and strategic relationships, including blocking Signal and strategy-stage citations.';
