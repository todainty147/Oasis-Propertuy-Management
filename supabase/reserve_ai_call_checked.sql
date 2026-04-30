-- =============================================================================
-- Atomic AI quota check + reservation RPC
-- =============================================================================
-- Replaces the read-check → assertAiDailyLimit + assertAiMonthlyLimit →
-- reserveAiCall three-step pattern in every Edge Function with a single
-- serialised SQL call.
--
-- The old pattern had a race window:
--   1. Read current count (in TS)
--   2. Decide whether under limit (in TS)
--   3. Increment counter (RPC)
-- Two concurrent requests could both pass step 2 before either reaches step 3.
--
-- This function closes the window using pg_advisory_xact_lock, which serialises
-- all callers for the same (account_id, feature_key) pair within the current
-- transaction. The sequence — read → check → increment — is then atomic for
-- that key.
--
-- Returns:
--   'ok'                    — slot reserved, call may proceed
--   'daily_limit_reached'   — daily quota exhausted
--   'monthly_limit_reached' — monthly quota exhausted
-- =============================================================================

create or replace function public.reserve_ai_call_checked(
  p_account_id  uuid,
  p_feature_key text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan          text;
  v_daily_limit   integer;
  v_monthly_limit integer;
  v_daily_key     text   := to_char(now() at time zone 'UTC', 'YYYY-MM-DD');
  v_month_start   text   := to_char(date_trunc('month', now() at time zone 'UTC'), 'YYYY-MM-DD');
  v_next_month    text   := to_char(
                              date_trunc('month', now() at time zone 'UTC') + interval '1 month',
                              'YYYY-MM-DD'
                            );
  v_daily_runs    integer := 0;
  v_monthly_runs  bigint  := 0;
begin
  -- Serialise concurrent calls for the same (account, feature) pair.
  -- pg_advisory_xact_lock is released automatically at transaction end.
  perform pg_advisory_xact_lock(
    hashtext(p_account_id::text),
    hashtext(p_feature_key)
  );

  v_plan          := public.account_subscription_plan(p_account_id);
  v_daily_limit   := public.ai_daily_call_limit_for_plan(v_plan, p_feature_key);
  v_monthly_limit := public.ai_monthly_call_limit_for_plan(v_plan);

  -- null on both = unlimited plan — skip checks, just increment
  if v_daily_limit is null and v_monthly_limit is null then
    perform public.increment_ai_usage_meter(
      p_account_id, p_feature_key, v_daily_key, 1, 0, 0
    );
    return 'ok';
  end if;

  -- Check monthly limit.
  -- Only daily rows (period_key YYYY-MM-DD) are counted; there are no separate
  -- monthly aggregate rows — the double-counting fix removed those.
  if v_monthly_limit is not null then
    if v_monthly_limit = 0 then
      return 'monthly_limit_reached';
    end if;

    select coalesce(sum(prompt_runs), 0)
    into   v_monthly_runs
    from   public.ai_usage_meter
    where  account_id  = p_account_id
      and  feature_key = p_feature_key
      and  period_key >= v_month_start
      and  period_key <  v_next_month;

    if v_monthly_runs >= v_monthly_limit then
      return 'monthly_limit_reached';
    end if;
  end if;

  -- Check daily limit.
  if v_daily_limit is not null then
    if v_daily_limit = 0 then
      return 'daily_limit_reached';
    end if;

    select coalesce(prompt_runs, 0)
    into   v_daily_runs
    from   public.ai_usage_meter
    where  account_id  = p_account_id
      and  feature_key = p_feature_key
      and  period_key  = v_daily_key;

    if v_daily_runs >= v_daily_limit then
      return 'daily_limit_reached';
    end if;
  end if;

  -- All checks passed — atomically increment the daily row and return
  perform public.increment_ai_usage_meter(
    p_account_id, p_feature_key, v_daily_key, 1, 0, 0
  );
  return 'ok';
end;
$$;

comment on function public.reserve_ai_call_checked(uuid, text) is
  'Atomically checks daily and monthly AI call quotas then increments the daily '
  'meter row if both limits allow it. Uses pg_advisory_xact_lock to serialise '
  'concurrent calls for the same (account_id, feature_key) pair, closing the '
  'check-then-call race window present in the previous 3-step pattern. '
  'Returns ''ok'', ''daily_limit_reached'', or ''monthly_limit_reached''.';

-- Service_role only: called exclusively by Edge Functions.
revoke all on function public.reserve_ai_call_checked(uuid, text) from public;
revoke all on function public.reserve_ai_call_checked(uuid, text) from authenticated;
grant execute on function public.reserve_ai_call_checked(uuid, text) to service_role;
