-- Harden work-order creation and attachment storage management.
--
-- Fixes:
--   - work_order_create SECURITY DEFINER must authorize p_account_id.
--   - browser-callable work-order RPCs need explicit authenticated grants
--     after PUBLIC/anon EXECUTE revocation.
--   - assigned contractors may view/upload attachments, but must not delete
--     arbitrary work-order evidence through broad manage permission.

begin;

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
revoke execute on function public.work_order_create(uuid, uuid, uuid, uuid, text, text, timestamptz, text) from anon;

grant execute on function public.work_order_assign_contractor(uuid, uuid) to authenticated;
revoke execute on function public.work_order_assign_contractor(uuid, uuid) from anon;

create or replace function public.can_manage_work_order_attachment(
  p_account_id uuid,
  p_work_order_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.work_orders wo
    where wo.id = p_work_order_id
      and wo.account_id = p_account_id
      and public.user_can_manage_account(wo.account_id)
  );
$$;

drop policy if exists "wo_attach_insert_members_or_assigned_contractor" on storage.objects;

create policy "wo_attach_insert_members_or_assigned_contractor"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'work-order-attachments'
  and split_part(name, '/', 1) = 'account'
  and split_part(name, '/', 3) = 'work_orders'
  and public.safe_uuid(split_part(name, '/', 2)) is not null
  and public.safe_uuid(split_part(name, '/', 4)) is not null
  and public.can_view_work_order_attachment(
    public.safe_uuid(split_part(name, '/', 2)),
    public.safe_uuid(split_part(name, '/', 4))
  )
);

commit;
