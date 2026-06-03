-- =============================================================================
-- Payment ledger reversal hardening
-- Keeps payment-linked ledger entries append-only. Paid receipts retain their
-- original ledger row; unpaid/void corrections append an outbound reversal.
-- =============================================================================

create or replace function public.tg_sync_payments_to_ledger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_currency text;
  v_reversal_reason text := nullif(trim(current_setting('oasis.payment_reversal_reason', true)), '');
begin
  if tg_op = 'DELETE' then
    if old.account_id is not null
       and old.paid_at is not null
       and coalesce(old.status, '') <> 'void' then
      insert into public.ledger_entries (
        account_id, property_id, tenant_id,
        entry_type, direction, amount, currency,
        occurred_at, notes,
        external_ref, source_table, source_id
      )
      values (
        old.account_id,
        old.property_id,
        old.tenant_id,
        'refund',
        'out',
        old.amount::numeric(12,2),
        coalesce(old.currency, (
          select a.currency from public.accounts a where a.id = old.account_id
        ), 'PLN'),
        now(),
        ('payment deleted after paid receipt, original payment=' || old.id::text
          || case when v_reversal_reason is not null then ', reason=' || v_reversal_reason else '' end)::text,
        old.id::text,
        'payment_reversals',
        gen_random_uuid()
      );
    end if;

    return old;
  end if;

  if new.account_id is null then
    return new;
  end if;

  v_currency := coalesce(new.currency, (
    select a.currency from public.accounts a where a.id = new.account_id
  ), 'PLN');

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
      v_currency,
      new.paid_at::timestamptz,
      ('payments status=' || coalesce(new.status, 'unknown')
        || case when new.due_date is not null then ', due=' || new.due_date::text else '' end
        || case when new.paid_at is not null then ', paid=' || new.paid_at::text else '' end
      )::text,
      'payments',
      new.id
    )
    on conflict (source_table, source_id) do nothing;
  end if;

  if tg_op = 'UPDATE'
     and old.paid_at is not null
     and coalesce(old.status, '') <> 'void'
     and (new.paid_at is null or coalesce(new.status, '') = 'void') then
    insert into public.ledger_entries (
      account_id, property_id, tenant_id,
      entry_type, direction, amount, currency,
      occurred_at, notes,
      external_ref, source_table, source_id
    )
    values (
      old.account_id,
      old.property_id,
      old.tenant_id,
      'refund',
      'out',
      old.amount::numeric(12,2),
      coalesce(old.currency, v_currency, 'PLN'),
      now(),
      ('payment receipt reversed, original payment=' || old.id::text
        || ', new status=' || coalesce(new.status, 'unknown')
        || case when v_reversal_reason is not null then ', reason=' || v_reversal_reason else '' end)::text,
      old.id::text,
      'payment_reversals',
      gen_random_uuid()
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_payments_to_ledger on public.payments;
create trigger trg_sync_payments_to_ledger
after insert or update or delete on public.payments
for each row execute function public.tg_sync_payments_to_ledger();

insert into public.role_permissions (role_id, permission_key)
select r.id, 'finance.reverse_payment'
from public.roles r
where lower(trim(r.name)) in ('owner', 'admin')
on conflict (role_id, permission_key) do nothing;

create or replace function public.tg_capture_payment_events()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  next_event_type text;
  next_old_status text;
  next_new_status text;
  next_payment_id uuid;
  next_account_id uuid;
  next_property_id uuid;
  next_tenant_id uuid;
  next_amount numeric(12, 2);
  next_event_at timestamptz;
  next_metadata jsonb;
  v_reversal_reason text := nullif(trim(current_setting('oasis.payment_reversal_reason', true)), '');
begin
  if tg_op = 'DELETE' then
    next_event_type := 'payment_deleted';
    next_old_status := old.status;
    next_new_status := null;
    next_payment_id := null;
    next_account_id := old.account_id;
    next_property_id := old.property_id;
    next_tenant_id := old.tenant_id;
    next_amount := old.amount;
    next_event_at := now();
    next_metadata := jsonb_build_object(
      'payment_id', old.id,
      'due_date', old.due_date,
      'paid_at', old.paid_at
    );
  elsif tg_op = 'INSERT' then
    next_event_type := case
      when new.paid_at is not null or lower(coalesce(new.status, '')) = 'paid' then 'payment_paid'
      else 'payment_created'
    end;
    next_old_status := null;
    next_new_status := new.status;
    next_payment_id := new.id;
    next_account_id := new.account_id;
    next_property_id := new.property_id;
    next_tenant_id := new.tenant_id;
    next_amount := new.amount;
    next_event_at := coalesce(new.paid_at, new.created_at, now());
    next_metadata := jsonb_build_object(
      'due_date', new.due_date,
      'paid_at', new.paid_at
    );
  else
    next_event_type := case
      when old.paid_at is distinct from new.paid_at and new.paid_at is not null then 'payment_paid'
      when lower(coalesce(old.status, '')) is distinct from lower(coalesce(new.status, ''))
        and lower(coalesce(new.status, '')) in ('overdue', 'zaległe', 'zalegle') then 'payment_overdue'
      when lower(coalesce(old.status, '')) is distinct from lower(coalesce(new.status, ''))
        and lower(coalesce(new.status, '')) = 'void' then 'payment_reversed'
      when lower(coalesce(old.status, '')) is distinct from lower(coalesce(new.status, ''))
        and lower(coalesce(old.status, '')) = 'paid'
        and coalesce(new.paid_at, null) is null then 'payment_reopened'
      when old.amount is distinct from new.amount or old.due_date is distinct from new.due_date then 'payment_updated'
      else 'payment_status_changed'
    end;
    next_old_status := old.status;
    next_new_status := new.status;
    next_payment_id := new.id;
    next_account_id := new.account_id;
    next_property_id := new.property_id;
    next_tenant_id := new.tenant_id;
    next_amount := new.amount;
    next_event_at := coalesce(new.paid_at, now());
    next_metadata := jsonb_build_object(
      'due_date', new.due_date,
      'paid_at', new.paid_at,
      'old_due_date', old.due_date,
      'old_paid_at', old.paid_at
    );
  end if;

  if v_reversal_reason is not null then
    next_metadata := coalesce(next_metadata, '{}'::jsonb)
      || jsonb_build_object('reversal_reason', v_reversal_reason);
  end if;

  insert into public.payment_events (
    payment_id,
    account_id,
    property_id,
    tenant_id,
    event_type,
    event_at,
    old_status,
    new_status,
    amount,
    actor_source,
    metadata
  ) values (
    next_payment_id,
    next_account_id,
    next_property_id,
    next_tenant_id,
    next_event_type,
    coalesce(next_event_at, now()),
    next_old_status,
    next_new_status,
    next_amount,
    'db_trigger',
    coalesce(next_metadata, '{}'::jsonb)
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop function if exists public.void_payment(uuid, uuid);
create or replace function public.void_payment(
  p_payment_id uuid,
  p_account_id uuid default null::uuid,
  p_reason text default null::text
)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pay public.payments;
  v_role text;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if v_reason is null then
    raise exception 'Payment reversal reason is required';
  end if;

  select * into v_pay
  from public.payments
  where id = p_payment_id
    and (p_account_id is null or account_id = p_account_id);

  if not found then
    raise exception 'Payment not found';
  end if;

  v_role := public.account_role_for(v_pay.account_id);
  if coalesce(v_role, '') not in ('owner', 'admin')
     and not public.account_member_has_permission(v_pay.account_id, 'finance.reverse_payment') then
    raise exception 'Not permitted';
  end if;

  if lower(coalesce(v_pay.status, '')) = 'void' then
    raise exception 'Payment is already voided';
  end if;

  if v_pay.paid_at is null
     and lower(coalesce(v_pay.status, '')) not in ('paid', 'partial') then
    raise exception 'Only paid payments can be reversed';
  end if;

  perform set_config('oasis.payment_reversal_reason', v_reason, true);

  update public.payments
  set status  = 'void',
      paid_at = null,
      notes = concat_ws(E'\n', nullif(notes, ''), 'Payment reversed: ' || v_reason)
  where id = p_payment_id
  returning * into v_pay;

  return v_pay;
end;
$$;

revoke all on function public.void_payment(uuid, uuid, text) from public;
grant execute on function public.void_payment(uuid, uuid, text) to authenticated;
grant execute on function public.void_payment(uuid, uuid, text) to service_role;
