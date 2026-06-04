-- HMRC MTD Phase 5A: live submission consent scaffolding.
-- This does not enable a live HMRC submission endpoint. It records and verifies
-- explicit landlord consent against a locked quarterly draft snapshot only.

create table if not exists public.hmrc_live_submission_consents (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  draft_id uuid not null references public.mtd_quarterly_update_drafts(id) on delete cascade,
  consented_by uuid not null,
  checkbox_confirmed boolean not null,
  consent_text_version text not null,
  consent_text_snapshot text not null,
  draft_status_at_consent text not null,
  draft_reviewed_at_at_consent timestamptz,
  draft_locked_at_at_consent timestamptz,
  draft_updated_at_at_consent timestamptz not null,
  draft_lines_hash text not null,
  category_totals_hash text not null,
  validation_summary_hash text not null,
  payload_preview_hash text,
  created_at timestamptz not null default now(),
  constraint hmrc_live_submission_consents_checkbox_check check (checkbox_confirmed is true),
  constraint hmrc_live_submission_consents_text_version_check check (length(trim(consent_text_version)) > 0),
  constraint hmrc_live_submission_consents_text_snapshot_check check (length(trim(consent_text_snapshot)) > 0),
  constraint hmrc_live_submission_consents_draft_status_check check (draft_status_at_consent = 'locked')
);

create index if not exists idx_hmrc_live_submission_consents_draft
  on public.hmrc_live_submission_consents(account_id, draft_id, created_at desc);

create index if not exists idx_hmrc_live_submission_consents_user
  on public.hmrc_live_submission_consents(account_id, consented_by, created_at desc);

alter table public.hmrc_live_submission_consents
  add column if not exists draft_lines_hash text,
  add column if not exists category_totals_hash text,
  add column if not exists validation_summary_hash text;

update public.hmrc_live_submission_consents
set
  draft_lines_hash = coalesce(draft_lines_hash, ''),
  category_totals_hash = coalesce(category_totals_hash, ''),
  validation_summary_hash = coalesce(validation_summary_hash, ''),
  payload_preview_hash = coalesce(payload_preview_hash, md5(''))
where draft_lines_hash is null
   or category_totals_hash is null
   or validation_summary_hash is null
   or payload_preview_hash is null;

alter table public.hmrc_live_submission_consents
  alter column draft_lines_hash set not null,
  alter column category_totals_hash set not null,
  alter column validation_summary_hash set not null;

