-- HMRC MTD Phase 3: sandbox test-data support flag.
-- This does not enable live HMRC submission. It only allows controlled
-- sandbox state setup through Edge Functions.

create or replace function public.account_has_feature(
  p_account_id uuid,
  p_feature text
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  with normalized as (
    select lower(trim(coalesce(p_feature, ''))) as feature_key
  )
  select case
    when (select feature_key from normalized) in (
      'hmrc_mtd_connection',
      'hmrc_mtd_sandbox',
      'hmrc_mtd_read_only',
      'hmrc_mtd_sandbox_test_data',
      'hmrc_mtd_quarterly_draft_builder',
      'hmrc_mtd_sandbox_submission',
      'hmrc_mtd_live_submission'
    ) then exists (
      select 1
      from public.account_feature_flags aff, normalized n
      where aff.account_id = p_account_id
        and aff.feature_key = n.feature_key
        and aff.enabled is true
    )
    else exists (
      select 1
      from public.account_feature_flags aff, normalized n
      where aff.account_id = p_account_id
        and aff.feature_key = n.feature_key
        and aff.enabled is true
    )
    or public.account_plan_rank(public.account_subscription_plan(p_account_id))
       >= public.account_plan_rank(public.account_feature_required_plan((select feature_key from normalized)))
  end;
$$;

comment on function public.account_has_feature(uuid, text) is
  'Returns whether the account has a plan entitlement or account-level feature flag. HMRC MTD flags are account-flag only and disabled by default.';

revoke all on function public.account_has_feature(uuid, text) from public;
grant execute on function public.account_has_feature(uuid, text) to authenticated;

insert into public.account_feature_flags (account_id, feature_key, enabled, created_by)
select a.id, flag.feature_key, false, null
from public.accounts a
cross join (values
  ('hmrc_mtd_sandbox_test_data')
) as flag(feature_key)
on conflict (account_id, feature_key) do nothing;
