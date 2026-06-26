-- RPE B-prereq-1 capacity-safe prepare: inadmissible-only jurisdiction guard.
--
-- Run after recording the Wales fast-fail evaluation.
-- Then select the RPE_DIAG_JURISDICTION_GUARD lease in the UI and click
-- "Run + record".

begin;

do $$
declare
  v_guard_lease_id uuid := '9f7e9d23-0000-4e1a-9000-000000000302'::uuid;
  v_account_id uuid;
  v_property_id uuid;
  v_tenant_id uuid;
  v_has_properties_market boolean;
begin
  select l.account_id, l.property_id, l.tenant_id
  into v_account_id, v_property_id, v_tenant_id
  from public.leases l
  where l.id = v_guard_lease_id;

  if v_account_id is null or v_property_id is null or v_tenant_id is null then
    raise exception 'Capacity-safe guard diagnostic lease not found. Run rpe_b_prereq1_capacity_safe_seed.sql first.';
  end if;

  update public.properties
  set country_subdivision = null
  where id = v_property_id;

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
      using 'uk', v_property_id;
  end if;

  delete from public.renters_rights_tasks
  where lease_id = v_guard_lease_id
    and requirement_type = 'renters_rights_information_sheet'
    and notes = 'RPE_DIAG_JURISDICTION_GUARD capacity-safe inadmissible task jurisdiction default.';

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
    v_property_id,
    v_tenant_id,
    v_guard_lease_id,
    'renters_rights_information_sheet',
    'GB-ENG',
    '2026-05-31',
    'required',
    'RPE_DIAG_JURISDICTION_GUARD capacity-safe inadmissible task jurisdiction default.'
  );
end $$;

commit;

select
  'Prepared RPE_DIAG_JURISDICTION_GUARD' as status,
  '9f7e9d23-0000-4e1a-9000-000000000302'::uuid as tenancy_id,
  'Expected: needs_data, missing_fields=[jurisdiction], decision_path=[jurisdiction]' as expected_evaluation;
