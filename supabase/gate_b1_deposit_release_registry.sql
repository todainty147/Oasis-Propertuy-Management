-- Gate-B1: Deposit Dispute Pack authoritative release registry.
-- Additive overlay only.
--
-- Introduces:
--   1. deposit_pack_account_has_entitlement(uuid) — explicit Growth+ entitlement helper
--   2. pack_version column on deposit_dispute_packs
--   3. deposit_pack_release_registry — single authoritative release-state row per pack type
--   4. deposit_pack_release_transitions — append-only approval ledger
--   5. deposit_pack_export_authorisations — durable export-auth event table
--   6. transition_deposit_pack_release_state() — root-only atomic state machine RPC
--   7. prepare_deposit_dispute_pack_export(uuid) — authoritative export-auth gate
--   8. Updated RLS on all deposit pack tables (entitlement + role)
--   9. RLS on new release tables
--
-- Deposit release state starts and remains internal_preview after this file.
-- Do NOT transition to production in this migration.

-- ── 1. Authoritative server-side entitlement helper ────────────────────────
-- Explicit Growth-or-higher check for evidence_vault_dispute_pack.
-- account_feature_required_plan() currently maps this feature to 'starter'
-- (confirmed gap in the Gate-B preflight trace, C-3). This helper is
-- self-contained and does not rely on that function.

