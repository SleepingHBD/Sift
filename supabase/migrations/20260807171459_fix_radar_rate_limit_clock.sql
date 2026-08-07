-- Avoid the reserved CURRENT_TIME keyword when calculating Radar quotas.
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
  v_now timestamptz := pg_catalog.clock_timestamp();
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
    v_now,
    1,
    v_now,
    1,
    v_now
  )
  on conflict (user_id) do update
  set
    minute_window_started_at = case
      when private.radar_rate_limits.minute_window_started_at <= v_now - interval '1 minute'
        then v_now
      else private.radar_rate_limits.minute_window_started_at
    end,
    minute_count = case
      when private.radar_rate_limits.minute_window_started_at <= v_now - interval '1 minute'
        then 1
      else private.radar_rate_limits.minute_count + 1
    end,
    day_window_started_at = case
      when private.radar_rate_limits.day_window_started_at <= v_now - interval '1 day'
        then v_now
      else private.radar_rate_limits.day_window_started_at
    end,
    day_count = case
      when private.radar_rate_limits.day_window_started_at <= v_now - interval '1 day'
        then 1
      else private.radar_rate_limits.day_count + 1
    end,
    updated_at = v_now
  returning * into current_limit;

  return query
  select
    current_limit.minute_count <= minute_limit
      and current_limit.day_count <= day_limit,
    case
      when current_limit.day_count > day_limit then greatest(
        1,
        pg_catalog.ceil(extract(epoch from (
          current_limit.day_window_started_at + interval '1 day' - v_now
        )))::integer
      )
      when current_limit.minute_count > minute_limit then greatest(
        1,
        pg_catalog.ceil(extract(epoch from (
          current_limit.minute_window_started_at + interval '1 minute' - v_now
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
