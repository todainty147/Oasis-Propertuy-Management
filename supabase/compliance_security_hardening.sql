-- Phase 5 – Compliance Suite: Security Hardening
--
-- Wraps all compliance write operations in RPCs that call
-- assert_manage_account_access + assert_account_feature_access before
-- acting. Resolves L-007, L-011, L-022, L-029, L-036.
--
-- Apply after: compliance_suite_phase0.sql, account_entitlements.sql,
--              account_branding.sql (defines assert_manage_account_access)

-- ─── Tax Readiness: compliance_items (category = 'tax') ───────────────────────

create or replace function public.create_tax_item(
  p_account_id               uuid,
  p_title                    text,
  p_jurisdiction             text,
  p_deadline_date            date,
  p_tax_filing_type          text    default null,
  p_recurrence_interval_months integer default 0,
  p_notes                    text    default null,
  p_property_id              uuid    default null
)
returns setof public.compliance_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid := public.assert_manage_account_access(p_account_id);
begin
  perform public.assert_account_feature_access(v_account_id, 'tax_readiness_dashboard');

  return query
  insert into public.compliance_items (
    account_id, property_id, title, category,
    due_date, deadline_date, jurisdiction,
    tax_filing_type, recurrence_interval_months, notes, status
  )
  values (
    v_account_id,
    p_property_id,
    trim(p_title),
    'tax',
    p_deadline_date,
    p_deadline_date,
    upper(left(trim(p_jurisdiction), 2)),
    nullif(trim(coalesce(p_tax_filing_type, '')), ''),
    greatest(0, least(60, coalesce(p_recurrence_interval_months, 0))),
    nullif(trim(coalesce(p_notes, '')), ''),
    'active'
  )
  returning *;
end;
$$;

comment on function public.create_tax_item(uuid, text, text, date, text, integer, text, uuid) is
  'Inserts a tax compliance item after verifying account membership and tax_readiness_dashboard entitlement.';

revoke all on function public.create_tax_item(uuid, text, text, date, text, integer, text, uuid) from public;
grant execute on function public.create_tax_item(uuid, text, text, date, text, integer, text, uuid) to authenticated;


