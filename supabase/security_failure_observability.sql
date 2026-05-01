create or replace function public.security_failure_context(
  p_event text,
  p_reason text,
  p_account_id uuid default null,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns text
language sql
stable
set search_path = public
as $$
  select jsonb_strip_nulls(
    jsonb_build_object(
      'event', nullif(trim(coalesce(p_event, '')), ''),
      'reason', nullif(trim(coalesce(p_reason, '')), ''),
      'account_id', p_account_id,
      'entity_type', nullif(trim(coalesce(lower(p_entity_type), '')), ''),
      'entity_id', p_entity_id,
      'actor_user_id', auth.uid()
    ) || coalesce(p_metadata, '{}'::jsonb)
  )::text;
$$;

comment on function public.security_failure_context(text, text, uuid, text, uuid, jsonb) is
  'Formats safe structured detail payloads for security-sensitive denied-path and validation exceptions.';

create or replace function public.contractor_update_work_order_status(
  p_work_order_id uuid,
  p_status text,
  p_notes text default null::text
)
returns public.work_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wo public.work_orders;
begin
  if auth.uid() is null then
    raise exception using
      errcode = '28000',
      message = 'Not authenticated',
      detail = public.security_failure_context(
        'contractor_update_work_order_status',
        'missing_auth',
        null,
        'work_order',
        p_work_order_id
      ),
      hint = 'Authenticate as the assigned contractor before updating contractor workflow status.';
  end if;

  select *
  into v_wo
  from public.work_orders
  where id = p_work_order_id;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Work order not found',
      detail = public.security_failure_context(
        'contractor_update_work_order_status',
        'work_order_not_found',
        null,
        'work_order',
        p_work_order_id
      ),
      hint = 'Use an existing work order identifier from the current account scope.';
  end if;

  if v_wo.contractor_user_id is distinct from auth.uid() then
    raise exception using
      errcode = '42501',
      message = 'Not allowed (not assigned contractor)',
      detail = public.security_failure_context(
        'contractor_update_work_order_status',
        'not_assigned_contractor',
        v_wo.account_id,
        'work_order',
        p_work_order_id,
        jsonb_build_object('requested_status', lower(coalesce(p_status, '')))
      ),
      hint = 'Only the contractor assigned to this work order can update contractor workflow status.';
  end if;

  if p_status is null or p_status not in ('assigned', 'in_progress', 'completed', 'blocked', 'cancelled') then
    raise exception using
      errcode = '22023',
      message = format('Invalid status: %s', p_status),
      detail = public.security_failure_context(
        'contractor_update_work_order_status',
        'invalid_status',
        v_wo.account_id,
        'work_order',
        p_work_order_id,
        jsonb_build_object('requested_status', coalesce(p_status, ''))
      ),
      hint = 'Allowed contractor statuses are assigned, in_progress, completed, blocked, and cancelled.';
  end if;

  update public.work_orders
  set status = p_status,
      notes = coalesce(p_notes, notes),
      updated_at = now()
  where id = p_work_order_id
  returning * into v_wo;

  return v_wo;
end;
$$;

create or replace function public.work_order_set_status(
  p_work_order_id uuid,
  p_new_status text,
  p_apply_if_tenant_allowed boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_status text;
  v_account_id uuid;
  v_is_member boolean;
  v_is_tenant boolean;
  v_next text := lower(coalesce(p_new_status, ''));
begin
  select wo.status, wo.account_id
    into v_old_status, v_account_id
  from public.work_orders wo
  where wo.id = p_work_order_id;

  if v_account_id is null then
    raise exception using
      errcode = 'P0002',
      message = 'Work order not found',
      detail = public.security_failure_context(
        'work_order_set_status',
        'work_order_not_found',
        null,
        'work_order',
        p_work_order_id,
        jsonb_build_object('requested_status', v_next)
      ),
      hint = 'Use an existing work order identifier before requesting a status change.';
  end if;

  v_old_status := lower(coalesce(v_old_status, 'assigned'));
  v_is_member := public.is_account_member(v_account_id);

  v_is_tenant := exists (
    select 1
    from public.work_orders wo
    join public.tenants t
      on t.user_id = auth.uid()
    where wo.id = p_work_order_id
      and t.archived_at is null
      and t.status = any(array['active','accepted_pending_signing'])
      and t.property_id is not null
      and t.property_id = wo.property_id
  );

  if (v_is_tenant and v_next = 'cancelled') then
    insert into public.work_order_audit_log (
      work_order_id,
      actor_user_id,
      action,
      old_value,
      new_value,
      account_id
    )
    values (
      p_work_order_id,
      auth.uid(),
      'tenant_cancellation_requested',
      jsonb_build_object('status', v_old_status),
      jsonb_build_object('requested_status', 'cancelled'),
      v_account_id
    );

    return;
  end if;

  if not v_is_member then
    raise exception using
      errcode = '42501',
      message = 'Not authorized to change/request status for this work order',
      detail = public.security_failure_context(
        'work_order_set_status',
        'member_role_required',
        v_account_id,
        'work_order',
        p_work_order_id,
        jsonb_build_object(
          'requested_status', v_next,
          'tenant_cancellation_path', (v_is_tenant and v_next = 'cancelled')
        )
      ),
      hint = 'Only owner, admin, or staff members can apply work order status transitions directly.';
  end if;

  if not public.work_order_can_transition(v_old_status, v_next) then
    raise exception using
      errcode = '22023',
      message = format('Invalid status transition: %s -> %s', v_old_status, v_next),
      detail = public.security_failure_context(
        'work_order_set_status',
        'invalid_transition',
        v_account_id,
        'work_order',
        p_work_order_id,
        jsonb_build_object(
          'old_status', v_old_status,
          'requested_status', v_next
        )
      ),
      hint = 'Use a valid work order transition from the current state.';
  end if;

  update public.work_orders
  set status = v_next,
      updated_at = now()
  where id = p_work_order_id;
  -- Audit entry is written by the trg_audit_work_order_status_change trigger.
end;
$$;

create or replace function public.wo_fin_approve_quote(p_work_order_id uuid)
returns public.work_order_financials
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_account_id uuid;
  v_row public.work_order_financials;
begin
  if v_uid is null then
    raise exception using
      errcode = '28000',
      message = 'Not authenticated',
      detail = public.security_failure_context('wo_fin_approve_quote', 'missing_auth', null, 'work_order', p_work_order_id),
      hint = 'Authenticate as an in-account manager before approving a quote.';
  end if;

  v_account_id := public.work_order_account_id(p_work_order_id);
  if v_account_id is null then
    raise exception using
      errcode = 'P0002',
      message = 'Work order not found',
      detail = public.security_failure_context('wo_fin_approve_quote', 'work_order_not_found', null, 'work_order', p_work_order_id),
      hint = 'Use an existing work order identifier before approving a quote.';
  end if;

  if not public.is_account_manager(v_account_id, v_uid) then
    raise exception using
      errcode = '42501',
      message = 'Not allowed (manager only)',
      detail = public.security_failure_context('wo_fin_approve_quote', 'manager_only', v_account_id, 'work_order', p_work_order_id),
      hint = 'Only owner, admin, or staff members for the same account can approve a contractor quote.';
  end if;

  update public.work_order_financials
  set
    quote_status = 'approved',
    approved_at = now(),
    approved_by = v_uid,
    rejected_at = null,
    rejected_by = null,
    rejection_reason = null
  where work_order_id = p_work_order_id
    and quote_status = 'submitted'
  returning * into v_row;

  if v_row.id is null then
    raise exception using
      errcode = '22023',
      message = 'Cannot approve quote (status must be submitted)',
      detail = public.security_failure_context('wo_fin_approve_quote', 'invalid_quote_state', v_account_id, 'work_order', p_work_order_id),
      hint = 'Only submitted quotes can be approved.';
  end if;

  return v_row;
end;
$$;

create or replace function public.wo_fin_reject_quote(p_work_order_id uuid, p_reason text)
returns public.work_order_financials
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_account_id uuid;
  v_row public.work_order_financials;
begin
  if v_uid is null then
    raise exception using
      errcode = '28000',
      message = 'Not authenticated',
      detail = public.security_failure_context('wo_fin_reject_quote', 'missing_auth', null, 'work_order', p_work_order_id),
      hint = 'Authenticate as an in-account manager before rejecting a quote.';
  end if;

  v_account_id := public.work_order_account_id(p_work_order_id);
  if v_account_id is null then
    raise exception using
      errcode = 'P0002',
      message = 'Work order not found',
      detail = public.security_failure_context('wo_fin_reject_quote', 'work_order_not_found', null, 'work_order', p_work_order_id),
      hint = 'Use an existing work order identifier before rejecting a quote.';
  end if;

  if not public.is_account_manager(v_account_id, v_uid) then
    raise exception using
      errcode = '42501',
      message = 'Not allowed (manager only)',
      detail = public.security_failure_context('wo_fin_reject_quote', 'manager_only', v_account_id, 'work_order', p_work_order_id),
      hint = 'Only owner, admin, or staff members for the same account can reject a contractor quote.';
  end if;

  update public.work_order_financials
  set
    quote_status = 'rejected',
    rejected_at = now(),
    rejected_by = v_uid,
    rejection_reason = p_reason
  where work_order_id = p_work_order_id
    and quote_status = 'submitted'
  returning * into v_row;

  if v_row.id is null then
    raise exception using
      errcode = '22023',
      message = 'Cannot reject quote (status must be submitted)',
      detail = public.security_failure_context('wo_fin_reject_quote', 'invalid_quote_state', v_account_id, 'work_order', p_work_order_id),
      hint = 'Only submitted quotes can be rejected.';
  end if;

  return v_row;
end;
$$;

create or replace function public.wo_fin_submit_quote(p_work_order_id uuid)
returns public.work_order_financials
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_account_id uuid;
  v_row public.work_order_financials;
begin
  if v_uid is null then
    raise exception using
      errcode = '28000',
      message = 'Not authenticated',
      detail = public.security_failure_context('wo_fin_submit_quote', 'missing_auth', null, 'work_order', p_work_order_id),
      hint = 'Authenticate as the assigned contractor before submitting a quote.';
  end if;

  v_account_id := public.work_order_account_id(p_work_order_id);
  if v_account_id is null then
    raise exception using
      errcode = 'P0002',
      message = 'Work order not found',
      detail = public.security_failure_context('wo_fin_submit_quote', 'work_order_not_found', null, 'work_order', p_work_order_id),
      hint = 'Use an existing work order identifier before submitting a quote.';
  end if;

  if not public.is_assigned_contractor(p_work_order_id, v_uid) then
    raise exception using
      errcode = '42501',
      message = 'Not allowed (contractor only)',
      detail = public.security_failure_context('wo_fin_submit_quote', 'assigned_contractor_required', v_account_id, 'work_order', p_work_order_id),
      hint = 'Only the contractor assigned to this work order can submit a quote.';
  end if;

  insert into public.work_order_financials(account_id, work_order_id, quote_status)
  values (v_account_id, p_work_order_id, 'draft')
  on conflict (work_order_id) do nothing;

  update public.work_order_financials
  set
    quote_status = 'submitted',
    quote_submitted_at = now(),
    quote_submitted_by = v_uid
  where work_order_id = p_work_order_id
    and quote_status in ('draft','rejected')
  returning * into v_row;

  if v_row.id is null then
    raise exception using
      errcode = '22023',
      message = 'Cannot submit quote (status must be draft/rejected)',
      detail = public.security_failure_context('wo_fin_submit_quote', 'invalid_quote_state', v_account_id, 'work_order', p_work_order_id),
      hint = 'Only draft or rejected quotes can be submitted.';
  end if;

  return v_row;
end;
$$;

create or replace function public.wo_fin_upsert_invoice(
  p_work_order_id uuid,
  p_invoice_amount numeric,
  p_invoice_currency text,
  p_invoice_issued_at timestamptz,
  p_invoice_due_at timestamptz
)
returns public.work_order_financials
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_account_id uuid;
  v_row public.work_order_financials;
begin
  if v_uid is null then
    raise exception using
      errcode = '28000',
      message = 'Not authenticated',
      detail = public.security_failure_context('wo_fin_upsert_invoice', 'missing_auth', null, 'work_order', p_work_order_id),
      hint = 'Authenticate as the assigned contractor before saving invoice details.';
  end if;

  v_account_id := public.work_order_account_id(p_work_order_id);
  if v_account_id is null then
    raise exception using
      errcode = 'P0002',
      message = 'Work order not found',
      detail = public.security_failure_context('wo_fin_upsert_invoice', 'work_order_not_found', null, 'work_order', p_work_order_id),
      hint = 'Use an existing work order identifier before saving invoice details.';
  end if;

  if not public.is_assigned_contractor(p_work_order_id, v_uid) then
    raise exception using
      errcode = '42501',
      message = 'Not allowed (contractor only)',
      detail = public.security_failure_context('wo_fin_upsert_invoice', 'assigned_contractor_required', v_account_id, 'work_order', p_work_order_id),
      hint = 'Only the contractor assigned to this work order can save invoice details.';
  end if;

  select * into v_row
  from public.work_order_financials f
  where f.work_order_id = p_work_order_id;

  if v_row.id is null then
    raise exception using
      errcode = '22023',
      message = 'No financials row. Submit quote first.',
      detail = public.security_failure_context('wo_fin_upsert_invoice', 'missing_financial_row', v_account_id, 'work_order', p_work_order_id),
      hint = 'Create and submit a quote before saving invoice details.';
  end if;

  if v_row.quote_status <> 'approved' then
    raise exception using
      errcode = '42501',
      message = 'Invoice allowed only after quote approved',
      detail = public.security_failure_context('wo_fin_upsert_invoice', 'quote_not_approved', v_account_id, 'work_order', p_work_order_id),
      hint = 'Invoice details can only be saved after an in-account manager approves the quote.';
  end if;

  update public.work_order_financials
  set
    invoice_amount = p_invoice_amount,
    invoice_currency = coalesce(nullif(p_invoice_currency,''),'PLN'),
    invoice_issued_at = p_invoice_issued_at,
    invoice_due_at = p_invoice_due_at
  where work_order_id = p_work_order_id
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.wo_fin_upsert_quote_draft(
  p_work_order_id uuid,
  p_quote_amount numeric,
  p_quote_currency text,
  p_quote_notes text
)
returns public.work_order_financials
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_account_id uuid;
  v_existing public.work_order_financials;
begin
  if v_uid is null then
    raise exception using
      errcode = '28000',
      message = 'Not authenticated',
      detail = public.security_failure_context('wo_fin_upsert_quote_draft', 'missing_auth', null, 'work_order', p_work_order_id),
      hint = 'Authenticate as the assigned contractor before saving a quote draft.';
  end if;

  v_account_id := public.work_order_account_id(p_work_order_id);
  if v_account_id is null then
    raise exception using
      errcode = 'P0002',
      message = 'Work order not found',
      detail = public.security_failure_context('wo_fin_upsert_quote_draft', 'work_order_not_found', null, 'work_order', p_work_order_id),
      hint = 'Use an existing work order identifier before saving a quote draft.';
  end if;

  if not public.is_assigned_contractor(p_work_order_id, v_uid) then
    raise exception using
      errcode = '42501',
      message = 'Not allowed (contractor only)',
      detail = public.security_failure_context('wo_fin_upsert_quote_draft', 'assigned_contractor_required', v_account_id, 'work_order', p_work_order_id),
      hint = 'Only the contractor assigned to this work order can save a quote draft.';
  end if;

  select * into v_existing
  from public.work_order_financials f
  where f.work_order_id = p_work_order_id;

  if v_existing.id is not null and v_existing.quote_status in ('submitted','approved') then
    raise exception using
      errcode = '42501',
      message = 'Quote already submitted/approved',
      detail = public.security_failure_context('wo_fin_upsert_quote_draft', 'quote_locked', v_account_id, 'work_order', p_work_order_id),
      hint = 'Quote drafts can only be edited while still in draft or rejected state.';
  end if;

  insert into public.work_order_financials (
    account_id, work_order_id,
    quote_amount, quote_currency, quote_notes,
    quote_status
  )
  values (
    v_account_id, p_work_order_id,
    p_quote_amount, coalesce(nullif(p_quote_currency,''),'PLN'), p_quote_notes,
    'draft'
  )
  on conflict (work_order_id) do update
  set
    quote_amount = excluded.quote_amount,
    quote_currency = excluded.quote_currency,
    quote_notes = excluded.quote_notes,
    quote_status = 'draft'
  returning * into v_existing;

  return v_existing;
end;
$$;
