begin;

create or replace function public.capture_rra_jurisdiction(
  p_account_id uuid,
  p_property_id uuid,
  p_country_subdivision text,
  p_evidence_basis text default null,
  p_demo_mode boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_property public.properties%rowtype;
  v_old_value text;
  v_event public.provenance_events%rowtype;
  v_captured_at timestamptz := now();
begin
  if p_demo_mode is not true then
    raise exception 'RPE VS-2A capture is demo_mode only until Gate-B approval';
  end if;

  if not public.user_can_manage_account(p_account_id) then
    raise exception 'Not authorized for account';
  end if;

  if p_country_subdivision is null
     or p_country_subdivision not in ('England','Wales','Scotland','Northern Ireland','Other') then
    raise exception 'country_subdivision must be one of England, Wales, Scotland, Northern Ireland, Other';
  end if;

  select *
    into v_property
    from public.properties p
   where p.id = p_property_id
     and p.account_id = p_account_id
   for update;

  if not found then
    raise exception 'Property not found for account';
  end if;

  v_old_value := v_property.country_subdivision;

  update public.properties
     set country_subdivision = p_country_subdivision
   where id = p_property_id;

  v_event := public.record_provenance_event(
    p_account_id,
    'property',
    p_property_id,
    'rpe.capture.jurisdiction_confirmed',
    'human',
    v_captured_at,
    'RPE jurisdiction captured for RRA information-sheet evaluation',
    p_property_id,
    null,
    public.account_member_effective_role(p_account_id, auth.uid()),
    null,
    jsonb_build_object(
      'account_id', p_account_id,
      'property_id', p_property_id,
      'actor_type', 'human',
      'captured_by', auth.uid(),
      'captured_at', v_captured_at,
      'field_name', 'properties.country_subdivision',
      'old_value', v_old_value,
      'new_value', p_country_subdivision,
      'basis', p_evidence_basis,
      'evidence_basis', p_evidence_basis,
      'capture_source', 'manual_rpe_capture',
      'demo_mode', true,
      'test_confirmation_notice', 'demo_mode capture only; not a customer-facing legal attestation'
    ),
    null,
    null,
    'regulatory_proof_engine',
    p_property_id,
    null,
    null,
    null,
    null,
    'internal',
    'rra_info_sheet:capture:jurisdiction:' || p_property_id::text || ':' || v_captured_at::text,
    1
  );

  return jsonb_build_object(
    'capture_event_id', v_event.id,
    'event_type', v_event.event_type,
    'property_id', p_property_id,
    'field_name', 'properties.country_subdivision',
    'old_value', v_old_value,
    'new_value', p_country_subdivision,
    'demo_mode', true
  );
end;
$$;

create or replace function public.capture_rra_term_indicator(
  p_account_id uuid,
  p_lease_id uuid,
  p_term_type text,
  p_term_type_effective_from date,
  p_term_type_evidence_basis text,
  p_demo_mode boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lease public.leases%rowtype;
  v_event public.provenance_events%rowtype;
  v_captured_at timestamptz := now();
  v_qualifying_date date;
begin
  if p_demo_mode is not true then
    raise exception 'RPE VS-2A capture is demo_mode only until Gate-B approval';
  end if;

  if not public.user_can_manage_account(p_account_id) then
    raise exception 'Not authorized for account';
  end if;

  if p_term_type is null
     or p_term_type not in ('periodic','open_ended') then
    raise exception 'term_type must be periodic or open_ended for an admissible active-on-date rescue';
  end if;

  if p_term_type_effective_from is null then
    raise exception 'term_type_effective_from is required';
  end if;

  select effective_date
    into v_qualifying_date
    from public.regulatory_change
   where regulation_key = 'renters_rights_act_2026'
     and version = 1
   limit 1;

  if v_qualifying_date is null then
    raise exception 'Versioned qualifying date is missing';
  end if;

  if p_term_type_effective_from > v_qualifying_date then
    raise exception 'term_type_effective_from must be on or before qualifying date %', v_qualifying_date;
  end if;

  if nullif(btrim(p_term_type_evidence_basis), '') is null then
    raise exception 'term_type_evidence_basis is required';
  end if;

  select *
    into v_lease
    from public.leases l
   where l.id = p_lease_id
     and l.account_id = p_account_id
   for update;

  if not found then
    raise exception 'Lease not found for account';
  end if;

  update public.leases
     set term_type = p_term_type,
         term_type_effective_from = p_term_type_effective_from,
         term_type_evidence_basis = p_term_type_evidence_basis,
         updated_at = now()
   where id = p_lease_id;

  v_event := public.record_provenance_event(
    p_account_id,
    'lease',
    p_lease_id,
    'rpe.capture.term_indicator_confirmed',
    'human',
    v_captured_at,
    'RPE active-on-date term indicator captured for RRA information-sheet evaluation',
    v_lease.property_id,
    p_lease_id,
    public.account_member_effective_role(p_account_id, auth.uid()),
    null,
    jsonb_build_object(
      'account_id', p_account_id,
      'lease_id', p_lease_id,
      'property_id', v_lease.property_id,
      'actor_type', 'human',
      'captured_by', auth.uid(),
      'captured_at', v_captured_at,
      'field_name', 'leases.term_type',
      'old_value', jsonb_build_object(
        'term_type', v_lease.term_type,
        'term_type_effective_from', v_lease.term_type_effective_from,
        'term_type_evidence_basis', v_lease.term_type_evidence_basis
      ),
      'new_value', jsonb_build_object(
        'term_type', p_term_type,
        'term_type_effective_from', p_term_type_effective_from,
        'term_type_evidence_basis', p_term_type_evidence_basis
      ),
      'basis', p_term_type_evidence_basis,
      'evidence_basis', p_term_type_evidence_basis,
      'capture_source', 'manual_rpe_capture',
      'demo_mode', true,
      'test_confirmation_notice', 'demo_mode capture only; not a customer-facing legal attestation'
    ),
    null,
    null,
    'regulatory_proof_engine',
    p_lease_id,
    null,
    null,
    null,
    null,
    'internal',
    'rra_info_sheet:capture:term_indicator:' || p_lease_id::text || ':' || v_captured_at::text,
    1
  );

  return jsonb_build_object(
    'capture_event_id', v_event.id,
    'event_type', v_event.event_type,
    'lease_id', p_lease_id,
    'field_name', 'leases.term_type',
    'old_value', jsonb_build_object(
      'term_type', v_lease.term_type,
      'term_type_effective_from', v_lease.term_type_effective_from,
      'term_type_evidence_basis', v_lease.term_type_evidence_basis
    ),
    'new_value', jsonb_build_object(
      'term_type', p_term_type,
      'term_type_effective_from', p_term_type_effective_from,
      'term_type_evidence_basis', p_term_type_evidence_basis
    ),
    'demo_mode', true
  );
end;
$$;

create or replace function public.capture_rra_tier4_classification(
  p_account_id uuid,
  p_lease_id uuid,
  p_tenancy_class text,
  p_company_let boolean,
  p_resident_landlord boolean,
  p_rent_act_1977 boolean,
  p_pbsa boolean,
  p_is_wholly_oral boolean,
  p_evidence_basis text default null,
  p_demo_mode boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lease public.leases%rowtype;
  v_old_pbsa boolean;
  v_event public.provenance_events%rowtype;
  v_captured_at timestamptz := now();
begin
  if p_demo_mode is not true then
    raise exception 'RPE VS-2A capture is demo_mode only until Gate-B approval';
  end if;

  if not public.user_can_manage_account(p_account_id) then
    raise exception 'Not authorized for account';
  end if;

  if p_tenancy_class is null
     or p_tenancy_class not in ('assured_shorthold','assured','regulated_rent_act','business','agricultural','licence','other') then
    raise exception 'tenancy_class is required and must be canonical';
  end if;

  if p_company_let is null
     or p_resident_landlord is null
     or p_rent_act_1977 is null
     or p_pbsa is null
     or p_is_wholly_oral is null then
    raise exception 'Tier-4 capture requires company_let, resident_landlord, rent_act_1977, pbsa, and is_wholly_oral';
  end if;

  if nullif(btrim(p_evidence_basis), '') is null then
    raise exception 'evidence_basis is required for Tier-4 capture attribution';
  end if;

  select *
    into v_lease
    from public.leases l
   where l.id = p_lease_id
     and l.account_id = p_account_id
   for update;

  if not found then
    raise exception 'Lease not found for account';
  end if;

  select p.pbsa
    into v_old_pbsa
    from public.properties p
   where p.id = v_lease.property_id
     and p.account_id = p_account_id
   for update;

  if not found then
    raise exception 'Property not found for lease/account';
  end if;

  update public.leases
     set tenancy_class = p_tenancy_class,
         company_let = p_company_let,
         resident_landlord = p_resident_landlord,
         rent_act_1977 = p_rent_act_1977,
         is_wholly_oral = p_is_wholly_oral,
         updated_at = now()
   where id = p_lease_id;

  update public.properties
     set pbsa = p_pbsa
   where id = v_lease.property_id;

  v_event := public.record_provenance_event(
    p_account_id,
    'lease',
    p_lease_id,
    'rpe.capture.tier4_classification_confirmed',
    'human',
    v_captured_at,
    'RPE Tier-4 classification captured for RRA information-sheet evaluation',
    v_lease.property_id,
    p_lease_id,
    public.account_member_effective_role(p_account_id, auth.uid()),
    null,
    jsonb_build_object(
      'account_id', p_account_id,
      'lease_id', p_lease_id,
      'property_id', v_lease.property_id,
      'actor_type', 'human',
      'captured_by', auth.uid(),
      'captured_at', v_captured_at,
      'field_name', 'rpe.tier4_classification',
      'old_value', jsonb_build_object(
        'tenancy_class', v_lease.tenancy_class,
        'company_let', v_lease.company_let,
        'resident_landlord', v_lease.resident_landlord,
        'rent_act_1977', v_lease.rent_act_1977,
        'pbsa', v_old_pbsa,
        'is_wholly_oral', v_lease.is_wholly_oral
      ),
      'new_value', jsonb_build_object(
        'tenancy_class', p_tenancy_class,
        'company_let', p_company_let,
        'resident_landlord', p_resident_landlord,
        'rent_act_1977', p_rent_act_1977,
        'pbsa', p_pbsa,
        'is_wholly_oral', p_is_wholly_oral
      ),
      'basis', p_evidence_basis,
      'evidence_basis', p_evidence_basis,
      'capture_source', 'manual_rpe_capture',
      'demo_mode', true,
      'test_confirmation_notice', 'demo_mode capture only; not a customer-facing legal attestation'
    ),
    null,
    null,
    'regulatory_proof_engine',
    p_lease_id,
    null,
    null,
    null,
    null,
    'internal',
    'rra_info_sheet:capture:tier4:' || p_lease_id::text || ':' || v_captured_at::text,
    1
  );

  return jsonb_build_object(
    'capture_event_id', v_event.id,
    'event_type', v_event.event_type,
    'lease_id', p_lease_id,
    'property_id', v_lease.property_id,
    'field_name', 'rpe.tier4_classification',
    'demo_mode', true
  );
end;
$$;

create or replace function public.get_rra_capture_readiness(
  p_account_id uuid,
  p_lease_id uuid
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_eval public.rule_evaluation%rowtype;
  v_next_action text;
  v_priority text[] := array[
    'jurisdiction',
    'active_on_qualifying_date',
    'tenancy_class',
    'company_let',
    'resident_landlord',
    'rent_act_1977',
    'pbsa',
    'is_wholly_oral'
  ];
  v_field text;
begin
  if not public.user_can_manage_account(p_account_id) then
    raise exception 'Not authorized for account';
  end if;

  select re.*
    into v_eval
    from public.rule_evaluation re
    join public.leases l on l.id = re.tenancy_id
    join public.impact_rule ir on ir.id = re.impact_rule_id
   where l.id = p_lease_id
     and l.account_id = p_account_id
     and ir.rule_key = 'rra_info_sheet_v1'
     and ir.version = 1
   order by re.evaluated_at desc
   limit 1;

  if not found then
    return jsonb_build_object(
      'current_evaluation_id', null,
      'result', 'not_run',
      'blocking_fields', '[]'::jsonb,
      'next_capture_action', 'run_evaluation',
      'recoverable_gap', false,
      'not_yet_reachable', false
    );
  end if;

  if v_eval.result = 'needs_data' then
    foreach v_field in array v_priority loop
      if v_field = any(coalesce(v_eval.missing_fields, array[]::text[])) then
        v_next_action := case
          when v_field = 'jurisdiction' then 'capture_jurisdiction'
          when v_field = 'active_on_qualifying_date' then 'capture_term_indicator'
          else 'capture_tier4_classification'
        end;
        exit;
      end if;
    end loop;
  end if;

  return jsonb_build_object(
    'current_evaluation_id', v_eval.id,
    'result', v_eval.result,
    'blocking_fields', coalesce(to_jsonb(v_eval.missing_fields), '[]'::jsonb),
    'next_capture_action', v_next_action,
    'recoverable_gap', v_next_action is not null,
    'not_yet_reachable', false,
    'demo_mode', v_eval.demo_mode,
    'evaluated_at', v_eval.evaluated_at
  );
end;
$$;

revoke all on function public.capture_rra_jurisdiction(uuid, uuid, text, text, boolean) from public;
revoke all on function public.capture_rra_term_indicator(uuid, uuid, text, date, text, boolean) from public;
revoke all on function public.capture_rra_tier4_classification(uuid, uuid, text, boolean, boolean, boolean, boolean, boolean, text, boolean) from public;
revoke all on function public.get_rra_capture_readiness(uuid, uuid) from public;

grant execute on function public.capture_rra_jurisdiction(uuid, uuid, text, text, boolean) to authenticated;
grant execute on function public.capture_rra_term_indicator(uuid, uuid, text, date, text, boolean) to authenticated;
grant execute on function public.capture_rra_tier4_classification(uuid, uuid, text, boolean, boolean, boolean, boolean, boolean, text, boolean) to authenticated;
grant execute on function public.get_rra_capture_readiness(uuid, uuid) to authenticated;

commit;
