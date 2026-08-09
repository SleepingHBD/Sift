-- Fix two issues discovered during the first controlled production activation:
--   1. PostgreSQL rejects the constant-expression grouping previously used
--      in the Vault completeness check.
--   2. current_time is a SQL keyword (time with time zone), so using it as a
--      PL/pgSQL variable made due-monitor timestamp comparisons ambiguous.
--
-- The migration is safe to apply after the live hotfix and during a clean
-- migration replay. It does not create secrets, schedule jobs, or delete data.

create or replace function private.install_radar_scheduler()
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  job_id bigint;
begin
  if (
    select count(*)
    from vault.decrypted_secrets
    where name in ('sift_project_url', 'sift_publishable_key', 'sift_radar_scheduler_token')
  ) <> 3 then
    raise exception 'Radar scheduler Vault configuration is incomplete.' using errcode = '55000';
  end if;

  select cron.schedule(
    'sift-radar-scheduler',
    '* * * * *',
    'select private.dispatch_due_radar_monitors();'
  ) into job_id;

  return job_id;
end;
$$;

revoke all on function private.install_radar_scheduler()
from public, anon, authenticated, service_role;

do $migration$
declare
  function_ddl text;
begin
  select pg_get_functiondef(
    'private.claim_due_radar_monitors(text, integer)'::regprocedure
  ) into function_ddl;

  if function_ddl like '%current_time timestamptz%' then
    function_ddl := replace(function_ddl, 'current_time', 'scheduler_now');
    function_ddl := replace(
      function_ddl,
      'pg_catalog.timezone(''utc'', pg_catalog.now())',
      'pg_catalog.now()'
    );
    execute function_ddl;
  elsif function_ddl not like '%scheduler_now timestamptz%' then
    raise exception 'The due-monitor claim function has an unexpected definition.';
  end if;

  select pg_get_functiondef(
    'private.finalize_radar_schedule_claim(text, uuid, uuid, boolean, text, integer)'::regprocedure
  ) into function_ddl;

  if function_ddl like '%current_time timestamptz%' then
    function_ddl := replace(function_ddl, 'current_time', 'scheduler_now');
    function_ddl := replace(
      function_ddl,
      'pg_catalog.timezone(''utc'', pg_catalog.now())',
      'pg_catalog.now()'
    );
    execute function_ddl;
  elsif function_ddl not like '%scheduler_now timestamptz%' then
    raise exception 'The schedule finalizer has an unexpected definition.';
  end if;
end;
$migration$;

revoke all on function private.claim_due_radar_monitors(text, integer)
from public, anon, authenticated, service_role;

grant execute on function private.claim_due_radar_monitors(text, integer)
to service_role;

revoke all on function private.finalize_radar_schedule_claim(text, uuid, uuid, boolean, text, integer)
from public, anon, authenticated, service_role;

grant execute on function private.finalize_radar_schedule_claim(text, uuid, uuid, boolean, text, integer)
to service_role;