create or replace function public.hmrc_quarterly_draft_lines_snapshot_hash(p_draft_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select md5(coalesce(jsonb_agg(
    jsonb_build_object(
      'id', l.id,
      'source_type', l.source_type,
      'source_table', l.source_table,
      'source_id', l.source_id,
      'property_id', l.property_id,
      'transaction_date', l.transaction_date,
      'description', l.description,
      'amount', l.amount,
      'direction', l.direction,
      'hmrc_category_key', l.hmrc_category_key,
      'include_in_draft', l.include_in_draft,
      'issue_status', l.issue_status,
      'evidence_status', l.evidence_status
    )
    order by l.transaction_date, l.id
  )::text, '[]'))
  from public.mtd_quarterly_update_draft_lines l
  where l.draft_id = p_draft_id;
$$;

create or replace function public.prevent_hmrc_live_submission_consent_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  raise exception 'HMRC live submission consent records are append-only';
end;
$$;

drop trigger if exists trg_prevent_hmrc_live_submission_consent_mutation on public.hmrc_live_submission_consents;
create trigger trg_prevent_hmrc_live_submission_consent_mutation
  before update or delete on public.hmrc_live_submission_consents
  for each row execute function public.prevent_hmrc_live_submission_consent_mutation();

create or replace function public.enforce_hmrc_live_submission_consent_account()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_draft_account_id uuid;
begin
  select d.account_id into v_draft_account_id
  from public.mtd_quarterly_update_drafts d
  where d.id = new.draft_id;

  if v_draft_account_id is null or v_draft_account_id <> new.account_id then
    raise exception 'HMRC live submission consent draft account mismatch';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_hmrc_live_submission_consent_account_match on public.hmrc_live_submission_consents;
create trigger trg_hmrc_live_submission_consent_account_match
  before insert on public.hmrc_live_submission_consents
  for each row execute function public.enforce_hmrc_live_submission_consent_account();

create or replace function public.record_hmrc_live_submission_consent(
  p_account_id uuid,
  p_draft_id uuid,
  p_checkbox_confirmed boolean,
  p_consent_text_version text,
  p_consent_text_snapshot text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_draft public.mtd_quarterly_update_drafts%rowtype;
  v_consent_id uuid;
  v_lines_hash text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not public.user_can_manage_account(p_account_id) then
    raise exception 'not_permitted';
  end if;

  if not public.account_has_feature(p_account_id, 'hmrc_mtd_quarterly_draft_builder') then
    raise exception 'hmrc_quarterly_drafts_not_enabled';
  end if;

  if p_checkbox_confirmed is distinct from true then
    raise exception 'checkbox_confirmed_required';
  end if;

  if length(trim(coalesce(p_consent_text_version, ''))) = 0 then
    raise exception 'consent_text_version_required';
  end if;

  if length(trim(coalesce(p_consent_text_snapshot, ''))) = 0 then
    raise exception 'consent_text_snapshot_required';
  end if;

  select * into v_draft
  from public.mtd_quarterly_update_drafts d
  where d.id = p_draft_id
    and d.account_id = p_account_id;

  if not found then
    raise exception 'quarterly_draft_not_found';
  end if;

  if v_draft.status <> 'locked' then
    raise exception 'draft_must_be_locked_for_live_consent';
  end if;

  if v_draft.reviewed_at is null or v_draft.locked_at is null then
    raise exception 'draft_review_and_lock_required_for_live_consent';
  end if;

  v_lines_hash := public.hmrc_quarterly_draft_lines_snapshot_hash(v_draft.id);

  insert into public.hmrc_live_submission_consents (
    account_id,
    draft_id,
    consented_by,
    checkbox_confirmed,
    consent_text_version,
    consent_text_snapshot,
    draft_status_at_consent,
    draft_reviewed_at_at_consent,
    draft_locked_at_at_consent,
    draft_updated_at_at_consent,
    draft_lines_hash,
    category_totals_hash,
    validation_summary_hash,
    payload_preview_hash
  ) values (
    p_account_id,
    p_draft_id,
    auth.uid(),
    p_checkbox_confirmed,
    trim(p_consent_text_version),
    trim(p_consent_text_snapshot),
    v_draft.status,
    v_draft.reviewed_at,
    v_draft.locked_at,
    v_draft.updated_at,
    v_lines_hash,
    md5(coalesce(v_draft.category_totals::text, '{}')),
    md5(coalesce(v_draft.validation_summary::text, '{}')),
    md5(coalesce(v_draft.payload_preview::text, ''))
  )
  returning id into v_consent_id;

  insert into public.mtd_quarterly_update_audit_events (
    account_id,
    draft_id,
    user_id,
    event_type,
    metadata
  ) values (
    p_account_id,
    p_draft_id,
    auth.uid(),
    'hmrc_live_submission_consent_recorded',
    jsonb_build_object(
      'consentId', v_consent_id,
      'consentTextVersion', trim(p_consent_text_version),
      'accountId', p_account_id,
      'draftId', p_draft_id,
      'userId', auth.uid(),
      'confirmedAt', now(),
      'draftStatus', v_draft.status,
      'draftUpdatedAt', v_draft.updated_at,
      'draftLinesHash', v_lines_hash,
      'categoryTotalsHash', md5(coalesce(v_draft.category_totals::text, '{}')),
      'validationSummaryHash', md5(coalesce(v_draft.validation_summary::text, '{}')),
      'payloadPreviewHash', md5(coalesce(v_draft.payload_preview::text, ''))
    )
  );

  return v_consent_id;
end;
$$;

create or replace function public.assert_hmrc_live_submission_consent(
  p_account_id uuid,
  p_draft_id uuid,
  p_consent_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_consent public.hmrc_live_submission_consents%rowtype;
  v_draft public.mtd_quarterly_update_drafts%rowtype;
begin
  if p_consent_id is null then
    raise exception 'missing_user_consent';
  end if;

  if auth.uid() is not null and not public.user_can_manage_account(p_account_id) then
    raise exception 'not_permitted';
  end if;

  select * into v_consent
  from public.hmrc_live_submission_consents c
  where c.id = p_consent_id;

  if not found then
    raise exception 'missing_user_consent';
  end if;

  if v_consent.account_id <> p_account_id or v_consent.draft_id <> p_draft_id then
    raise exception 'consent_draft_mismatch';
  end if;

  if v_consent.checkbox_confirmed is distinct from true then
    raise exception 'checkbox_confirmed_required';
  end if;

  select * into v_draft
  from public.mtd_quarterly_update_drafts d
  where d.id = p_draft_id
    and d.account_id = p_account_id;

  if not found then
    raise exception 'quarterly_draft_not_found';
  end if;

  if v_draft.status <> 'locked' then
    raise exception 'stale_user_consent';
  end if;

  if v_consent.draft_status_at_consent is distinct from v_draft.status
     or v_consent.draft_reviewed_at_at_consent is distinct from v_draft.reviewed_at
     or v_consent.draft_locked_at_at_consent is distinct from v_draft.locked_at
     or v_consent.draft_updated_at_at_consent is distinct from v_draft.updated_at
     or v_consent.draft_lines_hash is distinct from public.hmrc_quarterly_draft_lines_snapshot_hash(v_draft.id)
     or v_consent.category_totals_hash is distinct from md5(coalesce(v_draft.category_totals::text, '{}'))
     or v_consent.validation_summary_hash is distinct from md5(coalesce(v_draft.validation_summary::text, '{}'))
     or v_consent.payload_preview_hash is distinct from md5(coalesce(v_draft.payload_preview::text, '')) then
    raise exception 'stale_user_consent';
  end if;

  return jsonb_build_object(
    'consentId', v_consent.id,
    'accountId', v_consent.account_id,
    'draftId', v_consent.draft_id,
    'consentedBy', v_consent.consented_by,
    'consentTextVersion', v_consent.consent_text_version,
    'createdAt', v_consent.created_at
  );
end;
$$;

alter table public.hmrc_live_submission_consents enable row level security;

revoke all on public.hmrc_live_submission_consents from anon, authenticated;

drop policy if exists "Managers can read HMRC live submission consents" on public.hmrc_live_submission_consents;
create policy "Managers can read HMRC live submission consents"
  on public.hmrc_live_submission_consents
  for select
  to authenticated
  using (
    public.user_can_manage_account(account_id)
    and public.account_has_feature(account_id, 'hmrc_mtd_quarterly_draft_builder')
  );

grant select on public.hmrc_live_submission_consents to authenticated;

revoke all on function public.record_hmrc_live_submission_consent(uuid, uuid, boolean, text, text) from public;
revoke all on function public.assert_hmrc_live_submission_consent(uuid, uuid, uuid) from public;
grant execute on function public.record_hmrc_live_submission_consent(uuid, uuid, boolean, text, text) to authenticated;
revoke execute on function public.assert_hmrc_live_submission_consent(uuid, uuid, uuid) from authenticated;
grant execute on function public.assert_hmrc_live_submission_consent(uuid, uuid, uuid) to service_role;
revoke all on function public.hmrc_quarterly_draft_lines_snapshot_hash(uuid) from public;
grant execute on function public.hmrc_quarterly_draft_lines_snapshot_hash(uuid) to service_role;
