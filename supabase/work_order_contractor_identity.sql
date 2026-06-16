begin;

alter table public.work_orders
  add column if not exists contractor_id uuid;

do $$
begin
  if not exists (
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

update public.work_orders wo
set contractor_id = c.id
from public.contractors c
where wo.contractor_id is null
  and wo.contractor_user_id is not null
  and c.account_id = wo.account_id
  and c.user_id = wo.contractor_user_id;

drop view if exists public.work_orders_pending_cancellation;
drop view if exists public.work_orders_with_flags;

-- Browser-facing work-order views must execute as the querying role so the
-- underlying work_orders and audit-log RLS policies remain effective.
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

create or replace function public.work_order_assign_contractor(
  p_work_order_id uuid,
  p_contractor_id uuid
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_account_id uuid;
  v_contractor_user_id uuid;
  v_name text;
  v_phone text;
begin
  if p_work_order_id is null or p_contractor_id is null then
    raise exception 'Missing work order id or contractor id';
  end if;

  select wo.account_id
    into v_account_id
  from public.work_orders wo
  where wo.id = p_work_order_id;

  if v_account_id is null then
    raise exception 'Work order not found';
  end if;

  if not public.user_can_manage_account(v_account_id) then
    raise exception 'Access denied' using errcode = '42501';
  end if;

  select c.user_id, c.name, c.phone
    into v_contractor_user_id, v_name, v_phone
  from public.contractors c
  where c.id = p_contractor_id
    and c.account_id = v_account_id
    and coalesce(c.active, true) = true;

  if not found then
    raise exception 'Contractor not found/active for this account';
  end if;

  update public.work_orders wo
     set contractor_id      = p_contractor_id,
         contractor_user_id = v_contractor_user_id,
         contractor_name    = coalesce(v_name, wo.contractor_name),
         contractor_phone   = coalesce(v_phone, wo.contractor_phone),
         updated_at         = now()
   where wo.id = p_work_order_id;
end;
$$;

comment on function public.work_order_assign_contractor(uuid, uuid) is
  'Assigns an active in-account contractor directory row to a work order; contractor_id is the supplier identity and contractor_user_id remains the portal identity when present.';

grant execute on function public.work_order_assign_contractor(uuid, uuid) to authenticated;

create or replace function public.work_order_create(
  p_account_id uuid,
  p_property_id uuid,
  p_maintenance_request_id uuid default null,
  p_contractor_id uuid default null,
  p_contractor_name text default null,
  p_contractor_phone text default null,
  p_scheduled_at timestamptz default null,
  p_notes text default null
) returns public.work_orders
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user_id uuid;
  v_contractor_user_id uuid;
  v_name text;
  v_phone text;
  v_row public.work_orders;
begin
  if p_account_id is null then raise exception 'Missing account_id'; end if;
  if p_property_id is null then raise exception 'Missing property_id'; end if;

  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not public.user_can_manage_account(p_account_id) then
    raise exception 'Access denied' using errcode = '42501';
  end if;

  if p_contractor_id is not null then
    select c.user_id, c.name, c.phone
      into v_contractor_user_id, v_name, v_phone
    from public.contractors c
    where c.id = p_contractor_id
      and c.account_id = p_account_id
      and coalesce(c.active, true) = true;

    if not found then
      raise exception 'Contractor not found/active for this account';
    end if;
  end if;

  insert into public.work_orders (
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
    created_by,
    created_at,
    updated_at
  )
  values (
    p_account_id,
    p_property_id,
    p_maintenance_request_id,
    p_contractor_id,
    v_contractor_user_id,
    coalesce(v_name, p_contractor_name),
    coalesce(v_phone, p_contractor_phone),
    'assigned',
    p_scheduled_at,
    p_notes,
    v_user_id,
    now(),
    now()
  )
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.work_order_create(uuid, uuid, uuid, uuid, text, text, timestamptz, text) to authenticated;

commit;
