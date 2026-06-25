-- RPE diagnostic same-account seed helper.
--
-- Purpose:
--   Creates one isolated diagnostic lease inside the same account as an
--   existing lease that already appears in the RPE diagnostic dropdown.
--
--   To avoid property-plan-capacity triggers, this helper reuses the source
--   lease's property and tenant. The diagnostic value is the new lease row's
--   admissible rent/date fields, not a new property record.
--
-- Use this when scripts/dev/rpe_diag_seed.sql created a separate RPE_DIAG
-- account but the app is still scoped to your current account. The diagnostic
-- page receives the already-loaded manager lease list and filters by active
-- account, so a separate-account seed will not appear until that account is
-- selected in the app.
--
-- Safety:
--   - Dev/manual helper only. This file is intentionally outside supabase/*.sql
--     so repo DB apply will not run it.
--   - No real properties, tenants, payments, emails, notifications, finance
--     rows, portal user links, maintenance records, or billing objects are
--     created.
--   - Uses deterministic UUIDs so the seed is idempotent and reversible.
--
-- Before running:
--   1. Replace SOURCE_LEASE_ID with a lease ID that already appears in the
--      diagnostic dropdown. The account is derived from that lease.
--   2. Optionally replace YOUR_AUTH_USER_ID with the UUID of the app user you
--      log in with. If omitted, the script falls back to accounts.created_by.
--
-- Example:
--   select set_config('app.rpe_diag_source_lease_id', 'ea1acbdd-75f3-4cab-a658-97fa68344a04', false);
--   select set_config('request.jwt.claim.sub', 'YOUR_AUTH_USER_ID', false);
--   \i scripts/dev/rpe_diag_seed_same_account.sql
--
-- Cleanup:
--   delete from public.leases
--   where id = '9f7e9d21-0000-4e1a-9000-000000000301'::uuid;
--
begin;

-- Uncomment and replace this with a lease that already appears in the dropdown.
--
-- select set_config('app.rpe_diag_source_lease_id', 'SOURCE_LEASE_ID', false);

-- Optional in SQL editor/psql contexts that do not already have a JWT claim.
--
-- select set_config('request.jwt.claim.sub', 'YOUR_AUTH_USER_ID', false);

do $$
declare
  v_source_lease_id uuid := nullif(current_setting('app.rpe_diag_source_lease_id', true), '')::uuid;
  v_account_id uuid;
  v_property_id uuid;
  v_tenant_id uuid;
  v_user_id uuid;

  v_lease_id    uuid := '9f7e9d21-0000-4e1a-9000-000000000301'::uuid;
begin
  if v_source_lease_id is null then
    raise exception
      'Set app.rpe_diag_source_lease_id to a lease ID that already appears in the diagnostic dropdown.';
  end if;

  select
    l.account_id,
    l.property_id,
    l.tenant_id
  into
    v_account_id,
    v_property_id,
    v_tenant_id
  from public.leases l
  where l.id = v_source_lease_id;

  if v_account_id is null then
    raise exception
      'No source lease found for %. Pick a lease ID that already appears in the diagnostic dropdown.',
      v_source_lease_id;
  end if;

  if v_property_id is null or v_tenant_id is null then
    raise exception
      'Source lease % must have property_id and tenant_id so the capacity-safe diagnostic lease can reuse them.',
      v_source_lease_id;
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
    'RPE_DIAG same-account capacity-safe fixed-term seed. Reuses source property/tenant. Jurisdiction intentionally remains unavailable in the current SQL read model.'
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
  'RPE_DIAG same-account seeded' as status,
  current_setting('app.rpe_diag_source_lease_id', true)::uuid as source_lease_id,
  '9f7e9d21-0000-4e1a-9000-000000000301'::uuid as lease_id,
  'Expected diagnostic preview: needs_data, missing_fields=[jurisdiction], decision_path=[jurisdiction]' as expected_preview;
