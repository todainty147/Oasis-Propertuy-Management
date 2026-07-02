-- Make HMRC quarterly draft preparation generally available to account
-- managers. Sandbox submission and live pilot/network controls remain behind
-- their separate feature flags.

begin;

-- Note: these tables are created by HMRC MTD overlay SQL files, not by migrations.
-- The DO blocks guard against the case where supabase db reset runs migrations before
-- overlays have been applied (e.g. on a fresh local dev DB bootstrap).
do $$ begin
  drop policy if exists "Managers can manage MTD quarterly drafts" on public.mtd_quarterly_update_drafts;
exception when undefined_table then null;
end $$;
do $$ begin
  create policy "Managers can manage MTD quarterly drafts"
    on public.mtd_quarterly_update_drafts
    to authenticated
    using (public.user_can_manage_account(account_id))
    with check (public.user_can_manage_account(account_id));
exception when undefined_table or duplicate_object then null;
end $$;

do $$ begin
  drop policy if exists "Managers can manage MTD quarterly draft lines" on public.mtd_quarterly_update_draft_lines;
exception when undefined_table then null;
end $$;
do $$ begin
  create policy "Managers can manage MTD quarterly draft lines"
    on public.mtd_quarterly_update_draft_lines
    to authenticated
    using (public.user_can_manage_account(account_id))
    with check (public.user_can_manage_account(account_id));
exception when undefined_table or duplicate_object then null;
end $$;

do $$ begin
  drop policy if exists "Managers can read MTD quarterly draft audit" on public.mtd_quarterly_update_audit_events;
exception when undefined_table then null;
end $$;
do $$ begin
  create policy "Managers can read MTD quarterly draft audit"
    on public.mtd_quarterly_update_audit_events
    for select
    to authenticated
    using (public.user_can_manage_account(account_id));
exception when undefined_table or duplicate_object then null;
end $$;

do $$ begin
  drop policy if exists "Managers can insert MTD quarterly draft audit" on public.mtd_quarterly_update_audit_events;
exception when undefined_table then null;
end $$;
do $$ begin
  create policy "Managers can insert MTD quarterly draft audit"
    on public.mtd_quarterly_update_audit_events
    for insert
    to authenticated
    with check (public.user_can_manage_account(account_id));
exception when undefined_table or duplicate_object then null;
end $$;

do $$ begin
  drop policy if exists "Managers can read MTD sandbox submission attempts" on public.mtd_quarterly_submission_attempts;
exception when undefined_table then null;
end $$;
do $$ begin
  create policy "Managers can read MTD sandbox submission attempts"
    on public.mtd_quarterly_submission_attempts
    for select
    to authenticated
    using (public.user_can_manage_account(account_id));
exception when undefined_table or duplicate_object then null;
end $$;

do $$ begin
  drop policy if exists "Managers can read MTD sandbox submission events" on public.mtd_quarterly_submission_events;
exception when undefined_table then null;
end $$;
do $$ begin
  create policy "Managers can read MTD sandbox submission events"
    on public.mtd_quarterly_submission_events
    for select
    to authenticated
    using (public.user_can_manage_account(account_id));
exception when undefined_table or duplicate_object then null;
end $$;

do $$ begin
  drop policy if exists "Managers can read HMRC live submission consents" on public.hmrc_live_submission_consents;
exception when undefined_table then null;
end $$;
do $$ begin
  create policy "Managers can read HMRC live submission consents"
    on public.hmrc_live_submission_consents
    for select
    to authenticated
    using (public.user_can_manage_account(account_id));
exception when undefined_table or duplicate_object then null;
end $$;

set local check_function_bodies = off;

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

revoke all on function public.record_hmrc_live_submission_consent(uuid, uuid, boolean, text, text) from public;
grant execute on function public.record_hmrc_live_submission_consent(uuid, uuid, boolean, text, text) to authenticated;

commit;
