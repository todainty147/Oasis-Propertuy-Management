-- =============================================================================
-- Provenance Sprint 2B: Explain This Balance + Anchor Awareness
-- Overlay — idempotent, re-applied on every deploy
--
-- Depends on: provenance_finance_cutover.sql (must run before this file)
-- Must run before: supabase_linter_security_hardening.sql
-- =============================================================================

-- ─── B3. Period breakdown helper ────────────────────────────────────────────
--
-- Enumerates discrete billing periods from the shared accumulation function.
-- Periods sum to the legacy total by construction: count = months_elapsed.

create or replace function public.finance_property_period_breakdown(
  p_account_id uuid,
  p_property_id uuid default null
)
returns table (
  property_id uuid,
  period_index integer,
  period_start date,
  period_end date,
  period_key text,
  rent_minor bigint,
  rent_start_date date,
  rent_start_source text,
  currency text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  select
    fa.property_id,
    gs.idx::integer as period_index,
    (fa.rent_start_date + ((gs.idx - 1) || ' months')::interval)::date as period_start,
    (fa.rent_start_date + (gs.idx || ' months')::interval - interval '1 day')::date as period_end,
    to_char(fa.rent_start_date + ((gs.idx - 1) || ' months')::interval, 'YYYY-MM') as period_key,
    fa.rent_minor_used as rent_minor,
    fa.rent_start_date,
    fa.rent_start_source,
    fa.currency
  from public.finance_property_accumulation(p_account_id) fa
  cross join lateral generate_series(1, fa.months_elapsed) as gs(idx)
  where (p_property_id is null or fa.property_id = p_property_id);
end;
$$;

comment on function public.finance_property_period_breakdown(uuid, uuid) is
  'Enumerates per-property billing periods from the shared accumulation function. Each period carries the rent that finance_snapshot uses. Period count = months_elapsed by construction.';

revoke all on function public.finance_property_period_breakdown(uuid, uuid)
  from public, anon, authenticated;

-- ─── B1. Forward rent accrual function ──────────────────────────────────────
--
-- Emits real post-cutover rent.charged events for all eligible properties and
-- periods since cutover. Uses the shared period breakdown so accrual is
-- finance_snapshot-compatible. Idempotent: skips already-emitted periods
-- without consuming sequence numbers.

create or replace function public.provenance_accrue_rent_charges(
  p_account_id uuid default null,
  p_property_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_role text;
  v_account record;
  v_cutover record;
  v_snapshot_months integer;
  v_period record;
  v_idem_key text;
  v_existing_event_id uuid;
  v_sequence_number bigint;
  v_event_id uuid;
  v_emitted integer := 0;
  v_skipped integer := 0;
  v_lease_id uuid;
  v_lease_end_date date;
  v_accounts_cursor refcursor;
  v_account_row record;
begin
  v_actor_id := auth.uid();

  if p_account_id is not null then
    if v_actor_id is not null then
      v_role := public.account_member_effective_role(p_account_id, v_actor_id);
      if not public.user_is_root_operator()
         and coalesce(v_role, '') <> all (array['owner', 'admin', 'staff']) then
        raise exception 'account operator role required for rent accrual';
      end if;
    end if;
  end if;

  if p_account_id is null then
    for v_account_row in
      select c.account_id, c.cutover_at, c.cutover_version
      from public.provenance_finance_cutover c
      where c.status = 'active'
    loop
      perform public.provenance_accrue_rent_charges(
        p_account_id := v_account_row.account_id,
        p_property_id := p_property_id
      );
    end loop;

    return jsonb_build_object('batch', true);
  end if;

  select c.account_id, c.cutover_at, c.cutover_version, c.status
  into v_cutover
  from public.provenance_finance_cutover c
  where c.account_id = p_account_id;

  if not found or v_cutover.status <> 'active' then
    return jsonb_build_object(
      'account_id', p_account_id,
      'skipped', true,
      'reason', 'no active cutover'
    );
  end if;

  for v_period in
    select pb.*
    from public.finance_property_period_breakdown(p_account_id, p_property_id) pb
    order by pb.property_id, pb.period_index
  loop
    select (e.metadata ->> 'months_elapsed')::integer into v_snapshot_months
    from public.provenance_events e
    where e.account_id = p_account_id
      and e.property_id = v_period.property_id
      and e.event_type = 'finance.legacy_obligation_snapshot'
    order by e.sequence_number desc
    limit 1;

    if v_snapshot_months is null then
      continue;
    end if;

    if v_period.period_index <= v_snapshot_months then
      continue;
    end if;

    v_idem_key := 'live:rent.charged:' || p_account_id::text || ':' || v_period.property_id::text || ':' || v_period.period_key || ':' || v_cutover.cutover_version::text;

    select id into v_existing_event_id
    from public.provenance_events
    where account_id = p_account_id
      and idempotency_key = v_idem_key;

    if v_existing_event_id is not null then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    select l.id, l.lease_end_date into v_lease_id, v_lease_end_date
    from public.leases l
    where l.account_id = p_account_id
      and l.property_id = v_period.property_id
      and lower(coalesce(l.renewal_status, 'active')) not in ('ended')
    order by l.lease_start_date desc
    limit 1;

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
      'property', v_period.property_id, v_period.property_id, v_lease_id,
      'rent.charged', 1,
      'system', null, 'system',
      v_period.period_start::timestamptz, now(),
      'Rent obligation for ' || v_period.period_key,
      null,
      jsonb_build_object(
        'charge_period_start', v_period.period_start,
        'charge_period_end', v_period.period_end,
        'period_key', v_period.period_key,
        'period_index', v_period.period_index,
        'rent_minor_used', v_period.rent_minor,
        'rent_source', 'properties.rent',
        'accrual_basis', 'finance_snapshot_compatible',
        'cutover_version', v_cutover.cutover_version,
        'lease_id', v_lease_id,
        'property_id', v_period.property_id,
        'generated_as_of', current_date,
        'source', 'monthly_accrual',
        'accrual_continues_past_lease_end_date',
          case when v_lease_end_date is not null and current_date > v_lease_end_date then true else false end
      ),
      v_period.rent_minor,
      v_period.currency,
      'rent_accrual', null,
      'internal',
      null, null, 0,
      v_idem_key,
      now()
    );

    v_emitted := v_emitted + 1;
  end loop;

  return jsonb_build_object(
    'account_id', p_account_id,
    'emitted', v_emitted,
    'skipped_existing', v_skipped,
    'cutover_version', v_cutover.cutover_version
  );
end;
$$;

comment on function public.provenance_accrue_rent_charges(uuid, uuid) is
  'Emits post-cutover rent.charged events for all eligible properties and billing periods since cutover. Uses the shared period breakdown for finance_snapshot compatibility. Idempotent.';

revoke all on function public.provenance_accrue_rent_charges(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.provenance_accrue_rent_charges(uuid, uuid) to authenticated;

-- ─── C. Update balance projection for rent.charged ──────────────────────────

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
        'finance.legacy_obligation_snapshot',
        'rent.charged'
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
        when re.event_type = 'rent.charged' then 'active'
        else 'active'
      end as treatment,
      case
        when re.event_id in (select event_id from reversed_event_ids) then 0::bigint
        when re.event_id in (select event_id from superseded_event_ids) then 0::bigint
        when re.event_type = 'payment.recorded' then 0::bigint
        when re.event_type = 'payment.marked_overdue' then 0::bigint
        when re.event_type = 'finance.legacy_obligation_snapshot' then coalesce(re.amount_minor, 0)
        when re.event_type = 'rent.charged' then coalesce(re.amount_minor, 0)
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
        when re.event_type = 'rent.charged' then coalesce(re.amount_minor, 0)
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
          'reconstructed', coalesce(e.metadata ->> 'reconstructed', 'false') = 'true',
          'metadata', e.metadata
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
  'Returns per-property provenance-derived balance and event list. Includes rent.charged (post-cutover accrual) alongside legacy obligation snapshot and payment events. Sprint 2B.';

revoke all on function public.provenance_balance_projection(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.provenance_balance_projection(uuid, uuid) to authenticated;

-- ─── D. Reconciliation gate update ──────────────────────────────────────────
--
-- Now calls provenance_accrue_rent_charges before comparing (on-read catch-up)
-- and adds post_cutover_rent_change divergence category.

-- The Sprint 2A definition has one fewer OUT column, so it must be dropped
-- before installing this expanded Sprint 2B row shape.
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
  recommended_action text,
  display_basis text
)
language plpgsql
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

  perform public.provenance_accrue_rent_charges(
    p_account_id := p_account_id
  );

  return query
  with legacy as (
    select
      fa.property_id,
      fa.remaining_clamped as legacy_remaining,
      fa.currency as legacy_currency,
      fa.rent_minor_used as legacy_rent_minor
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
  snapshot_rent as (
    select
      e.property_id as snap_property_id,
      (e.metadata ->> 'rent_minor_used')::bigint as snap_rent_minor
    from public.provenance_events e
    where e.account_id = p_account_id
      and e.event_type = 'finance.legacy_obligation_snapshot'
  ),
  combined as (
    select
      coalesce(l.property_id, p.prov_property_id) as prop_id,
      p.prov_tenancy_id as ten_id,
      coalesce(l.legacy_remaining, 0) as leg_balance,
      coalesce(p.prov_balance, 0) as prov_bal,
      coalesce(l.legacy_currency, p.prov_currency) as curr,
      l.legacy_currency as l_curr,
      p.prov_currency as p_curr,
      l.legacy_rent_minor,
      sr.snap_rent_minor
    from legacy l
    full outer join provenance p on l.property_id = p.prov_property_id
    left join snapshot_rent sr on sr.snap_property_id = coalesce(l.property_id, p.prov_property_id)
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
      when c.p_curr is null then 'cannot_compare'
      when c.leg_balance = 0 and c.prov_bal = 0 then 'matched'
      when c.leg_balance = c.prov_bal then 'matched'
      when c.leg_balance = 0 and c.prov_bal < 0 then 'explained_divergence'
      when c.snap_rent_minor is not null
           and c.legacy_rent_minor is not null
           and c.snap_rent_minor <> c.legacy_rent_minor
        then 'explained_divergence'
      else 'unexplained_divergence'
    end as status,
    case
      when c.l_curr is not null and c.p_curr is not null and c.l_curr <> c.p_curr then 'currency_mismatch'
      when c.p_curr is null then 'not_yet_cut_over'
      when c.leg_balance = c.prov_bal then null
      when c.leg_balance = 0 and c.prov_bal < 0 then 'overpayment_credit_clamp'
      when c.snap_rent_minor is not null
           and c.legacy_rent_minor is not null
           and c.snap_rent_minor <> c.legacy_rent_minor
        then 'post_cutover_rent_change'
      when c.leg_balance = 0 and c.prov_bal = 0 then null
      else 'derivation_mismatch'
    end as divergence_reason,
    case
      when c.l_curr is not null and c.p_curr is not null and c.l_curr <> c.p_curr then 'investigate currency configuration'
      when c.p_curr is null then 'This property has not been cut over to provenance tracking yet. No comparison is possible until cutover is activated.'
      when c.leg_balance = c.prov_bal then null
      when c.leg_balance = 0 and c.prov_bal < 0 then 'expected: provenance shows tenant credit that legacy clamps to zero'
      when c.snap_rent_minor is not null
           and c.legacy_rent_minor is not null
           and c.snap_rent_minor <> c.legacy_rent_minor
        then 'The legacy finance view recalculates ALL earlier months using the current rent. Provenance keeps the rent that was recorded for each period.'
      else 'investigate derivation mismatch — fix shared accumulation, do not classify around it'
    end as recommended_action,
    case
      when c.l_curr is not null and c.p_curr is not null and c.l_curr <> c.p_curr then null
      when c.p_curr is null then 'legacy_compatible'
      when c.leg_balance = c.prov_bal then 'provenance'
      when c.leg_balance = 0 and c.prov_bal < 0 then 'legacy_compatible'
      when c.snap_rent_minor is not null
           and c.legacy_rent_minor is not null
           and c.snap_rent_minor <> c.legacy_rent_minor
        then 'legacy_compatible'
      else null
    end as display_basis
  from combined c;
end;
$$;

comment on function public.provenance_reconciliation_gate(uuid) is
  'Per-property legacy vs provenance comparison with on-read accrual catch-up. Returns matched/explained_divergence/unexplained_divergence/cannot_compare plus display_basis. Sprint 2B.';

revoke all on function public.provenance_reconciliation_gate(uuid)
  from public, anon, authenticated;
grant execute on function public.provenance_reconciliation_gate(uuid) to authenticated;

-- ─── Part 2. Chain verification status cache ────────────────────────────────
--
-- Mutable per-account cache of the latest verify_provenance_chain result.
-- Intentionally NOT append-only — upserted on every verify.

create table if not exists public.provenance_chain_status (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  verified boolean not null,
  last_verified_at timestamptz not null,
  head_sequence bigint,
  head_hash text,
  event_count bigint,
  first_broken_sequence bigint null,
  first_broken_reason text null,
  updated_at timestamptz not null default now()
);

comment on table public.provenance_chain_status is
  'Mutable per-account cache of the latest chain verification result. Upserted by verify_and_persist_chain_status. NOT append-only — intentionally updatable by the verify path.';

alter table public.provenance_chain_status enable row level security;

drop policy if exists provenance_chain_status_select_operators
  on public.provenance_chain_status;
create policy provenance_chain_status_select_operators
on public.provenance_chain_status
for select to authenticated
using (
  public.user_is_root_operator()
  or public.account_member_effective_role(account_id, auth.uid())
    = any (array['owner', 'admin', 'staff'])
);

revoke all on table public.provenance_chain_status from public, anon, authenticated;
grant select on table public.provenance_chain_status to authenticated;

-- ─── Head reader helper ─────────────────────────────────────────────────────

create or replace function public.get_provenance_chain_head(
  p_account_id uuid,
  out head_sequence bigint,
  out head_hash text
)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(c.next_sequence - 1, 0), c.head_hash
  from public.provenance_event_counters c
  where c.account_id = p_account_id;
$$;

revoke all on function public.get_provenance_chain_head(uuid)
  from public, anon, authenticated;

-- ─── Verify-and-persist wrapper ─────────────────────────────────────────────
--
-- Calls verify_provenance_chain and upserts the result into
-- provenance_chain_status. Returns the same shape as verify_provenance_chain.

create or replace function public.verify_and_persist_chain_status(
  p_account_id uuid,
  out is_valid boolean,
  out checked_count bigint,
  out first_broken_sequence bigint,
  out first_broken_reason text,
  out last_verified_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_role text;
  v_head_before record;
  v_head_after record;
begin
  if v_actor_id is null then
    raise exception 'authentication required';
  end if;

  v_role := public.account_member_effective_role(p_account_id, v_actor_id);
  if not public.user_is_root_operator()
     and coalesce(v_role, '') <> all (array['owner', 'admin', 'staff']) then
    raise exception 'account operator role required';
  end if;

  -- Same advisory lock as ledger writers to prevent concurrent appends.
  perform pg_advisory_xact_lock(hashtext('provenance:' || p_account_id::text), 0);

  select h.head_sequence, h.head_hash into v_head_before
  from public.get_provenance_chain_head(p_account_id) h;

  select vc.is_valid, vc.checked_count, vc.first_broken_sequence, vc.first_broken_reason
  into is_valid, checked_count, first_broken_sequence, first_broken_reason
  from public._verify_provenance_chain_internal(p_account_id) vc;

  select h.head_sequence, h.head_hash into v_head_after
  from public.get_provenance_chain_head(p_account_id) h;

  if v_head_before.head_sequence is distinct from v_head_after.head_sequence
     or v_head_before.head_hash is distinct from v_head_after.head_hash then
    raise exception 'chain head changed during verification, retry';
  end if;

  last_verified_at := now();

  insert into public.provenance_chain_status (
    account_id, verified, last_verified_at,
    head_sequence, head_hash, event_count,
    first_broken_sequence, first_broken_reason, updated_at
  ) values (
    p_account_id, is_valid, last_verified_at,
    coalesce(v_head_after.head_sequence, 0), v_head_after.head_hash, checked_count,
    first_broken_sequence, first_broken_reason, now()
  )
  on conflict (account_id) do update set
    verified = excluded.verified,
    last_verified_at = excluded.last_verified_at,
    head_sequence = excluded.head_sequence,
    head_hash = excluded.head_hash,
    event_count = excluded.event_count,
    first_broken_sequence = excluded.first_broken_sequence,
    first_broken_reason = excluded.first_broken_reason,
    updated_at = excluded.updated_at;
end;
$$;

comment on function public.verify_and_persist_chain_status(uuid) is
  'Runs verify_provenance_chain and upserts the result into provenance_chain_status. Returns the verification result plus the persisted last_verified_at timestamp.';

revoke all on function public.verify_and_persist_chain_status(uuid)
  from public, anon, authenticated;
grant execute on function public.verify_and_persist_chain_status(uuid) to authenticated;

-- ─── I. Internal anchoring ──────────────────────────────────────────────────

create table if not exists public.provenance_chain_anchors (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  head_sequence bigint not null,
  head_hash text not null,
  event_count bigint not null,
  anchor_hash text not null,
  anchored_at timestamptz not null default now(),
  anchored_by uuid,

  constraint provenance_chain_anchors_unique_head
    unique (account_id, head_sequence)
);

comment on table public.provenance_chain_anchors is
  'Append-only internal chain anchors. Each row snapshots the chain state at a verified point. Later events do not invalidate earlier anchors.';

alter table public.provenance_chain_anchors enable row level security;

drop policy if exists provenance_chain_anchors_select_operators
  on public.provenance_chain_anchors;
create policy provenance_chain_anchors_select_operators
on public.provenance_chain_anchors
for select to authenticated
using (
  public.user_is_root_operator()
  or public.account_member_effective_role(account_id, auth.uid())
    = any (array['owner', 'admin'])
);

revoke all on table public.provenance_chain_anchors from public, anon, authenticated;
grant select on table public.provenance_chain_anchors to authenticated;

create or replace function public.provenance_prevent_anchor_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'provenance_chain_anchors is append-only: % denied', tg_op;
end;
$$;

drop trigger if exists trg_provenance_anchors_no_update on public.provenance_chain_anchors;
create trigger trg_provenance_anchors_no_update
before update on public.provenance_chain_anchors
for each row execute function public.provenance_prevent_anchor_mutation();

drop trigger if exists trg_provenance_anchors_no_delete on public.provenance_chain_anchors;
create trigger trg_provenance_anchors_no_delete
before delete on public.provenance_chain_anchors
for each row execute function public.provenance_prevent_anchor_mutation();

drop trigger if exists trg_provenance_anchors_no_truncate on public.provenance_chain_anchors;
create trigger trg_provenance_anchors_no_truncate
before truncate on public.provenance_chain_anchors
execute function public.provenance_prevent_anchor_mutation();

create or replace function public.anchor_provenance_chain(
  p_account_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_role text;
  v_is_valid boolean;
  v_checked_count bigint;
  v_first_broken_sequence bigint;
  v_first_broken_reason text;
  v_head_hash text;
  v_head_sequence bigint;
  v_anchor_hash text;
  v_anchor_id uuid;
begin
  if v_actor_id is not null then
    v_role := public.account_member_effective_role(p_account_id, v_actor_id);
    if not public.user_is_root_operator()
       and coalesce(v_role, '') <> all (array['owner', 'admin']) then
      raise exception 'account owner or admin role required for anchoring';
    end if;
  end if;

  select vc.is_valid, vc.checked_count, vc.first_broken_sequence, vc.first_broken_reason
  into v_is_valid, v_checked_count, v_first_broken_sequence, v_first_broken_reason
  from public.verify_provenance_chain(p_account_id) vc;

  if not v_is_valid then
    return jsonb_build_object(
      'account_id', p_account_id,
      'anchored', false,
      'reason', 'chain verification failed',
      'checked_count', v_checked_count
    );
  end if;

  if v_checked_count = 0 then
    return jsonb_build_object(
      'account_id', p_account_id,
      'anchored', false,
      'reason', 'no events to anchor'
    );
  end if;

  select c.head_hash, c.next_sequence - 1
  into v_head_hash, v_head_sequence
  from public.provenance_event_counters c
  where c.account_id = p_account_id;

  v_anchor_hash := encode(
    extensions.digest(
      convert_to(
        p_account_id::text || ':' || v_head_sequence::text || ':' || v_head_hash || ':' || v_checked_count::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  v_anchor_id := gen_random_uuid();

  insert into public.provenance_chain_anchors (
    id, account_id, head_sequence, head_hash, event_count,
    anchor_hash, anchored_at, anchored_by
  ) values (
    v_anchor_id, p_account_id, v_head_sequence, v_head_hash, v_checked_count,
    v_anchor_hash, now(), v_actor_id
  )
  on conflict (account_id, head_sequence) do nothing;

  if not found then
    select id into v_anchor_id
    from public.provenance_chain_anchors
    where account_id = p_account_id and head_sequence = v_head_sequence;
  end if;

  return jsonb_build_object(
    'account_id', p_account_id,
    'anchored', true,
    'anchor_id', v_anchor_id,
    'head_sequence', v_head_sequence,
    'head_hash', v_head_hash,
    'event_count', v_checked_count,
    'anchor_hash', v_anchor_hash
  );
end;
$$;

comment on function public.anchor_provenance_chain(uuid) is
  'Verifies the account chain and creates an append-only anchor snapshot. Deduplicated by (account_id, head_sequence). Only verified chains can be anchored.';

revoke all on function public.anchor_provenance_chain(uuid)
  from public, anon, authenticated;
grant execute on function public.anchor_provenance_chain(uuid) to authenticated;

create or replace function public.verify_provenance_anchor(
  p_account_id uuid,
  p_anchor_id uuid default null
)
returns table (
  anchor_id uuid,
  has_anchor boolean,
  anchor_consistent boolean,
  anchor_sequence bigint,
  anchored_at timestamptz,
  events_after_anchor bigint,
  anchor_hash text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_role text;
  v_anchor public.provenance_chain_anchors%rowtype;
  v_event_hash text;
  v_current_seq bigint;
begin
  if v_actor_id is not null then
    v_role := public.account_member_effective_role(p_account_id, v_actor_id);
    if not public.user_is_root_operator()
       and coalesce(v_role, '') <> all (array['owner', 'admin', 'staff']) then
      raise exception 'account operator role required';
    end if;
  end if;

  if p_anchor_id is not null then
    select * into v_anchor
    from public.provenance_chain_anchors a
    where a.id = p_anchor_id and a.account_id = p_account_id;
  else
    select * into v_anchor
    from public.provenance_chain_anchors a
    where a.account_id = p_account_id
    order by a.head_sequence desc
    limit 1;
  end if;

  if not found then
    return query select
      null::uuid, false, null::boolean, null::bigint, null::timestamptz, null::bigint, null::text;
    return;
  end if;

  select e.event_hash into v_event_hash
  from public.provenance_events e
  where e.account_id = p_account_id
    and e.sequence_number = v_anchor.head_sequence;

  select coalesce(c.next_sequence - 1, 0) into v_current_seq
  from public.provenance_event_counters c
  where c.account_id = p_account_id;

  return query select
    v_anchor.id,
    true,
    v_event_hash is not null and v_event_hash = v_anchor.head_hash,
    v_anchor.head_sequence,
    v_anchor.anchored_at,
    greatest(coalesce(v_current_seq, 0) - v_anchor.head_sequence, 0),
    v_anchor.anchor_hash;
end;
$$;

comment on function public.verify_provenance_anchor(uuid, uuid) is
  'Checks whether the latest (or specific) anchor is still consistent with the chain. Later events do not invalidate the anchor. Returns anchor state for badge computation.';

revoke all on function public.verify_provenance_anchor(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.verify_provenance_anchor(uuid, uuid) to authenticated;

create or replace function public.anchor_all_provenance_chains()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account record;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_success integer := 0;
  v_failed integer := 0;
begin
  for v_account in
    select distinct pe.account_id
    from public.provenance_events pe
  loop
    begin
      v_result := public.anchor_provenance_chain(v_account.account_id);
      v_results := v_results || jsonb_build_array(v_result);
      if (v_result ->> 'anchored')::boolean then
        v_success := v_success + 1;
      end if;
    exception when others then
      v_failed := v_failed + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'account_id', v_account.account_id,
        'anchored', false,
        'reason', sqlerrm
      ));
    end;
  end loop;

  return jsonb_build_object(
    'anchored', v_success,
    'failed', v_failed,
    'details', v_results
  );
end;
$$;

comment on function public.anchor_all_provenance_chains() is
  'Batch anchor all accounts with provenance events. One account failure does not roll back the batch.';

revoke all on function public.anchor_all_provenance_chains()
  from public, anon, authenticated;

-- ─── E/F. Explain property balance RPC ──────────────────────────────────────

create or replace function public.explain_property_balance(
  p_property_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_role text;
  v_account_id uuid;
  v_projection record;
  v_gate record;
  v_chain_is_valid boolean;
  v_chain_checked_count bigint;
  v_chain_verified_at timestamptz;
  v_anchor record;
  v_badge_state text;
  v_export_allowed boolean;
  v_safe_message text;
  v_display_balance bigint;
  v_display_basis text;
  v_events jsonb;
  -- Freshness check variables
  v_status record;
  v_current_head record;
  v_max_age interval := interval '15 minutes';
  -- Lease-end notice variables
  v_notices jsonb := '[]'::jsonb;
  v_seen_leases text[] := '{}';
  v_ev jsonb;
  v_ev_lease_id text;
  v_ev_property_id text;
  -- Sprint 2C: labels, bridge lines, anchor hash
  v_account_label text;
  v_property_label text;
  v_tenant_label text;
  v_lease_label text;
  v_bridge_lines jsonb := '[]'::jsonb;
  v_event_total bigint := 0;
  v_accrued_past_lease_end boolean := false;
  v_has_reconstructed boolean := false;
  v_anchor_hash text;
begin
  -- ── 1. Authorize ──────────────────────────────────────────────────────────
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'authentication required';
  end if;

  select p.account_id into v_account_id
  from public.properties p
  where p.id = p_property_id;

  if v_account_id is null then
    raise exception 'property not found';
  end if;

  v_role := public.account_member_effective_role(v_account_id, v_actor_id);
  if not public.user_is_root_operator()
     and coalesce(v_role, '') <> all (array['owner', 'admin', 'staff']) then
    raise exception 'account operator role required';
  end if;

  -- ── 1b. Resolve labels for evidence summary ────────────────────────────────
  select a.name into v_account_label
  from public.accounts a where a.id = v_account_id;

  select p.address into v_property_label
  from public.properties p where p.id = p_property_id;

  select tn.name into v_tenant_label
  from public.tenants tn
  where tn.property_id = p_property_id
    and tn.account_id = v_account_id
  order by tn.created_at desc
  limit 1;

  select 'Lease from ' || l.lease_start_date::text
         || coalesce(' to ' || l.lease_end_date::text, ' (ongoing)')
  into v_lease_label
  from public.leases l
  where l.property_id = p_property_id
    and l.account_id = v_account_id
    and lower(coalesce(l.renewal_status, 'active')) not in ('ended')
  order by l.lease_start_date desc
  limit 1;

  -- ── 2. On-read accrual (MUST run before freshness check) ──────────────────
  --
  -- Accrual can append rent.charged events, advancing the chain head. The
  -- freshness check must evaluate against the post-accrual head so the badge
  -- reports a verification that covers any event just written.
  perform public.provenance_accrue_rent_charges(
    p_account_id := v_account_id,
    p_property_id := p_property_id
  );

  -- ── 3. Freshness check ────────────────────────────────────────────────────
  --
  -- Head equality is the primary gate. In an append-only ledger the only
  -- legitimate change is an append, which advances the head — so an unchanged
  -- head means no new events, and on-read accrual that DID append makes
  -- head != cached head → re-verify.
  --
  -- The max-age cap is the tamper-detection backstop. An out-of-band
  -- modification to a historical event would NOT advance the head, so
  -- head-equality alone could trust a stale "verified" indefinitely on a
  -- static chain. The cap forces periodic re-verification so such tampering
  -- surfaces within max_age.

  -- Hold the same advisory lock as ledger writers so no append can slip
  -- between verification and projection.
  perform pg_advisory_xact_lock(hashtext('provenance:' || v_account_id::text), 0);

  select h.head_sequence, h.head_hash
  into v_current_head
  from public.get_provenance_chain_head(v_account_id) h;

  select s.* into v_status
  from public.provenance_chain_status s
  where s.account_id = v_account_id;

  if found
     and v_status.head_sequence is not distinct from coalesce(v_current_head.head_sequence, 0)
     and v_status.head_hash is not distinct from v_current_head.head_hash
     and v_status.last_verified_at >= now() - v_max_age
  then
    -- Cache HIT: reuse persisted verification
    v_chain_is_valid := v_status.verified;
    v_chain_checked_count := v_status.event_count;
    v_chain_verified_at := v_status.last_verified_at;
  else
    -- Cache MISS: re-verify and persist
    select vp.is_valid, vp.checked_count, vp.last_verified_at
    into v_chain_is_valid, v_chain_checked_count, v_chain_verified_at
    from public.verify_and_persist_chain_status(v_account_id) vp;
  end if;

  -- ── 4. Projection + reconciliation ────────────────────────────────────────
  select bp.property_id, bp.tenancy_id, bp.balance_minor, bp.currency, bp.events
  into v_projection
  from public.provenance_balance_projection(v_account_id, p_property_id) bp
  limit 1;

  select rg.property_id, rg.legacy_balance_minor, rg.provenance_balance_minor,
         rg.difference_minor, rg.currency, rg.status, rg.divergence_reason,
         rg.recommended_action, rg.display_basis
  into v_gate
  from public.provenance_reconciliation_gate(v_account_id) rg
  where rg.property_id = p_property_id
  limit 1;

  select va.anchor_id, va.has_anchor, va.anchor_consistent, va.anchor_sequence,
         va.anchored_at, va.events_after_anchor
  into v_anchor
  from public.verify_provenance_anchor(v_account_id) va;

  -- Auto-anchor when chain is valid but no anchor exists yet
  if v_chain_is_valid is true and not coalesce(v_anchor.has_anchor, false) then
    begin
      perform public.anchor_provenance_chain(v_account_id);
      select va2.anchor_id, va2.has_anchor, va2.anchor_consistent, va2.anchor_sequence,
             va2.anchored_at, va2.events_after_anchor
      into v_anchor
      from public.verify_provenance_anchor(v_account_id) va2;
    exception when others then
      null;
    end;
  end if;

  -- ── 5. Badge state computation (J) ────────────────────────────────────────
  if v_chain_is_valid is not true then
    v_badge_state := 'issue';
    v_export_allowed := false;
    v_safe_message := 'A verification check found an inconsistency. Our team has been notified.';

    perform public.log_security_event(
      v_account_id,
      'provenance.chain_verification_failure',
      'account',
      v_account_id,
      jsonb_build_object(
        'property_id', p_property_id,
        'checked_count', v_chain_checked_count,
        'trigger', 'explain_property_balance'
      )
    );

  elsif coalesce(v_anchor.has_anchor, false) and v_anchor.anchor_consistent is not true then
    v_badge_state := 'issue';
    v_export_allowed := false;
    v_safe_message := 'A verification check found an inconsistency. Our team has been notified.';

    perform public.log_security_event(
      v_account_id,
      'provenance.anchor_mismatch',
      'account',
      v_account_id,
      jsonb_build_object(
        'property_id', p_property_id,
        'anchor_id', v_anchor.anchor_id,
        'trigger', 'explain_property_balance'
      )
    );

  elsif coalesce(v_gate.status, 'unexplained_divergence') = 'unexplained_divergence' then
    v_badge_state := 'reconciliation_warning';
    v_export_allowed := false;
    v_safe_message := 'The balance could not be fully reconciled. Our team has been notified.';

    perform public.log_security_event(
      v_account_id,
      'provenance.unexplained_divergence',
      'property',
      p_property_id,
      jsonb_build_object(
        'legacy_balance', v_gate.legacy_balance_minor,
        'provenance_balance', v_gate.provenance_balance_minor,
        'difference', v_gate.difference_minor,
        'trigger', 'explain_property_balance'
      )
    );

  elsif coalesce(v_gate.status, '') = 'cannot_compare' then
    v_badge_state := 'reconciliation_warning';
    v_export_allowed := false;
    v_safe_message := null;

  elsif not coalesce(v_anchor.has_anchor, false) then
    v_badge_state := 'verified_unanchored';
    v_export_allowed := true;
    v_safe_message := null;

  else
    v_badge_state := 'verified';
    v_export_allowed := true;
    v_safe_message := null;
  end if;

  -- ── 6. Lease-end accrual notices + event scanning ──────────────────────────
  v_events := coalesce(v_projection.events, '[]'::jsonb);

  for v_ev in select jsonb_array_elements(v_events)
  loop
    -- Sum event contributions for bridge reconciliation
    v_event_total := v_event_total + coalesce((v_ev ->> 'contribution_minor')::bigint, 0);

    -- Detect reconstructed events
    if (v_ev ->> 'reconstructed')::boolean is true
       or (v_ev -> 'metadata' ->> 'reconstructed')::boolean is true then
      v_has_reconstructed := true;
    end if;

    -- Detect lease-end accrual
    if (v_ev -> 'metadata' ->> 'accrual_continues_past_lease_end_date')::boolean is true then
      v_accrued_past_lease_end := true;
      v_ev_lease_id := coalesce(v_ev -> 'metadata' ->> 'lease_id', '');
      v_ev_property_id := coalesce(v_ev -> 'metadata' ->> 'property_id', p_property_id::text);

      if not (v_ev_lease_id = any(v_seen_leases)) then
        v_seen_leases := v_seen_leases || v_ev_lease_id;

        v_notices := v_notices || jsonb_build_array(jsonb_build_object(
          'type', 'lease_end_accrual',
          'property_id', v_ev_property_id,
          'lease_id', v_ev_lease_id,
          'period_key', v_ev -> 'metadata' ->> 'period_key',
          'message', 'Rent is still being accrued past the lease end date. Review the lease status or record a renewal.'
        ));

        perform public.upsert_security_anomaly_alert(
          v_account_id,
          'provenance.lease_end_accrual',
          'action',
          'Rent accrued past lease end date',
          'Property ' || v_ev_property_id || ' has rent charges accrued beyond the lease end date. Review lease status or record a renewal to resolve.',
          v_actor_id,
          'lease',
          case when v_ev_lease_id <> '' then v_ev_lease_id::uuid else null end,
          null,
          jsonb_build_object(
            'property_id', v_ev_property_id,
            'lease_id', v_ev_lease_id,
            'trigger', 'explain_property_balance'
          )
        );
      end if;
    end if;
  end loop;

  -- ── 7. Build response ─────────────────────────────────────────────────────
  v_display_basis := coalesce(v_gate.display_basis, 'provenance');
  if v_display_basis = 'legacy_compatible' then
    v_display_balance := coalesce(v_gate.legacy_balance_minor, 0);
  else
    v_display_balance := coalesce(v_projection.balance_minor, 0);
  end if;

  -- Compute reconciliation bridge lines when display differs from event total
  if v_display_basis = 'legacy_compatible'
     and v_display_balance is distinct from v_event_total then
    v_bridge_lines := jsonb_build_array(jsonb_build_object(
      'label', case coalesce(v_gate.divergence_reason, '')
        when 'overpayment_credit_clamp' then 'Legacy finance display adjustment'
        when 'post_cutover_rent_change' then 'Legacy rent formula adjustment'
        else 'Legacy display adjustment'
      end,
      'amount_minor', v_display_balance - v_event_total
    ));
  end if;

  -- Resolve anchor hash for evidential reference
  if coalesce(v_anchor.has_anchor, false) then
    select ca.anchor_hash into v_anchor_hash
    from public.provenance_chain_anchors ca
    where ca.id = v_anchor.anchor_id;
  end if;

  return jsonb_build_object(
    'account_id', v_account_id,
    'property_id', p_property_id,
    'tenancy_id', v_projection.tenancy_id,
    'scope', 'property',
    'account_label', v_account_label,
    'property_label', v_property_label,
    'tenant_label', v_tenant_label,
    'lease_label', v_lease_label,
    'balance', jsonb_build_object(
      'display_balance_minor', v_display_balance,
      'provenance_balance_minor', coalesce(v_projection.balance_minor, 0),
      'legacy_balance_minor', coalesce(v_gate.legacy_balance_minor, 0),
      'currency', coalesce(v_projection.currency, v_gate.currency),
      'display_basis', v_display_basis
    ),
    'events', v_events,
    'event_contribution_total_minor', v_event_total,
    'reconciliation_bridge_lines', v_bridge_lines,
    'legacy_reconciliation', jsonb_build_object(
      'status', coalesce(v_gate.status, 'cannot_compare'),
      'difference_minor', coalesce(v_gate.difference_minor, 0),
      'divergence_reason', v_gate.divergence_reason,
      'recommended_action', v_gate.recommended_action
    ),
    'chain_verification', jsonb_build_object(
      'is_valid', coalesce(v_chain_is_valid, false),
      'checked_count', coalesce(v_chain_checked_count, 0),
      'verified_at', v_chain_verified_at,
      'head_sequence', coalesce(v_current_head.head_sequence, 0),
      'head_hash', v_current_head.head_hash
    ),
    'anchor_consistency', jsonb_build_object(
      'has_anchor', coalesce(v_anchor.has_anchor, false),
      'anchor_consistent', v_anchor.anchor_consistent,
      'anchor_sequence', v_anchor.anchor_sequence,
      'anchor_hash', v_anchor_hash,
      'anchored_at', v_anchor.anchored_at,
      'events_after_anchor', coalesce(v_anchor.events_after_anchor, 0)
    ),
    'badge_state', v_badge_state,
    'export_allowed', v_export_allowed,
    'safe_user_message', v_safe_message,
    'notices', v_notices,
    'accrued_past_lease_end', v_accrued_past_lease_end,
    'has_reconstructed', v_has_reconstructed,
    'generated_at', now()
  );
end;
$$;

comment on function public.explain_property_balance(uuid) is
  'Returns a complete balance explanation for a property including labels, events, reconciliation bridge lines, chain verification with head reference, anchor hash, and evidence flags. Single-call contract for Explain This Balance + Balance Evidence Summary. Sprint 2C.';

revoke all on function public.explain_property_balance(uuid)
  from public, anon, authenticated;
grant execute on function public.explain_property_balance(uuid) to authenticated;

-- ─── Self-serve provenance cutover activation ─────────────────────────────────

create or replace function public.activate_provenance_cutover(
  p_account_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_role text;
  v_existing record;
  v_backfill_result jsonb;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'authentication required';
  end if;

  v_role := public.account_member_effective_role(p_account_id, v_actor_id);
  if not public.user_is_root_operator()
     and coalesce(v_role, '') <> all (array['owner', 'admin']) then
    raise exception 'account owner or admin role required';
  end if;

  select c.account_id, c.status into v_existing
  from public.provenance_finance_cutover c
  where c.account_id = p_account_id;

  if found and v_existing.status = 'active' then
    return jsonb_build_object(
      'account_id', p_account_id,
      'activated', false,
      'reason', 'already_active'
    );
  end if;

  if found then
    update public.provenance_finance_cutover
    set status = 'active',
        cutover_at = now()
    where account_id = p_account_id;
  else
    insert into public.provenance_finance_cutover (
      account_id, cutover_at, cutover_version, status, created_by
    ) values (
      p_account_id, now(), 1, 'active', v_actor_id
    );
  end if;

  v_backfill_result := public.provenance_finance_backfill(p_account_id);

  perform public.anchor_provenance_chain(p_account_id);

  return jsonb_build_object(
    'account_id', p_account_id,
    'activated', true,
    'cutover_at', now(),
    'backfill', v_backfill_result
  );
end;
$$;

comment on function public.activate_provenance_cutover(uuid) is
  'Self-serve activation of provenance finance tracking for an account. Inserts the cutover row, runs the historical backfill, and returns a summary. Idempotent — returns already_active if cutover exists. Owner/admin only.';

revoke all on function public.activate_provenance_cutover(uuid)
  from public, anon, authenticated;
grant execute on function public.activate_provenance_cutover(uuid) to authenticated;
