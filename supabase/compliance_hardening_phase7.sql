-- =============================================================================
-- Compliance Suite — Phase 7: Remaining Limitations Fixes
-- =============================================================================
-- Resolves: L-003/L-020 (updated_at triggers), L-009 (jurisdiction validation),
--           L-010 (mark-as-filed audit trail), L-021 (read entitlement RPCs)
--
-- Apply after: compliance_suite_phase0.sql, compliance_security_hardening.sql,
--              account_entitlements.sql, account_branding.sql
-- =============================================================================


-- ─── L-003 / L-020: updated_at auto-triggers for compliance tables ────────────
--
-- Uses the existing public.tg_set_updated_at() defined in baseline_schema.sql.
-- Attaches it to the four Phase-0 compliance tables that lacked it.
-- Uses DROP IF EXISTS + CREATE to be idempotent on re-runs.

drop trigger if exists trg_tax_records_updated_at on public.tax_records;
create trigger trg_tax_records_updated_at
  before update on public.tax_records
  for each row execute function public.tg_set_updated_at();

drop trigger if exists trg_rent_shield_assessments_updated_at on public.rent_shield_assessments;
create trigger trg_rent_shield_assessments_updated_at
  before update on public.rent_shield_assessments
  for each row execute function public.tg_set_updated_at();

drop trigger if exists trg_lease_audits_updated_at on public.lease_audits;
create trigger trg_lease_audits_updated_at
  before update on public.lease_audits
  for each row execute function public.tg_set_updated_at();

drop trigger if exists trg_lease_audit_findings_updated_at on public.lease_audit_findings;
create trigger trg_lease_audit_findings_updated_at
  before update on public.lease_audit_findings
  for each row execute function public.tg_set_updated_at();


-- ─── L-009: jurisdiction CHECK constraint ────────────────────────────────────
--
-- The frontend already uppercases and slices to 2 chars, but a user with a valid
-- session can still call the RPC with an invalid jurisdiction.
-- The RPC already uppercases; this constraint enforces it at the DB level.
-- Allows NULL (non-tax compliance_items have no jurisdiction).

do $$ begin
  alter table public.compliance_items
    add constraint compliance_items_jurisdiction_valid
    check (jurisdiction is null or jurisdiction in ('GB', 'PL', 'DE'));
exception when duplicate_object then null;
end $$;


-- ─── L-010: compliance_audit_log table + mark_as_filed logging ───────────────
--
-- document_audit_log has incompatible action check constraint. Create a
-- compliance-specific audit table so mark-as-filed events are traceable.

create table if not exists public.compliance_audit_log (
  id           uuid        primary key default gen_random_uuid(),
  account_id   uuid        not null references public.accounts(id) on delete cascade,
  item_id      uuid        not null,     -- compliance_items.id
  action       text        not null,     -- 'mark_filed', 'create', 'delete', etc.
  performed_by uuid        references auth.users(id),
  metadata     jsonb       default '{}',
  created_at   timestamptz not null default now()
);

comment on table public.compliance_audit_log is
  'Append-only log of compliance item state changes (mark_filed, etc.). '
  'Resolves L-010.';

alter table public.compliance_audit_log enable row level security;

drop policy if exists compliance_audit_log_manage_read on public.compliance_audit_log;
create policy compliance_audit_log_manage_read
  on public.compliance_audit_log
  for select
  to authenticated
  using (public.user_can_manage_account(account_id));

drop policy if exists compliance_audit_log_no_direct_write on public.compliance_audit_log;
create policy compliance_audit_log_no_direct_write
  on public.compliance_audit_log
  for all
  to authenticated
  using (false)
  with check (false);

revoke insert, update, delete on public.compliance_audit_log from authenticated;
grant select on public.compliance_audit_log to authenticated;


-- ─── Update mark_tax_item_filed RPC to log the event ─────────────────────────

create or replace function public.mark_tax_item_filed(
  p_id              uuid,
  p_account_id      uuid,
  p_filed_at        timestamptz default null,
  p_filing_reference text       default null
)
returns setof public.compliance_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid := public.assert_manage_account_access(p_account_id);
  v_now        timestamptz := coalesce(p_filed_at, now());
begin
  perform public.assert_account_feature_access(v_account_id, 'tax_readiness_dashboard');

  -- Insert audit row before the update so it's recorded even if update fails
  insert into public.compliance_audit_log (
    account_id, item_id, action, performed_by, metadata
  ) values (
    v_account_id,
    p_id,
    'mark_filed',
    auth.uid(),
    jsonb_build_object(
      'filed_at', v_now,
      'filing_reference', nullif(trim(coalesce(p_filing_reference, '')), '')
    )
  );

  return query
  update public.compliance_items
  set
    filed_at          = v_now,
    filing_reference  = nullif(trim(coalesce(p_filing_reference, '')), ''),
    status            = 'completed',
    completed_at      = v_now,
    last_completed_at = v_now,
    updated_at        = v_now
  where id         = p_id
    and account_id = v_account_id
    and category   = 'tax'
  returning *;
end;
$$;

comment on function public.mark_tax_item_filed(uuid, uuid, timestamptz, text) is
  'Marks a tax item as filed after verifying entitlement. Appends a row to '
  'compliance_audit_log for traceability. Resolves L-010.';

revoke all on function public.mark_tax_item_filed(uuid, uuid, timestamptz, text) from public;
grant execute on function public.mark_tax_item_filed(uuid, uuid, timestamptz, text) to authenticated;


-- ─── L-021: Read entitlement RPCs for all compliance read operations ──────────
--
-- Without these RPCs, a starter-plan user with a valid session can read
-- compliance data directly via the Supabase API. RLS enforces account
-- membership but not plan entitlement. These RPCs add server-side plan checks.

