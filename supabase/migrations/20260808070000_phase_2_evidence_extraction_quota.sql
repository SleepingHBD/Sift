-- Phase 2: protect authenticated URL metadata extraction from repeated or
-- automated outbound requests. The browser cannot read or mutate this state.

create table if not exists private.evidence_extraction_rate_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  minute_window_started_at timestamptz not null,
  minute_count integer not null check (minute_count >= 0),
  day_window_started_at timestamptz not null,
  day_count integer not null check (day_count >= 0),
  updated_at timestamptz not null
);

alter table private.evidence_extraction_rate_limits enable row level security;
revoke all on table private.evidence_extraction_rate_limits
  from public, anon, authenticated, service_role;

create or replace function private.consume_evidence_extraction_quota(target_user_id uuid)
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
  current_limit private.evidence_extraction_rate_limits%rowtype;
  minute_limit constant integer := 15;
  day_limit constant integer := 300;
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

  insert into private.evidence_extraction_rate_limits (
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
      when private.evidence_extraction_rate_limits.minute_window_started_at <= v_now - interval '1 minute' then v_now
      else private.evidence_extraction_rate_limits.minute_window_started_at
    end,
    minute_count = case
      when private.evidence_extraction_rate_limits.minute_window_started_at <= v_now - interval '1 minute' then 1
      else private.evidence_extraction_rate_limits.minute_count + 1
    end,
    day_window_started_at = case
      when private.evidence_extraction_rate_limits.day_window_started_at <= v_now - interval '1 day' then v_now
      else private.evidence_extraction_rate_limits.day_window_started_at
    end,
    day_count = case
      when private.evidence_extraction_rate_limits.day_window_started_at <= v_now - interval '1 day' then 1
      else private.evidence_extraction_rate_limits.day_count + 1
    end,
    updated_at = v_now
  returning * into current_limit;

  return query
  select
    current_limit.minute_count <= minute_limit and current_limit.day_count <= day_limit,
    case
      when current_limit.day_count > day_limit then greatest(
        1,
        pg_catalog.ceil(extract(epoch from (current_limit.day_window_started_at + interval '1 day' - v_now)))::integer
      )
      when current_limit.minute_count > minute_limit then greatest(
        1,
        pg_catalog.ceil(extract(epoch from (current_limit.minute_window_started_at + interval '1 minute' - v_now)))::integer
      )
      else 0
    end,
    greatest(0, minute_limit - current_limit.minute_count),
    greatest(0, day_limit - current_limit.day_count);
end;
$$;

revoke all on function private.consume_evidence_extraction_quota(uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.consume_evidence_extraction_quota(uuid)
  to service_role;

create or replace function public.consume_evidence_extraction_quota(target_user_id uuid)
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
  select * from private.consume_evidence_extraction_quota(target_user_id);
$$;

revoke all on function public.consume_evidence_extraction_quota(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.consume_evidence_extraction_quota(uuid)
  to service_role;

drop policy if exists "no direct client access" on private.evidence_extraction_rate_limits;
create policy "no direct client access"
on private.evidence_extraction_rate_limits
as restrictive
for all
to anon, authenticated
using (false)
with check (false);
