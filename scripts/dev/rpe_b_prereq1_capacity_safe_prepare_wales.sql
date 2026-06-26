-- RPE B-prereq-1 capacity-safe prepare: Wales fast-fail.
--
-- Run after scripts/dev/rpe_b_prereq1_capacity_safe_seed.sql.
-- Then select the RPE_DIAG_WALES_FAST_FAIL lease in the UI and click
-- "Run + record".

begin;

do $$
declare
  v_wales_lease_id uuid := '9f7e9d23-0000-4e1a-9000-000000000301'::uuid;
  v_property_id uuid;
begin
  select l.property_id
  into v_property_id
  from public.leases l
  where l.id = v_wales_lease_id;

  if v_property_id is null then
    raise exception 'Capacity-safe Wales diagnostic lease not found. Run rpe_b_prereq1_capacity_safe_seed.sql first.';
  end if;

  update public.properties
  set country_subdivision = 'Wales'
  where id = v_property_id;
end $$;

commit;

select
  'Prepared RPE_DIAG_WALES_FAST_FAIL' as status,
  '9f7e9d23-0000-4e1a-9000-000000000301'::uuid as tenancy_id,
  'Expected: not_affected, EXCL_JURISDICTION, decision_path=[jurisdiction]' as expected_evaluation;
