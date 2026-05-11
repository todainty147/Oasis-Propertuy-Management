-- =============================================================================
-- account_subscription_plan() — extended to check account_entitlements
-- Must be applied AFTER founder_launch_offer.sql (account_entitlements table).
-- =============================================================================
-- New priority ⑤ inserted between OA checks (①–④) and Stripe (⑥):
--   ⑤ Active account_entitlements row → effective_plan
--      (strongest plan wins when multiple rows exist; then newest created_at)
-- This ensures founder accounts resolve to 'pro' regardless of what
-- accounts.subscription_plan contains (the Stripe billing plan = 'starter').
-- =============================================================================

begin;

create or replace function public.account_subscription_plan(p_account_id uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select case
    -- ① Root account: always operator_agency
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

    -- ⑤ Active account_entitlements row (launch_offer or manual_admin)
    --    Strongest plan wins when multiple rows exist; then newest created_at.
    when ae.effective_plan is not null
      then ae.effective_plan

    -- ⑥ Active Stripe self-serve subscription
    when bs.status = 'active'
      then lower(trim(coalesce(a.subscription_plan, 'starter')))

    -- ⑦ Stripe-managed trial (e.g. STRIPE_TEST_TRIAL_DAYS checkout)
    when bs.status = 'trialing'
      then lower(trim(coalesce(a.subscription_plan, 'starter')))

    -- ⑧ Stripe past_due within 7-day grace from period end
    when bs.status = 'past_due'
     and bs.current_period_end >= now() - interval '7 days'
      then lower(trim(coalesce(a.subscription_plan, 'starter')))

    -- ⑨ Stripe past_due beyond grace — locked
    when bs.status = 'past_due'
      then 'billing_past_due_locked'

    -- ⑩ Stripe canceled / unpaid / incomplete_expired — locked
    when bs.status in ('canceled', 'unpaid', 'incomplete_expired')
      then 'billing_locked'

    -- ⑪ OASIS trial still active
    when a.trial_ends_at is not null and a.trial_ends_at > now()
      then lower(trim(coalesce(a.subscription_plan, 'starter')))

    -- ⑫ OASIS trial has expired, no active Stripe subscription
    when a.trial_ends_at is not null and a.trial_ends_at <= now()
      then 'trial_expired'

    -- ⑬ No trial set — grandfathered / legacy account
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

  -- ⑤ Active entitlement: strongest effective plan first, then newest
  left join lateral (
    select ae2.effective_plan, ae2.created_at
    from   public.account_entitlements ae2
    where  ae2.account_id = a.id
      and  ae2.is_active  = true
      and  ae2.starts_at  <= now()
      and  (ae2.ends_at is null or ae2.ends_at > now())
    order by
      public.account_plan_rank(ae2.effective_plan) desc,
      ae2.created_at desc nulls last
    limit 1
  ) ae on true

  where a.id = p_account_id;
$$;

comment on function public.account_subscription_plan(uuid) is
  'Hardened enforcement: OA grants > account_entitlements > Stripe subscription > OASIS trial > legacy. '
  'account_entitlements (launch_offer, manual_admin) are checked after OA grants and before Stripe, '
  'so founder accounts resolve to their effective plan (e.g. pro) regardless of the billing plan '
  'written by the Stripe webhook (e.g. starter). '
  'Returns sentinel values (trial_expired, operator_agency_pending, etc.) that rank 0, '
  'denying all paid feature gates. Root accounts always return operator_agency.';

revoke all  on function public.account_subscription_plan(uuid) from public;
grant execute on function public.account_subscription_plan(uuid) to authenticated;

commit;
