-- =============================================================================
-- Provenance Sprint 2A: Finance Provenance Cutover Prep
-- Overlay — idempotent, re-applied on every deploy
--
-- Depends on: provenance_events.sql (must run before this file)
-- Must run before: supabase_linter_security_hardening.sql
-- =============================================================================

-- ─── A. Cutover config table ────────────────────────────────────────────────

create table if not exists public.provenance_finance_cutover (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id),
  cutover_at timestamptz not null,
  cutover_version integer not null default 1,
  status text not null default 'draft',
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid,

  constraint provenance_finance_cutover_status_check
    check (status in ('draft', 'reconciled', 'active')),
  constraint provenance_finance_cutover_account_unique
    unique (account_id)
);

comment on table public.provenance_finance_cutover is
  'Per-account cutover timestamp separating historical reconstruction from live provenance.';

alter table public.provenance_finance_cutover enable row level security;

drop policy if exists provenance_finance_cutover_select_operators
  on public.provenance_finance_cutover;
create policy provenance_finance_cutover_select_operators
on public.provenance_finance_cutover
for select to authenticated
using (
  public.user_is_root_operator()
  or public.account_member_effective_role(account_id, auth.uid())
    = any (array['owner', 'admin'])
);

revoke all on table public.provenance_finance_cutover from public, anon, authenticated;
grant select on table public.provenance_finance_cutover to authenticated;

-- ─── C. Shared finance property accumulation function ───────────────────────
--
-- Extracts the per-property accumulation logic from finance_snapshot into a
-- reusable function. Both finance_snapshot and the obligation snapshot backfill
-- consume the SAME implementation, so months_elapsed, rent, and paid totals
-- are guaranteed to match by construction.

