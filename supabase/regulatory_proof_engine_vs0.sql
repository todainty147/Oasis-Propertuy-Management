-- supabase/regulatory_proof_engine_vs0.sql
--
-- Regulatory Proof Engine VS-0: Data Readiness Layer
--
-- This layer classifies available structured data for later regulatory
-- evaluation. It does not evaluate legal status and does not write
-- rule_evaluation or obligation_instance records.

begin;

create table if not exists public.regulatory_data_requirements (
  id uuid primary key default gen_random_uuid(),
  impact_rule_ref text not null,
  input_key text not null,
  capability text not null check (capability in ('exists','derivable','missing')),
  capture_tier int check (capture_tier between 1 and 5),
  capture_location text,
  mandatory boolean not null default true,
  conditional boolean not null default false,
  source_fields text[],
  notes text,
  created_at timestamptz not null default now(),
  unique (impact_rule_ref, input_key)
);

comment on table public.regulatory_data_requirements is
  'Platform-curated VS-0 catalogue of structural data requirements. Capability describes schema capability, not per-record legal status.';

alter table public.regulatory_data_requirements enable row level security;

revoke all on table public.regulatory_data_requirements from public;
grant select on table public.regulatory_data_requirements to authenticated;
grant all on table public.regulatory_data_requirements to service_role;

drop policy if exists regulatory_data_requirements_select_authenticated on public.regulatory_data_requirements;
create policy regulatory_data_requirements_select_authenticated
on public.regulatory_data_requirements
for select
to authenticated
using (true);

drop policy if exists regulatory_data_requirements_no_direct_write on public.regulatory_data_requirements;
create policy regulatory_data_requirements_no_direct_write
on public.regulatory_data_requirements
for all
to authenticated
using (false)
with check (false);

