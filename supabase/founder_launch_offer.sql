-- =============================================================================
-- Founder Launch Offer Automation v1
-- Tables: launch_offers, launch_offer_redemptions, account_entitlements
-- RPCs:   apply_founder_offer_on_landlord_signup
--         admin_apply_founder_offer_to_account
--         launch_offer_status
-- Helpers: get_account_ai_monthly_limit
-- Seed:   FOUNDER20 offer row
-- =============================================================================

-- ── launch_offers ─────────────────────────────────────────────────────────────

create table if not exists public.launch_offers (
  id                      uuid        primary key default gen_random_uuid(),
  code                    text        unique not null,
  name                    text        not null,
  description             text,
  max_redemptions         integer     not null,
  starts_at               timestamptz not null default now(),
  ends_at                 timestamptz,
  target_plan             text        not null,
  billed_plan             text        not null,
  duration_months         integer,
  monthly_ai_credit_limit integer     not null default 0,
  is_active               boolean     not null default true,
  created_at              timestamptz not null default now(),

  constraint launch_offers_target_plan_check
    check (target_plan in ('starter', 'pro', 'growth', 'operator_agency')),
  constraint launch_offers_billed_plan_check
    check (billed_plan in ('starter', 'pro', 'growth', 'operator_agency')),
  constraint launch_offers_max_redemptions_check
    check (max_redemptions > 0),
  constraint launch_offers_ai_credit_limit_check
    check (monthly_ai_credit_limit >= 0)
);

alter table public.launch_offers enable row level security;

drop policy if exists launch_offers_select_active on public.launch_offers;
create policy launch_offers_select_active
  on public.launch_offers
  for select
  to authenticated
  using (is_active = true);

-- ── launch_offer_redemptions ──────────────────────────────────────────────────

create table if not exists public.launch_offer_redemptions (
  id               uuid        primary key default gen_random_uuid(),
  offer_id         uuid        not null references public.launch_offers(id),
  account_id       uuid        not null references public.accounts(id) on delete cascade,
  user_id          uuid        references auth.users(id),
  email            text        not null,
  normalized_email text        not null,
  signup_source    text        not null default 'app_landlord_signup',
  position         integer     not null,
  status           text        not null default 'redeemed',
  redeemed_at      timestamptz not null default now(),
  cancelled_at     timestamptz,
  created_at       timestamptz not null default now(),

  constraint launch_offer_redemptions_status_check
    check (status in ('redeemed', 'cancelled')),
  constraint launch_offer_redemptions_offer_account_unique
    unique (offer_id, account_id),
  constraint launch_offer_redemptions_offer_position_unique
    unique (offer_id, position)
);

-- Partial unique on email — only one active (non-cancelled) redemption per email per offer
create unique index if not exists launch_offer_redemptions_offer_email_active_uidx
  on public.launch_offer_redemptions (offer_id, normalized_email)
  where status = 'redeemed';

create index if not exists launch_offer_redemptions_offer_status_idx
  on public.launch_offer_redemptions (offer_id, status);

create index if not exists launch_offer_redemptions_account_idx
  on public.launch_offer_redemptions (account_id);

alter table public.launch_offer_redemptions enable row level security;

-- Account managers can view their own redemption
drop policy if exists launch_offer_redemptions_select_managers on public.launch_offer_redemptions;
create policy launch_offer_redemptions_select_managers
  on public.launch_offer_redemptions
  for select
  to authenticated
  using (public.user_can_manage_account(account_id));

-- ── account_entitlements ──────────────────────────────────────────────────────
-- Note: account_entitlements.sql contains SQL functions only — no table conflict.

create table if not exists public.account_entitlements (
  id                      uuid        primary key default gen_random_uuid(),
  account_id              uuid        not null references public.accounts(id) on delete cascade,
  source                  text        not null,
  effective_plan          text        not null,
  billed_plan             text        not null,
  starts_at               timestamptz not null default now(),
  ends_at                 timestamptz,
  monthly_ai_credit_limit integer     not null default 0,
  is_active               boolean     not null default true,
  metadata                jsonb       not null default '{}'::jsonb,
  created_at              timestamptz not null default now(),

  constraint account_entitlements_source_check
    check (source in ('stripe', 'launch_offer', 'manual_admin', 'trial')),
  constraint account_entitlements_effective_plan_check
    check (effective_plan in ('starter', 'pro', 'growth', 'operator_agency')),
  constraint account_entitlements_billed_plan_check
    check (billed_plan in ('starter', 'pro', 'growth', 'operator_agency')),
  constraint account_entitlements_ai_credit_limit_check
    check (monthly_ai_credit_limit >= 0)
);

