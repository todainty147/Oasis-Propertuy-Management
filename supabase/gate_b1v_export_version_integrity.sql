-- gate_b1v_export_version_integrity.sql
-- Hotfix: deposit_pack_export_authorisations.pack_version must use the
-- authoritative registry row version, not a pack-record column default.
--
-- Root cause (gate_b_ent_deposit_export_fix.sql):
--   v_pack_version_col   := deposit_dispute_packs.pack_version  (null for pre-Gate-B packs)
--   v_historical_version := coalesce(v_pack_version_col, 'pre_gate_b')  -- always 'pre_gate_b'
--   INSERT ... pack_version = v_historical_version  -- wrong: pack-record version, not registry
--   The correct registry version was read into v_registry_version but only returned in
--   the JSON response under the key 'registry_version', never inserted into the auth row.
--
-- Fix: read release_state and pack_version atomically from the same registry row,
-- then use v_registry_version for both the INSERT and the returned payload.
-- Remove v_pack_version_col and v_historical_version entirely.
-- Remove the now-redundant 'registry_version' key from the return JSON.
--
-- PO ruling (2026-07-18):
--   "The RPC should atomically read the release row and use the same values for
--   authorisation: release_state → release_mode, pack_version → pack_version.
--   The values must come from the same registry row used to decide whether export
--   is permitted."
--
-- Production impact: new authorisation rows after this hotfix record pack_version
-- = registry version (e.g. 'gate_b1_v1'). The two existing rows with 'pre_gate_b'
-- are preserved and remain in the audit trail as evidence of the defect period.
-- Gate-B1 final closure requires a second production print confirming the new
-- authorisation row carries pack_version = 'gate_b1_v1'.

begin;

do $$
begin
  if not exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = 'deposit_pack_export_authorisations'
  ) then
    raise exception
      'gate_b1v_export_version_integrity.sql requires gate_b1_deposit_release_registry.sql '
      'to be applied first.';
  end if;
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
  v_release_state       text;
  v_registry_version    text;
  v_is_root             boolean;
  v_auth_id             uuid;
  v_resolved_pack_type  text  := coalesce(
    nullif(trim(coalesce(p_registry_pack_type, '')), ''),
    'deposit_dispute_pack'
  );
begin
  -- 1. Resolve pack -> account and status only.
  --    pack_version column is not read here (gate_b1v: use registry version instead).
  select account_id, status
  into   v_account_id, v_pack_status
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

  -- 4. Atomically resolve release state and pack version from the same registry row.
  --    Both values come from one SELECT — no skew between the state-gate decision
  --    and the version recorded in the authorisation row (gate_b1v integrity fix).
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

  -- 7. Record export authorisation. pack_version sourced from the registry row
  --    resolved atomically in step 4 — never from the pack record column.
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
    v_registry_version,
    v_release_state,
    'print_initiated'
  )
  returning id into v_auth_id;

  return jsonb_build_object(
    'result',          'print_initiated',
    'auth_id',         v_auth_id,
    'release_mode',    v_release_state,
    'pack_version',    v_registry_version,
    'is_root_preview', v_is_root and v_release_state = 'internal_preview'
  );
end;
$$;

comment on function public.prepare_deposit_dispute_pack_export(uuid, text) is
  'Authorises and records a deposit dispute pack export. '
  'gate_b1v_export_version_integrity (2026-07-18): fixes pack_version integrity — '
  'authorisation rows now record the registry pack_version (e.g. gate_b1_v1), not a '
  'pack-record column default. release_state and pack_version are read atomically from '
  'the same registry row. v_pack_version_col and v_historical_version removed. '
  'Supersedes gate_b_ent_deposit_export_fix.sql.';

revoke all     on function public.prepare_deposit_dispute_pack_export(uuid, text) from public;
grant  execute on function public.prepare_deposit_dispute_pack_export(uuid, text) to authenticated;

commit;
