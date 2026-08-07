-- Sift permanent-account and Radar abuse-prevention hardening.

-- Anonymous Auth users receive the authenticated Postgres role. Apply one
-- restrictive policy to every current public table so an anonymous JWT cannot
-- pass any otherwise valid project policy if anonymous sign-ins are ever
-- enabled accidentally or an old anonymous access token remains unexpired.
do $$
declare
  table_record record;
begin
  for table_record in
    select n.nspname as schema_name, c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
  loop
    execute format(
      'drop policy if exists "permanent authenticated users only" on %I.%I',
      table_record.schema_name,
      table_record.table_name
    );
    execute format(
      'create policy "permanent authenticated users only" on %I.%I as restrictive for all to authenticated using (coalesce((((select auth.jwt()) ->> ''is_anonymous''))::boolean, true) is false) with check (coalesce((((select auth.jwt()) ->> ''is_anonymous''))::boolean, true) is false)',
      table_record.schema_name,
      table_record.table_name
    );
  end loop;
end
$$;

-- The browser API needs only CRUD operations. These SQL-level capabilities are
-- not used by PostgREST and unnecessarily increase the role surface.
revoke truncate, references, trigger on all tables in schema public
  from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke truncate, references, trigger on tables from anon, authenticated;

-- Atomic, database-backed quotas protect external connector allowances and
-- Supabase compute from repeated or concurrent Radar invocations.
create table if not exists private.radar_rate_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  minute_window_started_at timestamptz not null,
  minute_count integer not null check (minute_count >= 0),
  day_window_started_at timestamptz not null,
  day_count integer not null check (day_count >= 0),
  updated_at timestamptz not null
);

alter table private.radar_rate_limits enable row level security;
revoke all on table private.radar_rate_limits
  from public, anon, authenticated, service_role;

create or replace function private.consume_radar_quota(target_user_id uuid)
returns table (
  allowed boolean,
  retry_after_seconds integer,
  remaining_minute integer,
  remaining_day integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_time timestamptz := pg_catalog.timezone('utc', pg_catalog.now());
  current_limit private.radar_rate_limits%rowtype;
  minute_limit constant integer := 6;
  day_limit constant integer := 100;
begin
  if target_user_id is null or not exists (
    select 1
    from auth.users u
    where u.id = target_user_id
      and u.is_anonymous is false
  ) then
    return query select false, 3600, 0, 0;
    return;
  end if;

  insert into private.radar_rate_limits (
    user_id,
    minute_window_started_at,
    minute_count,
    day_window_started_at,
    day_count,
    updated_at
  ) values (
    target_user_id,
    current_time,
    1,
    current_time,
    1,
    current_time
  )
  on conflict (user_id) do update
  set
    minute_window_started_at = case
      when private.radar_rate_limits.minute_window_started_at <= current_time - interval '1 minute'
        then current_time
      else private.radar_rate_limits.minute_window_started_at
    end,
    minute_count = case
      when private.radar_rate_limits.minute_window_started_at <= current_time - interval '1 minute'
        then 1
      else private.radar_rate_limits.minute_count + 1
    end,
    day_window_started_at = case
      when private.radar_rate_limits.day_window_started_at <= current_time - interval '1 day'
        then current_time
      else private.radar_rate_limits.day_window_started_at
    end,
    day_count = case
      when private.radar_rate_limits.day_window_started_at <= current_time - interval '1 day'
        then 1
      else private.radar_rate_limits.day_count + 1
    end,
    updated_at = current_time
  returning * into current_limit;

  return query
  select
    current_limit.minute_count <= minute_limit
      and current_limit.day_count <= day_limit,
    case
      when current_limit.day_count > day_limit then greatest(
        1,
        pg_catalog.ceil(extract(epoch from (
          current_limit.day_window_started_at + interval '1 day' - current_time
        )))::integer
      )
      when current_limit.minute_count > minute_limit then greatest(
        1,
        pg_catalog.ceil(extract(epoch from (
          current_limit.minute_window_started_at + interval '1 minute' - current_time
        )))::integer
      )
      else 0
    end,
    greatest(0, minute_limit - current_limit.minute_count),
    greatest(0, day_limit - current_limit.day_count);
end;
$$;

revoke all on function private.consume_radar_quota(uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.consume_radar_quota(uuid)
  to service_role;

-- PostgREST exposes RPC functions from the public schema. This invoker-safe
-- wrapper is callable only by the Edge Function's service role.
create or replace function public.consume_radar_quota(target_user_id uuid)
returns table (
  allowed boolean,
  retry_after_seconds integer,
  remaining_minute integer,
  remaining_day integer
)
language sql
security invoker
set search_path = ''
as $$
  select * from private.consume_radar_quota(target_user_id);
$$;

revoke all on function public.consume_radar_quota(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.consume_radar_quota(uuid)
  to service_role;
