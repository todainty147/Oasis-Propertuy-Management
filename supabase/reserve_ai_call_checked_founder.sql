-- =============================================================================
-- reserve_ai_call_checked() — founder override
-- Must be applied AFTER founder_launch_offer.sql (get_account_ai_monthly_limit).
-- =============================================================================
-- Single change from the original:
--   v_monthly_limit := public.ai_monthly_call_limit_for_plan(v_plan);
--   →
--   v_monthly_limit := public.get_account_ai_monthly_limit(p_account_id);
--
-- This means founder accounts with monthly_ai_credit_limit = 100 in
-- account_entitlements are capped at 100/month, not the pro-plan limit of 3000.
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
  perform pg_advisory_xact_lock(hashtext(p_account_id::text), 0);

  v_plan          := public.account_subscription_plan(p_account_id);
  v_daily_limit   := public.ai_daily_call_limit_for_plan(v_plan, p_feature_key);
  -- Account-specific override: founders get 100/month, not the pro limit of 3000
  v_monthly_limit := public.get_account_ai_monthly_limit(p_account_id);

  -- null on both = unlimited plan — skip checks, just increment
  if v_daily_limit is null and v_monthly_limit is null then
    perform public.increment_ai_usage_meter(
      p_account_id, p_feature_key, v_daily_key, 1, 0, 0
    );
    return 'ok';
  end if;

  -- Monthly limit — account-wide (all features combined, only daily rows)
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

  -- Daily limit per feature key
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

  perform public.increment_ai_usage_meter(
    p_account_id, p_feature_key, v_daily_key, 1, 0, 0
  );
  return 'ok';
end;
$$;

comment on function public.reserve_ai_call_checked(uuid, text) is
  'Atomically checks AI call quotas and increments the daily meter row. '
  'Monthly limit uses get_account_ai_monthly_limit() which checks '
  'account_entitlements first (founder override = 100/month) before '
  'falling back to the plan-based limit. '
  'Daily limit is per feature key (plan-based). '
  'Uses pg_advisory_xact_lock at account level. '
  'Returns ''ok'', ''daily_limit_reached'', or ''monthly_limit_reached''.';

revoke all on function public.reserve_ai_call_checked(uuid, text) from public;
revoke all on function public.reserve_ai_call_checked(uuid, text) from authenticated;
grant execute on function public.reserve_ai_call_checked(uuid, text) to service_role;
