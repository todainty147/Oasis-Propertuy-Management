-- RPE B-prereq-3 Tier-4 diagnostic seed.
--
-- Purpose:
--   Creates capacity-safe diagnostic leases for Tier-4 exclusion/classification
--   closure checks under the same account/property/tenant as a source lease
--   already visible in the RPE diagnostic dropdown.
--
-- Safety:
--   - Dev/manual helper only. This file is intentionally outside supabase/*.sql.
--   - Creates no properties or tenants.
--   - Diagnostic lease rows use status = 'ended' so they do not violate the
--     leases_one_active_per_property partial unique index.
--   - Sets the reused source property country_subdivision to England and
--     pbsa=false. Run rpe_b_prereq3_prepare_pbsa_true.sql only for the PBSA
--     case, then run rpe_b_prereq3_prepare_pbsa_false.sql before other cases.
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
  set
    country_subdivision = 'England',
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
      '9f7e9d25-0000-4e1a-9000-000000000401'::uuid,
      v_account_id, v_property_id, v_tenant_id, 'ended',
      '2026-03-17', '2026-05-12', 1200, 'monthly', null, v_user_id,
      '2026-03-17', '2026-05-12', 'active', null, null, null,
      true, false, false, false, 'assured_shorthold',
      30, false, 'RPE_BPREREQ3 company_let=true exclusion.'
    ),
    (
      '9f7e9d25-0000-4e1a-9000-000000000402'::uuid,
      v_account_id, v_property_id, v_tenant_id, 'ended',
      '2026-03-17', '2026-05-12', 1200, 'monthly', null, v_user_id,
      '2026-03-17', '2026-05-12', 'active', null, null, null,
      false, true, false, false, 'assured_shorthold',
      30, false, 'RPE_BPREREQ3 resident_landlord=true exclusion.'
    ),
    (
      '9f7e9d25-0000-4e1a-9000-000000000403'::uuid,
      v_account_id, v_property_id, v_tenant_id, 'ended',
      '2026-03-17', '2026-05-12', 1200, 'monthly', null, v_user_id,
      '2026-03-17', '2026-05-12', 'active', null, null, null,
      false, false, true, false, 'assured_shorthold',
      30, false, 'RPE_BPREREQ3 rent_act_1977=true exclusion.'
    ),
    (
      '9f7e9d25-0000-4e1a-9000-000000000404'::uuid,
      v_account_id, v_property_id, v_tenant_id, 'ended',
      '2026-03-17', '2026-05-12', 1200, 'monthly', null, v_user_id,
      '2026-03-17', '2026-05-12', 'active', null, null, null,
      false, false, false, false, 'assured_shorthold',
      30, false, 'RPE_BPREREQ3 PBSA exclusion. Run prepare_pbsa_true before Run + record.'
    ),
    (
      '9f7e9d25-0000-4e1a-9000-000000000405'::uuid,
      v_account_id, v_property_id, v_tenant_id, 'ended',
      '2026-03-17', '2026-05-12', 1200, 'monthly', null, v_user_id,
      '2026-03-17', '2026-05-12', 'active', null, null, null,
      true, null, null, null, null,
      30, false, 'RPE_BPREREQ3 ordering proof: company_let=true wins before tenancy_class completeness.'
    ),
    (
      '9f7e9d25-0000-4e1a-9000-000000000406'::uuid,
      v_account_id, v_property_id, v_tenant_id, 'ended',
      '2026-03-17', '2026-05-12', 1200, 'monthly', null, v_user_id,
      '2026-03-17', '2026-05-12', 'active', null, null, null,
      null, false, false, false, 'assured_shorthold',
      30, false, 'RPE_BPREREQ3 null-vs-false: company_let null remains needs_data.'
    ),
    (
      '9f7e9d25-0000-4e1a-9000-000000000407'::uuid,
      v_account_id, v_property_id, v_tenant_id, 'ended',
      '2026-03-17', '2026-05-12', 1200, 'monthly', null, v_user_id,
      '2026-03-17', '2026-05-12', 'active', null, null, null,
      false, false, false, false, 'regulated_rent_act',
      30, false, 'RPE_BPREREQ3 tenancy_class regulated_rent_act provisional non-AST exclusion.'
    ),
    (
      '9f7e9d25-0000-4e1a-9000-000000000408'::uuid,
      v_account_id, v_property_id, v_tenant_id, 'ended',
      '2026-03-17', '2026-05-12', 1200, 'monthly', null, v_user_id,
      '2026-03-17', '2026-05-12', 'active', null, null, null,
      false, false, false, false, null,
      30, false, 'RPE_BPREREQ3 tenancy_class null remains needs_data.'
    ),
    (
      '9f7e9d25-0000-4e1a-9000-000000000409'::uuid,
      v_account_id, v_property_id, v_tenant_id, 'ended',
      '2026-03-17', '2026-05-12', 1200, 'monthly', null, v_user_id,
      '2026-03-17', '2026-05-12', 'active', null, null, null,
      false, false, false, null, 'assured_shorthold',
      30, false, 'RPE_BPREREQ3 is_wholly_oral null remains needs_data after exclusions/classification.'
    ),
    (
      '9f7e9d25-0000-4e1a-9000-000000000410'::uuid,
      v_account_id, v_property_id, v_tenant_id, 'ended',
      '2026-03-17', '2026-05-12', 1200, 'monthly', null, v_user_id,
      '2026-03-17', '2026-05-12', 'active', null, null, null,
      false, false, false, false, 'assured_shorthold',
      30, false, 'RPE_BPREREQ3 first affected milestone: information_sheet.'
    ),
    (
      '9f7e9d25-0000-4e1a-9000-000000000411'::uuid,
      v_account_id, v_property_id, v_tenant_id, 'ended',
      '2026-03-17', '2026-05-12', 1200, 'monthly', null, v_user_id,
      '2026-03-17', '2026-05-12', 'active', null, null, null,
      false, false, false, true, 'assured_shorthold',
      30, false, 'RPE_BPREREQ3 affected milestone: wholly oral written_statement.'
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
    ('company_let_exclusion', '9f7e9d25-0000-4e1a-9000-000000000401'::uuid, 'not_affected[EXCL_CLASS_COMPANY_LET]'),
    ('resident_landlord_exclusion', '9f7e9d25-0000-4e1a-9000-000000000402'::uuid, 'not_affected[EXCL_CLASS_LODGER]'),
    ('rent_act_1977_exclusion', '9f7e9d25-0000-4e1a-9000-000000000403'::uuid, 'not_affected[EXCL_CLASS_RENT_ACT_1977]'),
    ('pbsa_exclusion', '9f7e9d25-0000-4e1a-9000-000000000404'::uuid, 'not_affected[EXCL_CLASS_PBSA] -- run prepare_pbsa_true first'),
    ('ordering_company_without_class', '9f7e9d25-0000-4e1a-9000-000000000405'::uuid, 'not_affected[EXCL_CLASS_COMPANY_LET]'),
    ('company_null_needs_data', '9f7e9d25-0000-4e1a-9000-000000000406'::uuid, 'needs_data[company_let]'),
    ('tenancy_class_regulated', '9f7e9d25-0000-4e1a-9000-000000000407'::uuid, 'not_affected[EXCL_NOT_AST]'),
    ('tenancy_class_null', '9f7e9d25-0000-4e1a-9000-000000000408'::uuid, 'needs_data[tenancy_class]'),
    ('is_wholly_oral_null', '9f7e9d25-0000-4e1a-9000-000000000409'::uuid, 'needs_data[is_wholly_oral]'),
    ('affected_information_sheet', '9f7e9d25-0000-4e1a-9000-000000000410'::uuid, 'affected[AFF_INFO_SHEET] exposure=7000'),
    ('affected_written_statement', '9f7e9d25-0000-4e1a-9000-000000000411'::uuid, 'affected[AFF_WRITTEN_STATEMENT] exposure=7000')
) as seeded(case_name, tenancy_id, expected_result);
