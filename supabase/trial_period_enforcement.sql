-- ── Trial Period Enforcement ──────────────────────────────────────────────────
-- Adds trial_ends_at + audit columns to accounts.
-- Provides root-only RPCs: set_account_trial_end, remove_account_trial_cap.
-- All new self-serve and invited accounts receive a 14-day trial (set in their
-- respective signup functions). Existing accounts remain grandfathered (NULL).
-- ──────────────────────────────────────────────────────────────────────────────

begin;

-- ── Schema ────────────────────────────────────────────────────────────────────

alter table public.accounts
  add column if not exists trial_ends_at              timestamptz,
  add column if not exists trial_source               text
    check (trial_source in (
      'self_serve_signup', 'root_invite', 'manual', 'grandfathered'
    )),
  add column if not exists trial_extended_by_user_id  uuid references auth.users(id),
  add column if not exists trial_extended_at          timestamptz,
  add column if not exists trial_extension_reason     text;

create index if not exists accounts_trial_ends_at_idx
  on public.accounts(trial_ends_at)
  where trial_ends_at is not null;

-- ── RPC: set_account_trial_end ────────────────────────────────────────────────
-- Root-only. Sets a specific trial end date (extension or shortening).
-- Requires a non-blank reason for audit purposes.

create or replace function public.set_account_trial_end(
  p_target_account_id uuid,
  p_trial_ends_at     timestamptz,
  p_reason            text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_is_root boolean;
begin
  if not public.user_is_root_operator() then
    raise exception 'Permission denied';
  end if;

  if p_target_account_id is null then
    raise exception 'Missing target account id';
  end if;

  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'Reason is required for trial date changes';
  end if;

  if p_trial_ends_at is not null and p_trial_ends_at <= now() then
    raise exception 'p_trial_ends_at must be in the future; use remove_account_trial_cap to unlock or set a past date intentionally via cancel path';
  end if;

  select coalesce(a.is_root, false)
    into v_target_is_root
  from public.accounts a
  where a.id = p_target_account_id;

  if v_target_is_root then
    raise exception 'Cannot set trial on a root account';
  end if;

  -- Block if account has an active OA grant (trial is irrelevant for OA)
  if exists (
    select 1 from public.operator_agency_grants
    where account_id = p_target_account_id
      and payment_status in ('pending_checkout', 'pending_payment', 'active')
  ) then
    raise exception 'Account has an active Operator/Agency grant; trial dates do not apply';
  end if;

  update public.accounts
  set trial_ends_at              = p_trial_ends_at,
      trial_source               = 'manual',
      trial_extended_by_user_id  = auth.uid(),
      trial_extended_at          = now(),
      trial_extension_reason     = p_reason
  where id = p_target_account_id;

  perform public.log_security_event(
    p_target_account_id,
    'trial_end_updated',
    'account',
    p_target_account_id,
    jsonb_build_object(
      'new_trial_ends_at', p_trial_ends_at,
      'reason', p_reason,
      'actor_user_id', auth.uid()
    )
  );
end;
$$;

revoke all  on function public.set_account_trial_end(uuid, timestamptz, text) from public;
grant execute on function public.set_account_trial_end(uuid, timestamptz, text) to authenticated;

-- ── RPC: remove_account_trial_cap ────────────────────────────────────────────
-- Root-only. Sets trial_ends_at to NULL, granting permanent access without a
-- time boundary (e.g. for special arrangements). Separate from set_account_trial_end
-- to make the intent explicit and require deliberate invocation.

create or replace function public.remove_account_trial_cap(
  p_target_account_id uuid,
  p_reason            text
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

  if p_target_account_id is null then
    raise exception 'Missing target account id';
  end if;

  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'Reason is required for trial cap removal';
  end if;

  update public.accounts
  set trial_ends_at              = null,
      trial_source               = 'grandfathered',
      trial_extended_by_user_id  = auth.uid(),
      trial_extended_at          = now(),
      trial_extension_reason     = p_reason
  where id = p_target_account_id;

  perform public.log_security_event(
    p_target_account_id,
    'trial_cap_removed',
    'account',
    p_target_account_id,
    jsonb_build_object(
      'reason', p_reason,
      'actor_user_id', auth.uid()
    )
  );
end;
$$;

revoke all  on function public.remove_account_trial_cap(uuid, text) from public;
grant execute on function public.remove_account_trial_cap(uuid, text) to authenticated;

commit;