create or replace function public.finance_property_accumulation_as_of(
  p_account_id uuid,
  p_as_of date
)
returns table (
  property_id uuid,
  months_elapsed integer,
  rent_minor_used bigint,
  rent_start_date date,
  rent_start_source text,
  total_paid_alltime bigint,
  currency text,
  remaining_clamped bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_account_currency text;
begin
  if p_as_of is null then
    raise exception 'p_as_of is required';
  end if;

  select coalesce(a.currency, 'PLN') into v_account_currency
  from public.accounts a
  where a.id = p_account_id;

  return query
  with scoped_properties as (
    select
      pr.id,
      pr.tenant_id,
      coalesce(pr.rent, 0) as rent
    from public.properties pr
    where pr.account_id = p_account_id
  ),
  property_occupancy as (
    select
      sp.id as prop_id,
      (
        sp.tenant_id is not null
        or exists (
          select 1
          from public.tenants t
          where t.account_id = p_account_id
            and t.property_id = sp.id
            and t.archived_at is null
        )
      ) as has_assigned_tenant
    from scoped_properties sp
  ),
  scoped_payments as (
    select
      p.id as pay_id,
      p.property_id as prop_id,
      coalesce(p.amount, 0) as amount,
      lower(coalesce(p.status, '')) as status_norm,
      p.paid_at,
      p.due_date,
      (
        p.paid_at is not null
        or lower(coalesce(p.status, '')) in ('paid', 'oplacone', 'opłacone')
      ) as is_paid
    from public.payments p
    where p.account_id = p_account_id
  ),
  property_tenure as (
    select
      sp.id as prop_id,
      sp.rent,
      date_trunc('month',
        coalesce(
          (
            select min(l.lease_start_date)
            from public.leases l
            where l.account_id = p_account_id
              and l.property_id = sp.id
              and lower(coalesce(l.renewal_status, 'active')) not in ('ended')
          ),
          (
            select min(sp2.due_date)
            from scoped_payments sp2
            where sp2.prop_id = sp.id
              and sp2.due_date is not null
          )
        )
      )::date as computed_rent_start,
      case
        when exists (
          select 1 from public.leases l
          where l.account_id = p_account_id
            and l.property_id = sp.id
            and lower(coalesce(l.renewal_status, 'active')) not in ('ended')
        ) then 'lease_start_date'
        when exists (
          select 1 from scoped_payments sp2
          where sp2.prop_id = sp.id and sp2.due_date is not null
        ) then 'earliest_payment_due_date'
        else 'fallback_current_month'
      end as computed_rent_start_source
    from scoped_properties sp
  ),
  property_accumulated as (
    select
      pt.prop_id,
      pt.rent,
      pt.computed_rent_start,
      pt.computed_rent_start_source,
      coalesce((
        select sum(sp2.amount)
        from scoped_payments sp2
        where sp2.prop_id = pt.prop_id
          and sp2.is_paid
      ), 0) as computed_total_paid,
      case
        when pt.computed_rent_start is not null and pt.rent > 0 then
          greatest(
            (
              extract(year  from age(date_trunc('month', p_as_of)::date, pt.computed_rent_start)) * 12
              + extract(month from age(date_trunc('month', p_as_of)::date, pt.computed_rent_start))
              + 1
            )::integer,
            1
          )
        else 1
      end as computed_months_elapsed
    from property_tenure pt
  )
  select
    pa.prop_id as property_id,
    pa.computed_months_elapsed as months_elapsed,
    (pa.rent * 100)::bigint as rent_minor_used,
    pa.computed_rent_start as rent_start_date,
    pa.computed_rent_start_source as rent_start_source,
    (pa.computed_total_paid * 100)::bigint as total_paid_alltime,
    v_account_currency as currency,
    greatest(
      (pa.computed_months_elapsed * pa.rent - pa.computed_total_paid) * 100,
      0
    )::bigint as remaining_clamped
  from property_accumulated pa
  join property_occupancy po on po.prop_id = pa.prop_id
  where po.has_assigned_tenant or pa.computed_total_paid > 0;
end;
$$;

comment on function public.finance_property_accumulation_as_of(uuid, date) is
  'Shared per-property accumulation logic evaluated at p_as_of. Returns months_elapsed, rent, paid totals, and clamped remaining in minor units.';

revoke all on function public.finance_property_accumulation_as_of(uuid, date)
  from public, anon, authenticated;

create or replace function public.finance_property_accumulation(
  p_account_id uuid
)
returns table (
  property_id uuid,
  months_elapsed integer,
  rent_minor_used bigint,
  rent_start_date date,
  rent_start_source text,
  total_paid_alltime bigint,
  currency text,
  remaining_clamped bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.finance_property_accumulation_as_of(p_account_id, current_date);
$$;

comment on function public.finance_property_accumulation(uuid) is
  'Current-date wrapper around finance_property_accumulation_as_of. Used by live finance_snapshot-compatible projections.';

revoke all on function public.finance_property_accumulation(uuid)
  from public, anon, authenticated;

-- ─── E. Live instrumentation helper ─────────────────────────────────────────
--
-- Internal function for payment RPCs to emit provenance events within the
-- same transaction. Bypasses auth.uid() check for system events (backfill)
-- but uses auth.uid() for live human events.

create or replace function public.provenance_record_payment_event(
  p_account_id uuid,
  p_payment_id uuid,
  p_property_id uuid,
  p_tenant_id uuid,
  p_event_type text,
  p_amount_minor bigint,
  p_currency text,
  p_occurred_at timestamptz,
  p_summary text,
  p_actor_type text default 'human',
  p_source_type text default 'rpc',
  p_metadata jsonb default '{}'::jsonb,
  p_idempotency_key text default null,
  p_tenancy_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_user_id uuid;
  v_actor_role text;
  v_cutover_at timestamptz;
  v_sequence_number bigint;
  v_event_id uuid := gen_random_uuid();
  v_existing_id uuid;
  v_lease_id uuid;
begin
  if p_event_type not in (
    'payment.recorded',
    'payment.marked_paid',
    'payment.reopened',
    'payment.voided',
    'payment.adjusted',
    'payment.deleted',
    'payment.marked_overdue',
    'finance.legacy_obligation_snapshot'
  ) then
    raise exception 'invalid payment provenance event_type: %', p_event_type;
  end if;

  v_actor_user_id := auth.uid();
  if p_actor_type = 'human' then
    if v_actor_user_id is null then
      raise exception 'authentication required for human payment provenance events';
    end if;
    v_actor_role := public.account_member_effective_role(p_account_id, v_actor_user_id);
  else
    v_actor_role := coalesce(p_metadata ->> 'actor_role', 'system');
  end if;

  if p_tenancy_id is null and p_property_id is not null then
    select l.id into v_lease_id
    from public.leases l
    where l.account_id = p_account_id
      and l.property_id = p_property_id
      and lower(coalesce(l.renewal_status, 'active')) not in ('ended')
    order by l.lease_start_date desc
    limit 1;
    p_tenancy_id := v_lease_id;
  end if;

  if p_idempotency_key is not null then
    perform pg_advisory_xact_lock(hashtext('provenance:' || p_account_id::text), 0);

    select id into v_existing_id
    from public.provenance_events
    where account_id = p_account_id
      and idempotency_key = p_idempotency_key;

    if v_existing_id is not null then
      return v_existing_id;
    end if;
  else
    perform pg_advisory_xact_lock(hashtext('provenance:' || p_account_id::text), 0);
  end if;

  insert into public.provenance_event_counters(account_id, next_sequence)
  values (p_account_id, 2)
  on conflict (account_id) do update
    set next_sequence = public.provenance_event_counters.next_sequence + 1
  returning next_sequence - 1 into v_sequence_number;

  insert into public.provenance_events (
    id, account_id, sequence_number,
    entity_type, entity_id, property_id, tenancy_id,
    event_type, event_version,
    actor_type, actor_user_id, actor_role,
    occurred_at, recorded_at,
    summary, reason, metadata,
    amount_minor, currency,
    source_type, source_id,
    supersedes_event_id, reversal_of_event_id,
    correlation_id, causation_id,
    visibility,
    previous_event_hash, event_hash, hash_version,
    idempotency_key, created_at
  ) values (
    v_event_id, p_account_id, v_sequence_number,
    'payment', p_payment_id, p_property_id, p_tenancy_id,
    p_event_type, 1,
    p_actor_type,
    case when p_actor_type = 'human' then v_actor_user_id else null end,
    v_actor_role,
    p_occurred_at, now(),
    p_summary, null, p_metadata,
    p_amount_minor, upper(nullif(btrim(p_currency), '')),
    p_source_type, p_payment_id,
    null, null,
    null, null,
    'internal',
    null, null, 0,
    p_idempotency_key, now()
  )
  on conflict (account_id, idempotency_key)
    where idempotency_key is not null
  do nothing
  returning id into v_event_id;

  if not found then
    select id into v_event_id
    from public.provenance_events
    where account_id = p_account_id
      and idempotency_key = p_idempotency_key;
  end if;

  return v_event_id;
end;
$$;

comment on function public.provenance_record_payment_event is
  'Internal helper: emits a payment provenance event within the calling transaction. Used by payment write RPCs for transactional provenance recording.';

revoke all on function public.provenance_record_payment_event(
  uuid, uuid, uuid, uuid, text, bigint, text, timestamptz, text,
  text, text, jsonb, text, uuid
) from public, anon, authenticated;

-- ─── E. Live instrumentation of payment write RPCs ──────────────────────────
--
-- Each payment RPC is rewritten to emit a provenance event in the same
-- transaction. The provenance write is AFTER the payment mutation so we have
-- the final payment state, but BEFORE the function returns so both succeed
-- or both roll back.

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
  v_cutover_at timestamptz;
  v_currency text;
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
    owner_id, account_id, property_id, tenant_id,
    amount, due_date, paid_at, status
  ) values (
    v_owner_id, p_account_id, p_property_id, p_tenant_id,
    p_amount, p_due_date, p_paid_at, 'due'
  )
  returning * into v_row;

  select cutover_at into v_cutover_at
  from public.provenance_finance_cutover
  where account_id = p_account_id
    and status = 'active';

  if v_cutover_at is not null and now() >= v_cutover_at then
    select coalesce(a.currency, 'PLN') into v_currency
    from public.accounts a where a.id = p_account_id;

    perform public.provenance_record_payment_event(
      p_account_id := p_account_id,
      p_payment_id := v_row.id,
      p_property_id := p_property_id,
      p_tenant_id := p_tenant_id,
      p_event_type := 'payment.recorded',
      p_amount_minor := (p_amount * 100)::bigint,
      p_currency := v_currency,
      p_occurred_at := coalesce(p_due_date::timestamptz, now()),
      p_summary := 'Payment recorded',
      p_idempotency_key := 'live:payment.recorded:' || v_row.id::text
    );

    if p_paid_at is not null then
      perform public.provenance_record_payment_event(
        p_account_id := p_account_id,
        p_payment_id := v_row.id,
        p_property_id := p_property_id,
        p_tenant_id := p_tenant_id,
        p_event_type := 'payment.marked_paid',
        p_amount_minor := (p_amount * 100)::bigint,
        p_currency := v_currency,
        p_occurred_at := p_paid_at::timestamptz,
        p_summary := 'Payment marked as paid',
        p_idempotency_key := 'live:payment.marked_paid:' || v_row.id::text
      );
    end if;
  end if;

  return v_row;
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
  v_cutover_at timestamptz;
  v_currency text;
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

  select cutover_at into v_cutover_at
  from public.provenance_finance_cutover
  where account_id = p_account_id
    and status = 'active';

  if v_cutover_at is not null and now() >= v_cutover_at then
    select coalesce(a.currency, 'PLN') into v_currency
    from public.accounts a where a.id = p_account_id;

    perform public.provenance_record_payment_event(
      p_account_id := p_account_id,
      p_payment_id := p_payment_id,
      p_property_id := v_pay.property_id,
      p_tenant_id := v_pay.tenant_id,
      p_event_type := 'payment.marked_paid',
      p_amount_minor := (v_pay.amount * 100)::bigint,
      p_currency := v_currency,
      p_occurred_at := coalesce(p_paid_at, current_date)::timestamptz,
      p_summary := 'Payment marked as paid',
      p_idempotency_key := 'live:payment.marked_paid:' || p_payment_id::text
    );
  end if;

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
  v_cutover_at timestamptz;
  v_currency text;
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

  select cutover_at into v_cutover_at
  from public.provenance_finance_cutover
  where account_id = p_account_id
    and status = 'active';

  if v_cutover_at is not null and now() >= v_cutover_at then
    select coalesce(a.currency, 'PLN') into v_currency
    from public.accounts a where a.id = p_account_id;

    perform public.provenance_record_payment_event(
      p_account_id := p_account_id,
      p_payment_id := p_payment_id,
      p_property_id := v_row.property_id,
      p_tenant_id := v_row.tenant_id,
      p_event_type := 'payment.reopened',
      p_amount_minor := (v_row.amount * 100)::bigint,
      p_currency := v_currency,
      p_occurred_at := now(),
      p_summary := 'Payment reopened (marked unpaid)',
      p_idempotency_key := 'live:payment.reopened:' || p_payment_id::text || ':' || extract(epoch from now())::text
    );
  end if;

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
  v_cutover_at timestamptz;
  v_currency text;
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

  select cutover_at into v_cutover_at
  from public.provenance_finance_cutover
  where account_id = v_pay.account_id
    and status = 'active';

  if v_cutover_at is not null and now() >= v_cutover_at then
    select coalesce(a.currency, 'PLN') into v_currency
    from public.accounts a where a.id = v_pay.account_id;

    perform public.provenance_record_payment_event(
      p_account_id := v_pay.account_id,
      p_payment_id := v_pay.id,
      p_property_id := v_pay.property_id,
      p_tenant_id := v_pay.tenant_id,
      p_event_type := 'payment.reopened',
      p_amount_minor := (v_pay.amount * 100)::bigint,
      p_currency := v_currency,
      p_occurred_at := now(),
      p_summary := 'Payment reopened',
      p_idempotency_key := 'live:payment.reopened:' || v_pay.id::text || ':' || extract(epoch from now())::text
    );
  end if;

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
  v_cutover_at timestamptz;
  v_currency text;
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

  select cutover_at into v_cutover_at
  from public.provenance_finance_cutover
  where account_id = v_pay.account_id
    and status = 'active';

  if v_cutover_at is not null and now() >= v_cutover_at then
    select coalesce(a.currency, 'PLN') into v_currency
    from public.accounts a where a.id = v_pay.account_id;

    perform public.provenance_record_payment_event(
      p_account_id := v_pay.account_id,
      p_payment_id := v_pay.id,
      p_property_id := v_pay.property_id,
      p_tenant_id := v_pay.tenant_id,
      p_event_type := 'payment.voided',
      p_amount_minor := (v_pay.amount * 100)::bigint,
      p_currency := v_currency,
      p_occurred_at := now(),
      p_summary := 'Payment voided',
      p_idempotency_key := 'live:payment.voided:' || v_pay.id::text
    );
  end if;

  return v_pay;
end;
$$;

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
  v_old_amount numeric;
  v_cutover_at timestamptz;
  v_currency text;
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

  v_old_amount := v_row.amount;

  update public.payments
  set
    amount   = coalesce(p_amount, amount),
    due_date = coalesce(p_due_date, due_date)
  where id = p_payment_id
    and account_id = p_account_id
  returning * into v_row;

  select cutover_at into v_cutover_at
  from public.provenance_finance_cutover
  where account_id = p_account_id
    and status = 'active';

  if v_cutover_at is not null and now() >= v_cutover_at then
    if p_amount is not null and p_amount is distinct from v_old_amount then
      select coalesce(a.currency, 'PLN') into v_currency
      from public.accounts a where a.id = p_account_id;

      perform public.provenance_record_payment_event(
        p_account_id := p_account_id,
        p_payment_id := p_payment_id,
        p_property_id := v_row.property_id,
        p_tenant_id := v_row.tenant_id,
        p_event_type := 'payment.adjusted',
        p_amount_minor := (v_row.amount * 100)::bigint,
        p_currency := v_currency,
        p_occurred_at := now(),
        p_summary := 'Payment amount adjusted',
        p_metadata := jsonb_build_object(
          'old_amount_minor', (v_old_amount * 100)::bigint,
          'new_amount_minor', (v_row.amount * 100)::bigint
        ),
        p_idempotency_key := 'live:payment.adjusted:' || p_payment_id::text || ':' || extract(epoch from now())::text
      );
    end if;
  end if;

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
  v_pay public.payments;
  v_cutover_at timestamptz;
  v_currency text;
begin
  select * into v_pay
  from public.payments
  where id = p_payment_id
    and account_id = p_account_id;

  if v_pay.id is null then
    raise exception 'Payment not found';
  end if;

  if coalesce(public.account_role_for(v_pay.account_id), '') <> 'owner' then
    raise exception 'Not allowed';
  end if;

  select cutover_at into v_cutover_at
  from public.provenance_finance_cutover
  where account_id = p_account_id
    and status = 'active';

  if v_cutover_at is not null and now() >= v_cutover_at then
    select coalesce(a.currency, 'PLN') into v_currency
    from public.accounts a where a.id = p_account_id;

    perform public.provenance_record_payment_event(
      p_account_id := p_account_id,
      p_payment_id := v_pay.id,
      p_property_id := v_pay.property_id,
      p_tenant_id := v_pay.tenant_id,
      p_event_type := 'payment.deleted',
      p_amount_minor := (v_pay.amount * 100)::bigint,
      p_currency := v_currency,
      p_occurred_at := now(),
      p_summary := 'Payment deleted',
      p_metadata := jsonb_build_object(
        'original_status', v_pay.status,
        'original_due_date', v_pay.due_date,
        'original_paid_at', v_pay.paid_at
      ),
      p_idempotency_key := 'live:payment.deleted:' || v_pay.id::text
    );
  end if;

  delete from public.payments
  where id = p_payment_id
    and account_id = p_account_id;
end;
$$;

-- ─── H. Balance projection function ─────────────────────────────────────────

create or replace function public.provenance_balance_projection(
  p_account_id uuid,
  p_property_id uuid default null
)
returns table (
  property_id uuid,
  tenancy_id uuid,
  balance_minor bigint,
  currency text,
  events jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_role text;
begin
  if v_actor_id is null then
    raise exception 'authentication required';
  end if;

  v_role := public.account_member_effective_role(p_account_id, v_actor_id);
  if not public.user_is_root_operator()
     and coalesce(v_role, '') <> all (array['owner', 'admin', 'staff']) then
    raise exception 'account operator role required';
  end if;

  return query
  with relevant_events as (
    select
      e.id as event_id,
      e.sequence_number,
      e.property_id as ev_property_id,
      e.tenancy_id as ev_tenancy_id,
      e.event_type,
      e.occurred_at,
      e.recorded_at,
      e.amount_minor,
      e.currency,
      e.actor_type,
      e.actor_role,
      e.source_type,
      e.source_id,
      e.supersedes_event_id,
      e.reversal_of_event_id,
      e.event_hash,
      e.visibility,
      e.summary,
      e.reason,
      e.metadata
    from public.provenance_events e
    where e.account_id = p_account_id
      and e.event_type in (
        'payment.recorded',
        'payment.marked_paid',
        'payment.reopened',
        'payment.voided',
        'payment.adjusted',
        'payment.deleted',
        'payment.marked_overdue',
        'finance.legacy_obligation_snapshot'
      )
      and (p_property_id is null or e.property_id = p_property_id)
    order by e.sequence_number asc
  ),
  reversed_event_ids as (
    select re.reversal_of_event_id as event_id
    from relevant_events re
    where re.reversal_of_event_id is not null
  ),
  superseded_event_ids as (
    select re.supersedes_event_id as event_id
    from relevant_events re
    where re.supersedes_event_id is not null
  ),
  events_with_treatment as (
    select
      re.*,
      case
        when re.event_id in (select event_id from reversed_event_ids) then 'reversed'
        when re.event_id in (select event_id from superseded_event_ids) then 'superseded'
        when re.event_type in ('payment.recorded', 'payment.marked_overdue') then 'informational'
        when re.reversal_of_event_id is not null then 'active'
        when re.supersedes_event_id is not null then 'active'
        when re.event_type = 'finance.legacy_obligation_snapshot' then
          case when coalesce(re.metadata ->> 'reconstructed', 'false') = 'true' then 'reconstructed' else 'active' end
        else 'active'
      end as treatment,
      case
        when re.event_id in (select event_id from reversed_event_ids) then 0::bigint
        when re.event_id in (select event_id from superseded_event_ids) then 0::bigint
        when re.event_type = 'payment.recorded' then 0::bigint
        when re.event_type = 'payment.marked_overdue' then 0::bigint
        when re.event_type = 'finance.legacy_obligation_snapshot' then coalesce(re.amount_minor, 0)
        when re.event_type = 'payment.marked_paid' then -coalesce(re.amount_minor, 0)
        when re.event_type = 'payment.reopened' then coalesce(re.amount_minor, 0)
        when re.event_type = 'payment.voided' then
          case
            when re.reversal_of_event_id is not null then 0::bigint
            else 0::bigint
          end
        when re.event_type = 'payment.adjusted' then
          case
            when re.supersedes_event_id is not null then -coalesce(re.amount_minor, 0)
            else 0::bigint
          end
        when re.event_type = 'payment.deleted' then 0::bigint
        else 0::bigint
      end as contribution_minor,
      case
        when re.event_type = 'finance.legacy_obligation_snapshot' then coalesce(re.amount_minor, 0)
        when re.event_type in ('payment.marked_paid', 'payment.adjusted') then -coalesce(re.amount_minor, 0)
        when re.event_type = 'payment.reopened' then coalesce(re.amount_minor, 0)
        else 0::bigint
      end as signed_amount_minor
    from relevant_events re
  ),
  per_property as (
    select
      coalesce(e.ev_property_id, '00000000-0000-0000-0000-000000000000'::uuid) as prop_id,
      (
        array_agg(e.ev_tenancy_id order by e.sequence_number desc)
          filter (where e.ev_tenancy_id is not null)
      )[1] as ten_id,
      max(e.currency) as curr,
      sum(e.contribution_minor) as balance,
      jsonb_agg(
        jsonb_build_object(
          'event_id', e.event_id,
          'sequence_number', e.sequence_number,
          'occurred_at', e.occurred_at,
          'recorded_at', e.recorded_at,
          'event_type', e.event_type,
          'amount_minor', e.amount_minor,
          'signed_amount_minor', e.signed_amount_minor,
          'contribution_minor', e.contribution_minor,
          'currency', e.currency,
          'treatment', e.treatment,
          'actor_type', e.actor_type,
          'actor_role', e.actor_role,
          'source_type', e.source_type,
          'source_id', e.source_id,
          'supersedes_event_id', e.supersedes_event_id,
          'reversal_of_event_id', e.reversal_of_event_id,
          'evidence_hash', e.event_hash,
          'visibility', e.visibility,
          'summary', e.summary,
          'reason', e.reason,
          'reconstructed', coalesce(e.metadata ->> 'reconstructed', 'false') = 'true'
        )
        order by e.sequence_number
      ) as event_list
    from events_with_treatment e
    group by coalesce(e.ev_property_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  select
    pp.prop_id as property_id,
    pp.ten_id as tenancy_id,
    pp.balance::bigint as balance_minor,
    pp.curr as currency,
    pp.event_list as events
  from per_property pp;
end;
$$;

comment on function public.provenance_balance_projection(uuid, uuid) is
  'Returns per-property provenance-derived balance and event list with treatment, contribution, and reconstruction markers. Sprint 2A backend projection — no UI.';

revoke all on function public.provenance_balance_projection(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.provenance_balance_projection(uuid, uuid) to authenticated;

-- ─── I. Reconciliation gate ─────────────────────────────────────────────────

-- Sprint 2B adds an OUT column to this RPC. DROP is required because PostgreSQL
-- cannot CREATE OR REPLACE a function whose returned row shape has changed.
drop function if exists public.provenance_reconciliation_gate(uuid);

create or replace function public.provenance_reconciliation_gate(
  p_account_id uuid
)
returns table (
  property_id uuid,
  tenancy_id uuid,
  legacy_balance_minor bigint,
  provenance_balance_minor bigint,
  difference_minor bigint,
  currency text,
  status text,
  divergence_reason text,
  recommended_action text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_role text;
begin
  if v_actor_id is null then
    raise exception 'authentication required';
  end if;

  v_role := public.account_member_effective_role(p_account_id, v_actor_id);
  if not public.user_is_root_operator()
     and coalesce(v_role, '') <> all (array['owner', 'admin']) then
    raise exception 'account owner or admin role required';
  end if;

  return query
  with legacy as (
    select
      fa.property_id,
      fa.remaining_clamped as legacy_remaining,
      fa.currency as legacy_currency
    from public.finance_property_accumulation(p_account_id) fa
  ),
  provenance as (
    select
      bp.property_id as prov_property_id,
      bp.tenancy_id as prov_tenancy_id,
      bp.balance_minor as prov_balance,
      bp.currency as prov_currency
    from public.provenance_balance_projection(p_account_id) bp
  ),
  combined as (
    select
      coalesce(l.property_id, p.prov_property_id) as prop_id,
      p.prov_tenancy_id as ten_id,
      coalesce(l.legacy_remaining, 0) as leg_balance,
      coalesce(p.prov_balance, 0) as prov_bal,
      coalesce(l.legacy_currency, p.prov_currency) as curr,
      l.legacy_currency as l_curr,
      p.prov_currency as p_curr
    from legacy l
    full outer join provenance p on l.property_id = p.prov_property_id
  )
  select
    c.prop_id as property_id,
    c.ten_id as tenancy_id,
    c.leg_balance as legacy_balance_minor,
    c.prov_bal as provenance_balance_minor,
    c.prov_bal - c.leg_balance as difference_minor,
    c.curr as currency,
    case
      when c.l_curr is not null and c.p_curr is not null and c.l_curr <> c.p_curr then 'cannot_compare'
      when c.leg_balance = 0 and c.prov_bal = 0 then 'matched'
      when c.leg_balance = c.prov_bal then 'matched'
      when c.leg_balance = 0 and c.prov_bal < 0 then 'explained_divergence'
      else 'unexplained_divergence'
    end as status,
    case
      when c.l_curr is not null and c.p_curr is not null and c.l_curr <> c.p_curr then 'currency_mismatch'
      when c.leg_balance = c.prov_bal then null
      when c.leg_balance = 0 and c.prov_bal < 0 then 'overpayment_credit_clamp'
      when c.leg_balance = 0 and c.prov_bal = 0 then null
      else 'derivation_mismatch'
    end as divergence_reason,
    case
      when c.l_curr is not null and c.p_curr is not null and c.l_curr <> c.p_curr then 'investigate currency configuration'
      when c.leg_balance = c.prov_bal then null
      when c.leg_balance = 0 and c.prov_bal < 0 then 'expected: provenance shows tenant credit that legacy clamps to zero'
      else 'investigate derivation mismatch — fix shared accumulation, do not classify around it'
    end as recommended_action
  from combined c;
end;
$$;

comment on function public.provenance_reconciliation_gate(uuid) is
  'Per-property comparison of legacy finance_snapshot remaining vs provenance-derived balance. Returns matched/explained_divergence/unexplained_divergence/cannot_compare per property. Sprint 2A reconciliation gate.';

revoke all on function public.provenance_reconciliation_gate(uuid)
  from public, anon, authenticated;
grant execute on function public.provenance_reconciliation_gate(uuid) to authenticated;

-- ─── D. Backfill function ───────────────────────────────────────────────────
--
-- Called once per account at cutover time. Creates:
-- 1. One finance.legacy_obligation_snapshot per property (from shared accumulation)
-- 2. One payment.recorded per existing payment
-- 3. One payment.marked_paid per paid payment
-- 4. One payment.voided per void payment
--
-- Idempotent via idempotency_key.

create or replace function public.provenance_finance_backfill(
  p_account_id uuid,
  p_cutover_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prop record;
  v_pay record;
  v_currency text;
  v_obligation_count integer := 0;
  v_payment_count integer := 0;
  v_paid_count integer := 0;
  v_void_count integer := 0;
  v_cutover_version integer;
  v_sequence_number bigint;
  v_event_id uuid;
  v_idem_key text;
  v_existing_event_id uuid;
begin
  select coalesce(a.currency, 'PLN') into v_currency
  from public.accounts a where a.id = p_account_id;

  select coalesce(c.cutover_version, 1) into v_cutover_version
  from public.provenance_finance_cutover c
  where c.account_id = p_account_id;
  if not found then
    v_cutover_version := 1;
  end if;

  for v_prop in
    select *
    from public.finance_property_accumulation_as_of(
      p_account_id,
      p_cutover_at::date
    )
  loop
    v_idem_key := 'cutover:legacy_obligation:' || p_account_id::text || ':' || v_prop.property_id::text || ':' || v_cutover_version::text;

    select id into v_existing_event_id
    from public.provenance_events
    where account_id = p_account_id
      and idempotency_key = v_idem_key;
    if v_existing_event_id is not null then
      continue;
    end if;

    perform pg_advisory_xact_lock(hashtext('provenance:' || p_account_id::text), 0);

    insert into public.provenance_event_counters(account_id, next_sequence)
    values (p_account_id, 2)
    on conflict (account_id) do update
      set next_sequence = public.provenance_event_counters.next_sequence + 1
    returning next_sequence - 1 into v_sequence_number;

    v_event_id := gen_random_uuid();

    insert into public.provenance_events (
      id, account_id, sequence_number,
      entity_type, entity_id, property_id, tenancy_id,
      event_type, event_version,
      actor_type, actor_user_id, actor_role,
      occurred_at, recorded_at,
      summary, reason, metadata,
      amount_minor, currency,
      source_type, source_id,
      visibility,
      previous_event_hash, event_hash, hash_version,
      idempotency_key, created_at
    ) values (
      v_event_id, p_account_id, v_sequence_number,
      'property', v_prop.property_id, v_prop.property_id, null,
      'finance.legacy_obligation_snapshot', 1,
      'system', null, 'system',
      p_cutover_at, now(),
      'Legacy obligation snapshot at finance cutover',
      null,
      jsonb_build_object(
        'formula_name', 'finance_snapshot_property_accumulated',
        'formula_version', '2A',
        'derivation', 'shared_function',
        'months_elapsed', v_prop.months_elapsed,
        'rent_minor_used', v_prop.rent_minor_used,
        'rent_source', 'properties.rent',
        'rent_start_date', v_prop.rent_start_date,
        'rent_start_date_source', v_prop.rent_start_source,
        'total_paid_alltime_at_cutover', v_prop.total_paid_alltime,
        'legacy_balance_source', 'finance_snapshot',
        'legacy_remaining_at_cutover', v_prop.remaining_clamped,
        'cutover_at', p_cutover_at,
        'reconstructed', true,
        'backfill', true,
        'warning', 'This event reconstructs the legacy finance formula and is not a contemporaneous monthly charge record.'
      ),
      (v_prop.months_elapsed::bigint * v_prop.rent_minor_used)::bigint,
      v_prop.currency,
      'backfill_legacy_formula', null,
      'internal',
      null, null, 0,
      v_idem_key,
      now()
    );

    v_obligation_count := v_obligation_count + 1;
  end loop;

  for v_pay in
    select
      p.id as payment_id,
      p.property_id,
      p.tenant_id,
      p.account_id,
      coalesce(p.amount, 0) as amount,
      lower(coalesce(p.status, '')) as status_norm,
      p.paid_at,
      p.due_date,
      p.created_at as payment_created_at
    from public.payments p
    where p.account_id = p_account_id
    order by coalesce(p.due_date, p.created_at::date, current_date), p.created_at
  loop
    -- Check idempotency BEFORE allocating a sequence number to avoid gaps on re-run
    v_idem_key := 'backfill:payment.recorded:' || v_pay.payment_id::text;
    select id into v_existing_event_id
    from public.provenance_events
    where account_id = p_account_id and idempotency_key = v_idem_key;

    if v_existing_event_id is null then
      perform pg_advisory_xact_lock(hashtext('provenance:' || p_account_id::text), 0);

      insert into public.provenance_event_counters(account_id, next_sequence)
      values (p_account_id, 2)
      on conflict (account_id) do update
        set next_sequence = public.provenance_event_counters.next_sequence + 1
      returning next_sequence - 1 into v_sequence_number;

      v_event_id := gen_random_uuid();

      insert into public.provenance_events (
        id, account_id, sequence_number,
        entity_type, entity_id, property_id, tenancy_id,
        event_type, event_version,
        actor_type, actor_user_id, actor_role,
        occurred_at, recorded_at,
        summary, reason, metadata,
        amount_minor, currency,
        source_type, source_id,
        visibility,
        previous_event_hash, event_hash, hash_version,
        idempotency_key, created_at
      ) values (
        v_event_id, p_account_id, v_sequence_number,
        'payment', v_pay.payment_id, v_pay.property_id, null,
        'payment.recorded', 1,
        'system', null, 'system',
        coalesce(v_pay.due_date::timestamptz, v_pay.payment_created_at, p_cutover_at),
        now(),
        'Payment recorded (backfill)',
        null,
        jsonb_build_object(
          'reconstructed', true,
          'backfill', true,
          'original_table', 'payments',
          'original_status', v_pay.status_norm,
          'original_due_date', v_pay.due_date,
          'original_paid_at', v_pay.paid_at
        ),
        (v_pay.amount * 100)::bigint,
        v_currency,
        'backfill_payment', v_pay.payment_id,
        'internal',
        null, null, 0,
        v_idem_key,
        now()
      );

      v_payment_count := v_payment_count + 1;
    end if;

    if v_pay.paid_at is not null
       or v_pay.status_norm in ('paid', 'oplacone', 'opłacone') then
      v_idem_key := 'backfill:payment.marked_paid:' || v_pay.payment_id::text;
      select id into v_existing_event_id
      from public.provenance_events
      where account_id = p_account_id and idempotency_key = v_idem_key;

      if v_existing_event_id is null then
        perform pg_advisory_xact_lock(hashtext('provenance:' || p_account_id::text), 0);

        insert into public.provenance_event_counters(account_id, next_sequence)
        values (p_account_id, 2)
        on conflict (account_id) do update
          set next_sequence = public.provenance_event_counters.next_sequence + 1
        returning next_sequence - 1 into v_sequence_number;

        v_event_id := gen_random_uuid();

        insert into public.provenance_events (
          id, account_id, sequence_number,
          entity_type, entity_id, property_id, tenancy_id,
          event_type, event_version,
          actor_type, actor_user_id, actor_role,
          occurred_at, recorded_at,
          summary, reason, metadata,
          amount_minor, currency,
          source_type, source_id,
          visibility,
          previous_event_hash, event_hash, hash_version,
          idempotency_key, created_at
        ) values (
          v_event_id, p_account_id, v_sequence_number,
          'payment', v_pay.payment_id, v_pay.property_id, null,
          'payment.marked_paid', 1,
          'system', null, 'system',
          coalesce(v_pay.paid_at::timestamptz, now()),
          now(),
          'Payment marked as paid (backfill)',
          null,
          jsonb_build_object(
            'reconstructed', true,
            'backfill', true,
            'original_table', 'payments',
            'original_status', v_pay.status_norm,
            'original_paid_at', v_pay.paid_at
          ),
          (v_pay.amount * 100)::bigint,
          v_currency,
          'backfill_payment', v_pay.payment_id,
          'internal',
          null, null, 0,
          v_idem_key,
          now()
        );

        v_paid_count := v_paid_count + 1;
      end if;
    end if;

    if v_pay.status_norm = 'void' then
      v_idem_key := 'backfill:payment.voided:' || v_pay.payment_id::text;
      select id into v_existing_event_id
      from public.provenance_events
      where account_id = p_account_id and idempotency_key = v_idem_key;

      if v_existing_event_id is null then
        perform pg_advisory_xact_lock(hashtext('provenance:' || p_account_id::text), 0);

        insert into public.provenance_event_counters(account_id, next_sequence)
        values (p_account_id, 2)
        on conflict (account_id) do update
          set next_sequence = public.provenance_event_counters.next_sequence + 1
        returning next_sequence - 1 into v_sequence_number;

        v_event_id := gen_random_uuid();

        insert into public.provenance_events (
          id, account_id, sequence_number,
          entity_type, entity_id, property_id, tenancy_id,
          event_type, event_version,
          actor_type, actor_user_id, actor_role,
          occurred_at, recorded_at,
          summary, reason, metadata,
          amount_minor, currency,
          source_type, source_id,
          visibility,
          previous_event_hash, event_hash, hash_version,
          idempotency_key, created_at
        ) values (
          v_event_id, p_account_id, v_sequence_number,
          'payment', v_pay.payment_id, v_pay.property_id, null,
          'payment.voided', 1,
          'system', null, 'system',
          now(),
          now(),
          'Payment voided (backfill)',
          null,
          jsonb_build_object(
            'reconstructed', true,
            'backfill', true,
            'original_table', 'payments',
            'original_status', v_pay.status_norm
          ),
          (v_pay.amount * 100)::bigint,
          v_currency,
          'backfill_payment', v_pay.payment_id,
          'internal',
          null, null, 0,
          v_idem_key,
          now()
        );

        v_void_count := v_void_count + 1;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'account_id', p_account_id,
    'cutover_at', p_cutover_at,
    'obligation_snapshots', v_obligation_count,
    'payments_recorded', v_payment_count,
    'payments_marked_paid', v_paid_count,
    'payments_voided', v_void_count
  );
end;
$$;

comment on function public.provenance_finance_backfill(uuid, timestamptz) is
  'One-time per-account backfill: creates legacy obligation snapshots and factual payment events from existing data. Idempotent via idempotency_key. Sprint 2A cutover prep.';

revoke all on function public.provenance_finance_backfill(uuid, timestamptz)
  from public, anon, authenticated;
