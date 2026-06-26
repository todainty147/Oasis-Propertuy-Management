-- RPE B-prereq-1 closure report helper.
--
-- Run after:
--   1. scripts/dev/rpe_b_prereq1_closure_seed.sql
--   2. "Run + record" in the RPE manual diagnostic UI for:
--        - RPE_DIAG_WALES_FAST_FAIL
--        - RPE_DIAG_JURISDICTION_GUARD
--
-- Optional account scoping:
--   select set_config('app.rpe_diag_account_id', 'ACCOUNT_ID', false);

with target_cases as (
  select
    'RPE_DIAG_WALES_FAST_FAIL'::text as case,
    '9f7e9d22-0000-4e1a-9000-000000000101'::uuid as property_id,
    '9f7e9d22-0000-4e1a-9000-000000000301'::uuid as tenancy_id
  union all
  select
    'RPE_DIAG_JURISDICTION_GUARD'::text as case,
    '9f7e9d22-0000-4e1a-9000-000000000102'::uuid as property_id,
    '9f7e9d22-0000-4e1a-9000-000000000302'::uuid as tenancy_id
),
latest_eval as (
  select distinct on (re.tenancy_id)
    re.*
  from public.rule_evaluation re
  join target_cases tc on tc.tenancy_id = re.tenancy_id
  order by re.tenancy_id, re.evaluated_at desc
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
  tc.case,
  tc.property_id,
  tc.tenancy_id,
  p.country_subdivision,
  (re.input_snapshot -> 'jurisdiction' ->> 'classification') as jurisdiction_classification,
  (re.input_snapshot -> 'jurisdiction' ->> 'value') as jurisdiction_value,
  re.result,
  coalesce(re.reason_codes, array[]::text[]) as reason_codes,
  coalesce(re.missing_fields, array[]::text[]) as missing_fields,
  coalesce(re.decision_path, array[]::text[]) as decision_path,
  re.evaluation_confidence,
  re.demo_mode,
  re.id as recorded_evaluation_id,
  (le.provenance_event_id is not null) as evaluation_run_event_exists,
  le.metadata ->> 'inputSnapshotHash' as "inputSnapshotHash"
from target_cases tc
left join public.properties p on p.id = tc.property_id
left join latest_eval re on re.tenancy_id = tc.tenancy_id
left join latest_event le on le.evaluation_id = re.id
where nullif(current_setting('app.rpe_diag_account_id', true), '') is null
   or exists (
     select 1
     from public.leases l
     where l.id = tc.tenancy_id
       and l.account_id = nullif(current_setting('app.rpe_diag_account_id', true), '')::uuid
   )
order by tc.case;