create or replace function public.mark_tax_item_filed(
  p_id         uuid,
  p_account_id uuid,
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

  return query
  update public.compliance_items
  set
    filed_at         = v_now,
    filing_reference = nullif(trim(coalesce(p_filing_reference, '')), ''),
    status           = 'completed',
    completed_at     = v_now,
    last_completed_at = v_now,
    updated_at       = v_now
  where id         = p_id
    and account_id = v_account_id
    and category   = 'tax'
  returning *;
end;
$$;

comment on function public.mark_tax_item_filed(uuid, uuid, timestamptz, text) is
  'Marks a tax item as filed after verifying entitlement.';

revoke all on function public.mark_tax_item_filed(uuid, uuid, timestamptz, text) from public;
grant execute on function public.mark_tax_item_filed(uuid, uuid, timestamptz, text) to authenticated;


create or replace function public.delete_tax_item(
  p_id         uuid,
  p_account_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid := public.assert_manage_account_access(p_account_id);
begin
  perform public.assert_account_feature_access(v_account_id, 'tax_readiness_dashboard');

  delete from public.compliance_items
  where id         = p_id
    and account_id = v_account_id
    and category   = 'tax';
end;
$$;

comment on function public.delete_tax_item(uuid, uuid) is
  'Deletes a tax item after verifying entitlement.';

revoke all on function public.delete_tax_item(uuid, uuid) from public;
grant execute on function public.delete_tax_item(uuid, uuid) to authenticated;


-- ─── Tax Records ──────────────────────────────────────────────────────────────

create or replace function public.create_tax_record(
  p_account_id        uuid,
  p_record_type       text,
  p_country_code      text,
  p_record_date       date,
  p_amount            numeric  default null,
  p_currency          text     default 'GBP',
  p_tax_category_code text     default null,
  p_tax_treatment     text     default 'review_required',
  p_description       text     default null,
  p_evidence_status   text     default 'missing',
  p_property_id       uuid     default null,
  p_tenant_id         uuid     default null,
  p_payment_id        uuid     default null,
  p_document_id       uuid     default null
)
returns setof public.tax_records
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid := public.assert_manage_account_access(p_account_id);
begin
  perform public.assert_account_feature_access(v_account_id, 'tax_readiness_dashboard');

  return query
  insert into public.tax_records (
    account_id, property_id, tenant_id, payment_id, document_id,
    country_code, record_type, amount, currency,
    tax_category_code, tax_treatment,
    record_date, description,
    evidence_status, review_status
  )
  values (
    v_account_id,
    p_property_id,
    p_tenant_id,
    p_payment_id,
    p_document_id,
    upper(left(trim(p_country_code), 2)),
    p_record_type,
    p_amount,
    upper(left(trim(coalesce(p_currency, 'GBP')), 3)),
    nullif(trim(coalesce(p_tax_category_code, '')), ''),
    p_tax_treatment,
    p_record_date,
    nullif(trim(coalesce(p_description, '')), ''),
    p_evidence_status,
    'unreviewed'
  )
  returning *;
end;
$$;

comment on function public.create_tax_record(uuid, text, text, date, numeric, text, text, text, text, text, uuid, uuid, uuid, uuid) is
  'Inserts a tax record after verifying tax_readiness_dashboard entitlement.';

revoke all on function public.create_tax_record(uuid, text, text, date, numeric, text, text, text, text, text, uuid, uuid, uuid, uuid) from public;
grant execute on function public.create_tax_record(uuid, text, text, date, numeric, text, text, text, text, text, uuid, uuid, uuid, uuid) to authenticated;


create or replace function public.update_tax_record_review_status(
  p_id            uuid,
  p_account_id    uuid,
  p_review_status text
)
returns setof public.tax_records
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid := public.assert_manage_account_access(p_account_id);
begin
  perform public.assert_account_feature_access(v_account_id, 'tax_readiness_dashboard');

  return query
  update public.tax_records
  set
    review_status = p_review_status,
    updated_at    = now()
  where id         = p_id
    and account_id = v_account_id
  returning *;
end;
$$;

comment on function public.update_tax_record_review_status(uuid, uuid, text) is
  'Updates review_status on a tax record after verifying entitlement.';

revoke all on function public.update_tax_record_review_status(uuid, uuid, text) from public;
grant execute on function public.update_tax_record_review_status(uuid, uuid, text) to authenticated;


create or replace function public.delete_tax_record(
  p_id         uuid,
  p_account_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid := public.assert_manage_account_access(p_account_id);
begin
  perform public.assert_account_feature_access(v_account_id, 'tax_readiness_dashboard');

  delete from public.tax_records
  where id         = p_id
    and account_id = v_account_id;
end;
$$;

comment on function public.delete_tax_record(uuid, uuid) is
  'Deletes a tax record after verifying entitlement.';

revoke all on function public.delete_tax_record(uuid, uuid) from public;
grant execute on function public.delete_tax_record(uuid, uuid) to authenticated;


-- ─── Tax Exports ──────────────────────────────────────────────────────────────

create or replace function public.record_tax_export(
  p_account_id  uuid,
  p_country_code text,
  p_tax_mode    text,
  p_period_label text,
  p_export_type text    default 'csv',
  p_row_count   integer default 0
)
returns setof public.tax_exports
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid := public.assert_manage_account_access(p_account_id);
begin
  perform public.assert_account_feature_access(v_account_id, 'tax_readiness_dashboard');

  return query
  insert into public.tax_exports (
    account_id, country_code, tax_mode, period_label,
    export_type, status, generated_at, metadata
  )
  values (
    v_account_id,
    nullif(upper(left(trim(coalesce(p_country_code, '')), 2)), ''),
    trim(p_tax_mode),
    trim(p_period_label),
    p_export_type,
    'complete',
    now(),
    jsonb_build_object('row_count', coalesce(p_row_count, 0))
  )
  returning *;
end;
$$;

comment on function public.record_tax_export(uuid, text, text, text, text, integer) is
  'Records a tax export audit row after verifying tax_readiness_dashboard entitlement.';

revoke all on function public.record_tax_export(uuid, text, text, text, text, integer) from public;
grant execute on function public.record_tax_export(uuid, text, text, text, text, integer) to authenticated;


-- ─── Rent Shield ──────────────────────────────────────────────────────────────

create or replace function public.upsert_rent_shield_assessment(
  p_account_id     uuid,
  p_property_id    uuid,
  p_period         text,
  p_shield_score   integer,
  p_shield_tier    text,
  p_arrears_amount numeric,
  p_days_overdue_p90 numeric
)
returns setof public.rent_shield_assessments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid := public.assert_manage_account_access(p_account_id);
begin
  perform public.assert_account_feature_access(v_account_id, 'rent_shield');

  return query
  insert into public.rent_shield_assessments (
    account_id, property_id, period,
    shield_score, shield_tier,
    arrears_amount, days_overdue_p90,
    generated_at
  )
  values (
    v_account_id,
    p_property_id,
    p_period,
    p_shield_score,
    p_shield_tier,
    p_arrears_amount,
    p_days_overdue_p90,
    now()
  )
  on conflict (account_id, property_id, period)
  do update set
    shield_score      = excluded.shield_score,
    shield_tier       = excluded.shield_tier,
    arrears_amount    = excluded.arrears_amount,
    days_overdue_p90  = excluded.days_overdue_p90,
    generated_at      = excluded.generated_at
  returning *;
end;
$$;

comment on function public.upsert_rent_shield_assessment(uuid, uuid, text, integer, text, numeric, numeric) is
  'Upserts a Rent Shield assessment row after verifying rent_shield entitlement.';

revoke all on function public.upsert_rent_shield_assessment(uuid, uuid, text, integer, text, numeric, numeric) from public;
grant execute on function public.upsert_rent_shield_assessment(uuid, uuid, text, integer, text, numeric, numeric) to authenticated;


-- ─── Lease Audits ─────────────────────────────────────────────────────────────

create or replace function public.create_lease_audit(
  p_account_id uuid,
  p_lease_id   uuid
)
returns setof public.lease_audits
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid := public.assert_manage_account_access(p_account_id);
begin
  perform public.assert_account_feature_access(v_account_id, 'ai_lease_auditor');

  return query
  insert into public.lease_audits (account_id, lease_id, status)
  values (v_account_id, p_lease_id, 'pending')
  returning *;
end;
$$;

comment on function public.create_lease_audit(uuid, uuid) is
  'Creates a lease audit row after verifying ai_lease_auditor entitlement.';

revoke all on function public.create_lease_audit(uuid, uuid) from public;
grant execute on function public.create_lease_audit(uuid, uuid) to authenticated;


create or replace function public.update_lease_audit_status(
  p_id         uuid,
  p_account_id uuid,
  p_status     text,
  p_summary    text default null
)
returns setof public.lease_audits
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid := public.assert_manage_account_access(p_account_id);
  v_now        timestamptz := now();
begin
  perform public.assert_account_feature_access(v_account_id, 'ai_lease_auditor');

  return query
  update public.lease_audits
  set
    status       = p_status,
    summary      = case when p_summary is not null
                        then nullif(trim(p_summary), '')
                        else summary end,
    completed_at = case when p_status = 'complete' then v_now else completed_at end,
    updated_at   = v_now
  where id         = p_id
    and account_id = v_account_id
  returning *;
end;
$$;

comment on function public.update_lease_audit_status(uuid, uuid, text, text) is
  'Updates status on a lease audit row after verifying ai_lease_auditor entitlement.';

revoke all on function public.update_lease_audit_status(uuid, uuid, text, text) from public;
grant execute on function public.update_lease_audit_status(uuid, uuid, text, text) to authenticated;


-- ─── Lease Audit Findings ─────────────────────────────────────────────────────

create or replace function public.create_lease_audit_finding(
  p_account_id     uuid,
  p_lease_audit_id uuid,
  p_risk_level     text   default 'medium',
  p_clause_ref     text   default null,
  p_clause_text    text   default null,
  p_category       text   default null,
  p_explanation    text   default null
)
returns setof public.lease_audit_findings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid := public.assert_manage_account_access(p_account_id);
begin
  perform public.assert_account_feature_access(v_account_id, 'ai_lease_auditor');

  return query
  insert into public.lease_audit_findings (
    account_id, lease_audit_id,
    clause_ref, clause_text, risk_level, category, explanation,
    dismissed
  )
  values (
    v_account_id,
    p_lease_audit_id,
    nullif(trim(coalesce(p_clause_ref, '')), ''),
    nullif(trim(coalesce(p_clause_text, '')), ''),
    p_risk_level,
    nullif(trim(coalesce(p_category, '')), ''),
    nullif(trim(coalesce(p_explanation, '')), ''),
    false
  )
  returning *;
end;
$$;

comment on function public.create_lease_audit_finding(uuid, uuid, text, text, text, text, text) is
  'Inserts a lease audit finding after verifying ai_lease_auditor entitlement.';

revoke all on function public.create_lease_audit_finding(uuid, uuid, text, text, text, text, text) from public;
grant execute on function public.create_lease_audit_finding(uuid, uuid, text, text, text, text, text) to authenticated;


create or replace function public.dismiss_lease_audit_finding(
  p_id         uuid,
  p_account_id uuid
)
returns setof public.lease_audit_findings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid := public.assert_manage_account_access(p_account_id);
begin
  perform public.assert_account_feature_access(v_account_id, 'ai_lease_auditor');

  return query
  update public.lease_audit_findings
  set
    dismissed    = true,
    dismissed_at = now()
  where id         = p_id
    and account_id = v_account_id
  returning *;
end;
$$;

comment on function public.dismiss_lease_audit_finding(uuid, uuid) is
  'Soft-dismisses a lease audit finding after verifying ai_lease_auditor entitlement.';

revoke all on function public.dismiss_lease_audit_finding(uuid, uuid) from public;
grant execute on function public.dismiss_lease_audit_finding(uuid, uuid) to authenticated;


create or replace function public.restore_lease_audit_finding(
  p_id         uuid,
  p_account_id uuid
)
returns setof public.lease_audit_findings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid := public.assert_manage_account_access(p_account_id);
begin
  perform public.assert_account_feature_access(v_account_id, 'ai_lease_auditor');

  return query
  update public.lease_audit_findings
  set
    dismissed    = false,
    dismissed_at = null,
    dismissed_by = null
  where id         = p_id
    and account_id = v_account_id
  returning *;
end;
$$;

comment on function public.restore_lease_audit_finding(uuid, uuid) is
  'Restores a dismissed lease audit finding after verifying ai_lease_auditor entitlement.';

revoke all on function public.restore_lease_audit_finding(uuid, uuid) from public;
grant execute on function public.restore_lease_audit_finding(uuid, uuid) to authenticated;


create or replace function public.delete_lease_audit_finding(
  p_id         uuid,
  p_account_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid := public.assert_manage_account_access(p_account_id);
begin
  perform public.assert_account_feature_access(v_account_id, 'ai_lease_auditor');

  delete from public.lease_audit_findings
  where id         = p_id
    and account_id = v_account_id;
end;
$$;

comment on function public.delete_lease_audit_finding(uuid, uuid) is
  'Hard-deletes a lease audit finding after verifying ai_lease_auditor entitlement.';

revoke all on function public.delete_lease_audit_finding(uuid, uuid) from public;
grant execute on function public.delete_lease_audit_finding(uuid, uuid) to authenticated;


-- ─── L-027: latest Rent Shield assessment per property (DISTINCT ON) ──────────

create or replace function public.get_latest_assessments_by_property(
  p_account_id uuid
)
returns setof public.rent_shield_assessments
language sql
security definer
stable
set search_path = public
as $$
  select distinct on (property_id) *
  from public.rent_shield_assessments
  where account_id = public.assert_manage_account_access(p_account_id)
  order by property_id, generated_at desc;
$$;

comment on function public.get_latest_assessments_by_property(uuid) is
  'Returns the most recent Rent Shield assessment per property using DISTINCT ON. Resolves L-027.';

revoke all on function public.get_latest_assessments_by_property(uuid) from public;
grant execute on function public.get_latest_assessments_by_property(uuid) to authenticated;


-- ─── L-030: latest lease audit per lease (DISTINCT ON) ───────────────────────

create or replace function public.get_latest_audits_by_lease(
  p_account_id uuid
)
returns setof public.lease_audits
language sql
security definer
stable
set search_path = public
as $$
  select distinct on (lease_id) *
  from public.lease_audits
  where account_id = public.assert_manage_account_access(p_account_id)
  order by lease_id, created_at desc;
$$;

comment on function public.get_latest_audits_by_lease(uuid) is
  'Returns the most recent lease audit per lease using DISTINCT ON. Resolves L-030.';

revoke all on function public.get_latest_audits_by_lease(uuid) from public;
grant execute on function public.get_latest_audits_by_lease(uuid) to authenticated;