-- ── list_tax_items ─────────────────────────────────────────────────────────

create or replace function public.list_tax_items(
  p_account_id  uuid,
  p_jurisdiction text default null
)
returns setof public.compliance_items
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_account_id uuid := public.assert_manage_account_access(p_account_id);
begin
  perform public.assert_account_feature_access(v_account_id, 'tax_readiness_dashboard');
  return query
  select * from public.compliance_items
  where account_id = v_account_id
    and category   = 'tax'
    and (p_jurisdiction is null or jurisdiction = upper(left(trim(p_jurisdiction), 2)))
  order by deadline_date asc nulls last;
end;
$$;

revoke all on function public.list_tax_items(uuid, text) from public;
grant execute on function public.list_tax_items(uuid, text) to authenticated;


-- ── list_tax_records ───────────────────────────────────────────────────────

create or replace function public.list_tax_records(
  p_account_id    uuid,
  p_country_code  text    default null,
  p_record_type   text    default null,
  p_review_status text    default null,
  p_date_from     date    default null,
  p_date_to       date    default null,
  p_limit         integer default 100,
  p_offset        integer default 0
)
returns setof public.tax_records
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_account_id uuid := public.assert_manage_account_access(p_account_id);
begin
  perform public.assert_account_feature_access(v_account_id, 'tax_readiness_dashboard');
  return query
  select * from public.tax_records
  where account_id = v_account_id
    and (p_country_code  is null or country_code   = upper(left(trim(p_country_code), 2)))
    and (p_record_type   is null or record_type    = p_record_type)
    and (p_review_status is null or review_status  = p_review_status)
    and (p_date_from     is null or record_date    >= p_date_from)
    and (p_date_to       is null or record_date    <= p_date_to)
  order by record_date desc
  limit p_limit offset p_offset;
end;
$$;

revoke all on function public.list_tax_records(uuid, text, text, text, date, date, integer, integer) from public;
grant execute on function public.list_tax_records(uuid, text, text, text, date, date, integer, integer) to authenticated;


-- ── list_tax_exports ───────────────────────────────────────────────────────

create or replace function public.list_tax_exports(
  p_account_id uuid,
  p_limit      integer default 50,
  p_offset     integer default 0
)
returns setof public.tax_exports
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_account_id uuid := public.assert_manage_account_access(p_account_id);
begin
  perform public.assert_account_feature_access(v_account_id, 'tax_readiness_dashboard');
  return query
  select * from public.tax_exports
  where account_id = v_account_id
  order by created_at desc
  limit p_limit offset p_offset;
end;
$$;

revoke all on function public.list_tax_exports(uuid, integer, integer) from public;
grant execute on function public.list_tax_exports(uuid, integer, integer) to authenticated;


-- ── list_rent_shield_assessments ───────────────────────────────────────────

create or replace function public.list_rent_shield_assessments(
  p_account_id uuid,
  p_property_id uuid    default null,
  p_limit       integer default 24
)
returns setof public.rent_shield_assessments
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_account_id uuid := public.assert_manage_account_access(p_account_id);
begin
  perform public.assert_account_feature_access(v_account_id, 'rent_shield');
  return query
  select * from public.rent_shield_assessments
  where account_id  = v_account_id
    and (p_property_id is null or property_id = p_property_id)
  order by period desc
  limit p_limit;
end;
$$;

revoke all on function public.list_rent_shield_assessments(uuid, uuid, integer) from public;
grant execute on function public.list_rent_shield_assessments(uuid, uuid, integer) to authenticated;


-- ── list_lease_audits ──────────────────────────────────────────────────────

create or replace function public.list_lease_audits(
  p_account_id uuid,
  p_lease_id   uuid default null
)
returns setof public.lease_audits
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_account_id uuid := public.assert_manage_account_access(p_account_id);
begin
  perform public.assert_account_feature_access(v_account_id, 'ai_lease_auditor');
  return query
  select * from public.lease_audits
  where account_id = v_account_id
    and (p_lease_id is null or lease_id = p_lease_id)
  order by created_at desc;
end;
$$;

revoke all on function public.list_lease_audits(uuid, uuid) from public;
grant execute on function public.list_lease_audits(uuid, uuid) to authenticated;


-- ── get_latest_lease_audit ────────────────────────────────────────────────

create or replace function public.get_latest_lease_audit(
  p_account_id uuid,
  p_lease_id   uuid
)
returns setof public.lease_audits
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_account_id uuid := public.assert_manage_account_access(p_account_id);
begin
  perform public.assert_account_feature_access(v_account_id, 'ai_lease_auditor');
  return query
  select * from public.lease_audits
  where account_id = v_account_id
    and lease_id   = p_lease_id
  order by created_at desc
  limit 1;
end;
$$;

revoke all on function public.get_latest_lease_audit(uuid, uuid) from public;
grant execute on function public.get_latest_lease_audit(uuid, uuid) to authenticated;


-- ── list_lease_audit_findings ─────────────────────────────────────────────

create or replace function public.list_lease_audit_findings(
  p_account_id     uuid,
  p_lease_audit_id uuid
)
returns setof public.lease_audit_findings
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_account_id uuid := public.assert_manage_account_access(p_account_id);
begin
  perform public.assert_account_feature_access(v_account_id, 'ai_lease_auditor');
  return query
  select * from public.lease_audit_findings
  where account_id      = v_account_id
    and lease_audit_id  = p_lease_audit_id
  order by created_at asc;
end;
$$;

revoke all on function public.list_lease_audit_findings(uuid, uuid) from public;
grant execute on function public.list_lease_audit_findings(uuid, uuid) to authenticated;
