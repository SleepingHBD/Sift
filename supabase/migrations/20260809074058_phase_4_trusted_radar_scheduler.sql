-- Phase 4: trusted scheduled Radar execution.
--
-- Scheduling is split into three security boundaries:
--   1. pg_cron wakes a small dispatcher every minute.
--   2. pg_net calls a JWT-protected Edge Function with a second secret held in
--      Vault. No user or service-role token is stored in the job command.
--   3. the Edge Function claims only due monitors through service-role-only
--      RPCs, then reuses the same collection, quota, lease, checkpoint, and
--      persistence path as a manual run.
--
-- Retention deletion remains intentionally disabled.

create extension if not exists pg_net;
create extension if not exists pg_cron;

alter table public.monitoring_queries
  add column if not exists schedule_claim_token uuid,
  add column if not exists schedule_claim_expires_at timestamptz,
  add column if not exists schedule_failure_count integer not null default 0,
  add column if not exists last_schedule_error text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'monitoring_queries_schedule_failure_count_check'
      and conrelid = 'public.monitoring_queries'::regclass
  ) then
    alter table public.monitoring_queries
      add constraint monitoring_queries_schedule_failure_count_check
      check (schedule_failure_count >= 0);
  end if;
end
$$;

create index if not exists monitoring_queries_schedule_claim_expiry_idx
  on public.monitoring_queries (schedule_claim_expires_at, id)
  where schedule_claim_token is not null;

create or replace function private.next_radar_schedule_after(
  p_frequency text,
  p_hour smallint,
  p_weekday smallint,
  p_timezone text,
  p_after timestamptz
)
returns timestamptz
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  local_after timestamp without time zone;
  candidate_date date;
  candidate timestamptz;
  days_ahead integer;
begin
  if p_frequency not in ('daily', 'weekly') then
    return null;
  end if;

  if p_hour not between 0 and 23 or p_weekday not between 0 and 6 then
    raise exception 'The Radar schedule is invalid.' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_timezone_names
    where name = p_timezone
  ) then
    raise exception 'The Radar schedule time zone is invalid.' using errcode = '22023';
  end if;

  local_after := pg_catalog.timezone(p_timezone, p_after);
  candidate_date := local_after::date;

  if p_frequency = 'weekly' then
    days_ahead := (p_weekday - extract(dow from local_after)::integer + 7) % 7;
    candidate_date := candidate_date + days_ahead;
  end if;

  candidate := pg_catalog.make_timestamptz(
    extract(year from candidate_date)::integer,
    extract(month from candidate_date)::integer,
    extract(day from candidate_date)::integer,
    p_hour,
    0,
    0,
    p_timezone
  );

  if candidate <= p_after then
    candidate_date := candidate_date + case when p_frequency = 'daily' then 1 else 7 end;
    candidate := pg_catalog.make_timestamptz(
      extract(year from candidate_date)::integer,
      extract(month from candidate_date)::integer,
      extract(day from candidate_date)::integer,
      p_hour,
      0,
      0,
      p_timezone
    );
  end if;

  return candidate;
end;
$$;

revoke all on function private.next_radar_schedule_after(text, smallint, smallint, text, timestamptz)
from public, anon, authenticated, service_role;

grant execute on function private.next_radar_schedule_after(text, smallint, smallint, text, timestamptz)
to service_role;

create or replace function private.prepare_radar_monitor_schedule()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.schedule_frequency = 'manual' or not new.enabled then
    new.schedule_enabled := false;
  end if;

  if new.schedule_enabled then
    if tg_op = 'INSERT'
      or old.schedule_enabled is distinct from new.schedule_enabled
      or old.schedule_frequency is distinct from new.schedule_frequency
      or old.schedule_hour is distinct from new.schedule_hour
      or old.schedule_weekday is distinct from new.schedule_weekday
      or old.schedule_timezone is distinct from new.schedule_timezone
      or old.enabled is distinct from new.enabled
      or new.next_scheduled_run_at is null
    then
      new.next_scheduled_run_at := private.next_radar_schedule_after(
        new.schedule_frequency,
        new.schedule_hour,
        new.schedule_weekday,
        new.schedule_timezone,
        pg_catalog.timezone('utc', pg_catalog.now())
      );
    end if;
  else
    new.next_scheduled_run_at := null;
  end if;

  if tg_op = 'INSERT'
    or old.schedule_enabled is distinct from new.schedule_enabled
    or old.schedule_frequency is distinct from new.schedule_frequency
    or old.schedule_hour is distinct from new.schedule_hour
    or old.schedule_weekday is distinct from new.schedule_weekday
    or old.schedule_timezone is distinct from new.schedule_timezone
    or old.enabled is distinct from new.enabled
  then
    new.schedule_claim_token := null;
    new.schedule_claim_expires_at := null;
    new.schedule_failure_count := 0;
    new.last_schedule_error := null;
  end if;

  return new;
