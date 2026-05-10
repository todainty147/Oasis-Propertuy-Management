-- supabase/renters_rights_phase3_pet_requests.sql
--
-- Renters' Rights Readiness Pack — Phase 3: Pet Requests Tracker
--
-- Under the Renters' Rights Act 2025 (England), landlords must respond in
-- writing to a tenant's pet request within 28 days. Refusals must give
-- written reasons and must not be unreasonable.
--
-- LEGAL DISCLAIMER: This module tracks operational records only. It does not
-- determine whether a refusal is legally reasonable or advise on landlord
-- obligations. Seek advice from a qualified professional.

begin;

-- ── pet_requests table ────────────────────────────────────────────────────────

create table if not exists public.pet_requests (
  id                    uuid        primary key default gen_random_uuid(),
  account_id            uuid        not null references public.accounts(id)    on delete cascade,
  property_id           uuid        references public.properties(id)           on delete set null,
  tenant_id             uuid        references public.tenants(id)              on delete set null,
  lease_id              uuid        references public.leases(id)               on delete set null,
  jurisdiction          text        not null default 'GB-ENG',
  pet_type              text        not null,
  pet_description       text,
  request_date          date        not null,
  status                text        not null default 'received',
  decision_date         date,
  refusal_reason        text,
  insurance_required    boolean     not null default false,
  insurance_document_id uuid        references public.documents(id)           on delete set null,
  notes                 text,
  created_by            uuid        references auth.users(id)                  on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ── Constraints ───────────────────────────────────────────────────────────────

alter table public.pet_requests drop constraint if exists pet_requests_status_check;
alter table public.pet_requests
  add constraint pet_requests_status_check
  check (status in ('received','under_review','approved','refused','withdrawn'));

alter table public.pet_requests drop constraint if exists pet_requests_pet_type_check;
alter table public.pet_requests
  add constraint pet_requests_pet_type_check
  check (pet_type in ('dog','cat','bird','reptile','other'));

-- ── Indexes ───────────────────────────────────────────────────────────────────

create index if not exists pet_requests_account_status_idx
  on public.pet_requests(account_id, status, request_date);

create index if not exists pet_requests_tenant_idx
  on public.pet_requests(tenant_id);

create index if not exists pet_requests_property_idx
  on public.pet_requests(property_id);

-- ── Updated-at trigger ────────────────────────────────────────────────────────

create or replace function public.pet_requests_set_updated_at()
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

drop trigger if exists pet_requests_updated_at_trg on public.pet_requests;
create trigger pet_requests_updated_at_trg
  before update on public.pet_requests
  for each row execute function public.pet_requests_set_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────────

alter table public.pet_requests enable row level security;

-- Managers (owner/admin/staff) may read their own account's records.
-- All writes go through SECURITY DEFINER RPCs.
drop policy if exists pet_requests_select_manager on public.pet_requests;
create policy pet_requests_select_manager on public.pet_requests
  for select
  using (public.is_account_manager(account_id, auth.uid()));

-- ── RPC: list_pet_requests ────────────────────────────────────────────────────

create or replace function public.list_pet_requests(
  p_account_id uuid,
  p_status     text    default null,
  p_limit      integer default 100,
  p_offset     integer default 0
)
returns table (
  id                    uuid,
  account_id            uuid,
  property_id           uuid,
  tenant_id             uuid,
  lease_id              uuid,
  jurisdiction          text,
  pet_type              text,
  pet_description       text,
  request_date          date,
  decision_due_date     date,
  status                text,
  decision_date         date,
  refusal_reason        text,
  insurance_required    boolean,
  insurance_document_id uuid,
  notes                 text,
  created_by            uuid,
  created_at            timestamptz,
  updated_at            timestamptz,
  tenant_name           text,
  property_address      text
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  perform public.assert_account_feature_access(p_account_id, 'renters_rights_readiness');

  if not public.is_account_manager(p_account_id, auth.uid()) then
    raise exception 'Access denied';
  end if;

  return query
  select
    pr.id,
    pr.account_id,
    pr.property_id,
    pr.tenant_id,
    pr.lease_id,
    pr.jurisdiction,
    pr.pet_type,
    pr.pet_description,
    pr.request_date,
    (pr.request_date + interval '28 days')::date  as decision_due_date,
    pr.status,
    pr.decision_date,
    pr.refusal_reason,
    pr.insurance_required,
    pr.insurance_document_id,
    pr.notes,
    pr.created_by,
    pr.created_at,
    pr.updated_at,
    coalesce(tn.name,    '—')  as tenant_name,
    coalesce(prop.address,'—') as property_address
  from public.pet_requests pr
  left join public.tenants    tn   on tn.id   = pr.tenant_id
  left join public.properties prop on prop.id = pr.property_id
  where pr.account_id = p_account_id
    and (p_status is null or pr.status = p_status)
  order by
    case
      when pr.status in ('received','under_review')
           and (pr.request_date + interval '28 days')::date < current_date then 1
      when pr.status in ('received','under_review')                         then 2
      when pr.status = 'approved'                                           then 3
      when pr.status = 'refused'                                            then 4
      when pr.status = 'withdrawn'                                          then 5
      else 6
    end,
    pr.request_date asc
  limit  greatest(1, least(coalesce(p_limit,  100), 500))
  offset greatest(0, coalesce(p_offset, 0));
end;
$$;

revoke all    on function public.list_pet_requests(uuid, text, integer, integer) from public;
grant  execute on function public.list_pet_requests(uuid, text, integer, integer) to authenticated;

-- ── RPC: create_pet_request ───────────────────────────────────────────────────

create or replace function public.create_pet_request(
  p_account_id      uuid,
  p_property_id     uuid    default null,
  p_tenant_id       uuid    default null,
  p_lease_id        uuid    default null,
  p_pet_type        text    default 'other',
  p_pet_description text    default null,
  p_request_date    date    default current_date,
  p_notes           text    default null
)
returns public.pet_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.pet_requests;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  perform public.assert_account_feature_access(p_account_id, 'renters_rights_readiness');
  if not public.is_account_manager(p_account_id, v_uid) then
    raise exception 'Access denied';
  end if;

  if p_pet_type not in ('dog','cat','bird','reptile','other') then
    raise exception 'Invalid pet_type: %', p_pet_type;
  end if;

  insert into public.pet_requests (
    account_id, property_id, tenant_id, lease_id,
    jurisdiction, pet_type, pet_description,
    request_date, status, notes, created_by
  ) values (
    p_account_id, p_property_id, p_tenant_id, p_lease_id,
    'GB-ENG', p_pet_type, p_pet_description,
    coalesce(p_request_date, current_date), 'received', p_notes, v_uid
  )
  returning * into v_row;

  perform public.log_security_event(
    p_account_id, 'pet_request_created', 'pet_request', v_row.id,
    jsonb_build_object(
      'pet_type',    p_pet_type,
      'tenant_id',   p_tenant_id,
      'property_id', p_property_id
    )
  );

  return v_row;
end;
$$;

revoke all    on function public.create_pet_request(uuid, uuid, uuid, uuid, text, text, date, text) from public;
grant  execute on function public.create_pet_request(uuid, uuid, uuid, uuid, text, text, date, text) to authenticated;

-- ── RPC: update_pet_request_status ───────────────────────────────────────────

create or replace function public.update_pet_request_status(
  p_request_id         uuid,
  p_account_id         uuid,
  p_status             text,
  p_decision_date      date    default null,
  p_refusal_reason     text    default null,
  p_insurance_required boolean default null,
  p_notes              text    default null
)
returns public.pet_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_row        public.pet_requests;
  v_old_status text;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  perform public.assert_account_feature_access(p_account_id, 'renters_rights_readiness');
  if not public.is_account_manager(p_account_id, v_uid) then
    raise exception 'Access denied';
  end if;

  if p_status not in ('received','under_review','approved','refused','withdrawn') then
    raise exception 'Invalid status: %', p_status;
  end if;

  -- Refusal reason is mandatory when refusing a request.
  if p_status = 'refused'
     and (p_refusal_reason is null or trim(p_refusal_reason) = '') then
    raise exception 'A refusal reason is required when refusing a pet request';
  end if;

  select status into v_old_status
  from public.pet_requests
  where id = p_request_id and account_id = p_account_id;

  if not found then
    raise exception 'Pet request not found';
  end if;

  update public.pet_requests
  set
    status             = p_status,
    decision_date      = case
                           when p_status in ('approved','refused')
                           then coalesce(p_decision_date, current_date)
                           else decision_date
                         end,
    refusal_reason     = case
                           when p_status = 'refused' then p_refusal_reason
                           else refusal_reason
                         end,
    insurance_required = case
                           when p_insurance_required is not null then p_insurance_required
                           else insurance_required
                         end,
    notes              = coalesce(p_notes, notes),
    updated_at         = now()
  where id = p_request_id and account_id = p_account_id
  returning * into v_row;

  perform public.log_security_event(
    p_account_id, 'pet_request_status_changed', 'pet_request', p_request_id,
    jsonb_build_object('old_status', v_old_status, 'new_status', p_status)
  );

  return v_row;
end;
$$;

revoke all    on function public.update_pet_request_status(uuid, uuid, text, date, text, boolean, text) from public;
grant  execute on function public.update_pet_request_status(uuid, uuid, text, date, text, boolean, text) to authenticated;

-- ── RPC: link_pet_request_document ───────────────────────────────────────────

create or replace function public.link_pet_request_document(
  p_request_id  uuid,
  p_account_id  uuid,
  p_document_id uuid
)
returns public.pet_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.pet_requests;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  perform public.assert_account_feature_access(p_account_id, 'renters_rights_readiness');
  if not public.is_account_manager(p_account_id, v_uid) then
    raise exception 'Access denied';
  end if;

  if p_document_id is null then
    raise exception 'Document ID is required';
  end if;

  update public.pet_requests
  set
    insurance_document_id = p_document_id,
    updated_at            = now()
  where id = p_request_id and account_id = p_account_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Pet request not found';
  end if;

  perform public.log_security_event(
    p_account_id, 'pet_request_document_linked', 'pet_request', p_request_id,
    jsonb_build_object('document_id', p_document_id)
  );

  return v_row;
end;
$$;

revoke all    on function public.link_pet_request_document(uuid, uuid, uuid) from public;
grant  execute on function public.link_pet_request_document(uuid, uuid, uuid) to authenticated;

commit;
