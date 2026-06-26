-- RPE contract test Part A coverage seed.
--
-- Purpose:
--   Creates the 14 pinned coverage leases from RPE Contract Test v0.3.2
--   under the same account/property/tenant as a source lease already visible
--   in the RPE manual diagnostic dropdown.
--
-- Safety:
--   - Dev/manual helper only. This file is intentionally outside supabase/*.sql.
--   - Creates no properties or tenants, so it does not consume property plan
--     capacity.
--   - Diagnostic lease rows use status = 'ended' so they do not violate the
--     leases_one_active_per_property partial unique index.
--   - Property-level inputs are shared by the reused property. Before recording
--     C4/C7/C8/C10, run scripts/dev/rpe_contract_coverage_prepare_case.sql
--     for that case.
--
-- Before running:
--   select set_config('app.rpe_diag_source_lease_id', 'SOURCE_LEASE_ID', false);
--   select set_config('request.jwt.claim.sub', 'YOUR_AUTH_USER_ID', false); -- optional
--
-- After running:
--   1. Refresh the RPE manual diagnostic page.
--   2. For each C1-C14 row, run rpe_contract_coverage_prepare_case.sql with
--      app.rpe_contract_case set to the case name, then click "Run + record".
--   3. Run rpe_contract_coverage_report.sql.

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
     set country_subdivision = 'England',
         pbsa = false
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
    company_let,
    resident_landlord,
    rent_act_1977,
    is_wholly_oral,
    tenancy_class,
    notice_period_days,
    auto_renew,
    notes
  )
  values
    (
      '9f7e9d26-0000-4e1a-9000-000000000501'::uuid,
      v_account_id, v_property_id, v_tenant_id, 'ended',
      '2026-03-17', '2026-05-12', 1200, 'monthly', null, v_user_id,
      '2026-03-17', '2026-05-12', 'active', null, null, null,
      false, false, false, false, 'assured_shorthold',
      30, false, 'RPE_CONTRACT_C1 affected information_sheet; prepare default England/pbsa=false.'
    ),
    (
      '9f7e9d26-0000-4e1a-9000-000000000502'::uuid,
      v_account_id, v_property_id, v_tenant_id, 'ended',
      '2025-10-01', null, 1200, 'monthly', null, v_user_id,
      '2025-10-01', null, 'active', 'periodic', '2026-05-01', 'statutory_conversion',
      false, false, false, true, 'assured_shorthold',
      30, false, 'RPE_CONTRACT_C2 affected written_statement via admissible periodic indicator.'
    ),
    (
      '9f7e9d26-0000-4e1a-9000-000000000503'::uuid,
      v_account_id, v_property_id, v_tenant_id, 'ended',
      '2026-03-17', '2026-05-12', 1200, 'monthly', null, v_user_id,
      '2026-03-17', '2026-05-12', 'active', null, null, null,
      true, false, false, false, 'assured_shorthold',
      30, false, 'RPE_CONTRACT_C3 company_let exclusion.'
    ),
    (
      '9f7e9d26-0000-4e1a-9000-000000000504'::uuid,
      v_account_id, v_property_id, v_tenant_id, 'ended',
      '2025-10-01', null, 1200, 'monthly', null, v_user_id,
      '2025-10-01', null, 'active', 'periodic', '2026-05-01', 'statutory_conversion',
      false, false, false, false, 'assured_shorthold',
      30, false, 'RPE_CONTRACT_C4 PBSA exclusion; run prepare_case C4 immediately before recording.'
    ),
    (
      '9f7e9d26-0000-4e1a-9000-000000000505'::uuid,
      v_account_id, v_property_id, v_tenant_id, 'ended',
      '2026-03-17', '2026-05-12', 1200, 'monthly', null, v_user_id,
      '2026-03-17', '2026-05-12', 'active', null, null, null,
      false, true, false, false, 'assured_shorthold',
      30, false, 'RPE_CONTRACT_C5 resident_landlord exclusion.'
    ),
    (
      '9f7e9d26-0000-4e1a-9000-000000000506'::uuid,
      v_account_id, v_property_id, v_tenant_id, 'ended',
      '2026-03-17', '2026-05-12', 1200, 'monthly', null, v_user_id,
      '2026-03-17', '2026-05-12', 'active', null, null, null,
      false, false, true, false, 'assured_shorthold',
      30, false, 'RPE_CONTRACT_C6 Rent Act 1977 exclusion.'
    ),
    (
      '9f7e9d26-0000-4e1a-9000-000000000507'::uuid,
      v_account_id, v_property_id, v_tenant_id, 'ended',
      '2026-03-17', '2026-05-12', null, null, null, v_user_id,
      '2026-03-17', '2026-05-12', 'active', null, null, null,
      null, null, null, null, null,
      30, false, 'RPE_CONTRACT_C7 Wales jurisdiction exclusion; run prepare_case C7 before recording.'
    ),
    (
      '9f7e9d26-0000-4e1a-9000-000000000508'::uuid,
      v_account_id, v_property_id, v_tenant_id, 'ended',
      '2026-03-17', '2026-05-12', null, null, null, v_user_id,
      '2026-03-17', '2026-05-12', 'active', null, null, null,
      null, null, null, null, null,
      30, false, 'RPE_CONTRACT_C8 Scotland jurisdiction exclusion; run prepare_case C8 before recording.'
    ),
    (
      '9f7e9d26-0000-4e1a-9000-000000000509'::uuid,
      v_account_id, v_property_id, v_tenant_id, 'ended',
      '2026-03-17', '2026-05-12', 1200, 'monthly', null, v_user_id,
      '2026-03-17', '2026-05-12', 'active', null, null, null,
      false, false, false, false, 'regulated_rent_act',
      30, false, 'RPE_CONTRACT_C9 tenancy_class regulated non-AST exclusion.'
    ),
    (
      '9f7e9d26-0000-4e1a-9000-000000000510'::uuid,
      v_account_id, v_property_id, v_tenant_id, 'ended',
      '2026-03-17', '2026-05-12', 1200, 'monthly', null, v_user_id,
      '2026-03-17', '2026-05-12', 'active', null, null, null,
      false, false, false, false, 'assured_shorthold',
      30, false, 'RPE_CONTRACT_C10 inadmissible-only jurisdiction guard; run prepare_case C10 before recording.'
    ),
    (
      '9f7e9d26-0000-4e1a-9000-000000000511'::uuid,
      v_account_id, v_property_id, v_tenant_id, 'ended',
      '2025-10-01', null, 1200, 'monthly', null, v_user_id,
      '2025-10-01', null, 'active', null, null, null,
      false, false, false, false, 'assured_shorthold',
      30, false, 'RPE_CONTRACT_C11 null end with no admissible periodic indicator.'
    ),
    (
      '9f7e9d26-0000-4e1a-9000-000000000512'::uuid,
      v_account_id, v_property_id, v_tenant_id, 'ended',
      '2025-10-01', null, 1200, 'monthly', null, v_user_id,
      '2025-10-01', null, 'active', 'periodic', null, 'statutory_conversion',
      false, false, false, false, 'assured_shorthold',
      30, false, 'RPE_CONTRACT_C12 C-bad: periodic indicator without effective date.'
    ),
    (
      '9f7e9d26-0000-4e1a-9000-000000000513'::uuid,
      v_account_id, v_property_id, v_tenant_id, 'ended',
      '2025-10-01', null, 1200, 'monthly', null, v_user_id,
      '2025-10-01', null, 'active', 'periodic', '2026-05-01', 'statutory_conversion',
      false, false, false, false, null,
      30, false, 'RPE_CONTRACT_C13 admissible periodic indicator, tenancy_class missing.'
    ),
    (
      '9f7e9d26-0000-4e1a-9000-000000000514'::uuid,
      v_account_id, v_property_id, v_tenant_id, 'ended',
      '2026-03-17', '2026-05-12', 1200, 'monthly', null, v_user_id,
      '2026-03-17', '2026-05-12', 'active', null, null, null,
      false, false, false, false, null,
      30, false, 'RPE_CONTRACT_C14 known-end, tenancy_class missing.'
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
    company_let = excluded.company_let,
    resident_landlord = excluded.resident_landlord,
    rent_act_1977 = excluded.rent_act_1977,
    is_wholly_oral = excluded.is_wholly_oral,
    tenancy_class = excluded.tenancy_class,
    notice_period_days = excluded.notice_period_days,
    auto_renew = excluded.auto_renew,
    notes = excluded.notes,
    updated_at = now();
end $$;

commit;

select *
from (
  values
    ('C1', '9f7e9d26-0000-4e1a-9000-000000000501'::uuid, 'affected[AFF_INFO_SHEET] / known_end_date'),
    ('C2', '9f7e9d26-0000-4e1a-9000-000000000502'::uuid, 'affected[AFF_WRITTEN_STATEMENT] / time_qualified_periodic_indicator'),
    ('C3', '9f7e9d26-0000-4e1a-9000-000000000503'::uuid, 'not_affected[EXCL_CLASS_COMPANY_LET]'),
    ('C4', '9f7e9d26-0000-4e1a-9000-000000000504'::uuid, 'not_affected[EXCL_CLASS_PBSA] / prepare_case C4'),
    ('C5', '9f7e9d26-0000-4e1a-9000-000000000505'::uuid, 'not_affected[EXCL_CLASS_LODGER]'),
    ('C6', '9f7e9d26-0000-4e1a-9000-000000000506'::uuid, 'not_affected[EXCL_CLASS_RENT_ACT_1977]'),
    ('C7', '9f7e9d26-0000-4e1a-9000-000000000507'::uuid, 'not_affected[EXCL_JURISDICTION] / prepare_case C7'),
    ('C8', '9f7e9d26-0000-4e1a-9000-000000000508'::uuid, 'not_affected[EXCL_JURISDICTION] / prepare_case C8'),
    ('C9', '9f7e9d26-0000-4e1a-9000-000000000509'::uuid, 'not_affected[EXCL_NOT_AST]'),
    ('C10', '9f7e9d26-0000-4e1a-9000-000000000510'::uuid, 'needs_data[jurisdiction] / prepare_case C10'),
    ('C11', '9f7e9d26-0000-4e1a-9000-000000000511'::uuid, 'needs_data[active_on_qualifying_date]'),
    ('C12', '9f7e9d26-0000-4e1a-9000-000000000512'::uuid, 'needs_data[active_on_qualifying_date] C-bad'),
    ('C13', '9f7e9d26-0000-4e1a-9000-000000000513'::uuid, 'needs_data[tenancy_class]'),
    ('C14', '9f7e9d26-0000-4e1a-9000-000000000514'::uuid, 'needs_data[tenancy_class]')
) as seeded(case_name, tenancy_id, expected_result);
