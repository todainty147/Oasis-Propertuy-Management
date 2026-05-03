-- =========================================================
-- get_my_lease
-- Purpose: tenant-safe read of the caller's own active lease.
-- Called with p_account_id only; tenant_id derived from auth.uid().
-- Tenants can already SELECT their lease via RLS but this function
-- provides a stable, typed contract and avoids client-side joins.
-- =========================================================

create or replace function public.get_my_lease(
  p_account_id uuid
)
returns table (
  id uuid,
  account_id uuid,
  property_id uuid,
  tenant_id uuid,
  lease_start_date date,
  lease_end_date date,
  renewal_status text,
  notice_period_days integer,
  auto_renew boolean,
  notes text,
  created_at timestamptz,
  updated_at timestamptz,
  property_address text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    l.id,
    l.account_id,
    l.property_id,
    l.tenant_id,
    l.lease_start_date,
    l.lease_end_date,
    lower(coalesce(l.renewal_status, 'active')) as renewal_status,
    coalesce(l.notice_period_days, 30) as notice_period_days,
    coalesce(l.auto_renew, false) as auto_renew,
    l.notes,
    l.created_at,
    l.updated_at,
    coalesce(p.address, '') as property_address
  from public.leases l
  join public.tenants t
    on t.id = l.tenant_id
   and t.user_id = auth.uid()
   and t.account_id = p_account_id
  left join public.properties p
    on p.id = l.property_id
  where l.account_id = p_account_id
  order by
    case lower(coalesce(l.renewal_status, 'active'))
      when 'renewal_in_progress' then 1
      when 'active' then 2
      when 'expiring_soon' then 3
      when 'renewed' then 4
      when 'ended' then 5
      else 6
    end,
    l.lease_end_date desc nulls last
  limit 1;
$$;

revoke all on function public.get_my_lease(uuid) from public;
grant execute on function public.get_my_lease(uuid) to authenticated;
