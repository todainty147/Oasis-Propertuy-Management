-- Gate-B1G: Release Registry + Transition Ledger Write Guard
-- Additive overlay — do NOT edit gate_b1_deposit_release_registry.sql or any applied unit.
--
-- Background: Gate-B-ENT triage found that deposit_pack_release_registry and
-- deposit_pack_release_transitions had SELECT-only RLS and no trigger-level write
-- protection. A direct psql UPDATE as the postgres role could silently advance the
-- release state without any ledger record. This file closes that gap.
--
-- Mechanism (unspoofable nonce):
--   The transition RPC calls _guard.open_transition_window() before writing.
--   That function inserts a per-(backend_pid, txid) nonce into a private table.
--   BEFORE triggers on both tables call _guard.is_transition_authorized() which
--   validates the nonce. The setter is REVOKE'd from service_role and authenticated,
--   so only the RPC (SECURITY DEFINER, runs as postgres/owner) can open the window.
--   postgres itself can insert into _guard.transition_authorisation as table owner,
--   but this requires deliberate extra steps — a lone direct UPDATE is still blocked.
--
-- Remaining break-glass path:
--   Only roles with rolreplication=true (currently: postgres) can set
--   session_replication_role = 'replica', which disables ALL triggers.
--   This is the SOLE documented emergency bypass. See runbook procedure 3.
--   service_role, authenticated, and anon have rolreplication=false and cannot use it.
--
-- Also in this file:
--   - Replaces transition_deposit_pack_release_state: removes prefix allowlist (PO RULING 1),
--     adds _guard.open_transition_window() call before writes.
--
-- NOT in this file:
--   - prepare_deposit_dispute_pack_export is corrected in gate_b_ent_deposit_export_fix.sql
--     (separate additive overlay applied before this one).

begin;

-- ── 0. Prerequisite guard ─────────────────────────────────────────────────────

do $$
begin
  if not exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = 'deposit_pack_release_registry'
  ) then
    raise exception
      'gate_b1g_release_guard.sql requires gate_b1_deposit_release_registry.sql '
      'to be applied first.';
  end if;
end;
$$;

-- ── 1. Private guard schema ───────────────────────────────────────────────────

create schema if not exists _guard;
revoke all on schema _guard from public;
revoke all on schema _guard from anon;
revoke all on schema _guard from authenticated;
revoke all on schema _guard from service_role;

-- ── 2. Per-transaction authorisation table ─────────────────────────────────────
-- Keyed by (backend_pid, txid_current()). A valid row proves that the current
-- transaction was started by the authorised RPC, not by a direct caller.
-- Only the SECURITY DEFINER setter can insert; table is not exposed to PostgREST.

create table if not exists _guard.transition_authorisation (
  backend_pid  integer      not null,
  txid         bigint       not null,
  pack_type    text         not null,
  new_state    text         not null,
  created_at   timestamptz  not null default now(),
  primary key (backend_pid, txid)
);

revoke all on table _guard.transition_authorisation from public;
revoke all on table _guard.transition_authorisation from anon;
revoke all on table _guard.transition_authorisation from authenticated;
revoke all on table _guard.transition_authorisation from service_role;

-- ── 3. Private SECURITY DEFINER setter ───────────────────────────────────────
-- Called exclusively by the transition RPC which runs as postgres (SECURITY DEFINER).
-- EXECUTE is REVOKE'd from service_role and authenticated so they cannot forge a nonce.
-- postgres owns this function and retains EXECUTE as table owner despite the revoke.

create or replace function _guard.open_transition_window(
  p_pack_type  text,
  p_new_state  text
)
returns void
language plpgsql
security definer
set search_path = _guard
as $$
begin
  -- Evict any stale nonce from a prior aborted transaction on this backend.
  delete from _guard.transition_authorisation
  where backend_pid = pg_backend_pid()
    and txid        <> txid_current();

  insert into _guard.transition_authorisation (backend_pid, txid, pack_type, new_state)
  values (pg_backend_pid(), txid_current(), p_pack_type, p_new_state)
  on conflict (backend_pid, txid) do update
    set pack_type  = excluded.pack_type,
        new_state  = excluded.new_state,
        created_at = now();
end;
$$;

revoke all     on function _guard.open_transition_window(text, text) from public;
revoke execute on function _guard.open_transition_window(text, text) from anon;
revoke execute on function _guard.open_transition_window(text, text) from authenticated;
revoke execute on function _guard.open_transition_window(text, text) from service_role;

-- ── 4. Private SECURITY DEFINER validator ─────────────────────────────────────
-- Called from trigger functions (which run as postgres/owner via SECURITY DEFINER).
-- EXECUTE is REVOKE'd from app roles; trigger functions call it as the function owner.

create or replace function _guard.is_transition_authorized(
  p_pack_type  text,
  p_new_state  text
)
returns boolean
language sql
security definer
set search_path = _guard
as $$
  select exists (
    select 1 from _guard.transition_authorisation
    where backend_pid = pg_backend_pid()
      and txid        = txid_current()
      and pack_type   = p_pack_type
      and new_state   = p_new_state
  );
