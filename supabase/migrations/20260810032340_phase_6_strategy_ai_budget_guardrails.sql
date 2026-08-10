-- Phase 6: service-only Strategy AI usage reservations and monthly guardrails.
-- A reservation is created before an external model call so concurrent requests
-- cannot both pass the same monthly request or token limit.

create table private.strategy_ai_usage_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_request_id uuid not null,
  period_start date not null,
  model text not null,
  status text not null default 'reserved'
    check (status in ('reserved', 'completed', 'failed', 'released')),
  reserved_tokens integer not null
    check (reserved_tokens between 1 and 100000),
  actual_tokens integer
    check (actual_tokens is null or actual_tokens between 0 and reserved_tokens),
  usage jsonb not null default '{}'::jsonb
    check (jsonb_typeof(usage) = 'object'),
  failure_code text,
  expires_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, client_request_id),
  check (
    (status in ('completed', 'failed') and actual_tokens is not null)
    or (status in ('reserved', 'released') and actual_tokens is null)
  )
);

alter table private.strategy_ai_usage_reservations enable row level security;

create index strategy_ai_usage_user_period_status_idx
  on private.strategy_ai_usage_reservations (user_id, period_start, status);

revoke all on table private.strategy_ai_usage_reservations
  from public, anon, authenticated;

