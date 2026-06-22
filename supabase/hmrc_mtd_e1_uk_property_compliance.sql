-- HMRC E1: in-year UK Property end-to-end compliance controls.
-- This overlay does not enable general live submission or any year-end journey.

alter table public.mtd_quarterly_update_drafts
  add column if not exists draft_type text not null default 'original',
  add column if not exists original_draft_id uuid references public.mtd_quarterly_update_drafts(id) on delete restrict,
  add column if not exists amendment_reason text,
  add column if not exists original_category_totals jsonb not null default '[]'::jsonb,
  add column if not exists accounting_type_snapshot text,
  add column if not exists accounting_type_review_required boolean not null default false,
  add column if not exists accounting_type_reviewed_at timestamptz;

alter table public.mtd_quarterly_update_drafts
  drop constraint if exists mtd_quarterly_update_drafts_type_check;
alter table public.mtd_quarterly_update_drafts
  add constraint mtd_quarterly_update_drafts_type_check
  check (draft_type in ('original', 'amendment'));

alter table public.mtd_quarterly_update_drafts
  drop constraint if exists mtd_quarterly_update_drafts_accounting_type_check;
alter table public.mtd_quarterly_update_drafts
  add constraint mtd_quarterly_update_drafts_accounting_type_check
  check (accounting_type_snapshot is null or accounting_type_snapshot in ('CASH', 'ACCRUALS'));

alter table public.mtd_quarterly_update_drafts
  drop constraint if exists mtd_quarterly_update_drafts_amendment_check;
alter table public.mtd_quarterly_update_drafts
  add constraint mtd_quarterly_update_drafts_amendment_check check (
    (draft_type = 'original' and original_draft_id is null)
    or
    (
      draft_type = 'amendment'
      and original_draft_id is not null
      and length(trim(coalesce(amendment_reason, ''))) > 0
    )
  );

create unique index if not exists idx_mtd_quarterly_one_open_amendment
  on public.mtd_quarterly_update_drafts(account_id, original_draft_id)
  where draft_type = 'amendment'
    and status <> 'archived'
    and coalesce(sandbox_submission_status, '') <> 'success'
    and coalesce(live_submission_status, '') <> 'success';

create or replace function public.prevent_locked_mtd_draft_line_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status text;
begin
  select status into v_status
  from public.mtd_quarterly_update_drafts
  where id = coalesce(new.draft_id, old.draft_id);

  if v_status = 'locked' then
    raise exception 'locked_mtd_draft_snapshot_is_immutable';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_locked_mtd_draft_line_mutation on public.mtd_quarterly_update_draft_lines;
create trigger trg_prevent_locked_mtd_draft_line_mutation
  before insert or update or delete on public.mtd_quarterly_update_draft_lines
  for each row execute function public.prevent_locked_mtd_draft_line_mutation();

