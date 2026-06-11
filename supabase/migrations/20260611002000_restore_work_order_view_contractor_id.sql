-- Repair work-order browser views after older manual view recreation.
--
-- The maintenance inbox selects contractor_id from work_orders_with_flags.
-- If 20260526000000_work_orders_with_flags_add_assignment_columns.sql was run
-- after the contractor identity rollout, the view could be recreated without
-- contractor_id and the app would fail with PostgREST 42703.

begin;

alter table public.work_orders
  add column if not exists contractor_id uuid;

create table if not exists public.work_order_audit_log (
  id bigint not null,
  work_order_id uuid not null,
  actor_user_id uuid,
  action text not null,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now(),
  account_id uuid
);

alter table public.work_order_audit_log enable row level security;

do $$
begin
  if to_regclass('public.contractors') is not null and not exists (
    select 1
    from pg_constraint
    where conname = 'work_orders_contractor_id_fkey'
      and conrelid = 'public.work_orders'::regclass
  ) then
    alter table public.work_orders
      add constraint work_orders_contractor_id_fkey
      foreign key (contractor_id)
      references public.contractors(id)
      on delete set null;
  end if;
end;
$$;

create index if not exists work_orders_account_contractor_idx
  on public.work_orders(account_id, contractor_id)
  where contractor_id is not null;

create index if not exists work_orders_contractor_id_idx
  on public.work_orders(contractor_id)
  where contractor_id is not null;

do $$
begin
  if to_regclass('public.contractors') is not null then
    update public.work_orders wo
    set contractor_id = c.id
    from public.contractors c
    where wo.contractor_id is null
      and wo.contractor_user_id is not null
      and c.account_id = wo.account_id
      and c.user_id = wo.contractor_user_id;
  end if;
end;
$$;

drop view if exists public.work_orders_pending_cancellation;
drop view if exists public.work_orders_with_flags;

create view public.work_orders_with_flags
with (security_invoker = true) as
with last_req as (
  select distinct on (al.work_order_id)
    al.work_order_id,
    al.created_at as last_cancel_request_at,
    al.actor_user_id as last_cancel_request_by
  from public.work_order_audit_log al
  where al.action = 'tenant_cancellation_requested'
  order by al.work_order_id, al.created_at desc
),
last_res as (
  select distinct on (al.work_order_id)
    al.work_order_id,
    al.created_at as last_cancel_resolution_at,
    al.action as last_cancel_resolution_action,
    al.actor_user_id as last_cancel_resolution_by
  from public.work_order_audit_log al
  where al.action = any (array[
    'tenant_cancellation_approved'::text,
    'tenant_cancellation_denied'::text
  ])
  order by al.work_order_id, al.created_at desc
)
select
  wo.id,
  wo.account_id,
  wo.property_id,
  wo.maintenance_request_id,
  wo.contractor_id,
  wo.contractor_user_id,
  wo.contractor_name,
  wo.contractor_phone,
  wo.status,
  wo.scheduled_at,
  wo.notes,
  wo.quote_amount,
  wo.invoice_amount,
  wo.created_by,
  wo.created_at,
  wo.updated_at,
  wo.assigned_at,
  wo.acknowledged_at,
  wo.acknowledgement_due_at,
  wo.acknowledgement_status,
  lr.last_cancel_request_at,
  lr.last_cancel_request_by,
  ls.last_cancel_resolution_at,
  ls.last_cancel_resolution_action,
  ls.last_cancel_resolution_by,
  (
    coalesce(lr.last_cancel_request_at, '-infinity'::timestamptz)
    > coalesce(ls.last_cancel_resolution_at, '-infinity'::timestamptz)
  ) as pending_cancel_request
from public.work_orders wo
left join last_req lr on lr.work_order_id = wo.id
left join last_res ls on ls.work_order_id = wo.id;

alter view public.work_orders_with_flags owner to postgres;
alter view public.work_orders_with_flags set (security_invoker = true);
revoke all on public.work_orders_with_flags from anon;
grant select on public.work_orders_with_flags to authenticated;
grant all on public.work_orders_with_flags to service_role;

create view public.work_orders_pending_cancellation
with (security_invoker = true) as
select
  id,
  account_id,
  property_id,
  maintenance_request_id,
  contractor_id,
  contractor_user_id,
  contractor_name,
  contractor_phone,
  status,
  scheduled_at,
  notes,
  quote_amount,
  invoice_amount,
  created_by,
  created_at,
  updated_at,
  assigned_at,
  acknowledged_at,
  acknowledgement_due_at,
  acknowledgement_status,
  last_cancel_request_at,
  last_cancel_request_by,
  last_cancel_resolution_at,
  last_cancel_resolution_action,
  last_cancel_resolution_by,
  pending_cancel_request
from public.work_orders_with_flags
where pending_cancel_request = true;

alter view public.work_orders_pending_cancellation owner to postgres;
alter view public.work_orders_pending_cancellation set (security_invoker = true);
revoke all on public.work_orders_pending_cancellation from anon;
grant select on public.work_orders_pending_cancellation to authenticated;
grant all on public.work_orders_pending_cancellation to service_role;

commit;