-- Prevent duplicate active founder entitlements on the same account
create unique index if not exists account_entitlements_active_founder_uidx
  on public.account_entitlements (account_id)
  where is_active = true and source = 'launch_offer';

create index if not exists account_entitlements_account_active_idx
  on public.account_entitlements (account_id, is_active, ends_at);

alter table public.account_entitlements enable row level security;

-- Account managers can view their own entitlements
drop policy if exists account_entitlements_select_managers on public.account_entitlements;
create policy account_entitlements_select_managers
  on public.account_entitlements
  for select
  to authenticated
  using (public.user_can_manage_account(account_id));

-- ── FOUNDER20 seed ────────────────────────────────────────────────────────────

insert into public.launch_offers (
  code,
  name,
  description,
  max_redemptions,
  target_plan,
  billed_plan,
  duration_months,
  monthly_ai_credit_limit,
  is_active
) values (
  'FOUNDER20',
  'Founder 20 Launch Offer',
  'First 20 eligible landlords get Pro-level access for the Starter price for 12 months, including a monthly AI allowance.',
  20,
  'pro',
  'starter',
  12,
  100,
  true
) on conflict (code) do nothing;

-- ── get_account_ai_monthly_limit ──────────────────────────────────────────────
-- Returns the effective monthly AI call limit for an account.
-- Checks for an active account_entitlements row with monthly_ai_credit_limit > 0
-- first; falls back to the plan-based limit otherwise.
-- Amendment 6: only uses entitlement limit when > 0 to prevent accidental lockout.

create or replace function public.get_account_ai_monthly_limit(
  p_account_id uuid
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select ae.monthly_ai_credit_limit
      from   public.account_entitlements ae
      where  ae.account_id = p_account_id
        and  ae.is_active  = true
        and  ae.monthly_ai_credit_limit > 0
        and  ae.starts_at <= now()
        and  (ae.ends_at is null or ae.ends_at > now())
      order by public.account_plan_rank(ae.effective_plan) desc,
               ae.created_at desc
      limit 1
    ),
    public.ai_monthly_call_limit_for_plan(
      public.account_subscription_plan(p_account_id)
    )
  );
$$;

comment on function public.get_account_ai_monthly_limit(uuid) is
  'Returns the effective monthly AI call limit for an account. '
  'Active account_entitlements with monthly_ai_credit_limit > 0 take priority '
  'over the plan-based limit. Falls back to ai_monthly_call_limit_for_plan() '
  'if no qualifying entitlement exists or the entitlement limit is 0.';

revoke all  on function public.get_account_ai_monthly_limit(uuid) from public;
grant execute on function public.get_account_ai_monthly_limit(uuid) to service_role;

-- ── apply_founder_offer_on_landlord_signup ────────────────────────────────────
-- Atomically checks eligibility and applies the FOUNDER20 offer to a new
-- landlord account. Non-blocking: all exceptions are caught and returned as
-- offer_check_failed so account creation is never blocked.
--
-- Guards (DB-side, not frontend-only):
--   1. Caller must be authenticated
--   2. Caller must be the owner of p_account_id (account_member_effective_role)
--   3. Account must not be sandbox/demo
--   4. Account must not be a root account
--   5. Offer must be active and within validity window
--   6. Offer must have remaining slots
--   7. Idempotent: returns existing result if account or email already redeemed