$$;

revoke all     on function _guard.is_transition_authorized(text, text) from public;
revoke execute on function _guard.is_transition_authorized(text, text) from anon;
revoke execute on function _guard.is_transition_authorized(text, text) from authenticated;
revoke execute on function _guard.is_transition_authorized(text, text) from service_role;

-- ── 5. Registry guard trigger function ────────────────────────────────────────

create or replace function _guard.tg_registry_write_guard()
returns trigger
language plpgsql
security definer
set search_path = _guard
as $$
begin
  if tg_op = 'INSERT' then
    -- Allow bootstrap seeds only at internal_preview.
    -- Prevents direct seeding at production or suspended by any caller.
    if new.release_state in ('production', 'suspended') then
      raise exception
        'Gate-B1G: direct INSERT into deposit_pack_release_registry at state "%" is '
        'denied. Bootstrap seeds must start at internal_preview. '
        'Use transition_deposit_pack_release_state() RPC to reach production or suspended.',
        new.release_state
        using errcode = 'P0G01';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if not _guard.is_transition_authorized(new.pack_type, new.release_state) then
      raise exception
        'Gate-B1G: direct UPDATE of deposit_pack_release_registry is denied '
        '(pack_type=%, new_state=%). Use transition_deposit_pack_release_state() RPC.',
        new.pack_type, new.release_state
        using errcode = 'P0G02';
    end if;
    -- Immutable columns: id and pack_type may not be altered by a transition.
    if old.id       is distinct from new.id
    or old.pack_type is distinct from new.pack_type
    then
      raise exception
        'Gate-B1G: transition may not alter id or pack_type (immutable columns).'
        using errcode = 'P0G03';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    raise exception
      'Gate-B1G: DELETE from deposit_pack_release_registry is denied. '
      'Registry rows are permanent. For local test cleanup see the break-glass runbook '
      '(session_replication_role = replica, postgres credentials required).'
      using errcode = 'P0G04';
  end if;

  return null;
end;
$$;

revoke all     on function _guard.tg_registry_write_guard() from public;
revoke execute on function _guard.tg_registry_write_guard() from anon, authenticated, service_role;

-- ── 6. Ledger guard trigger function ──────────────────────────────────────────

create or replace function _guard.tg_ledger_write_guard()
returns trigger
language plpgsql
security definer
set search_path = _guard
as $$
begin
  if tg_op = 'INSERT' then
    if not _guard.is_transition_authorized(new.pack_type, new.new_release_state) then
      raise exception
        'Gate-B1G: direct INSERT into deposit_pack_release_transitions is denied. '
        'Use transition_deposit_pack_release_state() RPC.'
        using errcode = 'P0G05';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    raise exception
      'Gate-B1G: deposit_pack_release_transitions is append-only — UPDATE is denied.'
      using errcode = 'P0G06';
  end if;

  if tg_op = 'DELETE' then
    raise exception
      'Gate-B1G: deposit_pack_release_transitions is append-only — DELETE is denied.'
      using errcode = 'P0G07';
  end if;

  return null;
end;
$$;

revoke all     on function _guard.tg_ledger_write_guard() from public;
revoke execute on function _guard.tg_ledger_write_guard() from anon, authenticated, service_role;

-- ── 7. Install triggers (idempotent: drop-if-exists then create) ──────────────

drop trigger if exists trg_b1g_registry_write_guard on public.deposit_pack_release_registry;
create trigger trg_b1g_registry_write_guard
  before insert or update or delete
  on public.deposit_pack_release_registry
  for each row execute function _guard.tg_registry_write_guard();

drop trigger if exists trg_b1g_ledger_write_guard on public.deposit_pack_release_transitions;
create trigger trg_b1g_ledger_write_guard
  before insert or update or delete
  on public.deposit_pack_release_transitions
  for each row execute function _guard.tg_ledger_write_guard();

-- ── 8. Replace transition_deposit_pack_release_state ──────────────────────────
-- Changes from Gate-B-ENT version:
--   REMOVED: the prefix check on pack_type that violated PO RULING 1.
--            Naming-convention guards are not authorisation.
--   ADDED:   _guard.open_transition_window() call at step 8 before any writes.
--   CHANGED: pack_type validated via registry lookup only (P0407 if not found);
--            no hardcoded pack type names anywhere in this function.

