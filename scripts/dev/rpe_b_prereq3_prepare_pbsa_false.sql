-- Prepare the reused diagnostic property for all non-PBSA B-prereq-3 runs.
--
-- Run this before "Run + record" for all B-prereq-3 cases except:
--   9f7e9d25-0000-4e1a-9000-000000000404

-- select set_config('app.rpe_diag_source_lease_id', 'SOURCE_LEASE_ID', false);

update public.properties p
set
  country_subdivision = 'England',
  pbsa = false
from public.leases l
where l.id = nullif(current_setting('app.rpe_diag_source_lease_id', true), '')::uuid
  and p.id = l.property_id
returning p.id as property_id, p.country_subdivision, p.pbsa;
