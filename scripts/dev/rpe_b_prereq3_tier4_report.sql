-- RPE B-prereq-3 Tier-4 diagnostic report.
--
-- Run after:
--   1. scripts/dev/rpe_b_prereq3_tier4_seed.sql
--   2. Run + record each seeded lease.
--   3. For the PBSA case only, use rpe_b_prereq3_prepare_pbsa_true.sql before
--      recording, then rpe_b_prereq3_prepare_pbsa_false.sql before recording
--      the other cases.

with target_cases as (
  select *
  from (
    values
      ('company_let_exclusion', '9f7e9d25-0000-4e1a-9000-000000000401'::uuid, 'not_affected'::text),
      ('resident_landlord_exclusion', '9f7e9d25-0000-4e1a-9000-000000000402'::uuid, 'not_affected'::text),
      ('rent_act_1977_exclusion', '9f7e9d25-0000-4e1a-9000-000000000403'::uuid, 'not_affected'::text),
      ('pbsa_exclusion', '9f7e9d25-0000-4e1a-9000-000000000404'::uuid, 'not_affected'::text),
      ('ordering_company_without_class', '9f7e9d25-0000-4e1a-9000-000000000405'::uuid, 'not_affected'::text),
      ('company_null_needs_data', '9f7e9d25-0000-4e1a-9000-000000000406'::uuid, 'needs_data'::text),
      ('tenancy_class_regulated', '9f7e9d25-0000-4e1a-9000-000000000407'::uuid, 'not_affected'::text),
      ('tenancy_class_null', '9f7e9d25-0000-4e1a-9000-000000000408'::uuid, 'needs_data'::text),
      ('is_wholly_oral_null', '9f7e9d25-0000-4e1a-9000-000000000409'::uuid, 'needs_data'::text),
      ('affected_information_sheet', '9f7e9d25-0000-4e1a-9000-000000000410'::uuid, 'affected'::text),
      ('affected_written_statement', '9f7e9d25-0000-4e1a-9000-000000000411'::uuid, 'affected'::text)
  ) as cases(case_name, tenancy_id, expected_result)
),
latest_eval as (
  select distinct on (tc.case_name)
    tc.case_name,
    re.*
  from target_cases tc
  join public.rule_evaluation re
    on re.tenancy_id = tc.tenancy_id
   and re.result = tc.expected_result
  order by tc.case_name, re.evaluated_at desc
),
latest_event as (
  select distinct on (pe.entity_id)
    pe.entity_id as evaluation_id,
    pe.id as provenance_event_id,
    pe.metadata
  from public.provenance_events pe
  join latest_eval re on re.id = pe.entity_id
  where pe.entity_type = 'rule_evaluation'
    and pe.event_type = 'evaluation_run'
  order by pe.entity_id, pe.recorded_at desc
)
select
  tc.case_name,
  l.property_id,
  tc.tenancy_id,
  p.pbsa as current_property_pbsa,
  l.company_let,
  l.resident_landlord,
  l.rent_act_1977,
  l.tenancy_class,
  l.is_wholly_oral,
  re.result,
  case
    when re.id is null then null
    when not ('active_on_qualifying_date' = any(re.decision_path)) then 'not_reached'
    when re.input_snapshot -> 'active_on_qualifying_date' ->> 'classification' = 'missing' then 'missing'
    when exists (
      select 1
      from jsonb_array_elements_text(coalesce(
        re.input_snapshot -> 'active_on_qualifying_date' -> 'source_fields',
        '[]'::jsonb
      )) as source_field(value)
      where source_field.value in (
        'leases.term_type',
        'leases.term_type_effective_from',
        'leases.term_type_evidence_basis'
      )
    ) then 'time_qualified_periodic_indicator'
    when lower(coalesce(re.input_snapshot -> 'active_on_qualifying_date' ->> 'admissibility_reason', '')) like '%periodic%'
      or lower(coalesce(re.input_snapshot -> 'active_on_qualifying_date' ->> 'admissibility_reason', '')) like '%open-ended%'
      or lower(coalesce(re.input_snapshot -> 'active_on_qualifying_date' ->> 'admissibility_reason', '')) like '%open_ended%'
      or lower(coalesce(re.input_snapshot -> 'active_on_qualifying_date' ->> 'admissibility_reason', '')) like '%time-qualified%'
      then 'time_qualified_periodic_indicator'
    else 'known_end_date'
  end as aod_branch,
  coalesce(re.reason_codes, array[]::text[]) as reason_codes,
  coalesce(re.missing_fields, array[]::text[]) as missing_fields,
  coalesce(re.decision_path, array[]::text[]) as decision_path,
  re.obligation_kind,
  re.exposure_gbp_ceiling,
  re.evaluation_confidence,
  re.demo_mode,
  re.id as recorded_evaluation_id,
  (le.provenance_event_id is not null) as evaluation_run_event_exists,
  le.metadata ->> 'inputSnapshotHash' as "inputSnapshotHash"
from target_cases tc
left join public.leases l on l.id = tc.tenancy_id
left join public.properties p on p.id = l.property_id
left join latest_eval re on re.case_name = tc.case_name
left join latest_event le on le.evaluation_id = re.id
order by tc.case_name;