create or replace function public.transition_deposit_pack_release_state(
  p_pack_type          text,
  p_new_state          text,
  p_release_reference  text,
  p_rationale          text,
  p_pack_version       text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id            uuid  := auth.uid();
  v_is_root             boolean;
  v_current_state       text;
  v_registry_id         uuid;
  v_existing_new_state  text;
  v_clean_pack_type     text  := lower(trim(coalesce(p_pack_type, '')));
  v_clean_new_state     text  := lower(trim(coalesce(p_new_state, '')));
  v_clean_ref           text  := trim(coalesce(p_release_reference, ''));
  v_allowed             boolean := false;
begin
  -- 1. Resolve and validate root membership.
  select exists (
    select 1
    from public.accounts a
    join public.account_members am on am.account_id = a.id
    where a.is_root    = true
      and am.user_id   = v_actor_id
  ) into v_is_root;

  if not v_is_root then
    raise exception 'Only root operators may transition pack release state'
      using errcode = 'P0401';
  end if;

  -- 2. pack_type non-empty check (registry lookup at step 6 proves it is registered).
  if v_clean_pack_type = '' then
    raise exception 'pack_type must not be empty'
      using errcode = 'P0402';
  end if;

  -- 3. Validate new_state enum.
  if v_clean_new_state not in ('internal_preview', 'production', 'suspended') then
    raise exception
      'Invalid release state "%". Must be internal_preview, production, or suspended.',
      p_new_state
      using errcode = 'P0403';
  end if;

  -- 4. release_reference non-empty.
  if v_clean_ref = '' then
    raise exception 'release_reference must not be empty'
      using errcode = 'P0405';
  end if;

  -- 5. Idempotency: check if (pack_type, release_reference) already used.
  select new_release_state into v_existing_new_state
  from public.deposit_pack_release_transitions
  where pack_type         = v_clean_pack_type
    and release_reference = v_clean_ref
  limit 1;

  if found then
    if v_existing_new_state = v_clean_new_state then
      select id, release_state into v_registry_id, v_current_state
      from public.deposit_pack_release_registry
      where pack_type = v_clean_pack_type;
      return jsonb_build_object(
        'idempotent',        true,
        'pack_type',         v_clean_pack_type,
        'release_state',     v_current_state,
        'pack_version',      coalesce(p_pack_version, 'unknown'),
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

  -- 6. Lock registry row; implicitly validates that pack_type is registered.
  select id, release_state
  into   v_registry_id, v_current_state
  from   public.deposit_pack_release_registry
  where  pack_type = v_clean_pack_type
  for update;

  if not found then
    raise exception
      'No release registry row found for pack type "%". '
      'Register the pack type first (bootstrap seed or additive SQL overlay).',
      p_pack_type
      using errcode = 'P0407';
  end if;

  -- 7. Validate state machine transition.
  v_allowed := case v_current_state
    when 'internal_preview' then v_clean_new_state in ('production')
    when 'production'       then v_clean_new_state in ('suspended')
    when 'suspended'        then v_clean_new_state in ('internal_preview', 'production')
    else false
  end;

  if not v_allowed then
    raise exception
      'Transition from % to % is not permitted. '
      'Allowed: internal_preview->production, production->suspended, '
      'suspended->internal_preview or suspended->production.',
      v_current_state, v_clean_new_state
      using errcode = 'P0408';
  end if;

  -- 8. Open guard authorisation window (per-backend_pid/txid nonce in _guard schema).
  --    Triggers on deposit_pack_release_transitions and deposit_pack_release_registry
  --    will validate this nonce before permitting the next two writes.
  perform _guard.open_transition_window(v_clean_pack_type, v_clean_new_state);

  -- 9. Append transition event (trigger validates nonce).
  insert into public.deposit_pack_release_transitions (
    pack_type, previous_release_state, new_release_state,
    approved_by, release_reference, rationale, pack_version
  ) values (
    v_clean_pack_type, v_current_state, v_clean_new_state,
    v_actor_id, v_clean_ref,
    p_rationale,
    coalesce(p_pack_version, 'unknown')
  );

  -- 10. Update registry (trigger validates nonce).
  update public.deposit_pack_release_registry
  set release_state = v_clean_new_state,
      pack_version  = coalesce(p_pack_version, pack_version),
      updated_at    = now()
  where id = v_registry_id;

  return jsonb_build_object(
    'idempotent',        false,
    'pack_type',         v_clean_pack_type,
    'previous_state',    v_current_state,
    'release_state',     v_clean_new_state,
    'pack_version',      coalesce(p_pack_version, 'unknown'),
    'release_reference', v_clean_ref,
    'approved_by',       v_actor_id::text
  );
end;
$$;

comment on function public.transition_deposit_pack_release_state(text, text, text, text, text) is
  'Root-only atomic pack release state transition. '
  'Gate-B1G: prefix allowlist removed (PO RULING 1); pack type validated via registry '
  'lookup only. Opens _guard.transition_authorisation window before writes so the '
  'BEFORE triggers on deposit_pack_release_registry and deposit_pack_release_transitions '
  'permit exactly the two writes this RPC performs. Direct writes from any role are '
  'blocked while the guard is enabled. '
  'State machine: internal_preview->production, production->suspended, '
  'suspended->internal_preview or suspended->production.';

revoke all     on function public.transition_deposit_pack_release_state(text, text, text, text, text) from public;
grant  execute on function public.transition_deposit_pack_release_state(text, text, text, text, text) to authenticated;

commit;