create or replace function public.deposit_pack_account_has_entitlement(
  p_account_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select case
    -- Root accounts are operator_agency class and always entitled.
    when exists (
      select 1 from public.accounts a
      where a.id = p_account_id and a.is_root = true
    ) then true
    -- Per-account feature flag override (early-access or manual grant).
    when exists (
      select 1 from public.account_feature_flags f
      where f.account_id = p_account_id
        and f.feature_key = 'evidence_vault_dispute_pack'
        and f.enabled = true
    ) then true
    -- Plan-level: Growth or higher (rank >= 2).
    else public.account_plan_rank(public.account_subscription_plan(p_account_id)) >= 2
  end;
$$;

comment on function public.deposit_pack_account_has_entitlement(uuid) is
  'Returns true when the account may access evidence_vault_dispute_pack. '
  'Requires Growth plan (rank >= 2), a root account, or an explicit '
  'account_feature_flags override. Does not rely on account_feature_required_plan, '
  'which currently maps this feature to starter (Gate-B preflight finding C-3).';

revoke all on function public.deposit_pack_account_has_entitlement(uuid) from public;
grant execute on function public.deposit_pack_account_has_entitlement(uuid) to authenticated;

-- ── 2. Pack version column on deposit_dispute_packs ───────────────────────
-- null = pre_gate_b (created before this overlay was applied).
-- The export-auth RPC classifies null as 'pre_gate_b' in the audit record.

alter table public.deposit_dispute_packs
  add column if not exists pack_version text default null;

-- ── 3. Release registry table ─────────────────────────────────────────────
-- One row per pack type. Direct writes are blocked (no write RLS policy).
-- Only the transition RPC (SECURITY DEFINER) may update this table.

create table if not exists public.deposit_pack_release_registry (
  id         uuid primary key default gen_random_uuid(),
  pack_type  text not null unique,
  release_state text not null default 'internal_preview',
  pack_version  text not null,
  updated_at    timestamptz not null default now(),
  constraint deposit_pack_release_registry_state_check check (
    release_state in ('internal_preview', 'production', 'suspended')
  )
);

-- Seed: Deposit starts at internal_preview. Replay-safe via ON CONFLICT DO NOTHING.
insert into public.deposit_pack_release_registry (pack_type, release_state, pack_version)
values ('deposit_dispute_pack', 'internal_preview', 'gate_b1_v1')
on conflict (pack_type) do nothing;

-- ── 4. Release transitions table (append-only ledger) ─────────────────────
-- No direct-write RLS policy — only the transition RPC may insert.

create table if not exists public.deposit_pack_release_transitions (
  id                    uuid primary key default gen_random_uuid(),
  pack_type             text not null,
  previous_release_state text not null,
  new_release_state     text not null,
  approved_by           uuid not null,
  approved_at           timestamptz not null default now(),
  release_reference     text not null,
  rationale             text,
  pack_version          text not null,
  constraint deposit_pack_release_transitions_prev_state_check check (
    previous_release_state in ('internal_preview', 'production', 'suspended')
  ),
  constraint deposit_pack_release_transitions_new_state_check check (
    new_release_state in ('internal_preview', 'production', 'suspended')
  )
);

create index if not exists idx_deposit_pack_release_transitions_type_ref
  on public.deposit_pack_release_transitions(pack_type, release_reference);

create index if not exists idx_deposit_pack_release_transitions_type_at
  on public.deposit_pack_release_transitions(pack_type, approved_at desc);

-- ── 5. Export authorisations table ────────────────────────────────────────
-- Durable record of each server-authorised print-initiation event.
-- Replaces the non-blocking client-insert pattern from evidence_vault_phase2.sql.
-- The browser cannot prove the OS print dialog completed — we record only what
-- Tenaqo can prove: that the server authorised and initiated the print.

create table if not exists public.deposit_pack_export_authorisations (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references public.accounts(id) on delete cascade,
  pack_id      uuid not null references public.deposit_dispute_packs(id) on delete cascade,
  actor_id     uuid not null,
  pack_type    text not null default 'deposit_dispute_pack',
  pack_version text not null,
  release_mode text not null,
  result       text not null,
  failure_reason text,
  authorised_at  timestamptz not null default now(),
  constraint deposit_pack_export_authorisations_result_check check (
    result in ('print_initiated', 'export_denied')
  ),
  constraint deposit_pack_export_authorisations_release_mode_check check (
    release_mode in ('internal_preview', 'production', 'suspended')
  )
);

create index if not exists idx_deposit_pack_export_auth_account_pack
  on public.deposit_pack_export_authorisations(account_id, pack_id, authorised_at desc);

-- ── 6. Transition RPC (root-only, atomic) ─────────────────────────────────
-- Allowed state machine:
--   internal_preview → production   (go-live)
--   production       → suspended    (emergency halt)
--   suspended        → internal_preview  (downgrade/start-over)
--   suspended        → production   (re-enable after fix)

create or replace function public.transition_deposit_pack_release_state(
  p_pack_type        text,
  p_new_state        text,
  p_release_reference text,
  p_rationale        text,
  p_pack_version     text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id          uuid := auth.uid();
  v_is_root           boolean;
  v_current_state     text;
  v_registry_id       uuid;
  v_existing_new_state text;
  v_clean_pack_type   text := lower(trim(coalesce(p_pack_type, '')));
  v_clean_new_state   text := lower(trim(coalesce(p_new_state, '')));
  v_clean_ref         text := trim(coalesce(p_release_reference, ''));
  v_allowed           boolean := false;
begin
  -- 1. Resolve and validate root membership
  select exists (
    select 1
    from public.accounts a
    join public.account_members am on am.account_id = a.id
    where a.is_root = true
      and am.user_id = v_actor_id
  ) into v_is_root;

  if not v_is_root then
    raise exception 'Only root operators may transition pack release state'
      using errcode = 'P0401';
  end if;

  -- 2. Validate pack_type
  if v_clean_pack_type <> 'deposit_dispute_pack' then
    raise exception 'Unknown pack type: %. Only deposit_dispute_pack is valid in Gate-B1.',
      p_pack_type using errcode = 'P0402';
  end if;

  -- 3. Validate new_state
  if v_clean_new_state not in ('internal_preview', 'production', 'suspended') then
    raise exception 'Invalid release state "%". Must be internal_preview, production, or suspended.',
      p_new_state using errcode = 'P0403';
  end if;

  -- 4. Validate release_reference
  if v_clean_ref = '' then
    raise exception 'release_reference must not be empty'
      using errcode = 'P0405';
  end if;

  -- 5. Check for existing transition with this (pack_type, release_reference)
  --    to enforce idempotency / reject conflicting reuse.
  select new_release_state into v_existing_new_state
  from public.deposit_pack_release_transitions
  where pack_type = v_clean_pack_type
    and release_reference = v_clean_ref
  limit 1;

  if found then
    if v_existing_new_state = v_clean_new_state then
      -- Idempotent replay: same reference, same target state — return current registry.
      select id, release_state into v_registry_id, v_current_state
      from public.deposit_pack_release_registry
      where pack_type = v_clean_pack_type;

      return jsonb_build_object(
        'idempotent',       true,
        'pack_type',        v_clean_pack_type,
        'release_state',    v_current_state,
        'pack_version',     coalesce(p_pack_version, 'unknown'),
        'release_reference', v_clean_ref
      );
    else
      raise exception
        'Release reference "%" was previously used for a transition to %, '
        'not %. Conflicting reference reuse is rejected.',
        v_clean_ref, v_existing_new_state, v_clean_new_state
        using errcode = 'P0406';
    end if;
  end if;

  -- 6. Lock current registry row (prevents concurrent transitions)
  select id, release_state into v_registry_id, v_current_state
  from public.deposit_pack_release_registry
  where pack_type = v_clean_pack_type
  for update;

  if not found then
    raise exception 'No release registry row found for pack type "%"', p_pack_type
      using errcode = 'P0407';
  end if;

  -- 7. Validate against allowed state machine
  v_allowed := case v_current_state
    when 'internal_preview' then v_clean_new_state in ('production')
    when 'production'       then v_clean_new_state in ('suspended')
    when 'suspended'        then v_clean_new_state in ('internal_preview', 'production')
    else false
  end;

  if not v_allowed then
    raise exception
      'Transition from % to % is not permitted for deposit_dispute_pack. '
      'Allowed: internal_preview→production, production→suspended, '
      'suspended→internal_preview or suspended→production.',
      v_current_state, v_clean_new_state
      using errcode = 'P0408';
  end if;

  -- 8. Append transition event (atomic with registry update in same transaction)
  insert into public.deposit_pack_release_transitions (
    pack_type, previous_release_state, new_release_state,
    approved_by, release_reference, rationale, pack_version
  ) values (
    v_clean_pack_type, v_current_state, v_clean_new_state,
    v_actor_id, v_clean_ref,
    p_rationale,
    coalesce(p_pack_version, 'unknown')
  );

  -- 9. Update registry
  update public.deposit_pack_release_registry
  set release_state = v_clean_new_state,
      pack_version  = coalesce(p_pack_version, pack_version),
      updated_at    = now()
  where id = v_registry_id;

  return jsonb_build_object(
    'idempotent',       false,
    'pack_type',        v_clean_pack_type,
    'previous_state',   v_current_state,
    'release_state',    v_clean_new_state,
    'pack_version',     coalesce(p_pack_version, 'unknown'),
    'release_reference', v_clean_ref,
    'approved_by',      v_actor_id::text
  );
end;
$$;

comment on function public.transition_deposit_pack_release_state(text, text, text, text, text) is
  'Root-only atomic pack release state transition. '
  'Validates state machine, is idempotent for the same release_reference, '
  'rejects conflicting reference reuse, and writes an append-only audit event '
  'atomically with the registry update. '
  'State machine: internal_preview→production, production→suspended, '
  'suspended→internal_preview/production.';

revoke all on function public.transition_deposit_pack_release_state(text, text, text, text, text) from public;
grant execute on function public.transition_deposit_pack_release_state(text, text, text, text, text) to authenticated;

-- ── 7. Export authorisation RPC ───────────────────────────────────────────
-- The frontend MUST call this before invoking window.print().
-- On failure: the caller must show a visible error and NOT call window.print().
-- On success: caller receives the authorised payload and may call window.print().
--
-- Access model:
--   production state → entitled (Growth+) managers may export
--   internal_preview  → root operators only (explicit internal preview path)
--   suspended         → all actors denied

create or replace function public.prepare_deposit_dispute_pack_export(
  p_pack_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id          uuid := auth.uid();
  v_account_id        uuid;
  v_pack_status       text;
  v_pack_version_col  text;
  v_release_state     text;
  v_registry_version  text;
  v_is_root           boolean;
  v_historical_version text;
  v_auth_id           uuid;
begin
  -- 1. Resolve pack → account
  select account_id, status, pack_version
  into v_account_id, v_pack_status, v_pack_version_col
  from public.deposit_dispute_packs
  where id = p_pack_id;

  if not found then
    raise exception 'Deposit dispute pack not found'
      using errcode = 'P0001';
  end if;

  if v_pack_status = 'archived' then
    raise exception 'An archived dispute pack cannot be exported'
      using errcode = 'P0002';
  end if;

  -- 2. Enforce role: must be account manager
  if not public.user_can_manage_account(v_account_id) then
    raise exception 'Not authorised to manage this account'
      using errcode = 'P0401';
  end if;

  -- 3. Enforce effective feature entitlement
  if not public.deposit_pack_account_has_entitlement(v_account_id) then
    raise exception
      'Account does not have the evidence_vault_dispute_pack entitlement. '
      'Growth plan or higher is required.'
      using errcode = 'P0402';
  end if;

  -- 4. Resolve release state
  select release_state, pack_version
  into v_release_state, v_registry_version
  from public.deposit_pack_release_registry
  where pack_type = 'deposit_dispute_pack';

  if not found then
    raise exception 'Deposit pack release registry is not initialised'
      using errcode = 'P0500';
  end if;

  -- 5. Check if actor is a root operator (enables internal preview path)
  select exists (
    select 1
    from public.accounts a
    join public.account_members am on am.account_id = a.id
    where a.is_root = true
      and am.user_id = v_actor_id
  ) into v_is_root;

  -- 6. Enforce release state gate
  --    suspended: all actors denied
  --    internal_preview: root-only explicit internal preview
  --    production: any entitled manager
  if v_release_state = 'suspended' then
    raise exception 'Deposit dispute pack export is currently suspended'
      using errcode = 'P0403';
  end if;

  if v_release_state = 'internal_preview' and not v_is_root then
    raise exception
      'Deposit dispute pack export is in internal preview only and '
      'is not yet available for customer production use'
      using errcode = 'P0404';
  end if;

  -- 7. Resolve pack version / historical classification
  v_historical_version := coalesce(v_pack_version_col, 'pre_gate_b');

  -- 8. Write durable export authorisation record
  --    Records what Tenaqo can prove: that the server authorised and
  --    initiated the print event. NOT that a PDF was saved to disk.
  insert into public.deposit_pack_export_authorisations (
    account_id,
    pack_id,
    actor_id,
    pack_type,
    pack_version,
    release_mode,
    result
  ) values (
    v_account_id,
    p_pack_id,
    v_actor_id,
    'deposit_dispute_pack',
    v_historical_version,
    v_release_state,
    'print_initiated'
  )
  returning id into v_auth_id;

  -- 9. Return authorisation payload
  return jsonb_build_object(
    'authorisation_id', v_auth_id::text,
    'pack_id',          p_pack_id::text,
    'account_id',       v_account_id::text,
    'release_mode',     v_release_state,
    'pack_version',     v_historical_version,
    'is_root_preview',  v_is_root,
    'result',           'print_initiated'
  );
end;
$$;

comment on function public.prepare_deposit_dispute_pack_export(uuid) is
  'Server-side export authorisation gate for the Deposit Dispute Pack. '
  'Enforces: (1) role — user_can_manage_account; '
  '(2) plan entitlement — deposit_pack_account_has_entitlement (Growth+); '
  '(3) release state — production for customers, internal_preview for root only, '
  'suspended blocks all. '
  'Writes a durable audit record recording only what Tenaqo can prove: '
  'that the server authorised and initiated a print event (not that a PDF was saved). '
  'The caller must receive a successful result before invoking window.print().';

revoke all on function public.prepare_deposit_dispute_pack_export(uuid) from public;
grant execute on function public.prepare_deposit_dispute_pack_export(uuid) to authenticated;

-- ── 8. Updated RLS for deposit pack workspace access ──────────────────────
-- Entitlement check added alongside the existing role check.
-- Pattern: entitlement + role govern workspace access.
-- Release state governs export/print (enforced in the RPC above, not here).

-- 8a. deposit_dispute_packs
drop policy if exists "Managers manage deposit dispute packs" on public.deposit_dispute_packs;
create policy "Managers manage deposit dispute packs" on public.deposit_dispute_packs
  for all to authenticated
  using (
    public.user_can_manage_account(account_id)
    and public.deposit_pack_account_has_entitlement(account_id)
  )
  with check (
    public.user_can_manage_account(account_id)
    and public.deposit_pack_account_has_entitlement(account_id)
  );

-- 8b. deposit_dispute_pack_items
drop policy if exists "Managers manage deposit dispute pack items" on public.deposit_dispute_pack_items;
create policy "Managers manage deposit dispute pack items" on public.deposit_dispute_pack_items
  for all to authenticated
  using (
    public.user_can_manage_account(account_id)
    and public.deposit_pack_account_has_entitlement(account_id)
  )
  with check (
    public.user_can_manage_account(account_id)
    and public.deposit_pack_account_has_entitlement(account_id)
  );

-- 8c. deposit_dispute_pack_exports (legacy export table; no new inserts expected)
drop policy if exists "Managers manage deposit dispute pack exports" on public.deposit_dispute_pack_exports;
create policy "Managers manage deposit dispute pack exports" on public.deposit_dispute_pack_exports
  for all to authenticated
  using (
    public.user_can_manage_account(account_id)
    and public.deposit_pack_account_has_entitlement(account_id)
  )
  with check (
    public.user_can_manage_account(account_id)
    and public.deposit_pack_account_has_entitlement(account_id)
  );

-- 8d. deposit_dispute_pack_audit_events
drop policy if exists "Managers read deposit dispute pack audit events" on public.deposit_dispute_pack_audit_events;
create policy "Managers read deposit dispute pack audit events" on public.deposit_dispute_pack_audit_events
  for select to authenticated
  using (
    public.user_can_manage_account(account_id)
    and public.deposit_pack_account_has_entitlement(account_id)
  );

drop policy if exists "Managers insert deposit dispute pack audit events" on public.deposit_dispute_pack_audit_events;
create policy "Managers insert deposit dispute pack audit events" on public.deposit_dispute_pack_audit_events
  for insert to authenticated
  with check (
    public.user_can_manage_account(account_id)
    and public.deposit_pack_account_has_entitlement(account_id)
  );

-- ── 9. RLS for new release tables ─────────────────────────────────────────
-- Direct writes to all three new tables are blocked (no write RLS policy).
-- Inserts/updates occur only via SECURITY DEFINER RPCs.

-- Release registry: readable by all authenticated (state is not a secret).
alter table public.deposit_pack_release_registry enable row level security;

drop policy if exists "Authenticated users read deposit pack release registry" on public.deposit_pack_release_registry;
create policy "Authenticated users read deposit pack release registry"
  on public.deposit_pack_release_registry
  for select to authenticated using (true);

-- Release transitions: readable by root operators only (approval audit).
alter table public.deposit_pack_release_transitions enable row level security;

drop policy if exists "Root operators read deposit pack release transitions" on public.deposit_pack_release_transitions;
create policy "Root operators read deposit pack release transitions"
  on public.deposit_pack_release_transitions
  for select to authenticated
  using (
    exists (
      select 1
      from public.accounts a
      join public.account_members am on am.account_id = a.id
      where a.is_root = true
        and am.user_id = auth.uid()
    )
  );

-- Export authorisations: readable by entitled account managers.
alter table public.deposit_pack_export_authorisations enable row level security;

drop policy if exists "Managers read deposit pack export authorisations" on public.deposit_pack_export_authorisations;
create policy "Managers read deposit pack export authorisations"
  on public.deposit_pack_export_authorisations
  for select to authenticated
  using (
    public.user_can_manage_account(account_id)
    and public.deposit_pack_account_has_entitlement(account_id)
  );

-- ── 10. Grants ────────────────────────────────────────────────────────────
-- New tables: SELECT only for authenticated — writes via SECURITY DEFINER RPCs.
-- Existing deposit pack tables: SELECT/INSERT/UPDATE/DELETE unchanged from
-- evidence_vault_phase2.sql; RLS policies above are now the access gate.

grant select on public.deposit_pack_release_registry       to authenticated;
grant select on public.deposit_pack_release_transitions    to authenticated;
grant select on public.deposit_pack_export_authorisations  to authenticated;