drop function if exists public.apply_founder_offer_on_landlord_signup(text, uuid, uuid, text, text);
create or replace function public.apply_founder_offer_on_landlord_signup(
  p_offer_code   text,
  p_account_id   uuid,
  p_user_id      uuid,
  p_email        text,
  p_signup_source text default 'app_landlord_signup'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_uid      uuid   := auth.uid();
  v_caller_role     text;
  v_normalized      text   := lower(trim(coalesce(p_email, '')));
  v_offer           record;
  v_existing_red    record;
  v_existing_ent    record;
  v_active_count    integer;
  v_position        integer;
  v_remaining       integer;
  v_redemption_id   uuid;
  v_entitlement_id  uuid;
  v_ends_at         timestamptz;
begin
  -- 1. Authentication guard
  if v_caller_uid is null then
    return jsonb_build_object(
      'qualified', false, 'status', 'offer_check_failed',
      'message', 'Not authenticated'
    );
  end if;

  -- 2. Ownership guard — must be the account owner (DB-side, not frontend-passed)
  v_caller_role := public.account_member_effective_role(p_account_id, v_caller_uid);
  if v_caller_role is distinct from 'owner' then
    return jsonb_build_object(
      'qualified', false, 'status', 'not_owner',
      'message', 'Caller is not the owner of this account'
    );
  end if;

  -- 3. Sandbox/demo guard
  if exists (
    select 1
    from   public.account_sandbox_profiles asp
    where  asp.account_id = p_account_id
      and  asp.mode = 'demo'
  ) then
    return jsonb_build_object(
      'qualified', false, 'status', 'sandbox_not_eligible',
      'message', 'Demo accounts do not qualify for the founder offer'
    );
  end if;

  -- 4. Root account guard
  if exists (
    select 1 from public.accounts a
    where  a.id = p_account_id and a.is_root = true
  ) then
    return jsonb_build_object(
      'qualified', false, 'status', 'ineligible_account_type',
      'message', 'Root accounts do not qualify for the founder offer'
    );
  end if;

  -- 6. Advisory lock — serialise slot assignment for this offer code
  perform pg_advisory_xact_lock(hashtext('founder_offer:' || p_offer_code));

  -- 7. Validate offer
  select * into v_offer
  from   public.launch_offers lo
  where  lo.code = p_offer_code
  limit  1;

  if not found then
    return jsonb_build_object(
      'qualified', false, 'status', 'offer_not_found',
      'message', 'Offer not found'
    );
  end if;

  if not v_offer.is_active then
    return jsonb_build_object(
      'qualified', false, 'status', 'offer_inactive',
      'message', 'Offer is not currently active'
    );
  end if;

  if v_offer.ends_at is not null and v_offer.ends_at <= now() then
    return jsonb_build_object(
      'qualified', false, 'status', 'offer_expired',
      'message', 'Offer has expired'
    );
  end if;

  -- 8. Idempotency: account already redeemed
  select * into v_existing_red
  from   public.launch_offer_redemptions lor
  where  lor.offer_id   = v_offer.id
    and  lor.account_id = p_account_id
  limit  1;

  if found then
    -- Return the existing entitlement id if available
    select id into v_entitlement_id
    from   public.account_entitlements ae
    where  ae.account_id = p_account_id
      and  ae.is_active  = true
      and  ae.source     = 'launch_offer'
    limit  1;

    return jsonb_build_object(
      'qualified',       true,
      'status',          v_existing_red.status,
      'position',        v_existing_red.position,
      'remaining_slots', greatest(0, v_offer.max_redemptions - v_existing_red.position),
      'effective_plan',  v_offer.target_plan,
      'billed_plan',     v_offer.billed_plan,
      'entitlement_id',  v_entitlement_id,
      'message',         'Founder offer already applied to this account'
    );
  end if;

  -- 9. Idempotency: active entitlement already exists (belt-and-suspenders)
  select * into v_existing_ent
  from   public.account_entitlements ae
  where  ae.account_id = p_account_id
    and  ae.is_active  = true
    and  ae.source     = 'launch_offer'
  limit  1;

  if found then
    return jsonb_build_object(
      'qualified',       true,
      'status',          'entitlement_already_exists',
      'position',        null,
      'remaining_slots', null,
      'effective_plan',  v_existing_ent.effective_plan,
      'billed_plan',     v_existing_ent.billed_plan,
      'entitlement_id',  v_existing_ent.id,
      'message',         'Active founder entitlement already exists for this account'
    );
  end if;

  -- 10. Duplicate normalized email check
  if exists (
    select 1
    from   public.launch_offer_redemptions lor
    where  lor.offer_id        = v_offer.id
      and  lor.normalized_email = v_normalized
      and  lor.status          = 'redeemed'
  ) then
    return jsonb_build_object(
      'qualified', false, 'status', 'email_already_redeemed',
      'message', 'This email has already been used to claim the founder offer'
    );
  end if;

  -- 11. Count active redemptions and check slot capacity
  select count(*) into v_active_count
  from   public.launch_offer_redemptions lor
  where  lor.offer_id = v_offer.id
    and  lor.status   = 'redeemed';

  if v_active_count >= v_offer.max_redemptions then
    return jsonb_build_object(
      'qualified',       false,
      'status',          'slots_full',
      'remaining_slots', 0,
      'message',         'All founder offer slots have been claimed'
    );
  end if;

  -- 12. Calculate position and remaining
  v_position  := v_active_count + 1;
  v_remaining := v_offer.max_redemptions - v_position;

  -- 13. Calculate entitlement end date
  if v_offer.duration_months is not null then
    v_ends_at := now() + (v_offer.duration_months || ' months')::interval;
  else
    v_ends_at := null;
  end if;

  -- 14. Insert redemption row
  insert into public.launch_offer_redemptions (
    offer_id, account_id, user_id, email, normalized_email,
    signup_source, position, status
  ) values (
    v_offer.id, p_account_id, p_user_id, p_email, v_normalized,
    coalesce(p_signup_source, 'app_landlord_signup'), v_position, 'redeemed'
  ) returning id into v_redemption_id;

  -- 15. Insert entitlement row
  insert into public.account_entitlements (
    account_id, source, effective_plan, billed_plan,
    starts_at, ends_at, monthly_ai_credit_limit, is_active, metadata
  ) values (
    p_account_id,
    'launch_offer',
    v_offer.target_plan,
    v_offer.billed_plan,
    now(),
    v_ends_at,
    v_offer.monthly_ai_credit_limit,
    true,
    jsonb_build_object(
      'offer_code',     p_offer_code,
      'redemption_id',  v_redemption_id,
      'founder_position', v_position,
      'signup_source',  coalesce(p_signup_source, 'app_landlord_signup')
    )
  ) returning id into v_entitlement_id;

  -- 16. Log security event (no PII — no email, no error text)
  begin
    perform public.log_security_event(
      p_account_id,
      'launch_offer_redeemed',
      'launch_offer_redemption',
      v_redemption_id,
      jsonb_build_object(
        'offer_code',        p_offer_code,
        'position',          v_position,
        'remaining_slots',   v_remaining,
        'signup_source',     coalesce(p_signup_source, 'app_landlord_signup')
      )
    );
  exception when others then
    null; -- audit logging must never block the redemption itself
  end;

  return jsonb_build_object(
    'qualified',       true,
    'status',          'redeemed',
    'position',        v_position,
    'remaining_slots', v_remaining,
    'effective_plan',  v_offer.target_plan,
    'billed_plan',     v_offer.billed_plan,
    'entitlement_id',  v_entitlement_id,
    'message',         'Founder offer applied successfully'
  );

exception when others then
  -- Catch-all: log observably, never expose raw error to caller
  begin
    perform public.log_security_event(
      p_account_id,
      'launch_offer_check_failed',
      'launch_offer',
      null,
      jsonb_build_object(
        'offer_code',  p_offer_code,
        'error_code',  sqlstate
      )
    );
  exception when others then
    null; -- if even the fallback log fails, still return gracefully
  end;

  return jsonb_build_object(
    'qualified', false,
    'status',    'offer_check_failed',
    'message',   'Offer check could not be completed'
  );
end;
$$;

comment on function public.apply_founder_offer_on_landlord_signup(text, uuid, uuid, text, text) is
  'Atomically checks eligibility and applies a launch offer to a newly created '
  'landlord account. Non-blocking: all exceptions are caught and returned as '
  'offer_check_failed so account creation is never interrupted. '
  'Guards: authenticated caller, DB-verified account ownership, non-sandbox, '
  'non-root, offer validity, slot availability, email/account idempotency.';

revoke all  on function public.apply_founder_offer_on_landlord_signup(text, uuid, uuid, text, text) from public;
grant execute on function public.apply_founder_offer_on_landlord_signup(text, uuid, uuid, text, text) to authenticated;

-- ── admin_apply_founder_offer_to_account ─────────────────────────────────────
-- Root-only recovery path. Allows a root operator to manually apply the founder
-- offer to a specific account that missed automatic application (e.g. because
-- offer_check_failed was logged after signup).
-- Respects max_redemptions — admin must adjust launch_offers.max_redemptions
-- first if a legitimate override is needed.
-- Logs launch_offer_recovered_by_admin.

drop function if exists public.admin_apply_founder_offer_to_account(text, uuid, text);
create or replace function public.admin_apply_founder_offer_to_account(
  p_offer_code text,
  p_account_id uuid,
  p_reason     text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_uid     uuid := auth.uid();
  v_offer          record;
  v_existing_red   record;
  v_existing_ent   record;
  v_email          text;
  v_normalized     text;
  v_active_count   integer;
  v_position       integer;
  v_remaining      integer;
  v_redemption_id  uuid;
  v_entitlement_id uuid;
  v_ends_at        timestamptz;
begin
  -- Root-only guard
  if not public.user_is_root_operator() then
    raise exception 'admin_apply_founder_offer_to_account: requires root operator';
  end if;

  -- Resolve email from auth.users
  select lower(u.email::text) into v_email
  from   auth.users u
  join   public.account_members am on am.user_id = u.id
  where  am.account_id = p_account_id
    and  public.account_member_effective_role(p_account_id, am.user_id) = 'owner'
  limit  1;

  v_normalized := coalesce(lower(trim(v_email)), '');

  -- Advisory lock
  perform pg_advisory_xact_lock(hashtext('founder_offer:' || p_offer_code));

  -- Validate offer
  select * into v_offer
  from   public.launch_offers lo
  where  lo.code = p_offer_code limit 1;

  if not found then
    raise exception 'Offer not found: %', p_offer_code;
  end if;

  -- Idempotency: account already redeemed
  select * into v_existing_red
  from   public.launch_offer_redemptions lor
  where  lor.offer_id = v_offer.id and lor.account_id = p_account_id
  limit  1;

  if found then
    select id into v_entitlement_id
    from   public.account_entitlements ae
    where  ae.account_id = p_account_id and ae.is_active = true and ae.source = 'launch_offer'
    limit  1;
    return jsonb_build_object(
      'qualified', true, 'status', 'already_redeemed',
      'position', v_existing_red.position, 'entitlement_id', v_entitlement_id,
      'message', 'Account already has a redemption for this offer'
    );
  end if;

  -- Existing active entitlement
  select * into v_existing_ent
  from   public.account_entitlements ae
  where  ae.account_id = p_account_id and ae.is_active = true and ae.source = 'launch_offer'
  limit  1;

  if found then
    return jsonb_build_object(
      'qualified', true, 'status', 'entitlement_already_exists',
      'entitlement_id', v_existing_ent.id,
      'message', 'Active founder entitlement already exists'
    );
  end if;

  -- Slot check (admin respects max_redemptions)
  select count(*) into v_active_count
  from   public.launch_offer_redemptions lor
  where  lor.offer_id = v_offer.id and lor.status = 'redeemed';

  if v_active_count >= v_offer.max_redemptions then
    raise exception 'All slots are full (%). Increase launch_offers.max_redemptions first.', v_offer.max_redemptions;
  end if;

  v_position  := v_active_count + 1;
  v_remaining := v_offer.max_redemptions - v_position;

  if v_offer.duration_months is not null then
    v_ends_at := now() + (v_offer.duration_months || ' months')::interval;
  else
    v_ends_at := null;
  end if;

  insert into public.launch_offer_redemptions (
    offer_id, account_id, user_id, email, normalized_email,
    signup_source, position, status
  )
  select v_offer.id, p_account_id, am.user_id,
         coalesce(v_email, ''), v_normalized,
         'admin_recovery', v_position, 'redeemed'
  from   public.account_members am
  where  am.account_id = p_account_id
    and  public.account_member_effective_role(p_account_id, am.user_id) = 'owner'
  limit  1
  returning id into v_redemption_id;

  -- If no owner found, still insert with null user_id
  if v_redemption_id is null then
    insert into public.launch_offer_redemptions (
      offer_id, account_id, user_id, email, normalized_email,
      signup_source, position, status
    ) values (
      v_offer.id, p_account_id, null, coalesce(v_email, ''), v_normalized,
      'admin_recovery', v_position, 'redeemed'
    ) returning id into v_redemption_id;
  end if;

  insert into public.account_entitlements (
    account_id, source, effective_plan, billed_plan,
    starts_at, ends_at, monthly_ai_credit_limit, is_active, metadata
  ) values (
    p_account_id, 'launch_offer', v_offer.target_plan, v_offer.billed_plan,
    now(), v_ends_at, v_offer.monthly_ai_credit_limit, true,
    jsonb_build_object(
      'offer_code', p_offer_code, 'redemption_id', v_redemption_id,
      'founder_position', v_position, 'signup_source', 'admin_recovery',
      'recovery_reason', coalesce(p_reason, ''),
      'recovered_by', v_caller_uid
    )
  ) returning id into v_entitlement_id;

  -- Log admin recovery event
  begin
    perform public.log_security_event(
      p_account_id,
      'launch_offer_recovered_by_admin',
      'launch_offer_redemption',
      v_redemption_id,
      jsonb_build_object(
        'offer_code',   p_offer_code,
        'position',     v_position,
        'admin_uid',    v_caller_uid,
        'reason',       coalesce(p_reason, '')
      )
    );
  exception when others then
    null;
  end;

  return jsonb_build_object(
    'qualified', true, 'status', 'redeemed',
    'position', v_position, 'remaining_slots', v_remaining,
    'effective_plan', v_offer.target_plan, 'billed_plan', v_offer.billed_plan,
    'entitlement_id', v_entitlement_id,
    'message', 'Founder offer applied via admin recovery'
  );
end;
$$;

comment on function public.admin_apply_founder_offer_to_account(text, uuid, text) is
  'Root-operator-only recovery RPC. Applies a launch offer to an account that '
  'missed automatic redemption. Respects max_redemptions. '
  'Logs launch_offer_recovered_by_admin.';

revoke all  on function public.admin_apply_founder_offer_to_account(text, uuid, text) from public;
grant execute on function public.admin_apply_founder_offer_to_account(text, uuid, text) to authenticated;

-- ── launch_offer_status ───────────────────────────────────────────────────────
-- Root-only admin visibility RPC.

drop function if exists public.launch_offer_status(text);
create or replace function public.launch_offer_status(
  p_offer_code text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_offer         record;
  v_redeemed      integer;
  v_cancelled     integer;
  v_last_redeemed timestamptz;
begin
  if not public.user_is_root_operator() then
    raise exception 'launch_offer_status: requires root operator';
  end if;

  select * into v_offer
  from   public.launch_offers lo
  where  lo.code = p_offer_code limit 1;

  if not found then
    raise exception 'Offer not found: %', p_offer_code;
  end if;

  select
    count(*) filter (where status = 'redeemed'),
    count(*) filter (where status = 'cancelled'),
    max(redeemed_at)  filter (where status = 'redeemed')
  into v_redeemed, v_cancelled, v_last_redeemed
  from public.launch_offer_redemptions lor
  where lor.offer_id = v_offer.id;

  return jsonb_build_object(
    'offer_code',       p_offer_code,
    'offer_name',       v_offer.name,
    'max_redemptions',  v_offer.max_redemptions,
    'redeemed_count',   coalesce(v_redeemed,  0),
    'cancelled_count',  coalesce(v_cancelled, 0),
    'remaining_slots',  greatest(0, v_offer.max_redemptions - coalesce(v_redeemed, 0)),
    'last_redeemed_at', v_last_redeemed,
    'is_active',        v_offer.is_active,
    'ends_at',          v_offer.ends_at
  );
end;
$$;

comment on function public.launch_offer_status(text) is
  'Root-operator-only: returns redemption statistics for a launch offer.';

revoke all  on function public.launch_offer_status(text) from public;
grant execute on function public.launch_offer_status(text) to authenticated;