create or replace function public.mark_mtd_drafts_for_accounting_type_review(
  p_account_id uuid,
  p_accounting_type text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_accounting_type not in ('CASH', 'ACCRUALS') then
    return 0;
  end if;

  update public.mtd_quarterly_update_drafts
  set accounting_type_review_required = true
  where account_id = p_account_id
    and accounting_type_snapshot is not null
    and accounting_type_snapshot <> p_accounting_type
    and status in ('draft', 'needs_review', 'ready_for_accountant', 'reviewed', 'locked');
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.prevent_locked_mtd_draft_line_mutation() from public;
revoke all on function public.mark_mtd_drafts_for_accounting_type_review(uuid, text) from public;
grant execute on function public.mark_mtd_drafts_for_accounting_type_review(uuid, text) to service_role;

comment on column public.mtd_quarterly_update_drafts.accounting_type_review_required is
  'Blocks live pilot submission until a changed HMRC Business Details accounting type is reviewed and the draft is revalidated.';

create or replace function public.prevent_direct_mtd_accounting_type_revalidation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if (
    old.accounting_type_review_required is distinct from new.accounting_type_review_required
    or old.accounting_type_snapshot is distinct from new.accounting_type_snapshot
    or old.accounting_type_reviewed_at is distinct from new.accounting_type_reviewed_at
  )
  and coalesce(current_setting('app.hmrc_accounting_type_revalidation', true), '') <> 'true'
  and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'accounting_type_revalidation_rpc_required';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_direct_mtd_accounting_type_revalidation on public.mtd_quarterly_update_drafts;
create trigger trg_prevent_direct_mtd_accounting_type_revalidation
  before update of accounting_type_review_required, accounting_type_snapshot, accounting_type_reviewed_at
  on public.mtd_quarterly_update_drafts
  for each row execute function public.prevent_direct_mtd_accounting_type_revalidation();

create or replace function public.revalidate_mtd_draft_accounting_type(
  p_draft_id uuid,
  p_review_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_draft public.mtd_quarterly_update_drafts%rowtype;
  v_role text;
  v_is_root boolean := false;
  v_accounting_type text;
  v_previous_review_required boolean;
  v_note text := nullif(trim(coalesce(p_review_note, '')), '');
begin
  if v_actor_id is null then
    raise exception 'not_authenticated';
  end if;
  if p_draft_id is null then
    raise exception 'missing_draft_id';
  end if;

  select *
  into v_draft
  from public.mtd_quarterly_update_drafts
  where id = p_draft_id;

  if not found then
    raise exception 'quarterly_draft_not_found';
  end if;

  v_is_root := public.user_is_root_operator();
  v_role := public.account_member_effective_role(v_draft.account_id, v_actor_id)::text;
  if not v_is_root and coalesce(lower(v_role), '') not in ('owner', 'admin') then
    raise exception 'not_permitted';
  end if;
  if v_draft.status = 'archived' then
    raise exception 'archived_draft_cannot_be_revalidated';
  end if;

  select upper(nullif(trim(hc.metadata #>> '{sandbox_profile,accounting_type}'), ''))
  into v_accounting_type
  from public.hmrc_connections hc
  where hc.account_id = v_draft.account_id
    and upper(coalesce(hc.metadata #>> '{sandbox_profile,accounting_type}', '')) in ('CASH', 'ACCRUALS')
  order by hc.last_refreshed_at desc nulls last, hc.last_connected_at desc nulls last
  limit 1;

  if v_accounting_type is null then
    v_accounting_type := case
      when v_draft.accounting_type_snapshot in ('CASH', 'ACCRUALS')
        then v_draft.accounting_type_snapshot
      else null
    end;
  end if;

  if v_accounting_type is null and v_note is null then
    raise exception 'accounting_type_not_returned_review_note_required';
  end if;

  v_previous_review_required := v_draft.accounting_type_review_required;
  perform set_config('app.hmrc_accounting_type_revalidation', 'true', true);

  update public.mtd_quarterly_update_drafts
  set accounting_type_snapshot = v_accounting_type,
      accounting_type_review_required = false,
      accounting_type_reviewed_at = now()
  where id = v_draft.id
    and account_id = v_draft.account_id;

  insert into public.mtd_quarterly_update_audit_events (
    account_id,
    draft_id,
    user_id,
    event_type,
    metadata
  ) values (
    v_draft.account_id,
    v_draft.id,
    v_actor_id,
    'hmrc.accounting_type_revalidated',
    jsonb_build_object(
      'draft_id', v_draft.id,
      'account_id', v_draft.account_id,
      'previous_accounting_type_review_required', v_previous_review_required,
      'accounting_type', v_accounting_type,
      'accounting_type_not_returned', v_accounting_type is null,
      'review_note_present', v_note is not null,
      'actor_id', v_actor_id
    )
  );

  return jsonb_build_object(
    'ok', true,
    'draftId', v_draft.id,
    'accountId', v_draft.account_id,
    'accountingType', v_accounting_type,
    'accountingTypeNotReturned', v_accounting_type is null,
    'accountingTypeReviewRequired', false,
    'reviewedAt', now()
  );
end;
$$;

revoke all on function public.prevent_direct_mtd_accounting_type_revalidation() from public;
revoke all on function public.revalidate_mtd_draft_accounting_type(uuid, text) from public;
grant execute on function public.revalidate_mtd_draft_accounting_type(uuid, text) to authenticated;

alter table public.mtd_quarterly_submission_attempts
  drop constraint if exists mtd_quarterly_submission_attempts_type_check;
alter table public.mtd_quarterly_submission_attempts
  add constraint mtd_quarterly_submission_attempts_type_check
  check (submission_type in ('uk_property_period_summary', 'uk_property_quarterly_amendment'));

alter table public.hmrc_live_submission_attempts
  drop constraint if exists hmrc_live_submission_attempts_type_check;
alter table public.hmrc_live_submission_attempts
  add constraint hmrc_live_submission_attempts_type_check
  check (submission_type in ('uk_property_period_summary', 'uk_property_quarterly_amendment'));
