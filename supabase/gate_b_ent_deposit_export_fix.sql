-- gate_b_ent_deposit_export_fix.sql
-- Corrective overlay for a runtime-breaking defect introduced in Gate-B-ENT (commit 0ea0601).
--
-- Defect: gate_b_ent_effective_feature_resolver.sql rewrote prepare_deposit_dispute_pack_export
-- with INSERT column names that do not exist in deposit_pack_export_authorisations:
--
--   WRONG (Gate-B-ENT):  authorised_by, release_state_at_export, pack_version_at_export
--   CORRECT (Gate-B1):   actor_id, release_mode, pack_version
--                         (+ account_id, pack_type, result which were also dropped)
--
-- Detection: Gate-B1 regression suite tests T-07, T-08, T-09 fail with
-- "column authorised_by of relation deposit_pack_export_authorisations does not exist"
-- against the Gate-B-ENT working tree. These tests were not run at Gate-B-ENT approval time.
--
-- Also corrects: the prefix allowlist (PO RULING 1 violation) on p_registry_pack_type.
-- Registry lookup at step 4 provides the authoritative pack-type check (P0500 if missing).
--
-- Also corrects: semantic break in account_feature_flags for evidence_vault_dispute_pack.
-- evidence_vault_phase2.sql seeded enabled=false for all accounts as a dark-launch kill-switch.
-- Gate-B-ENT replaced deposit_pack_account_has_entitlement to use account_has_effective_feature,
-- which treats enabled=false as an explicit DENY overriding plan rank. The seed rows were
-- never intended as account-level denies; they were dark-launch placeholders.
-- Fix: delete only the legacy seed rows (enabled=false AND created_by IS NULL).
-- After removal, accounts with no flag row fall through to plan-rank evaluation:
--   Growth/Pro → allowed (plan_rank >= growth)  |  Starter → denied
-- Admin-created rows (created_by IS NOT NULL) are preserved as intentional overrides.
--
-- Gate-B1 regression baseline:
--   Before this overlay: T-07/T-08/T-09 fail (column mismatch), T-01/T-02/T-06/T-12/T-17
--                        also fail (enabled=false flag semantic break) → 9/17 pass
--   After this overlay:  all 17/17 pass

begin;

do $$
begin
  if not exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = 'deposit_pack_export_authorisations'
  ) then
    raise exception
      'gate_b_ent_deposit_export_fix.sql requires gate_b1_deposit_release_registry.sql '
      'to be applied first.';
  end if;
end;
$$;

-- ── Corrective data fix: evidence_vault_dispute_pack legacy seed removal ─────
-- Deletes ONLY the rows seeded by evidence_vault_phase2.sql (enabled=false, created_by IS NULL).
-- Fingerprint: the seed script inserts with created_by = null (literal NULL).
-- No application RPC inserts account_feature_flags with created_by = NULL; only seed scripts
-- use that pattern. Therefore (enabled=false AND created_by IS NULL) ↔ seed row only.
-- Idempotent: if already deleted, this is a no-op. Safe to re-apply.
delete from public.account_feature_flags
where  feature_key = 'evidence_vault_dispute_pack'
  and  enabled     = false
  and  created_by  is null;

-- Report remaining flag counts for this feature.
do $$
declare
  v_explicit_deny  integer;
  v_explicit_grant integer;
begin
  select
    count(*) filter (where not enabled),
    count(*) filter (where enabled)
  into v_explicit_deny, v_explicit_grant
  from public.account_feature_flags
  where feature_key = 'evidence_vault_dispute_pack';
  raise notice
    'gate_b_ent_deposit_export_fix: evidence_vault_dispute_pack after seed removal — '
    '% explicit grant(s), % explicit deny(ies) (admin-created only, if any).',
    v_explicit_grant, v_explicit_deny;
end;
$$;

