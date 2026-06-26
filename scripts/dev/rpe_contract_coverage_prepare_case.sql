-- RPE contract test Part A per-case property preparation.
--
-- Purpose:
--   Sets the reused diagnostic property to the property-level state required
--   for a single C1-C14 coverage case immediately before clicking
--   "Run + record" in the RPE manual diagnostic UI.
--
-- Why this exists:
--   The capacity-safe seed reuses one existing property to avoid plan-limit
--   failures. Because jurisdiction and PBSA are property-level fields, the
--   property must be prepared for the case being recorded.
--
-- Usage:
--   select set_config('app.rpe_contract_case', 'C7', false);
--   \i scripts/dev/rpe_contract_coverage_prepare_case.sql
--
-- Cases:
--   C4  => England + pbsa=true
--   C7  => Wales + pbsa=false
--   C8  => Scotland + pbsa=false
--   C10 => country_subdivision=null + pbsa=false
--   all other C* => England + pbsa=false

do $$
declare
  v_case_name text := upper(nullif(current_setting('app.rpe_contract_case', true), ''));
  v_lease_id uuid;
  v_property_id uuid;
  v_country_subdivision text;
  v_pbsa boolean;
begin
  if v_case_name is null then
    raise exception 'Set app.rpe_contract_case to C1..C14 before running this helper.';
  end if;

  v_lease_id := case v_case_name
    when 'C1' then '9f7e9d26-0000-4e1a-9000-000000000501'::uuid
    when 'C2' then '9f7e9d26-0000-4e1a-9000-000000000502'::uuid
    when 'C3' then '9f7e9d26-0000-4e1a-9000-000000000503'::uuid
    when 'C4' then '9f7e9d26-0000-4e1a-9000-000000000504'::uuid
    when 'C5' then '9f7e9d26-0000-4e1a-9000-000000000505'::uuid
    when 'C6' then '9f7e9d26-0000-4e1a-9000-000000000506'::uuid
    when 'C7' then '9f7e9d26-0000-4e1a-9000-000000000507'::uuid
    when 'C8' then '9f7e9d26-0000-4e1a-9000-000000000508'::uuid
    when 'C9' then '9f7e9d26-0000-4e1a-9000-000000000509'::uuid
    when 'C10' then '9f7e9d26-0000-4e1a-9000-000000000510'::uuid
    when 'C11' then '9f7e9d26-0000-4e1a-9000-000000000511'::uuid
    when 'C12' then '9f7e9d26-0000-4e1a-9000-000000000512'::uuid
    when 'C13' then '9f7e9d26-0000-4e1a-9000-000000000513'::uuid
    when 'C14' then '9f7e9d26-0000-4e1a-9000-000000000514'::uuid
    else null
  end;

  if v_lease_id is null then
    raise exception 'Unsupported app.rpe_contract_case %. Expected C1..C14.', v_case_name;
  end if;

  select l.property_id
    into v_property_id
  from public.leases l
  where l.id = v_lease_id;

  if v_property_id is null then
    raise exception 'Coverage lease % for % does not exist. Run rpe_contract_coverage_seed.sql first.', v_lease_id, v_case_name;
  end if;

  v_country_subdivision := case v_case_name
    when 'C7' then 'Wales'
    when 'C8' then 'Scotland'
    when 'C10' then null
    else 'England'
  end;

  v_pbsa := (v_case_name = 'C4');

  update public.properties
     set country_subdivision = v_country_subdivision,
         pbsa = v_pbsa
   where id = v_property_id;

  raise notice 'Prepared %: lease %, property %, country_subdivision %, pbsa %',
    v_case_name,
    v_lease_id,
    v_property_id,
    coalesce(v_country_subdivision, '<null>'),
    v_pbsa;
end $$;