insert into public.regulatory_data_requirements (
  impact_rule_ref,
  input_key,
  capability,
  capture_tier,
  capture_location,
  mandatory,
  conditional,
  source_fields,
  notes
)
values
  ('rra_info_sheet_v1','regulatory_change_version','missing',null,'controlled regulatory catalogue',true,false,array[]::text[],'Delivered by regulatory_change at VS-1; not portfolio-captured.'),
  ('rra_info_sheet_v1','impact_rule_version','missing',null,'controlled regulatory catalogue',true,false,array[]::text[],'Delivered by impact_rule at VS-1; not portfolio-captured.'),
  ('rra_info_sheet_v1','qualifying_date','missing',null,'controlled regulatory catalogue',true,false,array[]::text[],'Commencement/qualifying date must come from a versioned rule record, not a code constant.'),
  ('rra_info_sheet_v1','tenancy_exists','exists',2,'tenancy setup',true,false,array['leases.id'],'A lease row is the structured tenancy record.'),
  ('rra_info_sheet_v1','tenancy_start_date','exists',2,'tenancy setup',true,false,array['leases.lease_start_date','leases.start_date'],'Dual nullable columns are accepted only when one is populated or both agree.'),
  ('rra_info_sheet_v1','tenancy_end_date','exists',2,'tenancy setup',true,false,array['leases.lease_end_date','leases.end_date'],'Null is not proof of an ongoing tenancy until an explicit semantic contract exists.'),
  ('rra_info_sheet_v1','active_on_qualifying_date','derivable',2,'tenancy setup / time-qualified term review',true,false,array['leases.lease_start_date','leases.start_date','leases.lease_end_date','leases.end_date','regulatory.qualifying_date','leases.term_type','leases.term_type_effective_from','leases.term_type_evidence_basis'],'Derived from admissible tenancy dates plus the versioned qualifying date. Null-end tenancies require a time-qualified periodic/open-ended indicator effective on or before the qualifying date.'),
  ('rra_info_sheet_v1','jurisdiction','missing',1,'property setup',true,false,array[]::text[],'Current schema lacks property-level England/Wales/Scotland subdivision. Account GB and property market uk are inadmissible.'),
  ('rra_info_sheet_v1','annual_rent_gbp','derivable',3,'tenancy rent terms',true,false,array['leases.rent_amount','leases.rent_frequency'],'properties.rent is an inadmissible substitute for lease rent.'),
  ('rra_info_sheet_v1','company_let','missing',4,'tenancy parties workflow',true,false,array[]::text[],'Requires structured contracting-party legal-person type.'),
  ('rra_info_sheet_v1','resident_landlord','missing',4,'tenancy setup/review',true,false,array[]::text[],'Requires structured occupancy/resident-landlord classification.'),
  ('rra_info_sheet_v1','is_wholly_oral','missing',4,'tenancy setup/review',true,false,array[]::text[],'Requires structured oral/written tenancy flag.'),
  ('rra_info_sheet_v1','tenancy_class','missing',4,'tenancy setup/review',true,false,array[]::text[],'Existing Polish lease_type values are inadmissible for UK statutory classification.'),
  ('rra_info_sheet_v1','rent_act_1977','missing',4,'tenancy setup/review',true,false,array[]::text[],'Requires structured UK statutory-regime flag.'),
  ('rra_info_sheet_v1','pbsa','missing',4,'property and tenancy setup/review',true,false,array[]::text[],'Requires structured PBSA/excluded accommodation classification.'),
  ('rra_info_sheet_v1','s21_served','missing',5,'possession notice workflow',true,true,array[]::text[],'Conditional possession input. No structured notice signal means not_applicable per tenancy.'),
  ('rra_info_sheet_v1','s8_served','missing',5,'possession notice workflow',true,true,array[]::text[],'Conditional possession input. No structured notice signal means not_applicable per tenancy.'),
  ('rra_info_sheet_v1','notice_cutoff_date','missing',null,'controlled regulatory catalogue',true,false,array[]::text[],'Delivered by the versioned rule catalogue, not by portfolio data.'),
  ('rra_info_sheet_v1','proceedings_status','missing',5,'possession/court proceeding workflow',true,true,array[]::text[],'Conditional possession input. Missing only once an admissible notice signal exists.'),
  ('rra_info_sheet_v1','official_info_sheet_identity','missing',null,'controlled document catalogue/template registry',true,false,array[]::text[],'Requires official GOV.UK artefact identity/version/hash; document tags or filenames are inadmissible.'),
  ('rra_info_sheet_v1','information_sheet_served','exists',null,'document service/provenance workflow',true,false,array['renters_rights_tasks.status','renters_rights_tasks.sent_at','provenance_events'],'Operational service evidence can exist, but does not by itself evaluate legal compliance.'),
  ('rra_info_sheet_v1','service_evidence_timestamp','exists',null,'document service/provenance workflow',true,false,array['renters_rights_tasks.sent_at','provenance_events.occurred_at','provenance_events.recorded_at'],'Timestamp strength depends on evidence type; VS-0 only classifies the source.'),
  ('rra_info_sheet_v1','evaluation_outcome_record','missing',null,'regulatory engine output',true,false,array[]::text[],'Placeholder for VS-1+ persisted evaluation/obligation output. VS-0 must not write it.')
on conflict (impact_rule_ref, input_key) do update
set
  capability = excluded.capability,
  capture_tier = excluded.capture_tier,
  capture_location = excluded.capture_location,
  mandatory = excluded.mandatory,
  conditional = excluded.conditional,
  source_fields = excluded.source_fields,
  notes = excluded.notes;

create or replace function public.rpe_vs0_classified_input(
  p_input_key text,
  p_classification text,
  p_value jsonb,
  p_source_fields text[],
  p_admissibility_reason text,
  p_confidence_basis text,
  p_low_confidence_reason text,
  p_capture_tier int,
  p_capture_location text
)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select jsonb_build_object(
    'input_key', p_input_key,
    'classification', p_classification,
    'value', case when p_classification in ('exists','derivable') then p_value else 'null'::jsonb end,
    'source_fields', coalesce(to_jsonb(p_source_fields), '[]'::jsonb),
    'admissibility_reason', p_admissibility_reason,
    'confidence_basis', case when p_classification in ('exists','derivable') then p_confidence_basis else null end,
    'low_confidence_reason', p_low_confidence_reason,
    'capture_tier', p_capture_tier,
    'capture_location', p_capture_location
  );
$$;

create or replace function public.rpe_vs0_dual_date_result(
  p_input_key text,
  p_primary text,
  p_legacy text,
  p_primary_field text,
  p_legacy_field text,
  p_capture_tier int,
  p_capture_location text
)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_primary date := nullif(p_primary, '')::date;
  v_legacy date := nullif(p_legacy, '')::date;
