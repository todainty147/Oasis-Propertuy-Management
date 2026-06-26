-- RPE B-prereq-2 term-type diagnostic seed.
--
-- Purpose:
--   Creates capacity-safe diagnostic leases for Record A, B, C, and C-bad
--   under the same account/property/tenant as a source lease already visible in
--   the RPE diagnostic dropdown.
--
-- Safety:
--   - Dev/manual helper only. This file is intentionally outside supabase/*.sql.
--   - Creates no properties or tenants.
--   - Diagnostic lease rows use status = 'ended' so they do not violate the
--     leases_one_active_per_property partial unique index.
--   - Sets the reused source property country_subdivision to England so
--     jurisdiction passes for all B-prereq-2 records.
--
-- Before running:
--   select set_config('app.rpe_diag_source_lease_id', 'SOURCE_LEASE_ID', false);
--   select set_config('request.jwt.claim.sub', 'YOUR_AUTH_USER_ID', false); -- optional
--
-- After running:
--   Refresh the RPE manual diagnostic page and Run + record the lease IDs below.

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
begin
  if v_source_lease_id is null then
    raise exception 'Set app.rpe_diag_source_lease_id before running this seed.';
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

  update public.properties
  set country_subdivision = 'England'
  where id = v_property_id;

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
    term_type,
    term_type_effective_from,
    term_type_evidence_basis,
    notice_period_days,
    auto_renew,
    notes
  )
  values
    (
      '9f7e9d24-0000-4e1a-9000-000000000301'::uuid,
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
      null,
      null,
      null,
      30,
      false,
      'RPE_BPREREQ2_A known-end regression: active_on_date should derive true via known_end_date and proceed to tenancy_class.'
    ),
    (
      '9f7e9d24-0000-4e1a-9000-000000000302'::uuid,
      v_account_id,
      v_property_id,
      v_tenant_id,
      'ended',
      '2025-10-01',
      null,
      null,
      null,
      null,
      v_user_id,
      '2025-10-01',
      null,
      'active',
      'periodic',
      '2026-05-01',
      'statutory_conversion',
      30,
      false,
      'RPE_BPREREQ2_B modal periodic: admissible time-qualified periodic indicator.'
    ),
    (
      '9f7e9d24-0000-4e1a-9000-000000000303'::uuid,
      v_account_id,
      v_property_id,
      v_tenant_id,
      'ended',
      '2025-10-01',
      null,
      null,
      null,
      null,
      v_user_id,
      '2025-10-01',
      null,
      'active',
      null,
      null,
      null,
      30,
      false,
      'RPE_BPREREQ2_C null end with no indicator: active_on_date should be missing.'
    ),
    (
      '9f7e9d24-0000-4e1a-9000-000000000304'::uuid,
      v_account_id,
      v_property_id,
      v_tenant_id,
      'ended',
      '2025-10-01',
      null,
      null,
      null,
      null,
      v_user_id,
      '2025-10-01',
      null,
      'active',
      'periodic',
      null,
      'statutory_conversion',
      30,
      false,
      'RPE_BPREREQ2_C_BAD_1 present periodic but no effective date: reject.'
    ),
    (
      '9f7e9d24-0000-4e1a-9000-000000000305'::uuid,
      v_account_id,
      v_property_id,
      v_tenant_id,
      'ended',
      '2025-10-01',
      null,
      null,
      null,
      null,
      v_user_id,
      '2025-10-01',
      null,
      'active',
      'periodic',
      '2026-06-01',
      'statutory_conversion',
      30,
      false,
      'RPE_BPREREQ2_C_BAD_2 present periodic but effective after qualifying date: reject.'
    ),
    (
      '9f7e9d24-0000-4e1a-9000-000000000306'::uuid,
      v_account_id,
      v_property_id,
      v_tenant_id,
      'ended',
      '2025-10-01',
      null,
      null,
      null,
      null,
      v_user_id,
      '2025-10-01',
      null,
      'active',
      'periodic',
      '2026-05-01',
      null,
      30,
      false,
      'RPE_BPREREQ2_C_BAD_3 present periodic but no evidence basis: reject.'
    ),
    (
      '9f7e9d24-0000-4e1a-9000-000000000307'::uuid,
      v_account_id,
      v_property_id,
      v_tenant_id,
      'ended',
      '2025-10-01',
      null,
      null,
      null,
      null,
      v_user_id,
      '2025-10-01',
      null,
      'active',
      'fixed',
      '2026-05-01',
      'agreement_clause',
      30,
      false,
      'RPE_BPREREQ2_C_BAD_4 fixed term is not an open-ended/periodic indicator: reject.'
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
    term_type = excluded.term_type,
    term_type_effective_from = excluded.term_type_effective_from,
    term_type_evidence_basis = excluded.term_type_evidence_basis,
    notice_period_days = excluded.notice_period_days,
    auto_renew = excluded.auto_renew,
    notes = excluded.notes,
    updated_at = now();
end $$;

commit;

select *
from (
  values
    ('A_known_end_regression', '9f7e9d24-0000-4e1a-9000-000000000301'::uuid, 'needs_data[tenancy_class]'),
    ('B_admissible_periodic', '9f7e9d24-0000-4e1a-9000-000000000302'::uuid, 'needs_data[tenancy_class]'),
    ('C_no_indicator', '9f7e9d24-0000-4e1a-9000-000000000303'::uuid, 'needs_data[active_on_qualifying_date]'),
    ('C_bad_1_no_effective_date', '9f7e9d24-0000-4e1a-9000-000000000304'::uuid, 'needs_data[active_on_qualifying_date]'),
    ('C_bad_2_effective_after', '9f7e9d24-0000-4e1a-9000-000000000305'::uuid, 'needs_data[active_on_qualifying_date]'),
    ('C_bad_3_no_evidence_basis', '9f7e9d24-0000-4e1a-9000-000000000306'::uuid, 'needs_data[active_on_qualifying_date]'),
    ('C_bad_4_fixed_null_end', '9f7e9d24-0000-4e1a-9000-000000000307'::uuid, 'needs_data[active_on_qualifying_date]')
) as seeded(case_name, tenancy_id, expected_result);