create or replace function public.prepare_deposit_dispute_pack_export(
  p_pack_id             uuid,
  p_registry_pack_type  text  default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id            uuid  := auth.uid();
  v_account_id          uuid;
  v_pack_status         text;
  v_pack_version_col    text;
  v_release_state       text;
  v_registry_version    text;
  v_is_root             boolean;
  v_historical_version  text;
  v_auth_id             uuid;
  v_resolved_pack_type  text  := coalesce(
    nullif(trim(coalesce(p_registry_pack_type, '')), ''),
    'deposit_dispute_pack'
  );
begin
  -- 1. Resolve pack -> account.
  select account_id, status, pack_version
  into   v_account_id, v_pack_status, v_pack_version_col
  from   public.deposit_dispute_packs
  where  id = p_pack_id;

  if not found then
    raise exception 'Deposit dispute pack not found' using errcode = 'P0001';
  end if;

  if v_pack_status = 'archived' then
    raise exception 'An archived dispute pack cannot be exported' using errcode = 'P0002';
  end if;

  -- 2. Enforce role: must be account manager.
  if not public.user_can_manage_account(v_account_id) then
    raise exception 'Not authorised to manage this account' using errcode = 'P0401';
  end if;

  -- 3. Enforce effective feature entitlement.
  if not public.deposit_pack_account_has_entitlement(v_account_id) then
    raise exception
      'Account does not have the evidence_vault_dispute_pack entitlement. '
      'Growth plan or higher is required.'
      using errcode = 'P0402';
  end if;

  -- 4. Resolve release state from target registry row.
  --    Registry lookup validates pack type (P0500 if not registered).
  --    No prefix allowlist — the registry row IS the authoritative validator.
  select release_state, pack_version
  into   v_release_state, v_registry_version
  from   public.deposit_pack_release_registry
  where  pack_type = v_resolved_pack_type;

  if not found then
    raise exception
      'Deposit pack release registry is not initialised for pack type "%".',
      v_resolved_pack_type
      using errcode = 'P0500';
  end if;

  -- 5. Check root operator status (enables internal preview path).
  select exists (
    select 1
    from   public.accounts a
    join   public.account_members am on am.account_id = a.id
    where  a.is_root  = true
      and  am.user_id = v_actor_id
  ) into v_is_root;

  -- 6. State gate.
  if v_release_state = 'suspended' then
    raise exception
      'Deposit dispute pack export is currently suspended.'
      using errcode = 'P0501';
  end if;

  if v_release_state = 'internal_preview' and not v_is_root then
    raise exception
      'Deposit dispute pack is in internal preview. '
      'Only root operators may export during the preview period.'
      using errcode = 'P0502';
  end if;

  -- 7. Pack version classification.
  v_historical_version := coalesce(v_pack_version_col, 'pre_gate_b');

  -- 8. Record export authorisation using the correct column names.
  --    actor_id/release_mode/pack_version/account_id/pack_type/result match
  --    the actual schema in gate_b1_deposit_release_registry.sql.
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
    v_resolved_pack_type,
    v_historical_version,
    v_release_state,
    'print_initiated'
  )
  returning id into v_auth_id;

  return jsonb_build_object(
    'result',           'print_initiated',
    'auth_id',          v_auth_id,
    'release_mode',     v_release_state,
    'pack_version',     v_historical_version,
    'registry_version', v_registry_version,
    'is_root_preview',  v_is_root and v_release_state = 'internal_preview'
  );
end;
$$;

comment on function public.prepare_deposit_dispute_pack_export(uuid, text) is
  'Authorises and records a deposit dispute pack export. '
  'gate_b_ent_deposit_export_fix: corrects runtime-breaking column-name defect '
  'introduced in Gate-B-ENT (commit 0ea0601). Correct columns: actor_id, release_mode, '
  'pack_version (plus account_id, pack_type, result). Wrong columns removed: '
  'authorised_by, release_state_at_export, pack_version_at_export. '
  'Also removes prefix allowlist on p_registry_pack_type (PO RULING 1 fix). '
  'Gate-B1 tests T-07/T-08/T-09 confirm this corrective overlay. '
  'Production callers omit p_registry_pack_type; tests pass the isolated test pack type.';

revoke all     on function public.prepare_deposit_dispute_pack_export(uuid, text) from public;
grant  execute on function public.prepare_deposit_dispute_pack_export(uuid, text) to authenticated;

commit;
