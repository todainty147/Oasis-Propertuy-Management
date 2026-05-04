-- ── Operator/Agency Grant System ─────────────────────────────────────────────
-- Tracks sales-negotiated Operator/Agency contracts separately from Stripe
-- billing_subscriptions, because the contract is set by root operator + sales,
-- not by self-serve Stripe checkout.
-- ──────────────────────────────────────────────────────────────────────────────

begin;

-- ── Table ─────────────────────────────────────────────────────────────────────

create table if not exists public.operator_agency_grants (
  id                          uuid primary key default gen_random_uuid(),
  account_id                  uuid not null references public.accounts(id) on delete cascade,

  -- Actor audit trail (user-level, not just account-level)
  granted_by_user_id          uuid not null references auth.users(id),
  granted_by_account_id       uuid not null references public.accounts(id),
  granted_at                  timestamptz not null default now(),
  updated_by_user_id          uuid references auth.users(id),
  updated_at                  timestamptz,
  cancelled_by_user_id        uuid references auth.users(id),
  cancelled_at                timestamptz,
  cancellation_reason         text,

  -- Agreed contract terms (set by root operator during grant)
  subscription_start          date not null,
  subscription_end            date,
  unit_count                  integer not null check (unit_count > 0),
  notes                       text,

  -- Lifecycle
  payment_status              text not null default 'draft'
    check (payment_status in (
      'draft',
      'pending_checkout',
      'pending_payment',
      'active',
      'expired',
      'cancelled',
      'checkout_failed',
      'activation_failed'
    )),

  -- Stripe linkage (populated by Edge Function, not SQL)
  stripe_checkout_session_id  text,
  stripe_checkout_url         text,
  stripe_checkout_expires_at  timestamptz,
  stripe_subscription_id      text,
  stripe_price_id             text,
  activated_at                timestamptz,

  created_at                  timestamptz not null default now(),

  constraint operator_agency_grant_dates_valid
    check (subscription_end is null or subscription_end >= subscription_start)
);

-- Only one active/pending grant per account at a time
create unique index if not exists operator_agency_grants_active_idx
  on public.operator_agency_grants(account_id)
  where payment_status in ('draft', 'pending_checkout', 'pending_payment', 'active');

-- Expiry sweep index
create index if not exists operator_agency_grants_expiry_idx
  on public.operator_agency_grants(subscription_end)
  where payment_status = 'active' and subscription_end is not null;

