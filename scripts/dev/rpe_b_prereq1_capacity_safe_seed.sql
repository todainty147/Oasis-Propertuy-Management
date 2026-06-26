-- RPE B-prereq-1 capacity-safe closure seed.
--
-- Purpose:
--   Creates two disposable diagnostic leases without creating new properties.
--   Use this when the target account has hit its property plan limit.
--
-- Flow:
--   1. Run this file with app.rpe_diag_source_lease_id set to a lease already
--      visible in the diagnostic dropdown.
--   2. Run scripts/dev/rpe_b_prereq1_capacity_safe_prepare_wales.sql.
--   3. In the UI, select RPE_DIAG_WALES_FAST_FAIL and click "Run + record".
--   4. Run scripts/dev/rpe_b_prereq1_capacity_safe_prepare_guard.sql.
--   5. In the UI, select RPE_DIAG_JURISDICTION_GUARD and click "Run + record".
--   6. Run scripts/dev/rpe_b_prereq1_capacity_safe_report.sql.
--
-- The diagnostic lease rows use status = 'ended' so they do not violate the
-- leases_one_active_per_property partial unique index. RPE reads the historical
-- lease dates and property subdivision, not the operational active-lease slot.
--
-- This mutates the source property country_subdivision during the test. The
-- guard prepare script leaves it null afterwards, which is normally the pre-test
-- state for this diagnostic path.
--
-- Before running:
--   select set_config('app.rpe_diag_source_lease_id', 'SOURCE_LEASE_ID', false);
--   select set_config('request.jwt.claim.sub', 'YOUR_AUTH_USER_ID', false); -- optional

begin;

-- select set_config('app.rpe_diag_source_lease_id', 'SOURCE_LEASE_ID', false);
-- select set_config('request.jwt.claim.sub', 'YOUR_AUTH_USER_ID', false);

do $$
declare
  v_source_lease_id uuid := nullif(current_setting('app.rpe_diag_source_lease_id', true), '')::uuid;
  v_account_id uuid;
  v_property_id uuid;
  v_tenant_id uuid;
  v_user_id uuid;

  v_wales_lease_id uuid := '9f7e9d23-0000-4e1a-9000-000000000301'::uuid;
  v_guard_lease_id uuid := '9f7e9d23-0000-4e1a-9000-000000000302'::uuid;
begin
  if v_source_lease_id is null then
    raise exception 'Set app.rpe_diag_source_lease_id before running this capacity-safe seed.';
  end if;

  select l.account_id, l.property_id, l.tenant_id
  into v_account_id, v_property_id, v_tenant_id
  from public.leases l
  where l.id = v_source_lease_id;

  if v_account_id is null or v_property_id is null or v_tenant_id is null then
    raise exception 'Source lease % must exist and have account_id, property_id, and tenant_id.', v_source_lease_id;
  end if;

  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), '')::uuid,
    a.created_by
  )
  into v_user_id
  from public.accounts a
  where a.id = v_account_id;

  if v_user_id is null then
    raise exception 'Could not determine user id. Set request.jwt.claim.sub to your app auth.users.id.';
  end if;

  insert into public.account_feature_flags (
    account_id,
    feature_key,
    enabled,
    created_by
  )
  values (
    v_account_id,
    'renters_rights_readiness',
    true,
    v_user_id
  )
  on conflict (account_id, feature_key) do update
  set
    enabled = excluded.enabled,
    created_by = coalesce(public.account_feature_flags.created_by, excluded.created_by),
    updated_at = now();

  insert into public.leases (
    id,
    account_id,
    property_id,
    tenant_id,
    status,
    start_date,
    end_date,
    rent_amount,
    rent_frequency,
    deposit_amount,
    created_by,
    lease_start_date,
    lease_end_date,
    renewal_status,
    notice_period_days,
    auto_renew,
    notes
  )
  values
    (
      v_wales_lease_id,
      v_account_id,
      v_property_id,
      v_tenant_id,
      'ended',
      '2026-03-17',
      '2026-05-12',
      null,
      null,
      null,
      v_user_id,
      '2026-03-17',
      '2026-05-12',
      'active',
      30,
      false,
      'RPE_DIAG_WALES_FAST_FAIL capacity-safe lease. Reuses source property/tenant; downstream fields deliberately incomplete.'
    ),
    (
      v_guard_lease_id,
      v_account_id,
      v_property_id,
      v_tenant_id,
      'ended',
      '2026-03-17',
      '2026-05-12',
      null,
      null,
      null,
      v_user_id,
      '2026-03-17',
      '2026-05-12',
      'active',
      30,
      false,
      'RPE_DIAG_JURISDICTION_GUARD capacity-safe lease. Reuses source property/tenant; property subdivision deliberately null for guard run.'
    )
  on conflict (id) do update
  set
    account_id = excluded.account_id,
    property_id = excluded.property_id,
    tenant_id = excluded.tenant_id,
    status = excluded.status,
    start_date = excluded.start_date,
    end_date = excluded.end_date,
    rent_amount = excluded.rent_amount,
    rent_frequency = excluded.rent_frequency,
    deposit_amount = excluded.deposit_amount,
    created_by = excluded.created_by,
    lease_start_date = excluded.lease_start_date,
    lease_end_date = excluded.lease_end_date,
    renewal_status = excluded.renewal_status,
    notice_period_days = excluded.notice_period_days,
    auto_renew = excluded.auto_renew,
    notes = excluded.notes,
    updated_at = now();
end $$;

commit;

select
  'RPE B-prereq-1 capacity-safe leases seeded' as status,
  '9f7e9d23-0000-4e1a-9000-000000000301'::uuid as wales_fast_fail_lease_id,
  '9f7e9d23-0000-4e1a-9000-000000000302'::uuid as jurisdiction_guard_lease_id;
