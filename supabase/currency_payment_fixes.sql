-- =============================================================================
-- Currency-aware payment RPCs and ledger trigger
-- Depends on: currency_internationalization.sql (accounts.currency must exist)
--             payment_integrity_improvements.sql  (payments.currency must exist)
-- =============================================================================


-- ── 1. Ledger trigger: use payments.currency instead of hardcoded 'PLN' ───────
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
      -- Use the payment's own currency (set at creation from the account's currency)
      coalesce(new.currency, (
        select a.currency from public.accounts a where a.id = new.account_id
      ), 'PLN'),
      new.paid_at::timestamptz,
      ('payments status=' || coalesce(new.status, 'unknown')
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
      currency    = excluded.currency,
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


-- ── 2. create_payment: inherit currency from account ─────────────────────────
create or replace function public.create_payment(
  p_account_id  uuid,
  p_property_id uuid,
  p_tenant_id   uuid,
  p_amount      numeric,
  p_due_date    date,
  p_paid_at     date    default null::date,
  p_notes       text    default null::text
)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id    uuid;
  v_currency    text;
  v_row         public.payments;
begin
  if coalesce(public.account_role_for(p_account_id), '') not in ('owner', 'admin') then
    raise exception 'Not allowed';
  end if;

  select p.owner_id into v_owner_id
  from public.properties p
  where p.id = p_property_id
    and p.account_id = p_account_id;

  if v_owner_id is null then
    raise exception 'Property not found in this account';
  end if;

  if not exists (
    select 1 from public.tenants t
    where t.id = p_tenant_id
      and t.account_id = p_account_id
      and t.status = 'active'
  ) then
    raise exception 'Tenant not active in this account';
  end if;

  -- Inherit currency from the account so ledger entries are always correct
  select coalesce(a.currency, 'PLN') into v_currency
  from public.accounts a
  where a.id = p_account_id;

  insert into public.payments (
    owner_id, account_id, property_id, tenant_id,
    amount, due_date, paid_at, status, notes, currency
  ) values (
    v_owner_id, p_account_id, p_property_id, p_tenant_id,
    p_amount, p_due_date, p_paid_at,
    case when p_paid_at is not null then 'paid' else 'due' end,
    p_notes,
    v_currency
  )
  returning * into v_row;

  return v_row;
end;
$$;
