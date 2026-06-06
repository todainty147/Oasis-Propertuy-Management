do $$
begin
  alter type public.account_role add value if not exists 'admin' after 'owner';
exception
  when duplicate_object then null;
end
$$;

create or replace function public.prevent_ledger_update_delete()
returns trigger
language plpgsql
as $$
begin
  if current_setting('oasis.allow_ledger_sync', true) = 'on' then
    return coalesce(new, old);
  end if;

  raise exception
    'ledger_entries is append-only. Use reversal entries instead.';
end;
$$;

create or replace function public.tg_sync_payments_to_ledger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.account_id is null then
    return new;
  end if;

  perform set_config('oasis.allow_ledger_sync', 'on', true);

  if new.paid_at is not null and coalesce(new.status, '') <> 'void' then
    insert into public.ledger_entries (
      account_id, property_id, tenant_id,
      entry_type, direction, amount, currency,
      occurred_at, notes,
      source_table, source_id
    )
    values (
      new.account_id,
      new.property_id,
      new.tenant_id,
      'payment',
      'in',
      new.amount::numeric(12,2),
      'PLN',
      new.paid_at::timestamptz,
      ('payments status=' || coalesce(new.status,'unknown')
        || case when new.due_date is not null then ', due=' || new.due_date::text else '' end
        || case when new.paid_at is not null then ', paid=' || new.paid_at::text else '' end
      )::text,
      'payments',
      new.id
    )
    on conflict (source_table, source_id)
    do update set
      account_id  = excluded.account_id,
      property_id = excluded.property_id,
      tenant_id   = excluded.tenant_id,
      amount      = excluded.amount,
      occurred_at = excluded.occurred_at,
      notes       = excluded.notes,
      updated_at  = now();
  else
    delete from public.ledger_entries
    where source_table = 'payments'
      and source_id = new.id;
  end if;

  perform set_config('oasis.allow_ledger_sync', 'off', true);
  return new;
end;
$$;

create or replace function public.create_payment(
  p_account_id uuid,
  p_property_id uuid,
  p_tenant_id uuid,
  p_amount numeric,
  p_due_date date,
  p_paid_at date default null::date,
  p_notes text default null::text
)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_row public.payments;
begin
  if coalesce(public.account_role_for(p_account_id), '') not in ('owner','admin') then
    raise exception 'Not allowed';
  end if;

  select p.owner_id
    into v_owner_id
  from public.properties p
  where p.id = p_property_id
    and p.account_id = p_account_id;

  if v_owner_id is null then
    raise exception 'Property not found in this account';
  end if;

  if not exists (
    select 1
    from public.tenants t
    where t.id = p_tenant_id
      and t.account_id = p_account_id
      and t.status = 'active'
  ) then
    raise exception 'Tenant not active in this account';
  end if;

  insert into public.payments (
    owner_id,
    account_id,
    property_id,
    tenant_id,
    amount,
    due_date,
    paid_at,
    status
  ) values (
    v_owner_id,
    p_account_id,
    p_property_id,
    p_tenant_id,
    p_amount,
    p_due_date,
    p_paid_at,
    'due'
  )
  returning * into v_row;

  return v_row;
end;
$$;

drop function if exists public.update_payment(uuid, numeric, date, text);
drop function if exists public.delete_payment(uuid);
drop function if exists public.mark_payment_paid(uuid, date);
drop function if exists public.mark_payment_unpaid(uuid);

