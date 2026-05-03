-- =============================================================================
-- Atomic AI quota check + reservation RPC
-- =============================================================================
-- Replaces the read-check → assertAiDailyLimit + assertAiMonthlyLimit →
-- reserveAiCall three-step pattern in every Edge Function with a single
-- serialised SQL call.
--
-- Quota semantics (deliberate product decisions):
--
--   Monthly limit — account-wide across all AI features combined.
--     A Growth account with a 500-call monthly limit gets 500 AI calls total
--     regardless of which feature generated them. The monthly query sums
--     ALL feature keys for the account, not just the one being requested.
--
--   Daily limit — per feature key.
--     Each AI feature has its own daily ceiling so one heavy user of a single
--     feature (e.g., maintenance triage) cannot exhaust the daily budget for
--     every other feature. The daily query filters by feature_key.
--
--   Attempted-generation billing — if OpenAI is configured and the model call
--     is attempted but returns an error that triggers deterministic fallback,
--     the slot is still consumed. This is consistent with how AI APIs bill:
--     the attempt counts, not the output quality. Edge Functions only reach
--     this path when OPENAI_API_KEY is present, so fallback-mode deployments
--     (no key) never consume quota.
--
-- Concurrency:
--   pg_advisory_xact_lock is held at account level (not per-feature) because
--   the monthly budget is account-wide. This serialises all AI calls from the
--   same account. The lock is released automatically at transaction end.
--
-- Returns:
--   'ok'                    — slot reserved, call may proceed
--   'daily_limit_reached'   — daily quota exhausted for this feature
--   'monthly_limit_reached' — monthly quota exhausted across all features
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
  -- Serialise all AI calls for the same account. Lock is at account level
  -- (not per-feature) because the monthly budget is account-wide. The fixed
  -- second arg of 0 distinguishes this from any other advisory lock namespace.
  perform pg_advisory_xact_lock(hashtext(p_account_id::text), 0);

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

  -- Check monthly limit — account-wide (all features combined).
  -- Sums ALL feature keys so the account budget is shared, not per-feature.
  -- Only daily rows (period_key YYYY-MM-DD) are included.
  if v_monthly_limit is not null then
    if v_monthly_limit = 0 then
      return 'monthly_limit_reached';
    end if;

    select coalesce(sum(prompt_runs), 0)
    into   v_monthly_runs
    from   public.ai_usage_meter
    where  account_id  = p_account_id
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
  'Atomically checks AI call quotas and increments the daily meter row. '
  'Monthly limit is account-wide (all features); daily limit is per feature. '
  'Uses pg_advisory_xact_lock at account level to serialise concurrent callers. '
  'Returns ''ok'', ''daily_limit_reached'', or ''monthly_limit_reached''.';

-- Service_role only: called exclusively by Edge Functions.
revoke all on function public.reserve_ai_call_checked(uuid, text) from public;
revoke all on function public.reserve_ai_call_checked(uuid, text) from authenticated;
grant execute on function public.reserve_ai_call_checked(uuid, text) to service_role;
