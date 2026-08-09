-- Allow a permanent account to remove a disposable working Signal without
-- weakening provenance protection. Original Research, Inspiration, and Radar
-- records are never deleted; only their Signal relationships are detached.

revoke delete on table public.signals from authenticated;

create or replace function public.preview_signal_deletion(
  p_signal_id uuid
)
returns table (
  deletable boolean,
  blockers text[],
  evidence_link_count bigint,
  assessment_count bigint,
  revision_count bigint,
  lineage_count bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  candidate public.signals%rowtype;
  has_signal_lineage boolean := false;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if coalesce((((select auth.jwt()) ->> 'is_anonymous'))::boolean, true) then
    raise exception 'A permanent account is required.' using errcode = '42501';
  end if;

  select signal.* into candidate
  from public.signals signal
  where signal.id = p_signal_id;

  if candidate.id is null then
    raise exception 'Signal is unavailable.' using errcode = '42501';
  end if;

  select exists (
    select 1
    from public.signal_lineage lineage
    where lineage.project_id = candidate.project_id
      and (
        lineage.source_signal_id = candidate.id
        or lineage.target_signal_id = candidate.id
      )
  ) or exists (
    select 1
    from public.signals related
    where related.project_id = candidate.project_id
      and related.superseded_by_signal_id = candidate.id
  ) into has_signal_lineage;

  select count(*) into evidence_link_count
  from public.signal_evidence link
  where link.project_id = candidate.project_id
    and link.signal_id = candidate.id;

  select count(*) into assessment_count
  from public.signal_snapshots snapshot
  where snapshot.project_id = candidate.project_id
    and snapshot.signal_id = candidate.id;

  select count(*) into revision_count
  from public.signal_revisions revision
  where revision.project_id = candidate.project_id
    and revision.signal_id = candidate.id;

  select count(*) into lineage_count
  from public.signal_lineage lineage
  where lineage.project_id = candidate.project_id
    and (
      lineage.source_signal_id = candidate.id
      or lineage.target_signal_id = candidate.id
    );

  blockers := pg_catalog.array_remove(array[
    case
      when candidate.status = 'promoted'
        or candidate.kind = 'observed_trend'
        or candidate.promoted_trend_id is not null
      then 'Promoted Signals are preserved with their linked observed Trend.'
    end,
    case
      when candidate.superseded_by_signal_id is not null or has_signal_lineage
      then 'Signals involved in a merge or split are preserved as provenance.'
    end
  ], null);
  deletable := cardinality(blockers) = 0;
  return next;
end;
$$;

create or replace function private.delete_signal_candidate_internal(
  p_signal_id uuid
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  candidate public.signals%rowtype;
  deleted_count integer := 0;
begin
  if caller_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if coalesce((((select auth.jwt()) ->> 'is_anonymous'))::boolean, true) then
    raise exception 'A permanent account is required.' using errcode = '42501';
  end if;

  select signal.* into candidate
  from public.signals signal
  where signal.id = p_signal_id
  for update;

  if candidate.id is null
    or not candidate.project_id = any(((select private.accessible_project_ids()))::uuid[])
  then
    raise exception 'Signal is unavailable.' using errcode = '42501';
  end if;

  if candidate.status = 'promoted'
    or candidate.kind = 'observed_trend'
    or candidate.promoted_trend_id is not null
  then
    raise exception 'Promoted Signals cannot be deleted.' using errcode = '22023';
  end if;

  if candidate.superseded_by_signal_id is not null
    or exists (
      select 1
      from public.signal_lineage lineage
      where lineage.project_id = candidate.project_id
        and (
          lineage.source_signal_id = candidate.id
          or lineage.target_signal_id = candidate.id
        )
    )
    or exists (
      select 1
      from public.signals related
      where related.project_id = candidate.project_id
        and related.superseded_by_signal_id = candidate.id
    )
  then
    raise exception 'Signals involved in a merge or split cannot be deleted.' using errcode = '22023';
  end if;

  delete from public.signals signal
  where signal.id = candidate.id
    and signal.project_id = candidate.project_id;
  get diagnostics deleted_count = row_count;

  if deleted_count <> 1 then
    raise exception 'Signal could not be deleted.' using errcode = 'P0001';
  end if;

  return candidate.id;
end;
$$;

create or replace function public.delete_signal_candidate(
  p_signal_id uuid
)
returns uuid
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.delete_signal_candidate_internal(p_signal_id);
$$;

revoke all on function public.preview_signal_deletion(uuid)
from public, anon, authenticated, service_role;
revoke all on function private.delete_signal_candidate_internal(uuid)
from public, anon, authenticated, service_role;
revoke all on function public.delete_signal_candidate(uuid)
from public, anon, authenticated, service_role;

grant execute on function public.preview_signal_deletion(uuid)
to authenticated;
grant execute on function private.delete_signal_candidate_internal(uuid)
to authenticated;
grant execute on function public.delete_signal_candidate(uuid)
to authenticated;

comment on function public.preview_signal_deletion(uuid) is
  'RLS-scoped preview of whether a working Signal may be permanently deleted and which relationships will be detached.';
comment on function private.delete_signal_candidate_internal(uuid) is
  'Authorization-checked permanent deletion for an unpromoted Signal with no merge or split lineage.';
comment on function public.delete_signal_candidate(uuid) is
  'RLS-caller wrapper for guarded permanent deletion of a disposable working Signal.';
