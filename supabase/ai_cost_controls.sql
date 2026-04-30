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
      -- match both daily rows (YYYY-MM-DD) and monthly summary rows (YYYY-MM)
      and (m.period_key like v_period || '%' or m.period_key = v_period)
    group by m.feature_key
  ),
  totals as (
    select
      sum(feat_runs)   as tot_runs,
      sum(feat_input)  as tot_input,
      sum(feat_output) as tot_output,
      sum(feat_cost)   as tot_cost
    from monthly_rows
  )
  select
    v_period                                    as period_key,
    v_plan                                      as plan,
    v_limit                                     as monthly_limit,
    coalesce(t.tot_runs,   0)::bigint           as total_prompt_runs,
    coalesce(t.tot_input,  0)::bigint           as total_input_tokens,
    coalesce(t.tot_output, 0)::bigint           as total_output_tokens,
    coalesce(t.tot_cost,   0)                   as total_estimated_cost,
    r.feature_key,
    coalesce(r.feat_runs,   0)::bigint          as feature_prompt_runs,
    coalesce(r.feat_input,  0)::bigint          as feature_input_tokens,
    coalesce(r.feat_output, 0)::bigint          as feature_output_tokens,
    coalesce(r.feat_cost,   0)                  as feature_cost
  from monthly_rows r
  cross join totals t
  order by r.feat_runs desc;
end;
$$;

comment on function public.get_account_ai_usage_summary(uuid, text) is
  'Returns per-feature and aggregate AI usage for an account in a calendar month '
  '(p_period = YYYY-MM). Requires manage role. Sums daily and monthly meter rows.';

revoke all on function public.get_account_ai_usage_summary(uuid, text) from public;
grant execute on function public.get_account_ai_usage_summary(uuid, text) to authenticated;
grant execute on function public.get_account_ai_usage_summary(uuid, text) to service_role;
