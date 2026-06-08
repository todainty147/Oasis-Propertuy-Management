-- Harden contractor assignment so only account managers/root support can assign work orders.
-- This file is safe to apply directly to production as a CREATE OR REPLACE FUNCTION patch.

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
