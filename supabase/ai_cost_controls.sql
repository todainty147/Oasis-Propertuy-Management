-- =========================================================
-- AI Cost Controls
-- Epic A1: operator_agency plan tier
-- Epic A2: AI feature keys in account_feature_required_plan
-- Epic B1: per-plan daily limit function
-- Epic B2: monthly period key + assertAiMonthlyLimit helper function
-- Epic E1: get_account_ai_usage_summary RPC
-- =========================================================

-- ─── Epic A1 + A2: account_plan_rank / account_feature_required_plan ─────────
-- CANONICAL DEFINITIONS moved to account_entitlements.sql (L-001 resolved).
-- account_entitlements.sql is now the single source of truth for both functions,
-- including all feature keys: core, AI, and Compliance & Risk Suite.
-- IMPORTANT: apply account_entitlements.sql before this file.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Epic B1: per-plan daily AI call limits ──────────────────────────────────

create or replace function public.ai_daily_call_limit_for_plan(
  p_plan     text,
  p_feature  text default null
)
returns integer
language sql
stable
set search_path = public
as $$
  -- Returns the maximum number of AI prompt_runs allowed per account per day
  -- for the given plan. null means unlimited (operator_agency only).
  -- p_feature is accepted for future per-feature overrides but currently
  -- the limit is plan-wide.
  select case lower(trim(coalesce(p_plan, 'starter')))
    when 'operator_agency' then null   -- unlimited
    when 'pro'             then 200
    when 'growth'          then 50
    else 0  -- starter: AI is feature-gated before this check is ever reached
  end;
$$;

comment on function public.ai_daily_call_limit_for_plan(text, text) is
  'Returns the per-account per-day AI call ceiling for a billing plan. '
  'null = unlimited. Starter returns 0 as a safety floor; plan gate blocks earlier.';

revoke all on function public.ai_daily_call_limit_for_plan(text, text) from public;
grant execute on function public.ai_daily_call_limit_for_plan(text, text) to service_role;

-- ─── Epic B2: monthly AI call limits per plan ────────────────────────────────

create or replace function public.ai_monthly_call_limit_for_plan(
  p_plan text
)
returns integer
language sql
stable
set search_path = public
as $$
  select case lower(trim(coalesce(p_plan, 'starter')))
    when 'operator_agency' then null    -- unlimited
    when 'pro'             then 3000
    when 'growth'          then 500
    else 0
  end;
$$;

comment on function public.ai_monthly_call_limit_for_plan(text) is
  'Returns the per-account per-calendar-month AI call ceiling for a billing plan. '
  'null = unlimited. Starter returns 0; plan gate blocks before this is checked.';

revoke all on function public.ai_monthly_call_limit_for_plan(text) from public;
grant execute on function public.ai_monthly_call_limit_for_plan(text) to service_role;

-- ─── Epic E1: per-account monthly AI usage summary ───────────────────────────

create or replace function public.get_account_ai_usage_summary(
  p_account_id uuid,
  p_period     text  -- YYYY-MM  (e.g. '2026-04')
)
returns table (
  period_key            text,
  plan                  text,
  monthly_limit         integer,
  total_prompt_runs     bigint,
  total_input_tokens    bigint,
  total_output_tokens   bigint,
  total_estimated_cost  numeric,
  feature_key           text,
  feature_prompt_runs   bigint,
  feature_input_tokens  bigint,
  feature_output_tokens bigint,
  feature_cost          numeric
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_account_id uuid := public.assert_manage_account_access(p_account_id);
  v_period     text := lower(trim(coalesce(p_period, to_char(now(), 'YYYY-MM'))));
  v_plan       text;
  v_limit      integer;
begin
  -- Validate period format: must be YYYY-MM
  if v_period !~ '^\d{4}-\d{2}$' then
    raise exception 'p_period must be in YYYY-MM format, got: %', p_period;
  end if;

  v_plan  := public.account_subscription_plan(v_account_id);
  v_limit := public.ai_monthly_call_limit_for_plan(v_plan);

  return query
  with monthly_rows as (
    select
      m.feature_key,
      sum(m.prompt_runs)       as feat_runs,
      sum(m.input_tokens)      as feat_input,
      sum(m.output_tokens)     as feat_output,
      sum(m.estimated_cost)    as feat_cost
    from public.ai_usage_meter m
    where m.account_id = v_account_id
      -- daily rows only (YYYY-MM-DD); YYYY-MM-__ excludes legacy YYYY-MM aggregates
      and m.period_key like v_period || '-__'
    group by m.feature_key
  ),
  -- totals is a plain aggregate — always returns exactly one row even when
  -- monthly_rows is empty, which means this query always returns at least
  -- one row so callers can read the correct plan and limit for zero-usage months.
  totals as (
    select
      coalesce(sum(feat_runs),   0) as tot_runs,
      coalesce(sum(feat_input),  0) as tot_input,
      coalesce(sum(feat_output), 0) as tot_output,
      coalesce(sum(feat_cost),   0) as tot_cost
    from monthly_rows
  ),
  -- feature_or_sentinel: when there is no usage data, emit a single null-
  -- feature row so the CROSS JOIN with totals still produces output.
  feature_or_sentinel as (
    select mr.feature_key, mr.feat_runs, mr.feat_input, mr.feat_output, mr.feat_cost
    from monthly_rows mr
    union all
    select null::text, 0, 0, 0, 0::numeric
    where not exists (select 1 from monthly_rows)
  )
  select
    v_period                                    as period_key,
    v_plan                                      as plan,
    v_limit                                     as monthly_limit,
    t.tot_runs::bigint                          as total_prompt_runs,
    t.tot_input::bigint                         as total_input_tokens,
    t.tot_output::bigint                        as total_output_tokens,
    t.tot_cost                                  as total_estimated_cost,
    f.feature_key,
    f.feat_runs::bigint                         as feature_prompt_runs,
    f.feat_input::bigint                        as feature_input_tokens,
    f.feat_output::bigint                       as feature_output_tokens,
    f.feat_cost                                 as feature_cost
  from feature_or_sentinel f
  cross join totals t
  order by f.feat_runs desc nulls last;
end;
$$;

comment on function public.get_account_ai_usage_summary(uuid, text) is
  'Returns per-feature and aggregate AI usage for an account in a calendar month '
  '(p_period = YYYY-MM). Requires manage role. Always returns at least one row '
  '(with null feature_key) so callers get correct plan/limit for zero-usage months. '
  'Sums daily rows only (period_key YYYY-MM-DD); monthly total is account-wide.';

revoke all on function public.get_account_ai_usage_summary(uuid, text) from public;
grant execute on function public.get_account_ai_usage_summary(uuid, text) to authenticated;
grant execute on function public.get_account_ai_usage_summary(uuid, text) to service_role;
