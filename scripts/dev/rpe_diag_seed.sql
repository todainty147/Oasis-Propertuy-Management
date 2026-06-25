-- RPE diagnostic seed helper.
--
-- Purpose:
--   Creates one isolated, fake account/tenant/property/lease for the current
--   RPE Diagnostic Rerun Prediction Sheet Section A.
--
-- Safety:
--   - Dev/manual helper only. This file is intentionally outside supabase/*.sql
--     so repo DB apply will not run it.
--   - No real tenants, payments, emails, notifications, finance rows, portal
--     user links, maintenance records, or billing objects are created.
--   - Uses deterministic UUIDs so the seed is idempotent and reversible.
--
-- Before running:
--   1. Apply the current repo SQL first, especially:
--        supabase/regulatory_proof_engine_vs0.sql
--        supabase/regulatory_proof_engine_vs1.sql
--   2. Replace YOUR_AUTH_USER_ID below with the UUID of the app user you log in
--      with, then run this file against the same database.
--
-- Example:
--   select set_config('request.jwt.claim.sub', 'YOUR_AUTH_USER_ID', false);
--   \i scripts/dev/rpe_diag_seed.sql
--
-- Cleanup:
--   delete from public.accounts
--   where id = '9f7e9d20-0000-4e1a-9000-000000000001'::uuid
--      or name = 'RPE_DIAG';

begin;

-- Uncomment and replace this line when running from a SQL editor/psql context
-- that does not already have an authenticated JWT claim.
--
-- select set_config('request.jwt.claim.sub', 'YOUR_AUTH_USER_ID', false);

do $$
declare
  v_user_id uuid := nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;

  v_account_id  uuid := '9f7e9d20-0000-4e1a-9000-000000000001'::uuid;
  v_property_id uuid := '9f7e9d20-0000-4e1a-9000-000000000101'::uuid;
  v_tenant_id   uuid := '9f7e9d20-0000-4e1a-9000-000000000201'::uuid;
  v_lease_id    uuid := '9f7e9d20-0000-4e1a-9000-000000000301'::uuid;
begin
  if v_user_id is null then
    raise exception
      'Set request.jwt.claim.sub to your app auth.users.id before running this seed.';
  end if;

  insert into public.accounts (
    id,
    name,
    created_by,
    language,
    is_root,
    is_disabled,
    subscription_status,
    subscription_plan,
    country_code,
    currency
  )
  values (
    v_account_id,
    'RPE_DIAG',
    v_user_id,
    'en',
    false,
    false,
    'active',
    'pro',
    'GB',
    'GBP'
  )
  on conflict (id) do update
  set
    name = excluded.name,
    created_by = excluded.created_by,
    language = excluded.language,
    is_root = excluded.is_root,
    is_disabled = excluded.is_disabled,
    subscription_status = excluded.subscription_status,
    subscription_plan = excluded.subscription_plan,
    country_code = excluded.country_code,
    currency = excluded.currency;

  insert into public.account_members (
    account_id,
    user_id,
    role
  )
  values (
    v_account_id,
    v_user_id,
    'owner'
  )
  on conflict (account_id, user_id) do update
  set role = excluded.role;

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
    account_id
  )
  values (
    v_property_id,
    v_user_id,
    'RPE Diagnostic House',
    'London',
    null,
    'Wolne',
    1200,
    'diagnostic',
    v_account_id
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
    account_id = excluded.account_id;

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
  values (
    v_tenant_id,
    v_user_id,
    v_property_id,
    'RPE Diagnostic Tenant',
    'rpe-diagnostic@example.invalid',
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
  set
    tenant_id = v_tenant_id,
    status = 'Wynajęte'
  where id = v_property_id;

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
  values (
    v_lease_id,
    v_account_id,
    v_property_id,
    v_tenant_id,
    'active',
    '2026-03-17',
    '2026-05-12',
    1200,
    'monthly',
    1200,
    v_user_id,
    '2026-03-17',
    '2026-05-12',
    'active',
    30,
    false,
    'RPE_DIAG fixed-term Section A seed. Jurisdiction intentionally remains unavailable in the current SQL read model.'
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
  'RPE_DIAG seeded' as status,
  '9f7e9d20-0000-4e1a-9000-000000000001'::uuid as account_id,
  '9f7e9d20-0000-4e1a-9000-000000000301'::uuid as lease_id,
  'Expected diagnostic preview: needs_data, missing_fields=[jurisdiction], decision_path=[jurisdiction]' as expected_preview;
