-- supabase/renters_rights_readiness.sql
--
-- Renters' Rights Readiness Pack — Phase 1: Information Sheet Tracker
--
-- Tracks whether the official GOV.UK Renters' Rights Act Information Sheet
-- has been provided to each relevant tenant for England-based tenancies.
--
-- LEGAL DISCLAIMER: This module tracks operational tasks and evidence only.
-- It does not provide legal advice and does not determine whether any tenancy,
-- notice, rent increase, pet decision, or possession action is legally valid.
-- Landlords should seek advice from a qualified professional.
--
-- Reforms affect private rented tenancies in England from 1 May 2026.
-- The official Information Sheet must be the exact PDF from GOV.UK.

begin;

-- ── renters_rights_tasks ─────────────────────────────────────────────────────

create table if not exists public.renters_rights_tasks (
  id               uuid        primary key default gen_random_uuid(),
  account_id       uuid        not null references public.accounts(id) on delete cascade,
  property_id      uuid        references public.properties(id) on delete set null,
  tenant_id        uuid        references public.tenants(id) on delete set null,
  lease_id         uuid        references public.leases(id) on delete set null,
  requirement_type text        not null default 'renters_rights_information_sheet',
  jurisdiction     text        not null default 'GB-ENG',
  due_date         date        not null default '2026-05-31',
  status           text        not null default 'required',
  sent_at          timestamptz,
  sent_by          uuid        references auth.users(id) on delete set null,
  delivery_method  text,
  document_id      uuid        references public.documents(id) on delete set null,
  notes            text,
  metadata         jsonb       not null default '{}',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ── Constraints ──────────────────────────────────────────────────────────────

-- 'overdue' is a computed read-only state derived in list_renters_rights_tasks
-- (required + past due_date). It is never stored; removing it from the constraint
-- prevents accidental direct writes of 'overdue' via service_role.
alter table public.renters_rights_tasks drop constraint if exists rr_tasks_status_check;
alter table public.renters_rights_tasks
  add constraint rr_tasks_status_check
  check (status in ('not_required','required','sent','evidence_uploaded','reviewed'));

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'rr_tasks_delivery_method_check') then
    alter table public.renters_rights_tasks
      add constraint rr_tasks_delivery_method_check
      check (delivery_method in ('email','sms','printed_hand_delivery','post','other'));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'rr_tasks_jurisdiction_check') then
    alter table public.renters_rights_tasks
      add constraint rr_tasks_jurisdiction_check
      check (length(trim(jurisdiction)) > 0);
  end if;
end $$;

-- ── Indexes ──────────────────────────────────────────────────────────────────

create index if not exists rr_tasks_account_status_idx
  on public.renters_rights_tasks(account_id, status, due_date);

create index if not exists rr_tasks_tenant_idx
  on public.renters_rights_tasks(tenant_id);

create index if not exists rr_tasks_property_idx
  on public.renters_rights_tasks(property_id);

-- ── Updated-at trigger ───────────────────────────────────────────────────────

create or replace function public.rr_tasks_set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists rr_tasks_updated_at_trg on public.renters_rights_tasks;
create trigger rr_tasks_updated_at_trg
  before update on public.renters_rights_tasks
  for each row execute function public.rr_tasks_set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────

alter table public.renters_rights_tasks enable row level security;

-- Managers (owner/admin/staff) may read their own account's tasks.
-- Tenants and contractors have no access — this is internal management data.
drop policy if exists rr_tasks_select_manager on public.renters_rights_tasks;
create policy rr_tasks_select_manager on public.renters_rights_tasks
  for select
  using (public.is_account_manager(account_id, auth.uid()));

-- All writes go through SECURITY DEFINER RPCs.
-- No direct INSERT/UPDATE/DELETE from authenticated or public roles.

-- ── RPC: list_renters_rights_tasks ───────────────────────────────────────────

