-- ============================================================================
-- RLS Performance Optimization — E-136
--
-- Root cause: user_can_manage_account(account_id) is SECURITY DEFINER and
-- takes a column reference, so PostgreSQL evaluates it per-row even when
-- account_id is constant in the result set. For 248 rows this produces
-- 339,321 buffer hits and 1,002 ms on a local machine with zero contention.
--
-- Fix: replace the per-row function dispatch with a parameterless
-- set-returning function that PostgreSQL can evaluate once and hash-join.
-- The security semantics are identical — same role check, same root operator
-- escape hatch — but the cost moves from O(rows × subqueries) to O(1).
--
-- IMPORTANT: every change here rewrites the isolation boundary. The full
-- deny-test suite (E-093 / E-094) must pass before AND after this file.
-- ============================================================================

-- 1. Parameterless helper: returns account IDs the current user can manage.
--    Evaluated once per query, not per row.
create or replace function public.my_manageable_account_ids()
returns setof uuid
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.user_is_root_operator() then
    return query select a.id from accounts a;
    return;
  end if;

  return query
    select am.account_id
    from account_members am
    left join roles r on r.id = am.role_id
    where am.user_id = auth.uid()
      and coalesce(
        case when nullif(lower(trim(r.name)), '') in ('owner', 'admin', 'staff')
          then nullif(lower(trim(r.name)), '')
        end,
        lower(am.role::text)
      ) in ('owner', 'admin', 'staff');
end;
$$;

-- 2. Tenants SELECT policy — hot path for /tenants page
drop policy if exists tenants_select_member on public.tenants;
create policy tenants_select_member
on public.tenants
for select
to authenticated
using (
  account_id in (select public.my_manageable_account_ids())
  or public.account_member_has_permission(account_id, 'tenants.read')
);

-- 3. Properties SELECT policy — hot path for /properties page.
--    Also benefits indirectly: properties_select_tenant sub-scans tenants,
--    which now hits the faster tenants_select_member above.
drop policy if exists properties_select_member on public.properties;
create policy properties_select_member
on public.properties
for select
to authenticated
using (
  account_id in (select public.my_manageable_account_ids())
  or public.account_member_has_permission(account_id, 'properties.read')
);