create or replace function private.validate_strategy_ai_budget_limits(
  p_user_id uuid,
  p_monthly_request_limit integer,
  p_monthly_token_limit integer,
  p_token_reserve integer
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_user_id is null then
    raise exception 'A Strategy AI budget requires a user.' using errcode = '22023';
  end if;
  if p_monthly_request_limit < 1 or p_monthly_request_limit > 500 then
    raise exception 'The monthly request limit is outside the supported range.' using errcode = '22023';
  end if;
  if p_token_reserve < 1000 or p_token_reserve > 100000 then
    raise exception 'The per-request token reservation is outside the supported range.' using errcode = '22023';
  end if;
  if p_monthly_token_limit < p_token_reserve or p_monthly_token_limit > 100000000 then
    raise exception 'The monthly token limit must cover at least one protected request.' using errcode = '22023';
  end if;
end;
$$;

create or replace function public.strategy_ai_budget_status(
  p_user_id uuid,
  p_monthly_request_limit integer,
  p_monthly_token_limit integer,
  p_token_reserve integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_period date := date_trunc('month', timezone('utc', statement_timestamp()))::date;
  next_period date := (date_trunc('month', timezone('utc', statement_timestamp())) + interval '1 month')::date;
  completed_requests integer := 0;
  failed_requests integer := 0;
  active_reservations integer := 0;
  used_tokens bigint := 0;
  reserved_tokens bigint := 0;
  used_requests integer := 0;
  available boolean := false;
  block_reason text;
begin
  perform private.validate_strategy_ai_budget_limits(
    p_user_id,
    p_monthly_request_limit,
    p_monthly_token_limit,
    p_token_reserve
  );

  select
    count(*) filter (where reservation.status = 'completed')::integer,
    count(*) filter (where reservation.status = 'failed')::integer,
    count(*) filter (
      where reservation.status = 'reserved'
        and reservation.expires_at > statement_timestamp()
    )::integer,
    coalesce(sum(reservation.actual_tokens) filter (
      where reservation.status in ('completed', 'failed')
    ), 0),
    coalesce(sum(reservation.reserved_tokens) filter (
      where reservation.status = 'reserved'
        and reservation.expires_at > statement_timestamp()
    ), 0)
  into completed_requests, failed_requests, active_reservations, used_tokens, reserved_tokens
  from private.strategy_ai_usage_reservations reservation
  where reservation.user_id = p_user_id
    and reservation.period_start = current_period;

  used_requests := completed_requests + failed_requests + active_reservations;
  available := used_requests < p_monthly_request_limit
    and used_tokens + reserved_tokens + p_token_reserve <= p_monthly_token_limit;

  if used_requests >= p_monthly_request_limit then
    block_reason := 'The monthly Strategy AI request limit has been reached.';
  elsif used_tokens + reserved_tokens + p_token_reserve > p_monthly_token_limit then
    block_reason := 'The remaining monthly Strategy AI token allowance is below the protected per-request reservation.';
  end if;

  return jsonb_build_object(
    'configured', true,
    'available', available,
    'reason', block_reason,
    'periodStart', current_period,
    'periodEnd', next_period,
    'monthlyRequestLimit', p_monthly_request_limit,
    'monthlyTokenLimit', p_monthly_token_limit,
    'completedRequests', completed_requests,
    'failedRequests', failed_requests,
    'activeReservations', active_reservations,
    'usedRequests', used_requests,
    'usedTokens', used_tokens,
    'reservedTokens', reserved_tokens,
    'remainingRequests', greatest(p_monthly_request_limit - used_requests, 0),
    'remainingTokens', greatest(p_monthly_token_limit - used_tokens - reserved_tokens, 0),
    'nextRequestReservationTokens', p_token_reserve
  );
end;
$$;

create or replace function public.reserve_strategy_ai_budget(
  p_user_id uuid,
  p_client_request_id uuid,
  p_model text,
  p_monthly_request_limit integer,
  p_monthly_token_limit integer,
  p_token_reserve integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_period date := date_trunc('month', timezone('utc', statement_timestamp()))::date;
  existing private.strategy_ai_usage_reservations%rowtype;
  current_requests integer := 0;
  current_tokens bigint := 0;
  reservation_id uuid;
begin
  perform private.validate_strategy_ai_budget_limits(
    p_user_id,
    p_monthly_request_limit,
    p_monthly_token_limit,
    p_token_reserve
  );
  if p_client_request_id is null or nullif(btrim(p_model), '') is null then
    raise exception 'The Strategy AI reservation identity and model are required.' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('strategy-ai-budget'),
    pg_catalog.hashtext(p_user_id::text || ':' || current_period::text)
  );

  update private.strategy_ai_usage_reservations reservation
  set status = 'released',
      failure_code = 'RESERVATION_EXPIRED',
      updated_at = timezone('utc', now())
  where reservation.user_id = p_user_id
    and reservation.period_start = current_period
    and reservation.status = 'reserved'
    and reservation.expires_at <= statement_timestamp();

  select reservation.* into existing
  from private.strategy_ai_usage_reservations reservation
  where reservation.user_id = p_user_id
    and reservation.client_request_id = p_client_request_id;

  if found then
    return jsonb_build_object(
      'allowed', false,
      'duplicate', true,
      'reason', 'This Strategy AI request identifier has already been used.'
    );
  end if;

  select
    count(*)::integer,
    coalesce(sum(case
      when reservation.status in ('completed', 'failed') then reservation.actual_tokens
      when reservation.status = 'reserved' and reservation.expires_at > statement_timestamp() then reservation.reserved_tokens
      else 0
    end), 0)
  into current_requests, current_tokens
  from private.strategy_ai_usage_reservations reservation
  where reservation.user_id = p_user_id
    and reservation.period_start = current_period
    and (
      reservation.status in ('completed', 'failed')
      or (reservation.status = 'reserved' and reservation.expires_at > statement_timestamp())
    );

  if current_requests >= p_monthly_request_limit then
    return jsonb_build_object(
      'allowed', false,
      'duplicate', false,
      'reason', 'The monthly Strategy AI request limit has been reached.'
    );
  end if;
  if current_tokens + p_token_reserve > p_monthly_token_limit then
    return jsonb_build_object(
      'allowed', false,
      'duplicate', false,
      'reason', 'The remaining monthly Strategy AI token allowance is below the protected per-request reservation.'
    );
  end if;

  insert into private.strategy_ai_usage_reservations (
    user_id,
    client_request_id,
    period_start,
    model,
    reserved_tokens,
    expires_at
  ) values (
    p_user_id,
    p_client_request_id,
    current_period,
    btrim(p_model),
    p_token_reserve,
    statement_timestamp() + interval '15 minutes'
  ) returning id into reservation_id;

  return jsonb_build_object(
    'allowed', true,
    'duplicate', false,
    'reservationId', reservation_id,
    'reservedTokens', p_token_reserve,
    'remainingRequests', greatest(p_monthly_request_limit - current_requests - 1, 0),
    'remainingTokens', greatest(p_monthly_token_limit - current_tokens - p_token_reserve, 0)
  );
end;
$$;

create or replace function public.complete_strategy_ai_budget(
  p_user_id uuid,
  p_client_request_id uuid,
  p_actual_tokens integer,
  p_usage jsonb,
  p_failure_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  reservation private.strategy_ai_usage_reservations%rowtype;
  final_status text := case when nullif(btrim(p_failure_code), '') is null then 'completed' else 'failed' end;
begin
  if jsonb_typeof(p_usage) is distinct from 'object' then
    raise exception 'Strategy AI usage metadata must be an object.' using errcode = '22023';
  end if;

  select entry.* into reservation
  from private.strategy_ai_usage_reservations entry
  where entry.user_id = p_user_id
    and entry.client_request_id = p_client_request_id
  for update;

  if not found or reservation.status <> 'reserved' then
    raise exception 'The Strategy AI budget reservation is not active.' using errcode = '22023';
  end if;
  if p_actual_tokens < 0 or p_actual_tokens > reservation.reserved_tokens then
    raise exception 'Reported Strategy AI usage exceeds the protected reservation.' using errcode = '22023';
  end if;

  update private.strategy_ai_usage_reservations entry
  set status = final_status,
      actual_tokens = p_actual_tokens,
      usage = p_usage,
      failure_code = left(nullif(btrim(p_failure_code), ''), 80),
      updated_at = timezone('utc', now())
  where entry.id = reservation.id;

  return jsonb_build_object(
    'reservationId', reservation.id,
    'status', final_status,
    'actualTokens', p_actual_tokens
  );
end;
$$;

create or replace function public.release_strategy_ai_budget(
  p_user_id uuid,
  p_client_request_id uuid,
  p_failure_code text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.strategy_ai_usage_reservations entry
  set status = 'released',
      failure_code = left(coalesce(nullif(btrim(p_failure_code), ''), 'REQUEST_CANCELLED'), 80),
      updated_at = timezone('utc', now())
  where entry.user_id = p_user_id
    and entry.client_request_id = p_client_request_id
    and entry.status = 'reserved';
  return found;
end;
$$;

revoke all on function private.validate_strategy_ai_budget_limits(uuid, integer, integer, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.strategy_ai_budget_status(uuid, integer, integer, integer)
  from public, anon, authenticated;
revoke all on function public.reserve_strategy_ai_budget(uuid, uuid, text, integer, integer, integer)
  from public, anon, authenticated;
revoke all on function public.complete_strategy_ai_budget(uuid, uuid, integer, jsonb, text)
  from public, anon, authenticated;
revoke all on function public.release_strategy_ai_budget(uuid, uuid, text)
  from public, anon, authenticated;

grant execute on function private.validate_strategy_ai_budget_limits(uuid, integer, integer, integer)
  to service_role;
grant execute on function public.strategy_ai_budget_status(uuid, integer, integer, integer)
  to service_role;
grant execute on function public.reserve_strategy_ai_budget(uuid, uuid, text, integer, integer, integer)
  to service_role;
grant execute on function public.complete_strategy_ai_budget(uuid, uuid, integer, jsonb, text)
  to service_role;
grant execute on function public.release_strategy_ai_budget(uuid, uuid, text)
  to service_role;

comment on table private.strategy_ai_usage_reservations is
  'Service-only Strategy AI monthly request and token reservations. No model credential or source content is stored here.';
comment on function public.reserve_strategy_ai_budget(uuid, uuid, text, integer, integer, integer) is
  'Atomically reserves one Strategy AI request against server-configured monthly request and token limits.';
comment on function public.complete_strategy_ai_budget(uuid, uuid, integer, jsonb, text) is
  'Records actual or conservatively estimated usage for a previously reserved Strategy AI request.';