-- Webhook idempotency lookups
create unique index if not exists operator_agency_grants_checkout_session_idx
  on public.operator_agency_grants(stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

create unique index if not exists operator_agency_grants_subscription_idx
  on public.operator_agency_grants(stripe_subscription_id)
  where stripe_subscription_id is not null;

-- ── RLS ───────────────────────────────────────────────────────────────────────

alter table public.operator_agency_grants enable row level security;

-- Root operators have full access to all rows
drop policy if exists "oa_grants_root_all" on public.operator_agency_grants;
create policy "oa_grants_root_all"
  on public.operator_agency_grants
  for all
  using (public.user_is_root_operator())
  with check (public.user_is_root_operator());

-- Non-root: no direct access to raw table (use get_my_oa_grant_status RPC)

-- ── RPC: get_my_oa_grant_status ───────────────────────────────────────────────
-- Account managers can call this to get their own OA status.
-- Returns only safe fields; hides notes, internal IDs, raw Stripe data.

create or replace function public.get_my_oa_grant_status(
  p_account_id uuid
)
returns table (
  payment_status             text,
  subscription_start         date,
  subscription_end           date,
  unit_count                 integer,
  checkout_url               text,
  stripe_checkout_expires_at timestamptz,
  activated_at               timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if p_account_id is null then
    raise exception 'Missing account id';
  end if;

  if not (public.is_account_manager(p_account_id) or public.user_is_root_operator()) then
    raise exception 'Permission denied';
  end if;

  return query
  select
    oag.payment_status,
    oag.subscription_start,
    oag.subscription_end,
    oag.unit_count,
    case
      when oag.payment_status = 'pending_payment'
       and oag.stripe_checkout_expires_at is not null
       and oag.stripe_checkout_expires_at > now()
      then oag.stripe_checkout_url
      else null
    end                        as checkout_url,
    oag.stripe_checkout_expires_at,
    oag.activated_at
  from public.operator_agency_grants oag
  where oag.account_id = p_account_id
    and oag.payment_status in ('pending_checkout', 'pending_payment', 'active', 'expired')
  order by
    case oag.payment_status
      when 'active'           then 1
      when 'pending_payment'  then 2
      when 'pending_checkout' then 3
      when 'expired'          then 4
      else 5
    end
  limit 1;
end;
$$;

revoke all  on function public.get_my_oa_grant_status(uuid) from public;
grant execute on function public.get_my_oa_grant_status(uuid) to authenticated;

-- ── RPC: create_operator_agency_grant ────────────────────────────────────────
-- Root-only. Step 1: Creates the grant record. Stripe session is created
-- separately by the create-oa-checkout-session Edge Function.

create or replace function public.create_operator_agency_grant(
  p_target_account_id  uuid,
  p_unit_count         integer,
  p_subscription_start date,
  p_subscription_end   date,
  p_reason             text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grant_id uuid;
  v_caller_account_id uuid;
begin
  if not public.user_is_root_operator() then
    raise exception 'Permission denied';
  end if;

  if p_target_account_id is null then
    raise exception 'Missing target account id';
  end if;

  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'Reason is required for OA grant creation';
  end if;

  if coalesce(p_unit_count, 0) <= 0 then
    raise exception 'unit_count must be a positive integer';
  end if;

  if p_subscription_start is null then
    raise exception 'subscription_start is required';
  end if;

  if p_subscription_end is not null and p_subscription_end < p_subscription_start then
    raise exception 'subscription_end must be on or after subscription_start';
  end if;

  -- Block if account already has an active Stripe self-serve subscription
  if exists (
    select 1 from public.billing_subscriptions bs
    where bs.account_id = p_target_account_id
      and bs.status in ('active', 'trialing', 'past_due')
  ) then
    raise exception
      'Account has an active self-serve subscription. Cancel it before granting Operator/Agency access.';
  end if;

  -- Resolve root account for audit
  select am.account_id into v_caller_account_id
  from public.account_members am
  join public.accounts a on a.id = am.account_id
  where am.user_id = auth.uid() and coalesce(a.is_root, false) = true
  limit 1;

  -- Cancel any existing pending grant (safe, idempotent)
  update public.operator_agency_grants
  set payment_status      = 'cancelled',
      cancelled_by_user_id = auth.uid(),
      cancelled_at         = now(),
      cancellation_reason  = 'superseded by new grant'
  where account_id = p_target_account_id
    and payment_status in ('draft', 'pending_checkout', 'pending_payment');

  -- Clear trial for OA accounts — trial never applies to OA
  update public.accounts
  set trial_ends_at = null,
      trial_source  = null
  where id = p_target_account_id;

  insert into public.operator_agency_grants (
    account_id,
    granted_by_user_id,
    granted_by_account_id,
    subscription_start,
    subscription_end,
    unit_count,
    notes,
    payment_status
  ) values (
    p_target_account_id,
    auth.uid(),
    coalesce(v_caller_account_id, p_target_account_id),
    p_subscription_start,
    p_subscription_end,
    p_unit_count,
    p_reason,
    'draft'
  )
  returning id into v_grant_id;

  perform public.log_security_event(
    p_target_account_id,
    'oa_grant_created',
    'operator_agency_grant',
    v_grant_id,
    jsonb_build_object(
      'grant_id', v_grant_id,
      'unit_count', p_unit_count,
      'subscription_start', p_subscription_start,
      'subscription_end', p_subscription_end,
      'reason', p_reason,
      'actor_user_id', auth.uid()
    )
  );

  return v_grant_id;
end;
$$;

revoke all  on function public.create_operator_agency_grant(uuid, integer, date, date, text) from public;
grant execute on function public.create_operator_agency_grant(uuid, integer, date, date, text) to authenticated;

-- ── RPC: record_oa_checkout_session ──────────────────────────────────────────
-- Called by the create-oa-checkout-session Edge Function after Stripe session
-- is created. Root-only.

create or replace function public.record_oa_checkout_session(
  p_grant_id                   uuid,
  p_stripe_checkout_session_id text,
  p_stripe_checkout_url        text,
  p_stripe_checkout_expires_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid;
begin
  if not public.user_is_root_operator() then
    raise exception 'Permission denied';
  end if;

  select account_id into v_account_id
  from public.operator_agency_grants
  where id = p_grant_id and payment_status = 'draft';

  if v_account_id is null then
    raise exception 'Grant not found or not in draft status';
  end if;

  update public.operator_agency_grants
  set payment_status               = 'pending_checkout',
      stripe_checkout_session_id   = p_stripe_checkout_session_id,
      stripe_checkout_url          = p_stripe_checkout_url,
      stripe_checkout_expires_at   = p_stripe_checkout_expires_at,
      updated_by_user_id           = auth.uid(),
      updated_at                   = now()
  where id = p_grant_id;
end;
$$;

revoke all  on function public.record_oa_checkout_session(uuid, text, text, timestamptz) from public;
grant execute on function public.record_oa_checkout_session(uuid, text, text, timestamptz) to authenticated;

-- ── RPC: activate_oa_payment_link ────────────────────────────────────────────
-- Root-only. Transitions grant from pending_checkout → pending_payment,
-- signalling the link has been sent to the account.

create or replace function public.activate_oa_payment_link(
  p_grant_id uuid,
  p_reason   text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid;
begin
  if not public.user_is_root_operator() then
    raise exception 'Permission denied';
  end if;

  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'Reason is required';
  end if;

  select account_id into v_account_id
  from public.operator_agency_grants
  where id = p_grant_id and payment_status = 'pending_checkout';

  if v_account_id is null then
    raise exception 'Grant not found or not in pending_checkout status';
  end if;

  update public.operator_agency_grants
  set payment_status     = 'pending_payment',
      updated_by_user_id = auth.uid(),
      updated_at         = now()
  where id = p_grant_id;

  perform public.log_security_event(
    v_account_id,
    'oa_payment_link_activated',
    'operator_agency_grant',
    p_grant_id,
    jsonb_build_object('reason', p_reason, 'actor_user_id', auth.uid())
  );
end;
$$;

revoke all  on function public.activate_oa_payment_link(uuid, text) from public;
grant execute on function public.activate_oa_payment_link(uuid, text) to authenticated;

-- ── RPC: record_regenerated_oa_checkout ──────────────────────────────────────
-- Root-only. Updates grant with new Stripe session after regeneration.

create or replace function public.record_regenerated_oa_checkout(
  p_grant_id                   uuid,
  p_stripe_checkout_session_id text,
  p_stripe_checkout_url        text,
  p_stripe_checkout_expires_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.user_is_root_operator() then
    raise exception 'Permission denied';
  end if;

  if not exists (
    select 1 from public.operator_agency_grants
    where id = p_grant_id
      and payment_status = 'pending_payment'
      and (stripe_checkout_expires_at is null or stripe_checkout_expires_at < now())
  ) then
    raise exception 'Grant not found, not in pending_payment, or checkout not yet expired';
  end if;

  update public.operator_agency_grants
  set stripe_checkout_session_id  = p_stripe_checkout_session_id,
      stripe_checkout_url         = p_stripe_checkout_url,
      stripe_checkout_expires_at  = p_stripe_checkout_expires_at,
      updated_by_user_id          = auth.uid(),
      updated_at                  = now()
  where id = p_grant_id;
end;
$$;

revoke all  on function public.record_regenerated_oa_checkout(uuid, text, text, timestamptz) from public;
grant execute on function public.record_regenerated_oa_checkout(uuid, text, text, timestamptz) to authenticated;

-- ── RPC: update_operator_agency_grant ────────────────────────────────────────
-- Root-only. Modifies contract terms for pending or active grants.

create or replace function public.update_operator_agency_grant(
  p_grant_id         uuid,
  p_subscription_end date,
  p_unit_count       integer,
  p_reason           text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid;
  v_start      date;
begin
  if not public.user_is_root_operator() then
    raise exception 'Permission denied';
  end if;

  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'Reason is required for grant updates';
  end if;

  if coalesce(p_unit_count, 0) <= 0 then
    raise exception 'unit_count must be a positive integer';
  end if;

  select account_id, subscription_start
  into v_account_id, v_start
  from public.operator_agency_grants
  where id = p_grant_id
    and payment_status in ('pending_checkout', 'pending_payment', 'active');

  if v_account_id is null then
    raise exception 'Grant not found or not in a modifiable state';
  end if;

  if p_subscription_end is not null and p_subscription_end < v_start then
    raise exception 'subscription_end must be on or after subscription_start';
  end if;

  update public.operator_agency_grants
  set subscription_end   = p_subscription_end,
      unit_count         = p_unit_count,
      notes              = coalesce(notes, '') || E'\n[' || now()::text || '] ' || p_reason,
      updated_by_user_id = auth.uid(),
      updated_at         = now()
  where id = p_grant_id;

  perform public.log_security_event(
    v_account_id,
    'oa_grant_updated',
    'operator_agency_grant',
    p_grant_id,
    jsonb_build_object(
      'new_subscription_end', p_subscription_end,
      'new_unit_count', p_unit_count,
      'reason', p_reason,
      'actor_user_id', auth.uid()
    )
  );
end;
$$;

revoke all  on function public.update_operator_agency_grant(uuid, date, integer, text) from public;
grant execute on function public.update_operator_agency_grant(uuid, date, integer, text) to authenticated;

-- ── RPC: cancel_operator_agency_grant ────────────────────────────────────────
-- Root-only. Cancels a grant immediately or marks it for end-of-period.

create or replace function public.cancel_operator_agency_grant(
  p_grant_id            uuid,
  p_immediate           boolean default true,
  p_cancellation_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid;
begin
  if not public.user_is_root_operator() then
    raise exception 'Permission denied';
  end if;

  if nullif(trim(coalesce(p_cancellation_reason, '')), '') is null then
    raise exception 'Cancellation reason is required';
  end if;

  select account_id into v_account_id
  from public.operator_agency_grants
  where id = p_grant_id
    and payment_status in ('draft', 'pending_checkout', 'pending_payment', 'active');

  if v_account_id is null then
    raise exception 'Grant not found or already cancelled/expired';
  end if;

  if coalesce(p_immediate, true) then
    update public.operator_agency_grants
    set payment_status       = 'cancelled',
        cancelled_by_user_id = auth.uid(),
        cancelled_at         = now(),
        cancellation_reason  = p_cancellation_reason,
        updated_at           = now()
    where id = p_grant_id;

    -- Downgrade account plan back to starter
    update public.accounts
    set subscription_plan   = 'starter',
        subscription_status = null
    where id = v_account_id;
  else
    -- Non-immediate: mark end date as today so grace period handles it
    update public.operator_agency_grants
    set subscription_end     = current_date,
        cancelled_by_user_id = auth.uid(),
        cancelled_at         = now(),
        cancellation_reason  = p_cancellation_reason,
        updated_at           = now()
    where id = p_grant_id;
  end if;

  perform public.log_security_event(
    v_account_id,
    'oa_grant_cancelled',
    'operator_agency_grant',
    p_grant_id,
    jsonb_build_object(
      'immediate', p_immediate,
      'reason', p_cancellation_reason,
      'actor_user_id', auth.uid()
    )
  );
end;
$$;

revoke all  on function public.cancel_operator_agency_grant(uuid, boolean, text) from public;
grant execute on function public.cancel_operator_agency_grant(uuid, boolean, text) to authenticated;

-- ── RPC: root_list_accounts_with_billing ─────────────────────────────────────
-- Root-only. Extended version of root_list_accounts that includes trial and
-- OA grant summary for the admin panel.

create or replace function public.root_list_accounts_with_billing(
  p_root_account_id uuid
)
returns table (
  id                  uuid,
  name                text,
  is_root             boolean,
  is_disabled         boolean,
  subscription_plan   text,
  subscription_status text,
  trial_ends_at       timestamptz,
  trial_source        text,
  oa_payment_status   text,
  oa_subscription_end date,
  oa_unit_count       integer,
  created_at          timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.user_is_root_operator() then
    raise exception 'Permission denied';
  end if;

  if not exists (
    select 1 from public.accounts
    where id = p_root_account_id and coalesce(is_root, false) = true
  ) then
    raise exception 'Not a root account';
  end if;

  return query
  select
    a.id,
    a.name,
    coalesce(a.is_root, false),
    coalesce(a.is_disabled, false),
    a.subscription_plan,
    a.subscription_status,
    a.trial_ends_at,
    a.trial_source,
    oag.payment_status,
    oag.subscription_end,
    oag.unit_count,
    a.created_at
  from public.accounts a
  left join lateral (
    select payment_status, subscription_end, unit_count
    from public.operator_agency_grants
    where account_id = a.id
      and payment_status in ('draft', 'pending_checkout', 'pending_payment', 'active', 'expired')
    order by
      case payment_status
        when 'active'           then 1
        when 'pending_payment'  then 2
        when 'pending_checkout' then 3
        when 'draft'            then 4
        when 'expired'          then 5
        else 9
      end
    limit 1
  ) oag on true
  order by a.created_at desc;
end;
$$;

revoke all  on function public.root_list_accounts_with_billing(uuid) from public;
grant execute on function public.root_list_accounts_with_billing(uuid) to authenticated;

commit;
