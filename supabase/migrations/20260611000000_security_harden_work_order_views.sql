-- Canonical hardening for browser-facing work-order views.
--
-- These views project account-scoped work-order and contractor details. They
-- must execute as the querying role so underlying RLS policies continue to
-- protect cross-account data when the views are queried directly by the app.

begin;

alter view if exists public.work_orders_with_flags
  set (security_invoker = true);

alter view if exists public.work_orders_pending_cancellation
  set (security_invoker = true);

revoke all on public.work_orders_with_flags from anon;
revoke all on public.work_orders_pending_cancellation from anon;

grant select on public.work_orders_with_flags to authenticated;
grant select on public.work_orders_pending_cancellation to authenticated;

grant all on public.work_orders_with_flags to service_role;
grant all on public.work_orders_pending_cancellation to service_role;

comment on view public.work_orders_with_flags is
  'Browser-facing work-order view. security_invoker=true is required so underlying work_orders RLS applies to the caller.';

comment on view public.work_orders_pending_cancellation is
  'Browser-facing pending-cancellation work-order view. security_invoker=true is required so underlying work_orders RLS applies to the caller.';

commit;
