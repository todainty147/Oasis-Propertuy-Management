-- =============================================================================
-- Payment Integrity Improvements
-- =============================================================================
-- A-1  Status column kept in sync with paid_at across all write RPCs.
-- A-3  update_payment blocks amount changes on already-paid payments (preserves
--      ledger integrity without needing reversal entries).
-- A-7  notes column added to payments; update_payment now persists it.
-- A-8  updated_at column added to payments with auto-trigger.
-- A-9  void_payment and reopen_payment accept optional p_account_id for
--      consistency with the rest of the payment RPC surface.
-- =============================================================================


-- ── A-7: notes column ─────────────────────────────────────────────────────────
alter table public.payments
  add column if not exists notes text;


-- ── A-8: updated_at column + trigger ──────────────────────────────────────────
alter table public.payments
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.tg_payments_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_payments_updated_at on public.payments;
create trigger trg_payments_updated_at
  before update on public.payments
  for each row execute function public.tg_payments_set_updated_at();


-- ── A-1 + A-7: create_payment — correct initial status, persist notes ─────────
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
  v_row      public.payments;
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

  insert into public.payments (
    owner_id, account_id, property_id, tenant_id,
    amount, due_date, paid_at, status, notes
  ) values (
    v_owner_id, p_account_id, p_property_id, p_tenant_id,
    p_amount, p_due_date, p_paid_at,
    -- A-1: status reflects paid_at at creation time
    case when p_paid_at is not null then 'paid' else 'due' end,
    p_notes
  )
  returning * into v_row;

  return v_row;
end;
$$;


-- ── A-1 + A-3 + A-7: update_payment — sync status, block paid-amount edits ────
create or replace function public.update_payment(
  p_account_id uuid,
  p_payment_id uuid,
  p_amount      numeric default null::numeric,
  p_due_date    date    default null::date,
  p_notes       text    default null::text
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

  if coalesce(public.account_role_for(v_row.account_id), '') not in ('owner', 'admin') then
    raise exception 'Not allowed';
  end if;

  -- A-3: prevent silent ledger mutation — amount is immutable once paid
  if v_row.paid_at is not null
     and p_amount is not null
     and p_amount <> v_row.amount then
    raise exception
      'Cannot change the amount of a paid payment. Void it and create a new payment instead.';
  end if;

  update public.payments
  set
    amount   = coalesce(p_amount,   amount),
    due_date = coalesce(p_due_date, due_date),
    notes    = case when p_notes is not null then p_notes else notes end
  where id = p_payment_id
    and account_id = p_account_id
  returning * into v_row;

  return v_row;
end;
$$;


-- ── A-1: mark_payment_paid — also set status = 'paid' ────────────────────────
create or replace function public.mark_payment_paid(
  p_account_id uuid,
  p_payment_id uuid,
  p_paid_at    date default current_date
)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pay  public.payments;
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
  if coalesce(v_role, '') not in ('owner', 'admin') then
    raise exception 'Not permitted';
  end if;

  update public.payments
  set paid_at = coalesce(p_paid_at, current_date),
      status  = 'paid'
  where id = p_payment_id
    and account_id = p_account_id
  returning * into v_pay;

  return v_pay;
end;
$$;


-- ── A-1: mark_payment_unpaid — clear paid_at, derive correct status ───────────
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

  if coalesce(public.account_role_for(v_row.account_id), '') not in ('owner', 'admin') then
    raise exception 'Not allowed';
  end if;

  update public.payments
  set paid_at = null,
      status  = case
                  when due_date < current_date then 'overdue'
                  else 'due'
                end
  where id = p_payment_id
    and account_id = p_account_id
  returning * into v_row;

  return v_row;
end;
$$;


-- ── A-1 + A-9: void_payment — accept optional p_account_id, clear paid_at ────
-- Drop 1-param overload if it exists (avoids PGRST203 ambiguity when called
-- with only p_payment_id from clients that omit the optional parameter).
drop function if exists public.void_payment(uuid);
create or replace function public.void_payment(
  p_payment_id uuid,
  p_account_id uuid default null::uuid
)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pay  public.payments;
  v_role text;
begin
  select * into v_pay
  from public.payments
  where id = p_payment_id
    and (p_account_id is null or account_id = p_account_id);

  if not found then
    raise exception 'Payment not found';
  end if;

  v_role := public.account_role_for(v_pay.account_id);
  if coalesce(v_role, '') not in ('owner', 'admin') then
    raise exception 'Not permitted';
  end if;

  update public.payments
  set status  = 'void',
      paid_at = null
  where id = p_payment_id
  returning * into v_pay;

  return v_pay;
end;
$$;


-- ── A-1 + A-9: reopen_payment — accept optional p_account_id, derive status ──
drop function if exists public.reopen_payment(uuid);
create or replace function public.reopen_payment(
  p_payment_id uuid,
  p_account_id uuid default null::uuid
)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pay  public.payments;
  v_role text;
begin
  select * into v_pay
  from public.payments
  where id = p_payment_id
    and (p_account_id is null or account_id = p_account_id);

  if not found then
    raise exception 'Payment not found';
  end if;

  v_role := public.account_role_for(v_pay.account_id);
  if coalesce(v_role, '') not in ('owner', 'admin') then
    raise exception 'Not permitted';
  end if;

  update public.payments
  set paid_at = null,
      status  = case
                  when due_date < current_date then 'overdue'
                  else 'due'
                end
  where id = p_payment_id
  returning * into v_pay;

  return v_pay;
end;
$$;


-- ── Grants ────────────────────────────────────────────────────────────────────
revoke all on function public.update_payment(uuid, uuid, numeric, date, text) from public;
revoke all on function public.mark_payment_paid(uuid, uuid, date)             from public;
revoke all on function public.mark_payment_unpaid(uuid, uuid)                 from public;
revoke all on function public.void_payment(uuid, uuid)                        from public;
revoke all on function public.reopen_payment(uuid, uuid)                      from public;

grant execute on function public.update_payment(uuid, uuid, numeric, date, text) to authenticated;
grant execute on function public.mark_payment_paid(uuid, uuid, date)             to authenticated;
grant execute on function public.mark_payment_unpaid(uuid, uuid)                 to authenticated;
grant execute on function public.void_payment(uuid, uuid)                        to authenticated;
grant execute on function public.reopen_payment(uuid, uuid)                      to authenticated;
