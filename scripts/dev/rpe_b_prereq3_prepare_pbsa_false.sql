-- Prepare the reused diagnostic property for all non-PBSA B-prereq-3 runs.
--
-- Run this before "Run + record" for all B-prereq-3 cases except:
--   9f7e9d25-0000-4e1a-9000-000000000404

-- Optional override:
-- select set_config('app.rpe_diag_source_lease_id', 'SOURCE_LEASE_ID', false);

with target as (
  select coalesce(
    nullif(current_setting('app.rpe_diag_source_lease_id', true), '')::uuid,
    '9f7e9d25-0000-4e1a-9000-000000000404'::uuid
  ) as lease_id
),
updated as (
  update public.properties p
  set
    country_subdivision = 'England',
    pbsa = false
  from public.leases l
  join target t on t.lease_id = l.id
  where p.id = l.property_id
  returning
    l.id as lease_id,
    p.id as property_id,
    p.country_subdivision,
    p.pbsa
)
select
  'updated' as status,
  lease_id,
  property_id,
  country_subdivision,
  pbsa
from updated
union all
select
  'no matching lease updated - check app.rpe_diag_source_lease_id' as status,
  (select lease_id from target),
  null::uuid,
  null::text,
  null::boolean
where not exists (select 1 from updated);