end;
$$;

revoke all on function private.prepare_radar_monitor_schedule()
from public, anon, authenticated, service_role;

drop trigger if exists prepare_radar_monitor_schedule on public.monitoring_queries;
create trigger prepare_radar_monitor_schedule
before insert or update of
  enabled,
  schedule_frequency,
  schedule_hour,
  schedule_weekday,
  schedule_timezone,
  schedule_enabled
on public.monitoring_queries
for each row
execute function private.prepare_radar_monitor_schedule();

create or replace function private.radar_scheduler_token_valid(p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_token is not null
    and char_length(p_token) >= 32
    and exists (
      select 1
      from vault.decrypted_secrets secret
      where secret.name = 'sift_radar_scheduler_token'
        and extensions.digest(secret.decrypted_secret, 'sha256')
          = extensions.digest(p_token, 'sha256')
    );
$$;

revoke all on function private.radar_scheduler_token_valid(text)
from public, anon, authenticated, service_role;

grant execute on function private.radar_scheduler_token_valid(text)
to service_role;

create or replace function private.claim_due_radar_monitors(
  p_scheduler_token text,
  p_limit integer default 2
)
returns table (
  monitor_id uuid,
  claim_token uuid,
  user_id uuid,
  project jsonb,
  monitor jsonb,
  connector_config jsonb
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_time timestamptz := pg_catalog.timezone('utc', pg_catalog.now());
begin
  if not private.radar_scheduler_token_valid(p_scheduler_token) then
    raise exception 'The Radar scheduler credential is invalid.' using errcode = '42501';
  end if;

  return query
  with due as materialized (
    select query.id
    from public.monitoring_queries query
    join public.projects project_row on project_row.id = query.project_id
    join auth.users account on account.id = project_row.owner_id
    where query.enabled
      and query.schedule_enabled
      and query.schedule_frequency in ('daily', 'weekly')
      and query.next_scheduled_run_at is not null
      and query.next_scheduled_run_at <= current_time
      and (
        query.schedule_claim_token is null
        or query.schedule_claim_expires_at is null
        or query.schedule_claim_expires_at <= current_time
      )
      and account.is_anonymous is false
    order by query.next_scheduled_run_at, query.id
    for update of query skip locked
    limit least(greatest(coalesce(p_limit, 2), 1), 3)
  ), claimed as (
    update public.monitoring_queries query
    set
      schedule_claim_token = extensions.gen_random_uuid(),
      schedule_claim_expires_at = current_time + interval '5 minutes',
      updated_at = current_time
    from due
    where query.id = due.id
    returning query.*
  )
  select
    claimed.id,
    claimed.schedule_claim_token,
    project_row.owner_id,
    pg_catalog.jsonb_build_object(
      'id', coalesce(project_row.client_ref, project_row.id::text),
      'name', project_row.name,
      'description', project_row.description,
      'market', project_row.market
    ),
    pg_catalog.jsonb_build_object(
      'id', coalesce(claimed.client_ref, claimed.id::text),
      'name', claimed.name,
      'query', claimed.query,
      'builder', coalesce(claimed.parsed_query, '{}'::jsonb),
      'language', coalesce(claimed.language, 'Any language'),
      'market', coalesce(claimed.market, ''),
      'sources', pg_catalog.to_jsonb(claimed.platform_filters)
    ),
    pg_catalog.jsonb_build_object(
      'rssFeedUrls', coalesce((
        select pg_catalog.jsonb_agg(url_value order by url_value)
        from (
          select distinct value as url_value
          from public.connector_configs config
          cross join lateral pg_catalog.jsonb_array_elements_text(
            case when pg_catalog.jsonb_typeof(config.config -> 'urls') = 'array'
              then config.config -> 'urls'
              else '[]'::jsonb
            end
          ) value
          where config.project_id = claimed.project_id
            and config.source_kind = 'rss'::public.source_kind
            and config.enabled
            and config.mode = 'live'::public.connector_mode
        ) urls
      ), '[]'::jsonb),
      'manualUrls', coalesce((
        select pg_catalog.jsonb_agg(url_value order by url_value)
        from (
          select distinct value as url_value
          from public.connector_configs config
          cross join lateral pg_catalog.jsonb_array_elements_text(
            case when pg_catalog.jsonb_typeof(config.config -> 'urls') = 'array'
              then config.config -> 'urls'
              else '[]'::jsonb
            end
          ) value
          where config.project_id = claimed.project_id
            and config.source_kind = 'manual_url'::public.source_kind
            and config.enabled
            and config.mode = 'live'::public.connector_mode
        ) urls
      ), '[]'::jsonb),
      'youtubeEnabled', exists (
        select 1
        from public.connector_configs config
        where config.project_id = claimed.project_id
          and config.source_kind = 'youtube'::public.source_kind
          and config.enabled
          and config.mode = 'live'::public.connector_mode
      )
    )
  from claimed
  join public.projects project_row on project_row.id = claimed.project_id;
end;
$$;

revoke all on function private.claim_due_radar_monitors(text, integer)
from public, anon, authenticated, service_role;

grant execute on function private.claim_due_radar_monitors(text, integer)
to service_role;

create or replace function public.claim_due_radar_monitors(
  p_scheduler_token text,
  p_limit integer default 2
)
returns table (
  monitor_id uuid,
  claim_token uuid,
  user_id uuid,
  project jsonb,
  monitor jsonb,
  connector_config jsonb
)
language sql
volatile
security invoker
set search_path = ''
as $$
  select *
  from private.claim_due_radar_monitors(p_scheduler_token, p_limit);
$$;

revoke all on function public.claim_due_radar_monitors(text, integer)
from public, anon, authenticated, service_role;

grant execute on function public.claim_due_radar_monitors(text, integer)
to service_role;

create or replace function private.finalize_radar_schedule_claim(
  p_scheduler_token text,
  p_monitor_id uuid,
  p_claim_token uuid,
  p_succeeded boolean,
  p_error text default null,
  p_retry_after_seconds integer default 900
)
returns table (
  next_scheduled_run_at timestamptz,
  schedule_failure_count integer,
  last_schedule_error text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_time timestamptz := pg_catalog.timezone('utc', pg_catalog.now());
  target public.monitoring_queries%rowtype;
  failures integer;
  next_run timestamptz;
  failure_message text;
begin
  if not private.radar_scheduler_token_valid(p_scheduler_token) then
    raise exception 'The Radar scheduler credential is invalid.' using errcode = '42501';
  end if;

  select *
  into target
  from public.monitoring_queries query
  where query.id = p_monitor_id
  for update;

  if not found
    or target.schedule_claim_token is distinct from p_claim_token
    or target.schedule_claim_expires_at is null
  then
    raise exception 'The Radar schedule claim is unavailable.' using errcode = '40001';
  end if;

  failure_message := case
    when p_succeeded then null
    else left(coalesce(nullif(btrim(p_error), ''), 'The scheduled collection did not complete.'), 2000)
  end;
  failures := case when p_succeeded then 0 else target.schedule_failure_count + 1 end;

  if not target.enabled or not target.schedule_enabled or target.schedule_frequency = 'manual' then
    next_run := null;
  elsif p_succeeded or failures >= 3 then
    next_run := private.next_radar_schedule_after(
      target.schedule_frequency,
      target.schedule_hour,
      target.schedule_weekday,
      target.schedule_timezone,
      current_time
    );
  else
    next_run := current_time + pg_catalog.make_interval(
      secs => least(greatest(coalesce(p_retry_after_seconds, 900), 60), 3600)
    );
  end if;

  update public.monitoring_queries query
  set
    schedule_claim_token = null,
    schedule_claim_expires_at = null,
    last_scheduled_run_at = current_time,
    next_scheduled_run_at = next_run,
    schedule_failure_count = failures,
    last_schedule_error = failure_message,
    updated_at = current_time
  where query.id = p_monitor_id;

  return query select next_run, failures, failure_message;
end;
$$;

revoke all on function private.finalize_radar_schedule_claim(text, uuid, uuid, boolean, text, integer)
from public, anon, authenticated, service_role;

grant execute on function private.finalize_radar_schedule_claim(text, uuid, uuid, boolean, text, integer)
to service_role;

create or replace function public.finalize_radar_schedule_claim(
  p_scheduler_token text,
  p_monitor_id uuid,
  p_claim_token uuid,
  p_succeeded boolean,
  p_error text default null,
  p_retry_after_seconds integer default 900
)
returns table (
  next_scheduled_run_at timestamptz,
  schedule_failure_count integer,
  last_schedule_error text
)
language sql
volatile
security invoker
set search_path = ''
as $$
  select *
  from private.finalize_radar_schedule_claim(
    p_scheduler_token,
    p_monitor_id,
    p_claim_token,
    p_succeeded,
    p_error,
    p_retry_after_seconds
  );
$$;

revoke all on function public.finalize_radar_schedule_claim(text, uuid, uuid, boolean, text, integer)
from public, anon, authenticated, service_role;

grant execute on function public.finalize_radar_schedule_claim(text, uuid, uuid, boolean, text, integer)
to service_role;

create or replace function private.dispatch_due_radar_monitors()
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  project_url text;
  publishable_key text;
  scheduler_token text;
  request_id bigint;
begin
  select decrypted_secret into project_url
  from vault.decrypted_secrets
  where name = 'sift_project_url';

  select decrypted_secret into publishable_key
  from vault.decrypted_secrets
  where name = 'sift_publishable_key';

  select decrypted_secret into scheduler_token
  from vault.decrypted_secrets
  where name = 'sift_radar_scheduler_token';

  if project_url is null or publishable_key is null or scheduler_token is null then
    raise exception 'Radar scheduler Vault configuration is incomplete.' using errcode = '55000';
  end if;

  select net.http_post(
    url := rtrim(project_url, '/') || '/functions/v1/radar-scheduler',
    headers := pg_catalog.jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', publishable_key,
      'Authorization', 'Bearer ' || publishable_key,
      'x-sift-scheduler-token', scheduler_token
    ),
    body := pg_catalog.jsonb_build_object('action', 'dispatch'),
    timeout_milliseconds := 120000
  ) into request_id;

  return request_id;
end;
$$;

revoke all on function private.dispatch_due_radar_monitors()
from public, anon, authenticated, service_role;

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
  if not exists (
    select 1
    from vault.decrypted_secrets
    where name in ('sift_project_url', 'sift_publishable_key', 'sift_radar_scheduler_token')
    group by true
    having count(*) = 3
  ) then
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

create or replace function private.radar_scheduler_status()
returns table (
  available boolean,
  last_dispatch_at timestamptz,
  last_dispatch_status text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
    or coalesce((((select auth.jwt()) ->> 'is_anonymous'))::boolean, true)
  then
    raise exception 'A permanent authenticated account is required.' using errcode = '42501';
  end if;

  return query
  select
    coalesce(job.active, false)
      and (
        select count(*) = 3
        from vault.secrets
        where name in ('sift_project_url', 'sift_publishable_key', 'sift_radar_scheduler_token')
      ),
    run.start_time,
    run.status
  from (select true) seed
  left join lateral (
    select cron_job.jobid, cron_job.active
    from cron.job cron_job
    where cron_job.jobname = 'sift-radar-scheduler'
    limit 1
  ) job on true
  left join lateral (
    select detail.start_time, detail.status
    from cron.job_run_details detail
    where detail.jobid = job.jobid
    order by detail.start_time desc
    limit 1
  ) run on true;
end;
$$;

revoke all on function private.radar_scheduler_status()
from public, anon, authenticated, service_role;

grant execute on function private.radar_scheduler_status()
to authenticated, service_role;

create or replace function public.radar_scheduler_status()
returns table (
  available boolean,
  last_dispatch_at timestamptz,
  last_dispatch_status text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.radar_scheduler_status();
$$;

revoke all on function public.radar_scheduler_status()
from public, anon, authenticated, service_role;

grant execute on function public.radar_scheduler_status()
to authenticated, service_role;

comment on column public.monitoring_queries.schedule_claim_token is
  'Short-lived, server-only claim preventing concurrent scheduled dispatch.';
comment on column public.monitoring_queries.schedule_claim_expires_at is
  'Expired scheduler claims are eligible for safe retry.';
comment on column public.monitoring_queries.schedule_failure_count is
  'Consecutive scheduled execution failures; reset after a successful scheduled run or schedule edit.';
comment on column public.monitoring_queries.last_schedule_error is
  'Most recent scheduled execution failure, if any. This is diagnostic data, not an AI conclusion.';
comment on function public.radar_scheduler_status() is
  'Returns non-sensitive scheduler availability and latest cron status to permanent authenticated users.';