begin
  if v_primary is not null and v_legacy is not null and v_primary <> v_legacy then
    return public.rpe_vs0_classified_input(
      p_input_key, 'missing', null, array[p_primary_field, p_legacy_field],
      'Contradictory structured source fields require data capture; VS-0 must not choose silently.',
      null, null, p_capture_tier, p_capture_location
    );
  end if;

  if v_primary is not null then
    return public.rpe_vs0_classified_input(
      p_input_key, 'exists', to_jsonb(v_primary), array[p_primary_field],
      'Admissible structured field is present.', 'exists', null, p_capture_tier, p_capture_location
    );
  end if;

  if v_legacy is not null then
    return public.rpe_vs0_classified_input(
      p_input_key, 'exists', to_jsonb(v_legacy), array[p_legacy_field],
      'Admissible structured field is present.', 'exists', null, p_capture_tier, p_capture_location
    );
  end if;

  return public.rpe_vs0_classified_input(
    p_input_key, 'missing', null, array[]::text[],
    'No admissible structured source field is present for this input.',
    null, null, p_capture_tier, p_capture_location
  );
end;
$$;

create or replace function public.get_rra_info_sheet_data_readiness(
  p_account_id uuid,
  p_lease_id uuid
)
returns table (
  input_key text,
  classified_input jsonb
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_lease public.leases%rowtype;
  v_lease_json jsonb;
  v_task public.renters_rights_tasks%rowtype;
  v_req public.regulatory_data_requirements%rowtype;
  v_start jsonb;
  v_end jsonb;
  v_start_date date;
  v_end_date date;
  v_qualifying_date date;
  v_term_type text;
  v_term_effective_from date;
  v_term_evidence_basis text;
  v_rent_amount numeric;
  v_rent_frequency text;
  v_multiplier numeric;
begin
  if not public.user_can_manage_account(p_account_id) then
    raise exception 'Not authorized for account';
  end if;

  select *
  into v_lease
  from public.leases l
  where l.id = p_lease_id
    and l.account_id = p_account_id;

  if not found then
    raise exception 'Lease not found for account';
  end if;

  v_lease_json := to_jsonb(v_lease);

  select *
  into v_task
  from public.renters_rights_tasks t
  where t.account_id = p_account_id
    and t.lease_id = p_lease_id
    and t.requirement_type = 'renters_rights_information_sheet'
  order by t.created_at desc
  limit 1;

  if to_regclass('public.regulatory_change') is not null then
    execute $dyn$
      select effective_date
      from public.regulatory_change
      where regulation_key = 'renters_rights_act_2026'
        and version = 1
      limit 1
    $dyn$ into v_qualifying_date;
  end if;

  for v_req in
    select r.*
    from public.regulatory_data_requirements r
    where r.impact_rule_ref = 'rra_info_sheet_v1'
    order by
      case r.input_key
        when 'regulatory_change_version' then 1
        when 'impact_rule_version' then 2
        when 'qualifying_date' then 3
        when 'tenancy_exists' then 4
        when 'tenancy_start_date' then 5
        when 'tenancy_end_date' then 6
        when 'active_on_qualifying_date' then 7
        when 'jurisdiction' then 8
        when 'annual_rent_gbp' then 9
        when 'company_let' then 10
        when 'resident_landlord' then 11
        when 'is_wholly_oral' then 12
        when 'tenancy_class' then 13
        when 'rent_act_1977' then 14
        when 'pbsa' then 15
        when 's21_served' then 16
        when 's8_served' then 17
        when 'notice_cutoff_date' then 18
        when 'proceedings_status' then 19
        when 'official_info_sheet_identity' then 20
        when 'information_sheet_served' then 21
        when 'service_evidence_timestamp' then 22
        when 'evaluation_outcome_record' then 23
        else 999
      end
  loop
    input_key := v_req.input_key;

    if v_req.input_key = 'tenancy_exists' then
      classified_input := public.rpe_vs0_classified_input(
        v_req.input_key, 'exists', 'true'::jsonb, array['leases.id'],
        'Admissible structured field is present.', 'exists', null,
        v_req.capture_tier, v_req.capture_location
      );

    elsif v_req.input_key = 'tenancy_start_date' then
      classified_input := public.rpe_vs0_dual_date_result(
        v_req.input_key,
        v_lease_json->>'lease_start_date',
        v_lease_json->>'start_date',
        'leases.lease_start_date',
        'leases.start_date',
        v_req.capture_tier,
        v_req.capture_location
      );

    elsif v_req.input_key = 'tenancy_end_date' then
      classified_input := public.rpe_vs0_dual_date_result(
        v_req.input_key,
        v_lease_json->>'lease_end_date',
        v_lease_json->>'end_date',
        'leases.lease_end_date',
        'leases.end_date',
        v_req.capture_tier,
        v_req.capture_location
      );

    elsif v_req.input_key = 'active_on_qualifying_date' then
      if v_qualifying_date is null then
        classified_input := public.rpe_vs0_classified_input(
          v_req.input_key, 'missing', null, array[]::text[],
          'No versioned qualifying date is present; VS-0 must not use code constants.',
          null, null, v_req.capture_tier, v_req.capture_location
        );
      else
        v_start := public.rpe_vs0_dual_date_result(
          v_req.input_key,
          v_lease_json->>'lease_start_date',
          v_lease_json->>'start_date',
          'leases.lease_start_date',
          'leases.start_date',
          v_req.capture_tier,
          v_req.capture_location
        );
        v_end := public.rpe_vs0_dual_date_result(
          v_req.input_key,
          v_lease_json->>'lease_end_date',
          v_lease_json->>'end_date',
          'leases.lease_end_date',
          'leases.end_date',
          v_req.capture_tier,
          v_req.capture_location
        );

        if v_start->>'classification' = 'missing'
           and (v_start->>'admissibility_reason') like 'Contradictory%' then
          classified_input := v_start;
        elsif v_end->>'classification' = 'missing'
           and (v_end->>'admissibility_reason') like 'Contradictory%' then
          classified_input := v_end;
        elsif v_start->>'classification' = 'missing' then
          classified_input := public.rpe_vs0_classified_input(
            v_req.input_key, 'missing', null, array[]::text[],
            'No admissible tenancy start date is present for active-on-date derivation.',
            null, null, v_req.capture_tier, v_req.capture_location
          );
        else
          v_start_date := (v_start->>'value')::date;
          v_end_date := case when v_end->>'classification' = 'exists' then (v_end->>'value')::date else null end;
          v_term_type := lower(nullif(v_lease_json->>'term_type', ''));
          v_term_effective_from := nullif(v_lease_json->>'term_type_effective_from', '')::date;
          v_term_evidence_basis := nullif(v_lease_json->>'term_type_evidence_basis', '');

          if v_start_date > v_qualifying_date then
            classified_input := public.rpe_vs0_classified_input(
              v_req.input_key, 'derivable', 'false'::jsonb,
              array['leases.lease_start_date','leases.start_date','regulatory.qualifying_date'],
              'Start date is after the qualifying date, derived from admissible structured fields.',
              'derivable', null, v_req.capture_tier, v_req.capture_location
            );
          elsif v_end_date is not null then
            classified_input := public.rpe_vs0_classified_input(
              v_req.input_key, 'derivable', to_jsonb(v_end_date >= v_qualifying_date),
              array['leases.lease_start_date','leases.start_date','leases.lease_end_date','leases.end_date','regulatory.qualifying_date'],
              'Value is deterministically derived from admissible structured fields.',
              'derivable', null, v_req.capture_tier, v_req.capture_location
            );
          elsif v_term_type in ('periodic','open_ended','open-ended')
             and v_term_effective_from is not null
             and v_term_effective_from <= v_qualifying_date
             and v_term_evidence_basis is not null then
            classified_input := public.rpe_vs0_classified_input(
              v_req.input_key, 'derivable', 'true'::jsonb,
              array['leases.lease_start_date','leases.start_date','regulatory.qualifying_date','leases.term_type','leases.term_type_effective_from','leases.term_type_evidence_basis'],
              'Null end date is supported by an admissible time-qualified periodic/open-ended indicator as at the qualifying date.',
              'derivable', null, v_req.capture_tier, v_req.capture_location
            );
          else
            classified_input := public.rpe_vs0_classified_input(
              v_req.input_key, 'missing', null,
              array['leases.lease_end_date','leases.end_date','leases.term_type','leases.term_type_effective_from','leases.term_type_evidence_basis'],
              'End date is absent and no admissible time-qualified periodic/open-ended indicator is present.',
              null, null, v_req.capture_tier, v_req.capture_location
            );
          end if;
        end if;
      end if;

    elsif v_req.input_key = 'annual_rent_gbp' then
      v_rent_amount := nullif(v_lease_json->>'rent_amount', '')::numeric;
      v_rent_frequency := lower(nullif(v_lease_json->>'rent_frequency', ''));
      v_multiplier := case v_rent_frequency
        when 'weekly' then 52
        when 'week' then 52
        when 'monthly' then 12
        when 'month' then 12
        when 'quarterly' then 4
        when 'quarter' then 4
        when 'annually' then 1
        when 'annual' then 1
        when 'yearly' then 1
        when 'year' then 1
        else null
      end;

      if v_rent_amount is not null and v_multiplier is not null then
        classified_input := public.rpe_vs0_classified_input(
          v_req.input_key, 'derivable', to_jsonb(v_rent_amount * v_multiplier),
          array['leases.rent_amount','leases.rent_frequency'],
          'Value is deterministically derived from admissible structured fields.',
          'derivable', null, v_req.capture_tier, v_req.capture_location
        );
      else
        classified_input := public.rpe_vs0_classified_input(
          v_req.input_key, 'missing', null, array['leases.rent_amount','leases.rent_frequency'],
          'No admissible lease rent amount/frequency is present. properties.rent is inadmissible.',
          null, null, v_req.capture_tier, v_req.capture_location
        );
      end if;

    elsif v_req.input_key = 'information_sheet_served' and v_task.id is not null
      and v_task.status in ('sent','evidence_uploaded','reviewed') then
      classified_input := public.rpe_vs0_classified_input(
        v_req.input_key, 'exists', 'true'::jsonb, array['renters_rights_tasks.status'],
        'Admissible structured operational task state is present; this is not a legal conclusion.',
        'exists', null, v_req.capture_tier, v_req.capture_location
      );

    elsif v_req.input_key = 'service_evidence_timestamp' and v_task.sent_at is not null then
      classified_input := public.rpe_vs0_classified_input(
        v_req.input_key, 'exists', to_jsonb(v_task.sent_at), array['renters_rights_tasks.sent_at'],
        'Admissible structured timestamp is present; evidential strength is evaluated later.',
        'exists', null, v_req.capture_tier, v_req.capture_location
      );

    elsif v_req.input_key in ('s21_served','s8_served','proceedings_status') then
      classified_input := public.rpe_vs0_classified_input(
        v_req.input_key, 'not_applicable', null, array[]::text[],
        'No admissible structured possession notice signal exists for this tenancy.',
        null, null, v_req.capture_tier, v_req.capture_location
      );

    elsif v_req.input_key = 'jurisdiction' then
      classified_input := public.rpe_vs0_classified_input(
        v_req.input_key, 'missing', null, array['properties.country_subdivision'],
        'No property-level England/Wales/Scotland subdivision exists. Account GB, property market uk, and task jurisdiction defaults are inadmissible.',
        null, null, v_req.capture_tier, v_req.capture_location
      );

    else
      classified_input := public.rpe_vs0_classified_input(
        v_req.input_key, 'missing', null, coalesce(v_req.source_fields, array[]::text[]),
        coalesce(v_req.notes, 'No admissible structured source field is present for this input.'),
        null, null, v_req.capture_tier, v_req.capture_location
      );
    end if;

    return next;
  end loop;
end;
$$;

comment on function public.get_rra_info_sheet_data_readiness(uuid, uuid) is
  'Returns VS-0 per-tenancy classified data inputs for RRA information-sheet VS-1. This is a read model only and performs no legal evaluation.';

revoke all on function public.rpe_vs0_classified_input(text, text, jsonb, text[], text, text, text, int, text) from public;
revoke all on function public.rpe_vs0_dual_date_result(text, text, text, text, text, int, text) from public;
revoke all on function public.get_rra_info_sheet_data_readiness(uuid, uuid) from public;

grant execute on function public.get_rra_info_sheet_data_readiness(uuid, uuid) to authenticated;

commit;