create or replace function public.list_renters_rights_tasks(
  p_account_id uuid,
  p_status     text    default null,
  p_limit      integer default 100,
  p_offset     integer default 0
)
returns table (
  id               uuid,
  account_id       uuid,
  property_id      uuid,
  tenant_id        uuid,
  lease_id         uuid,
  requirement_type text,
  jurisdiction     text,
  due_date         date,
  status           text,
  sent_at          timestamptz,
  sent_by          uuid,
  delivery_method  text,
  document_id      uuid,
  notes            text,
  metadata         jsonb,
  created_at       timestamptz,
  updated_at       timestamptz,
  tenant_name      text,
  property_address text
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  perform public.assert_account_feature_access(p_account_id, 'renters_rights_readiness');

  return query
  select
    t.id,
    t.account_id,
    t.property_id,
    t.tenant_id,
    t.lease_id,
    t.requirement_type,
    t.jurisdiction,
    t.due_date,
    -- Auto-surface overdue: required tasks past due_date are treated as overdue
    case
      when t.status = 'required' and t.due_date < current_date then 'overdue'
      else t.status
    end                             as status,
    t.sent_at,
    t.sent_by,
    t.delivery_method,
    t.document_id,
    t.notes,
    t.metadata,
    t.created_at,
    t.updated_at,
    coalesce(tn.name, '—')         as tenant_name,
    coalesce(pr.address, '—')      as property_address
  from public.renters_rights_tasks t
  left join public.tenants    tn on tn.id = t.tenant_id
  left join public.properties pr on pr.id = t.property_id
  where t.account_id = p_account_id
    and (
      p_status is null
      or (
        p_status = 'overdue' and t.status = 'required' and t.due_date < current_date
      )
      or (
        p_status <> 'overdue' and t.status = p_status
      )
    )
  order by
    case
      when t.status = 'required' and t.due_date < current_date then 1
      when t.status = 'required'         then 2
      when t.status = 'sent'             then 3
      when t.status = 'evidence_uploaded' then 4
      when t.status = 'reviewed'         then 5
      when t.status = 'not_required'     then 6
      else 7
    end,
    t.due_date asc
  limit  greatest(1, least(coalesce(p_limit, 100), 500))
  offset greatest(0, coalesce(p_offset, 0));
end;
$$;

revoke all  on function public.list_renters_rights_tasks(uuid, text, integer, integer) from public;
grant execute on function public.list_renters_rights_tasks(uuid, text, integer, integer) to authenticated;

-- ── RPC: upsert_renters_rights_task ──────────────────────────────────────────

create or replace function public.upsert_renters_rights_task(
  p_account_id       uuid,
  p_property_id      uuid    default null,
  p_tenant_id        uuid    default null,
  p_lease_id         uuid    default null,
  p_requirement_type text    default 'renters_rights_information_sheet',
  p_due_date         date    default '2026-05-31',
  p_notes            text    default null
)
returns public.renters_rights_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_type text := coalesce(nullif(trim(p_requirement_type), ''), 'renters_rights_information_sheet');
  v_row  public.renters_rights_tasks;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  perform public.assert_account_feature_access(p_account_id, 'renters_rights_readiness');

  if not public.is_account_manager(p_account_id, v_uid) then
    raise exception 'Access denied';
  end if;

  -- Return existing task if one already exists for this tenant + requirement_type
  select * into v_row
  from public.renters_rights_tasks
  where account_id       = p_account_id
    and tenant_id        is not distinct from p_tenant_id
    and requirement_type = v_type
  limit 1;

  if found then
    return v_row;
  end if;

  insert into public.renters_rights_tasks (
    account_id, property_id, tenant_id, lease_id,
    requirement_type, jurisdiction, due_date, status, notes
  )
  values (
    p_account_id,
    p_property_id,
    p_tenant_id,
    p_lease_id,
    v_type,
    'GB-ENG',
    coalesce(p_due_date, '2026-05-31'),
    'required',
    p_notes
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all  on function public.upsert_renters_rights_task(uuid, uuid, uuid, uuid, text, date, text) from public;
grant execute on function public.upsert_renters_rights_task(uuid, uuid, uuid, uuid, text, date, text) to authenticated;

-- ── RPC: create_rr_tasks_for_active_tenants ──────────────────────────────────
-- Auto-creates information sheet tasks for all non-archived, non-applicant tenants
-- that do not yet have a task for the given requirement_type.

create or replace function public.create_rr_tasks_for_active_tenants(
  p_account_id       uuid,
  p_requirement_type text    default 'renters_rights_information_sheet',
  p_due_date         date    default '2026-05-31'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid    := auth.uid();
  v_type  text    := coalesce(nullif(trim(p_requirement_type), ''), 'renters_rights_information_sheet');
  v_count integer := 0;
  v_t     record;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  perform public.assert_account_feature_access(p_account_id, 'renters_rights_readiness');

  if not public.is_account_manager(p_account_id, v_uid) then
    raise exception 'Access denied';
  end if;

  -- Set-based INSERT is atomic and avoids per-row round-trips for large portfolios.
  with eligible as (
    select t.id as tenant_id, t.property_id
    from public.tenants t
    where t.account_id  = p_account_id
      and t.archived_at is null          -- status not filtered: default is 'applicant'
      and not exists (
        select 1
        from public.renters_rights_tasks rr
        where rr.account_id       = p_account_id
          and rr.tenant_id        = t.id
          and rr.requirement_type = v_type
      )
  )
  insert into public.renters_rights_tasks (
    account_id, property_id, tenant_id,
    requirement_type, jurisdiction, due_date, status
  )
  select
    p_account_id, e.property_id, e.tenant_id,
    v_type, 'GB-ENG', coalesce(p_due_date, '2026-05-31'), 'required'
  from eligible e;

  get diagnostics v_count = row_count;

  if v_count > 0 then
    perform public.log_security_event(
      p_account_id,
      'renters_rights_tasks_auto_created',
      'renters_rights_task',
      null,
      jsonb_build_object('tasks_created', v_count, 'requirement_type', v_type)
    );
  end if;

  return v_count;
end;
$$;

revoke all  on function public.create_rr_tasks_for_active_tenants(uuid, text, date) from public;
grant execute on function public.create_rr_tasks_for_active_tenants(uuid, text, date) to authenticated;

-- ── RPC: mark_rr_task_sent ───────────────────────────────────────────────────

create or replace function public.mark_rr_task_sent(
  p_task_id         uuid,
  p_account_id      uuid,
  p_delivery_method text,
  p_sent_at         timestamptz default null,
  p_notes           text        default null
)
returns public.renters_rights_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.renters_rights_tasks;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  perform public.assert_account_feature_access(p_account_id, 'renters_rights_readiness');

  if not public.is_account_manager(p_account_id, v_uid) then
    raise exception 'Access denied';
  end if;

  if p_delivery_method is null or trim(p_delivery_method) = '' then
    raise exception 'Delivery method is required';
  end if;

  update public.renters_rights_tasks
  set
    status          = 'sent',
    sent_at         = coalesce(p_sent_at, now()),
    sent_by         = v_uid,
    delivery_method = lower(trim(p_delivery_method)),
    notes           = coalesce(p_notes, notes),
    updated_at      = now()
  where id         = p_task_id
    and account_id = p_account_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Task not found';
  end if;

  perform public.log_security_event(
    p_account_id,
    'renters_rights_info_sheet_marked_sent',
    'renters_rights_task',
    p_task_id,
    jsonb_build_object(
      'delivery_method', v_row.delivery_method,
      'tenant_id',       v_row.tenant_id,
      'property_id',     v_row.property_id
    )
  );

  return v_row;
end;
$$;

revoke all  on function public.mark_rr_task_sent(uuid, uuid, text, timestamptz, text) from public;
grant execute on function public.mark_rr_task_sent(uuid, uuid, text, timestamptz, text) to authenticated;

-- ── RPC: set_rr_task_not_required ────────────────────────────────────────────

create or replace function public.set_rr_task_not_required(
  p_task_id    uuid,
  p_account_id uuid,
  p_notes      text default null
)
returns public.renters_rights_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.renters_rights_tasks;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  perform public.assert_account_feature_access(p_account_id, 'renters_rights_readiness');

  if not public.is_account_manager(p_account_id, v_uid) then
    raise exception 'Access denied';
  end if;

  -- Guard: only allow dismissing tasks that have not yet been sent or evidenced.
  -- 'overdue' is a computed state (stored as 'required' past due_date) so is included.
  update public.renters_rights_tasks
  set
    status     = 'not_required',
    notes      = coalesce(p_notes, notes),
    updated_at = now()
  where id         = p_task_id
    and account_id = p_account_id
    and status in ('required')
  returning * into v_row;

  if v_row.id is null then
    -- Distinguish "not found" from "wrong status"
    if exists (select 1 from public.renters_rights_tasks where id = p_task_id and account_id = p_account_id) then
      raise exception 'Task cannot be dismissed: it has already been sent or evidenced';
    end if;
    raise exception 'Task not found';
  end if;

  perform public.log_security_event(
    p_account_id,
    'renters_rights_info_sheet_status_changed',
    'renters_rights_task',
    p_task_id,
    jsonb_build_object('new_status', 'not_required', 'tenant_id', v_row.tenant_id)
  );

  return v_row;
end;
$$;

revoke all  on function public.set_rr_task_not_required(uuid, uuid, text) from public;
grant execute on function public.set_rr_task_not_required(uuid, uuid, text) to authenticated;

-- ── RPC: link_rr_task_document ───────────────────────────────────────────────

create or replace function public.link_rr_task_document(
  p_task_id     uuid,
  p_account_id  uuid,
  p_document_id uuid
)
returns public.renters_rights_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.renters_rights_tasks;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  perform public.assert_account_feature_access(p_account_id, 'renters_rights_readiness');

  if not public.is_account_manager(p_account_id, v_uid) then
    raise exception 'Access denied';
  end if;

  if p_document_id is null then
    raise exception 'Document ID is required';
  end if;

  update public.renters_rights_tasks
  set
    document_id = p_document_id,
    -- Upgrade 'required' to 'evidence_uploaded'; leave sent/reviewed unchanged.
    -- 'overdue' is not a stored status — tasks past due_date are stored as 'required'.
    status      = case
                    when status = 'required' then 'evidence_uploaded'
                    else status
                  end,
    updated_at  = now()
  where id         = p_task_id
    and account_id = p_account_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Task not found';
  end if;

  perform public.log_security_event(
    p_account_id,
    'renters_rights_info_sheet_evidence_linked',
    'renters_rights_task',
    p_task_id,
    jsonb_build_object('document_id', p_document_id, 'tenant_id', v_row.tenant_id)
  );

  return v_row;
end;
$$;

revoke all  on function public.link_rr_task_document(uuid, uuid, uuid) from public;
grant execute on function public.link_rr_task_document(uuid, uuid, uuid) to authenticated;

-- ── RPC: list_rr_attention_items ─────────────────────────────────────────────
-- Returns Renters' Rights items in the same shape as attention_center_items so
-- the frontend can merge them into the attention feed without schema changes.

create or replace function public.list_rr_attention_items(
  p_account_id uuid,
  p_limit      integer default 20
)
returns table (
  item_key       text,
  item_type      text,
  bucket         text,
  property_label text,
  tenant_label   text,
  entity_label   text,
  amount         numeric,
  age_hours      integer,
  due_days       integer,
  link_path      text,
  source_table   text,
  sort_order     integer
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  perform public.assert_account_feature_access(p_account_id, 'renters_rights_readiness');

  return query
  select
    'rr_info_sheet_' || t.id::text                               as item_key,
    case
      when t.due_date < current_date then 'renters_rights_information_sheet_overdue'
      else                                'renters_rights_information_sheet_due'
    end                                                          as item_type,
    case
      when t.due_date < current_date then 'urgent'
      else                                'action'
    end                                                          as bucket,
    coalesce(pr.address, '—')                                   as property_label,
    coalesce(tn.name, '—')                                      as tenant_label,
    'Information Sheet'::text                                    as entity_label,
    0::numeric                                                   as amount,
    greatest(0,
      extract(epoch from (now() - t.due_date::timestamptz))::integer / 3600
    )                                                            as age_hours,
    (t.due_date - current_date)::integer                        as due_days,
    '/compliance/renters-rights'::text                          as link_path,
    'renters_rights_tasks'::text                                as source_table,
    case
      when t.due_date < current_date then 5
      else                                50
    end                                                          as sort_order
  from public.renters_rights_tasks t
  left join public.tenants    tn on tn.id = t.tenant_id
  left join public.properties pr on pr.id = t.property_id
  where t.account_id = p_account_id
    and t.status in ('required', 'overdue')
    and t.due_date <= current_date + interval '60 days'
  order by t.due_date asc
  limit greatest(1, least(coalesce(p_limit, 20), 100));
end;
$$;

revoke all  on function public.list_rr_attention_items(uuid, integer) from public;
grant execute on function public.list_rr_attention_items(uuid, integer) to authenticated;

commit;