create or replace function public.update_payment(
  p_account_id uuid,
  p_payment_id uuid,
  p_amount numeric default null::numeric,
  p_due_date date default null::date,
  p_notes text default null::text
)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.payments;
begin
  select * into v_row
  from public.payments
  where id = p_payment_id
    and account_id = p_account_id;

  if v_row.id is null then
    raise exception 'Payment not found';
  end if;

  if coalesce(public.account_role_for(v_row.account_id), '') not in ('owner','admin') then
    raise exception 'Not allowed';
  end if;

  update public.payments
  set
    amount   = coalesce(p_amount, amount),
    due_date = coalesce(p_due_date, due_date)
  where id = p_payment_id
    and account_id = p_account_id
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.delete_payment(
  p_account_id uuid,
  p_payment_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid;
begin
  select account_id into v_account_id
  from public.payments
  where id = p_payment_id
    and account_id = p_account_id;

  if v_account_id is null then
    raise exception 'Payment not found';
  end if;

  if coalesce(public.account_role_for(v_account_id), '') <> 'owner' then
    raise exception 'Not allowed';
  end if;

  delete from public.payments
  where id = p_payment_id
    and account_id = p_account_id;
end;
$$;

create or replace function public.mark_payment_paid(
  p_account_id uuid,
  p_payment_id uuid,
  p_paid_at date default current_date
)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pay public.payments;
  v_role text;
begin
  select * into v_pay
  from public.payments
  where id = p_payment_id
    and account_id = p_account_id;

  if not found then
    raise exception 'Payment not found';
  end if;

  v_role := public.account_role_for(v_pay.account_id);
  if coalesce(v_role, '') not in ('owner','admin') then
    raise exception 'Not permitted';
  end if;

  update public.payments
  set paid_at = coalesce(p_paid_at, current_date)
  where id = p_payment_id
    and account_id = p_account_id
  returning * into v_pay;

  return v_pay;
end;
$$;

create or replace function public.mark_payment_unpaid(
  p_account_id uuid,
  p_payment_id uuid
)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.payments;
begin
  select * into v_row
  from public.payments
  where id = p_payment_id
    and account_id = p_account_id;

  if v_row.id is null then
    raise exception 'Payment not found';
  end if;

  if coalesce(public.account_role_for(v_row.account_id), '') not in ('owner','admin') then
    raise exception 'Not allowed';
  end if;

  update public.payments
  set paid_at = null
  where id = p_payment_id
    and account_id = p_account_id
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.reopen_payment(p_payment_id uuid)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pay public.payments;
  v_role text;
begin
  select * into v_pay
  from public.payments
  where id = p_payment_id;

  if not found then
    raise exception 'Payment not found';
  end if;

  v_role := public.account_role_for(v_pay.account_id);
  if coalesce(v_role, '') not in ('owner','admin') then
    raise exception 'Not permitted';
  end if;

  update public.payments
  set status = null,
      paid_at = null
  where id = p_payment_id
  returning * into v_pay;

  return v_pay;
end;
$$;

create or replace function public.void_payment(p_payment_id uuid)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pay public.payments;
  v_role text;
begin
  select * into v_pay
  from public.payments
  where id = p_payment_id;

  if not found then
    raise exception 'Payment not found';
  end if;

  v_role := public.account_role_for(v_pay.account_id);
  if coalesce(v_role, '') not in ('owner','admin') then
    raise exception 'Not permitted';
  end if;

  update public.payments
  set status = 'void',
      paid_at = null
  where id = p_payment_id
  returning * into v_pay;

  return v_pay;
end;
$$;

revoke all on function public.update_payment(uuid, uuid, numeric, date, text) from public;
revoke all on function public.delete_payment(uuid, uuid) from public;
revoke all on function public.mark_payment_paid(uuid, uuid, date) from public;
revoke all on function public.mark_payment_unpaid(uuid, uuid) from public;

grant execute on function public.update_payment(uuid, uuid, numeric, date, text) to authenticated;
grant execute on function public.delete_payment(uuid, uuid) to authenticated;
grant execute on function public.mark_payment_paid(uuid, uuid, date) to authenticated;
grant execute on function public.mark_payment_unpaid(uuid, uuid) to authenticated;

create or replace function public.tg_payments_notify_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_user_id uuid;
  v_type text;
  v_title text;
begin
  if new.account_id is null or new.tenant_id is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.paid_at is not null or lower(coalesce(new.status, '')) = 'paid' then
      v_type := 'payment_received';
      v_title := 'Your payment has been received';
    else
      v_type := 'payment_due';
      v_title := 'New payment recorded';
    end if;
  elsif tg_op = 'UPDATE'
    and old.paid_at is null
    and new.paid_at is not null then
    v_type := 'payment_received';
    v_title := 'Your payment has been received';
  else
    return new;
  end if;

  select t.user_id
    into v_tenant_user_id
  from public.tenants t
  where t.id = new.tenant_id
    and t.account_id = new.account_id
  limit 1;

  if v_tenant_user_id is null then
    return new;
  end if;

  if public.should_throttle_notification(
    new.account_id,
    v_tenant_user_id,
    v_type,
    'payment',
    new.id,
    60
  ) then
    return new;
  end if;

  perform public.create_notifications_system(
    new.account_id,
    array[v_tenant_user_id],
    v_type,
    v_title,
    null,
    'payment',
    new.id,
    '/tenant/payments',
    jsonb_build_object(
      'payment_id', new.id,
      'amount', new.amount,
      'due_date', new.due_date,
      'paid_at', new.paid_at
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_payments_notify_tenant on public.payments;
create trigger trg_payments_notify_tenant
  after insert or update on public.payments
  for each row
  execute function public.tg_payments_notify_tenant();
