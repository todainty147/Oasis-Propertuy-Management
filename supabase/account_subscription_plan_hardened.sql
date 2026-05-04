-- ── Hardened account_subscription_plan() ─────────────────────────────────────
-- Replaces the simple account-plan lookup with a full enforcement function that
-- checks:  OA grants > Stripe subscription > OASIS trial > legacy/grandfathered.
--
-- New plan sentinels (all rank 0 — deny all feature gates):
--   trial_expired          — OASIS trial has lapsed, no active Stripe subscription
--   operator_agency_pending — OA grant exists but payment not yet confirmed
--   oa_contract_expired    — OA contract subscription_end passed grace period
--   billing_past_due_locked — Stripe past_due beyond 7-day grace window
--   billing_locked          — Stripe canceled/unpaid/incomplete_expired
--
-- This file must be applied AFTER account_entitlements.sql and
-- operator_agency_grants.sql in the overlay sequence.
-- ──────────────────────────────────────────────────────────────────────────────

begin;

-- ── account_plan_rank ─────────────────────────────────────────────────────────
-- Extended to include all sentinel values at rank 0.

create or replace function public.account_plan_rank(p_plan text)
returns integer
language sql
stable
set search_path = public
as $$
  select case lower(trim(coalesce(p_plan, 'starter')))
    when 'operator_agency'          then 4
    when 'pro'                      then 3
    when 'growth'                   then 2
    when 'starter'                  then 1
    -- Sentinel values: rank 0 denies all paid feature gates
    when 'trial_expired'            then 0
    when 'operator_agency_pending'  then 0
    when 'oa_contract_expired'      then 0
    when 'billing_past_due_locked'  then 0
    when 'billing_locked'           then 0
    else 1  -- unknown values fall back to starter behaviour
  end;
$$;

comment on function public.account_plan_rank(text) is
  'Maps canonical billing plan keys (including locked sentinels) to a comparable numeric rank.';

revoke all  on function public.account_plan_rank(text) from public;
grant execute on function public.account_plan_rank(text) to authenticated;

-- ── account_subscription_plan ─────────────────────────────────────────────────
-- Full enforcement: OA grants > Stripe subscription > OASIS trial > legacy.
-- Uses deterministic LATERAL subqueries so multiple rows never cause ambiguity.

create or replace function public.account_subscription_plan(p_account_id uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select case
    -- ① Root account: always operator_agency, no trial or payment check
    when a.is_root
      then 'operator_agency'

    -- ② Active OA grant within contract dates + 7-day grace
    when oag.payment_status = 'active'
     and oag.subscription_start <= current_date
     and (oag.subscription_end is null
          or oag.subscription_end + 7 >= current_date)
      then 'operator_agency'

    -- ③ OA grant pending checkout/payment — locked at rank 0
    when oag.payment_status in ('draft', 'pending_checkout', 'pending_payment')
      then 'operator_agency_pending'

    -- ④ OA grant exists but contract has expired past grace
    when oag.payment_status in ('active', 'expired')
     and oag.subscription_end is not null
     and oag.subscription_end + 7 < current_date
      then 'oa_contract_expired'

    -- ⑤ Active Stripe self-serve subscription
    when bs.status = 'active'
      then lower(trim(coalesce(a.subscription_plan, 'starter')))

    -- ⑥ Stripe-managed trial (e.g. STRIPE_TEST_TRIAL_DAYS checkout)
    when bs.status = 'trialing'
      then lower(trim(coalesce(a.subscription_plan, 'starter')))

    -- ⑦ Stripe past_due within 7-day grace from period end
    when bs.status = 'past_due'
     and bs.current_period_end >= now() - interval '7 days'
      then lower(trim(coalesce(a.subscription_plan, 'starter')))

    -- ⑧ Stripe past_due beyond grace — locked
    when bs.status = 'past_due'
      then 'billing_past_due_locked'

    -- ⑨ Stripe canceled / unpaid / incomplete_expired — locked
    when bs.status in ('canceled', 'unpaid', 'incomplete_expired')
      then 'billing_locked'

    -- ⑩ OASIS trial still active
    when a.trial_ends_at is not null and a.trial_ends_at > now()
      then lower(trim(coalesce(a.subscription_plan, 'starter')))

    -- ⑪ OASIS trial has expired, no active Stripe subscription
    when a.trial_ends_at is not null and a.trial_ends_at <= now()
      then 'trial_expired'

    -- ⑫ No trial set — grandfathered / legacy account
    else lower(trim(coalesce(a.subscription_plan, 'starter')))
  end

  from public.accounts a

  -- Deterministic: prefer active > trialing > past_due, then most recently updated
  left join lateral (
    select status, current_period_end, updated_at
    from public.billing_subscriptions bs2
    where bs2.account_id = a.id
    order by
      case bs2.status
        when 'active'               then 1
        when 'trialing'             then 2
        when 'past_due'             then 3
        when 'canceled'             then 4
        when 'unpaid'               then 5
        when 'incomplete_expired'   then 6
        else 9
      end,
      bs2.updated_at desc nulls last
    limit 1
  ) bs on true

  -- Deterministic: prefer active > pending, then most recently created
  left join lateral (
    select payment_status, subscription_start, subscription_end
    from public.operator_agency_grants oag2
    where oag2.account_id = a.id
      and oag2.payment_status in (
        'draft', 'pending_checkout', 'pending_payment', 'active', 'expired'
      )
    order by
      case oag2.payment_status
        when 'active'           then 1
        when 'pending_payment'  then 2
        when 'pending_checkout' then 3
        when 'draft'            then 4
        when 'expired'          then 5
        else 9
      end,
      oag2.created_at desc nulls last
    limit 1
  ) oag on true

  where a.id = p_account_id;
$$;

comment on function public.account_subscription_plan(uuid) is
  'Hardened enforcement: OA grants > Stripe subscription > OASIS trial > legacy. '
  'Returns sentinel values (trial_expired, operator_agency_pending, etc.) that rank 0, '
  'denying all paid feature gates. Root accounts always return operator_agency.';

revoke all  on function public.account_subscription_plan(uuid) from public;
grant execute on function public.account_subscription_plan(uuid) to authenticated;

commit;
