-- Lightweight performance hardening for the highest-value account-scoped RPCs.
-- These indexes are additive and intentionally narrow: they target the specific
-- predicates that showed the weakest current alignment during the review pass.

create index if not exists work_orders_contractor_user_idx
  on public.work_orders(contractor_user_id);

create index if not exists payments_account_unpaid_due_idx
  on public.payments(account_id, due_date)
  where paid_at is null and due_date is not null;

create index if not exists maintenance_requests_account_status_created_idx
  on public.maintenance_requests(account_id, lower(coalesce(status, '')), created_at desc);
