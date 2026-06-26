-- RPE contract test Part B representative measurement template.
--
-- Purpose:
--   Produces the exposure-vs-capture split for two representative brackets:
--     1. current_capture_state
--     2. post_capture_steady_state
--
-- Important:
--   This is a measurement report, not a correctness gate. It must aggregate
--   ONLY the fresh recorded_evaluation_id values from the run you are measuring.
--   Do not point it at all rule_evaluation rows.
--
-- How to use:
--   Replace the null placeholder rows in run_population with the fresh
--   recorded_evaluation_id set for each bracket. Use weights if the
--   representative portfolio is model-weighted; otherwise leave weight = 1.
--
-- Example:
--   ('current_capture_state', 'current_001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 1.0),
--   ('post_capture_steady_state', 'post_001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, 1.0)

with run_population as (
  select *
  from (
    values
      ('current_capture_state'::text, 'REPLACE_WITH_ROW_LABEL'::text, null::uuid, 1.0::numeric),
      ('post_capture_steady_state'::text, 'REPLACE_WITH_ROW_LABEL'::text, null::uuid, 1.0::numeric)
  ) as population(bracket_name, portfolio_row_label, recorded_evaluation_id, weight)
  where recorded_evaluation_id is not null
),
recorded as (
  select
    rp.bracket_name,
    rp.portfolio_row_label,
    rp.weight,
    re.id as recorded_evaluation_id,
    re.tenancy_id,
    re.result,
    re.reason_codes,
    re.missing_fields,
    re.decision_path,
    re.obligation_kind,
    re.exposure_gbp_ceiling,
    re.evaluation_confidence,
    re.demo_mode,
    re.evaluated_at,
    re.input_snapshot
  from run_population rp
  join public.rule_evaluation re
    on re.id = rp.recorded_evaluation_id
),
derived as (
  select
    r.*,
    case
      when not ('active_on_qualifying_date' = any(coalesce(r.decision_path, array[]::text[]))) then 'not_reached'
      when r.input_snapshot -> 'active_on_qualifying_date' ->> 'classification' = 'missing' then 'missing'
      when exists (
        select 1
        from jsonb_array_elements_text(coalesce(
          r.input_snapshot -> 'active_on_qualifying_date' -> 'source_fields',
          '[]'::jsonb
        )) as source_field(value)
        where source_field.value in (
          'leases.term_type',
          'leases.term_type_effective_from',
          'leases.term_type_evidence_basis'
        )
      ) then 'time_qualified_periodic_indicator'
      when lower(coalesce(r.input_snapshot -> 'active_on_qualifying_date' ->> 'admissibility_reason', '')) like '%periodic%'
        or lower(coalesce(r.input_snapshot -> 'active_on_qualifying_date' ->> 'admissibility_reason', '')) like '%open-ended%'
        or lower(coalesce(r.input_snapshot -> 'active_on_qualifying_date' ->> 'admissibility_reason', '')) like '%open_ended%'
        or lower(coalesce(r.input_snapshot -> 'active_on_qualifying_date' ->> 'admissibility_reason', '')) like '%time-qualified%'
        then 'time_qualified_periodic_indicator'
      else 'known_end_date'
    end as aod_branch
  from recorded r
),
events as (
  select distinct on (pe.entity_id)
    pe.entity_id as evaluation_id,
    pe.id as provenance_event_id,
    pe.metadata ->> 'inputSnapshotHash' as input_snapshot_hash
  from public.provenance_events pe
  join derived d on d.recorded_evaluation_id = pe.entity_id
  where pe.entity_type = 'rule_evaluation'
    and pe.event_type = 'evaluation_run'
  order by pe.entity_id, pe.recorded_at desc
),
checked as (
  select
    d.*,
    (e.provenance_event_id is not null) as evaluation_run_event_exists,
    e.input_snapshot_hash,
    (
      d.demo_mode is true
      and e.provenance_event_id is not null
      and e.input_snapshot_hash ~ '^[a-f0-9]{64}$'
    ) as hard_check_pass
  from derived d
  left join events e on e.evaluation_id = d.recorded_evaluation_id
),
bracket_totals as (
  select bracket_name, sum(weight) as total_weight
  from checked
  group by bracket_name
),
aod_distribution as (
  select
    c.bracket_name,
    '1_aod_branch_distribution'::text as report_line,
    c.aod_branch as bucket,
    sum(c.weight) as weighted_count
  from checked c
  group by c.bracket_name, c.aod_branch
),
result_distribution as (
  select
    c.bracket_name,
    '2_result_distribution'::text as report_line,
    c.result as bucket,
    sum(c.weight) as weighted_count
  from checked c
  group by c.bracket_name, c.result
),
needs_blockers as (
  select
    c.bracket_name,
    '3_needs_data_blocking_field'::text as report_line,
    blocker.blocking_field as bucket,
    sum(c.weight) as weighted_count
  from checked c
  cross join lateral unnest(coalesce(c.missing_fields, array[]::text[])) as blocker(blocking_field)
  where c.result = 'needs_data'
  group by c.bracket_name, blocker.blocking_field
),
confidence_distribution as (
  select
    c.bracket_name,
    '4_confidence_distribution'::text as report_line,
    coalesce(c.evaluation_confidence, 'null') as bucket,
    sum(c.weight) as weighted_count
  from checked c
  group by c.bracket_name, c.evaluation_confidence
),
headline as (
  select
    c.bracket_name,
    '5_headline_terminal_vs_capture'::text as report_line,
    case when c.result in ('affected', 'not_affected') then 'terminal' else c.result end as bucket,
    sum(c.weight) as weighted_count
  from checked c
  group by c.bracket_name, case when c.result in ('affected', 'not_affected') then 'terminal' else c.result end
),
hard_checks as (
  select
    c.bracket_name,
    '0_hard_checks'::text as report_line,
    case when bool_and(c.hard_check_pass) then 'pass' else 'fail' end as bucket,
    sum(c.weight) as weighted_count
  from checked c
  group by c.bracket_name
),
bracket_hard_checks as (
  select
    c.bracket_name,
    bool_and(c.hard_check_pass) as bracket_hard_checks_pass
  from checked c
  group by c.bracket_name
),
combined as (
  select * from hard_checks
  union all select * from aod_distribution
  union all select * from result_distribution
  union all select * from needs_blockers
  union all select * from confidence_distribution
  union all select * from headline
)
select
  combined.bracket_name,
  combined.report_line,
  combined.bucket,
  combined.weighted_count,
  round((combined.weighted_count / nullif(bt.total_weight, 0)) * 100, 2) as weighted_percentage,
  bt.total_weight as bracket_total_weight,
  (
    select array_agg(priority.blocking_field order by priority.weighted_count desc, priority.blocking_field)
    from (
      select
        blocker.blocking_field,
        sum(c.weight) as weighted_count
      from checked c
      cross join lateral unnest(coalesce(c.missing_fields, array[]::text[])) as blocker(blocking_field)
      where c.bracket_name = combined.bracket_name
        and c.result = 'needs_data'
      group by blocker.blocking_field
    ) priority
  ) as capture_priority_order,
  bhc.bracket_hard_checks_pass
from combined
join bracket_totals bt on bt.bracket_name = combined.bracket_name
join bracket_hard_checks bhc on bhc.bracket_name = combined.bracket_name
group by
  combined.bracket_name,
  combined.report_line,
  combined.bucket,
  combined.weighted_count,
  bt.total_weight,
  bhc.bracket_hard_checks_pass
order by combined.bracket_name, combined.report_line, combined.weighted_count desc, combined.bucket;
