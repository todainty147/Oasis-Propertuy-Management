-- RPE B-prereq-1 closure seed helper.
--
-- Purpose:
--   Creates/updates two disposable diagnostic records for:
--     1. RPE_DIAG_WALES_FAST_FAIL
--     2. RPE_DIAG_JURISDICTION_GUARD
--
-- Scope:
--   B-prereq-1 only. This does not seed Tier-4 fields, VS-2 state,
--   obligation state, Command Centre cards, possession/proceedings data, PBSA,
--   company-let, resident-landlord, service evidence, or rent evidence beyond
--   minimal lease compatibility fields.
--
-- Safety:
--   - Dev/manual helper only. This file is intentionally outside supabase/*.sql
--     so repo DB apply will not run it.
--   - Uses deterministic UUIDs so the seed is idempotent and reversible.
--
-- Before running:
--   Option A, use the isolated RPE_DIAG account created by
--   scripts/dev/rpe_diag_seed.sql:
--
--     select set_config('app.rpe_diag_account_id', '9f7e9d20-0000-4e1a-9000-000000000001', false);
--
--   Option B, derive the account from a lease already visible in the diagnostic
--   dropdown:
--
--     select set_config('app.rpe_diag_source_lease_id', 'SOURCE_LEASE_ID', false);
--
--   Optional in SQL editor/psql contexts that do not already have a JWT claim:
--
--     select set_config('request.jwt.claim.sub', 'YOUR_AUTH_USER_ID', false);
--
-- Manual test after seeding:
--   1. Refresh the app.
--   2. Run + record both diagnostic leases on the RPE manual diagnostic page.
--   3. Run scripts/dev/rpe_b_prereq1_closure_report.sql to collect the closure
--      evidence table.
--
-- Cleanup:
--   delete from public.renters_rights_tasks
--   where lease_id in (
--     '9f7e9d22-0000-4e1a-9000-000000000301'::uuid,
--     '9f7e9d22-0000-4e1a-9000-000000000302'::uuid
--   );
--
--   delete from public.leases
--   where id in (
--     '9f7e9d22-0000-4e1a-9000-000000000301'::uuid,
--     '9f7e9d22-0000-4e1a-9000-000000000302'::uuid
--   );
--
--   delete from public.tenants
--   where id in (
--     '9f7e9d22-0000-4e1a-9000-000000000201'::uuid,
--     '9f7e9d22-0000-4e1a-9000-000000000202'::uuid
--   );
--
--   delete from public.properties
--   where id in (
--     '9f7e9d22-0000-4e1a-9000-000000000101'::uuid,
--     '9f7e9d22-0000-4e1a-9000-000000000102'::uuid
--   );

begin;

-- Uncomment one of these in SQL editor/psql, or run it immediately before this
-- file in the same SQL execution.
--
-- select set_config('app.rpe_diag_account_id', '9f7e9d20-0000-4e1a-9000-000000000001', false);
-- select set_config('app.rpe_diag_source_lease_id', 'SOURCE_LEASE_ID', false);
-- select set_config('request.jwt.claim.sub', 'YOUR_AUTH_USER_ID', false);

do $$
declare
  v_account_id uuid := nullif(current_setting('app.rpe_diag_account_id', true), '')::uuid;
  v_source_lease_id uuid := nullif(current_setting('app.rpe_diag_source_lease_id', true), '')::uuid;
  v_user_id uuid;
  v_has_properties_market boolean;

  v_wales_property_id uuid := '9f7e9d22-0000-4e1a-9000-000000000101'::uuid;
  v_guard_property_id uuid := '9f7e9d22-0000-4e1a-9000-000000000102'::uuid;
  v_wales_tenant_id uuid := '9f7e9d22-0000-4e1a-9000-000000000201'::uuid;
  v_guard_tenant_id uuid := '9f7e9d22-0000-4e1a-9000-000000000202'::uuid;
  v_wales_lease_id uuid := '9f7e9d22-0000-4e1a-9000-000000000301'::uuid;
  v_guard_lease_id uuid := '9f7e9d22-0000-4e1a-9000-000000000302'::uuid;
begin
  if v_account_id is null and v_source_lease_id is not null then
    select l.account_id
    into v_account_id
    from public.leases l
    where l.id = v_source_lease_id;
  end if;

  if v_account_id is null then
    raise exception
      'Set app.rpe_diag_account_id or app.rpe_diag_source_lease_id before running this seed.';
  end if;

  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), '')::uuid,
    a.created_by
  )
  into v_user_id
  from public.accounts a
  where a.id = v_account_id;

  if v_user_id is null then
    raise exception
      'Could not determine a user id. Set request.jwt.claim.sub to your app auth.users.id before running this seed.';
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

  insert into public.properties (
    id,
    owner_id,
    address,
    city,
    tenant_id,
    status,
    rent,
    size,
    account_id,
    country_subdivision
  )
  values
    (
      v_wales_property_id,
      v_user_id,
      'RPE_DIAG_WALES_FAST_FAIL House',
      'Cardiff',
      null,
      'Wolne',
      1200,
      'diagnostic',
      v_account_id,
      'Wales'
    ),
    (
      v_guard_property_id,
      v_user_id,
      'RPE_DIAG_JURISDICTION_GUARD House',
      'London',
      null,
      'Wolne',
      1200,
      'diagnostic',
      v_account_id,
      null
    )
  on conflict (id) do update
  set
    owner_id = excluded.owner_id,
    address = excluded.address,
    city = excluded.city,
    tenant_id = null,
    status = 'Wolne',
    rent = excluded.rent,
    size = excluded.size,
    account_id = excluded.account_id,
    country_subdivision = excluded.country_subdivision;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'properties'
      and column_name = 'market'
  )
  into v_has_properties_market;

  if v_has_properties_market then
    execute
      'update public.properties set market = $1 where id = $2'
      using 'uk', v_guard_property_id;
  end if;

  insert into public.tenants (
    id,
    owner_id,
    property_id,
    name,
    email,
    phone,
    account_id,
    status,
    risk_flag,
    user_id
  )
  values
    (
      v_wales_tenant_id,
      v_user_id,
      v_wales_property_id,
      'RPE_DIAG_WALES_FAST_FAIL Tenant',
      'rpe-diag-wales@example.invalid',
      null,
      v_account_id,
      'active',
      false,
      null
    ),
    (
      v_guard_tenant_id,
      v_user_id,
      v_guard_property_id,
      'RPE_DIAG_JURISDICTION_GUARD Tenant',
      'rpe-diag-jurisdiction-guard@example.invalid',
      null,
      v_account_id,
      'active',
      false,
      null
    )
  on conflict (id) do update
  set
    owner_id = excluded.owner_id,
    property_id = excluded.property_id,
    name = excluded.name,
    email = excluded.email,
    phone = excluded.phone,
    account_id = excluded.account_id,
    status = excluded.status,
    risk_flag = excluded.risk_flag,
    user_id = null;

  update public.properties
  set tenant_id = v_wales_tenant_id, status = 'Wynajęte'
  where id = v_wales_property_id;

  update public.properties
  set tenant_id = v_guard_tenant_id, status = 'Wynajęte'
  where id = v_guard_property_id;

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
      v_wales_property_id,
      v_wales_tenant_id,
      'active',
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
      'RPE_DIAG_WALES_FAST_FAIL. Downstream fields deliberately incomplete; Wales jurisdiction should be terminal.'
    ),
    (
      v_guard_lease_id,
      v_account_id,
      v_guard_property_id,
      v_guard_tenant_id,
      'active',
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
      'RPE_DIAG_JURISDICTION_GUARD. Property country_subdivision deliberately null; inadmissible defaults must be ignored.'
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

  delete from public.renters_rights_tasks
  where lease_id = v_guard_lease_id
    and requirement_type = 'renters_rights_information_sheet'
    and notes = 'RPE_DIAG_JURISDICTION_GUARD inadmissible task jurisdiction default.';

  insert into public.renters_rights_tasks (
    account_id,
    property_id,
    tenant_id,
    lease_id,
    requirement_type,
    jurisdiction,
    due_date,
    status,
    notes
  )
  values (
    v_account_id,
    v_guard_property_id,
    v_guard_tenant_id,
    v_guard_lease_id,
    'renters_rights_information_sheet',
    'GB-ENG',
    '2026-05-31',
    'required',
    'RPE_DIAG_JURISDICTION_GUARD inadmissible task jurisdiction default.'
  )
  on conflict do nothing;
end $$;

commit;

select
  'RPE B-prereq-1 closure records seeded' as status,
  'RPE_DIAG_WALES_FAST_FAIL' as case,
  '9f7e9d22-0000-4e1a-9000-000000000101'::uuid as property_id,
  '9f7e9d22-0000-4e1a-9000-000000000301'::uuid as tenancy_id,
  'Wales' as expected_country_subdivision,
  'not_affected / EXCL_JURISDICTION / decision_path=[jurisdiction]' as expected_evaluation
union all
select
  'RPE B-prereq-1 closure records seeded' as status,
  'RPE_DIAG_JURISDICTION_GUARD' as case,
  '9f7e9d22-0000-4e1a-9000-000000000102'::uuid as property_id,
  '9f7e9d22-0000-4e1a-9000-000000000302'::uuid as tenancy_id,
  null as expected_country_subdivision,
  'needs_data / missing_fields=[jurisdiction] / decision_path=[jurisdiction]' as expected_evaluation;
