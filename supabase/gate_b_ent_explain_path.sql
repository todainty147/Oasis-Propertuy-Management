-- ── Gate-B-ENT: Explain Path Overlay ─────────────────────────────────────────
-- Adds a structural JSONB projection of the six-priority feature-access decision.
-- Both the boolean resolver (account_has_effective_feature) and the explain surface
-- (account_explain_effective_feature) derive from one shared internal implementation
-- (account_effective_feature_check), preventing reason-code / boolean drift.
--
-- Overlay position: after gate_b_ent_deposit_export_fix.sql
-- Supersedes: account_has_effective_feature in gate_b_ent_effective_feature_resolver.sql
--
-- Expiry note: an expired Founder20 entitlement causes account_subscription_plan() to fall
-- back to the billing plan. The reason code is 'not_granted' — expiry is NOT a distinct code.

-- ── 1. Internal shared authority ─────────────────────────────────────────────
-- Contains the full six-priority decision logic. Returns JSONB with:
--   result, reason, feature_key, min_plan, effective_plan, flag_enabled
--
-- Reason codes: unknown_account | unknown_feature | explicit_deny | explicit_grant |
--               flag_required | plan_grant | not_granted
--
-- No EXECUTE grant to public or authenticated — callable only by the two wrappers below.
-- SECURITY DEFINER so it can read account_feature_flags (no RLS) and call
-- account_subscription_plan() without privilege loops inside RLS policies.

create or replace function public.account_effective_feature_check(
  p_account_id uuid,
  p_feature    text
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_min_plan       text;
  v_flag_enabled   boolean;
  v_effective_plan text;
begin
  -- Priority 1: null account_id → deny by default
  if p_account_id is null then
    return jsonb_build_object(
      'result',         false,
      'reason',         'unknown_account',
      'feature_key',    p_feature,
      'min_plan',       null,
      'effective_plan', null,
      'flag_enabled',   null
    );
  end if;

  -- Priority 2: unregistered feature key → deny by default
  v_min_plan := public.account_feature_min_plan(p_feature);
  if v_min_plan is null then
    return jsonb_build_object(
      'result',         false,
      'reason',         'unknown_feature',
      'feature_key',    p_feature,
      'min_plan',       null,
      'effective_plan', null,
      'flag_enabled',   null
    );
  end if;

  -- Flag lookup (null = no row present, no override)
  select enabled into v_flag_enabled
  from public.account_feature_flags
  where account_id = p_account_id
    and feature_key = lower(trim(coalesce(p_feature, '')))
  limit 1;

  -- Priority 3: explicit deny — enabled=false overrides plan entitlement
  if v_flag_enabled = false then
    v_effective_plan := public.account_subscription_plan(p_account_id);
    return jsonb_build_object(
      'result',         false,
      'reason',         'explicit_deny',
      'feature_key',    p_feature,
      'min_plan',       v_min_plan,
      'effective_plan', v_effective_plan,
      'flag_enabled',   false
    );
  end if;

  -- Priority 4: explicit grant — enabled=true overrides plan restriction
  if v_flag_enabled = true then
    v_effective_plan := public.account_subscription_plan(p_account_id);
    return jsonb_build_object(
      'result',         true,
      'reason',         'explicit_grant',
      'feature_key',    p_feature,
      'min_plan',       v_min_plan,
      'effective_plan', v_effective_plan,
      'flag_enabled',   true
    );
  end if;

  -- Priority 5: flag_only feature with no flag row
  if v_min_plan = 'flag_only' then
    return jsonb_build_object(
      'result',         false,
      'reason',         'flag_required',
      'feature_key',    p_feature,
      'min_plan',       v_min_plan,
      'effective_plan', null,
      'flag_enabled',   null
    );
  end if;

  -- Priority 6: plan rank check (honours account_entitlements via account_subscription_plan)
  v_effective_plan := public.account_subscription_plan(p_account_id);
  if public.account_plan_rank(v_effective_plan) >= public.account_plan_rank(v_min_plan) then
    return jsonb_build_object(
      'result',         true,
      'reason',         'plan_grant',
      'feature_key',    p_feature,
      'min_plan',       v_min_plan,
      'effective_plan', v_effective_plan,
      'flag_enabled',   null
    );
  else
    return jsonb_build_object(
      'result',         false,
      'reason',         'not_granted',
      'feature_key',    p_feature,
      'min_plan',       v_min_plan,
      'effective_plan', v_effective_plan,
      'flag_enabled',   null
    );
  end if;
end;
$$;

comment on function public.account_effective_feature_check(uuid, text) is
  'Internal shared authority for the six-priority feature-access decision. '
  'Returns JSONB: { result, reason, feature_key, min_plan, effective_plan, flag_enabled }. '
  'Reason codes: unknown_account | unknown_feature | explicit_deny | explicit_grant | '
  'flag_required | plan_grant | not_granted. '
  'No EXECUTE grant to public or authenticated — callable only by account_has_effective_feature '
  'and account_explain_effective_feature.';

revoke all on function public.account_effective_feature_check(uuid, text) from public;
revoke all on function public.account_effective_feature_check(uuid, text) from authenticated;

-- ── 2. Thin boolean projection ────────────────────────────────────────────────
-- Supersedes account_has_effective_feature from gate_b_ent_effective_feature_resolver.sql.
-- All six-priority logic now lives in account_effective_feature_check; this is a
-- structural projection — boolean output cannot drift from the JSONB source of truth.
-- SECURITY DEFINER and safe search_path unchanged from the superseded definition.

create or replace function public.account_has_effective_feature(
  p_account_id uuid,
  p_feature    text
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select (public.account_effective_feature_check(p_account_id, p_feature) ->> 'result')::boolean;
$$;

comment on function public.account_has_effective_feature(uuid, text) is
  'Authoritative feature-access resolver — structural boolean projection of account_effective_feature_check. '
  'Precedence: unregistered→deny; enabled=false flag→deny (overrides plan); enabled=true flag→grant; '
  'flag_only with no flag→deny; plan rank≥min_plan→allow. '
  'Returns false for unregistered feature keys (deny-by-default). '
  'Explicit deny (enabled=false) overrides Growth/Pro plan entitlement. '
  'HMRC features (flag_only) require an explicit enabled=true flag regardless of plan.';

revoke all on function public.account_has_effective_feature(uuid, text) from public;
grant execute on function public.account_has_effective_feature(uuid, text) to authenticated;

-- ── 3. Root-operator explain wrapper ─────────────────────────────────────────
-- Returns the full JSONB decision record for diagnostic use by root-account operators.
-- The user_is_root_operator() guard fires before any data access — non-root callers
-- receive a permission error regardless of the requested account or feature.
-- Grant to authenticated (not public): requires a valid session and root membership.

create or replace function public.account_explain_effective_feature(
  p_account_id uuid,
  p_feature    text
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.user_is_root_operator() then
    raise exception 'permission denied — account_explain_effective_feature is restricted to root accounts';
  end if;
  return public.account_effective_feature_check(p_account_id, p_feature);
end;
$$;

comment on function public.account_explain_effective_feature(uuid, text) is
  'Root-operator diagnostic surface for the feature-access decision. '
  'Returns the full JSONB record from account_effective_feature_check. '
  'Caller must be a member of the root account with owner role (user_is_root_operator()). '
  'Guard fires before any data access — non-root callers receive a permission error. '
  'Expiry: an expired Founder20 entitlement returns not_granted (no distinct expired reason code).';

revoke all on function public.account_explain_effective_feature(uuid, text) from public;
grant execute on function public.account_explain_effective_feature(uuid, text) to authenticated;
