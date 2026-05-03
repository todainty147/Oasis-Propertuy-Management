-- supabase/renters_rights_phase2.sql
--
-- Renters' Rights Readiness Pack — Phase 2
--   Module 2: Tenancy Agreement Review Prompts (deterministic, field-based)
--   Module 3: Rent Review Guardrails (rent_review_records table + RPCs)
--
-- LEGAL DISCLAIMER: All outputs are operational review prompts only.
-- OASIS does not determine whether a tenancy, clause, rent increase, or
-- action is legally valid. Seek advice from a qualified professional.

begin;

-- ══════════════════════════════════════════════════════════════════════════════
-- MODULE 3 — rent_review_records
-- ══════════════════════════════════════════════════════════════════════════════

create table if not exists public.rent_review_records (
  id                      uuid        primary key default gen_random_uuid(),
  account_id              uuid        not null references public.accounts(id) on delete cascade,
  property_id             uuid        references public.properties(id) on delete set null,
  tenant_id               uuid        references public.tenants(id) on delete set null,
  lease_id                uuid        references public.leases(id) on delete set null,
  current_rent            numeric(12,2),
  proposed_rent           numeric(12,2),
  proposed_effective_date date,
  last_rent_review_date   date,
  evidence_document_id    uuid        references public.documents(id) on delete set null,
  notice_document_id      uuid        references public.documents(id) on delete set null,
  status                  text        not null default 'draft',
  notes                   text,
  created_by              uuid        references auth.users(id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'rent_review_status_check') then
    alter table public.rent_review_records
      add constraint rent_review_status_check
      check (status in ('draft','evidence_needed','ready_for_review','sent','challenged','completed','cancelled'));
  end if;
end $$;

create index if not exists rent_review_account_status_idx
  on public.rent_review_records(account_id, status, proposed_effective_date);

create index if not exists rent_review_tenant_idx
  on public.rent_review_records(tenant_id);

-- Updated-at trigger
create or replace function public.rent_review_set_updated_at()
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

drop trigger if exists rent_review_updated_at_trg on public.rent_review_records;
create trigger rent_review_updated_at_trg
  before update on public.rent_review_records
  for each row execute function public.rent_review_set_updated_at();

-- RLS: manager-only
alter table public.rent_review_records enable row level security;

drop policy if exists rent_review_select_manager on public.rent_review_records;
create policy rent_review_select_manager on public.rent_review_records
  for select
  using (public.is_account_manager(account_id, auth.uid()));

-- ── RPC: list_rent_review_records ────────────────────────────────────────────

create or replace function public.list_rent_review_records(
  p_account_id uuid,
  p_status     text    default null,
  p_limit      integer default 100,
  p_offset     integer default 0
)
returns table (
  id                      uuid,
  account_id              uuid,
  property_id             uuid,
  tenant_id               uuid,
  lease_id                uuid,
  current_rent            numeric,
  proposed_rent           numeric,
  proposed_effective_date date,
  last_rent_review_date   date,
  evidence_document_id    uuid,
  notice_document_id      uuid,
  status                  text,
  notes                   text,
  created_by              uuid,
  created_at              timestamptz,
  updated_at              timestamptz,
  tenant_name             text,
  property_address        text
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
    r.id, r.account_id, r.property_id, r.tenant_id, r.lease_id,
    r.current_rent, r.proposed_rent, r.proposed_effective_date,
    r.last_rent_review_date, r.evidence_document_id, r.notice_document_id,
    r.status, r.notes, r.created_by, r.created_at, r.updated_at,
    coalesce(tn.name, '—')    as tenant_name,
    coalesce(pr.address, '—') as property_address
  from public.rent_review_records r
  left join public.tenants    tn on tn.id = r.tenant_id
  left join public.properties pr on pr.id = r.property_id
  where r.account_id = p_account_id
    and (p_status is null or r.status = p_status)
  order by r.proposed_effective_date asc nulls last, r.created_at desc
  limit  greatest(1, least(coalesce(p_limit, 100), 500))
  offset greatest(0, coalesce(p_offset, 0));
end;
$$;

revoke all  on function public.list_rent_review_records(uuid, text, integer, integer) from public;
grant execute on function public.list_rent_review_records(uuid, text, integer, integer) to authenticated;

-- ── RPC: create_rent_review_record ───────────────────────────────────────────

create or replace function public.create_rent_review_record(
  p_account_id              uuid,
  p_property_id             uuid    default null,
  p_tenant_id               uuid    default null,
  p_lease_id                uuid    default null,
  p_current_rent            numeric default null,
  p_proposed_rent           numeric default null,
  p_proposed_effective_date date    default null,
  p_last_rent_review_date   date    default null,
  p_notes                   text    default null
)
returns public.rent_review_records
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.rent_review_records;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  perform public.assert_account_feature_access(p_account_id, 'renters_rights_readiness');
  if not public.is_account_manager(p_account_id, v_uid) then
    raise exception 'Access denied';
  end if;

  insert into public.rent_review_records (
    account_id, property_id, tenant_id, lease_id,
    current_rent, proposed_rent, proposed_effective_date, last_rent_review_date,
    notes, created_by, status
  ) values (
    p_account_id, p_property_id, p_tenant_id, p_lease_id,
    p_current_rent, p_proposed_rent, p_proposed_effective_date, p_last_rent_review_date,
    p_notes, v_uid,
    case
      when p_current_rent is null or p_proposed_rent is null then 'evidence_needed'
      else 'draft'
    end
  )
  returning * into v_row;

  perform public.log_security_event(
    p_account_id, 'rent_review_created', 'rent_review_record', v_row.id,
    jsonb_build_object('tenant_id', p_tenant_id, 'property_id', p_property_id)
  );

  return v_row;
end;
$$;

revoke all  on function public.create_rent_review_record(uuid, uuid, uuid, uuid, numeric, numeric, date, date, text) from public;
grant execute on function public.create_rent_review_record(uuid, uuid, uuid, uuid, numeric, numeric, date, date, text) to authenticated;

-- ── RPC: update_rent_review_status ───────────────────────────────────────────

create or replace function public.update_rent_review_status(
  p_record_id  uuid,
  p_account_id uuid,
  p_status     text,
  p_notes      text default null
)
returns public.rent_review_records
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_row      public.rent_review_records;
  v_old_status text;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  perform public.assert_account_feature_access(p_account_id, 'renters_rights_readiness');
  if not public.is_account_manager(p_account_id, v_uid) then
    raise exception 'Access denied';
  end if;

  if p_status not in ('draft','evidence_needed','ready_for_review','sent','challenged','completed','cancelled') then
    raise exception 'Invalid status: %', p_status;
  end if;

  select status into v_old_status
  from public.rent_review_records
  where id = p_record_id and account_id = p_account_id;

  if not found then
    raise exception 'Record not found';
  end if;

  update public.rent_review_records
  set status     = p_status,
      notes      = coalesce(p_notes, notes),
      updated_at = now()
  where id = p_record_id and account_id = p_account_id
  returning * into v_row;

  perform public.log_security_event(
    p_account_id, 'rent_review_status_changed', 'rent_review_record', p_record_id,
    jsonb_build_object('old_status', v_old_status, 'new_status', p_status)
  );

  return v_row;
end;
$$;

revoke all  on function public.update_rent_review_status(uuid, uuid, text, text) from public;
grant execute on function public.update_rent_review_status(uuid, uuid, text, text) to authenticated;

-- ── RPC: link_rent_review_document ───────────────────────────────────────────

create or replace function public.link_rent_review_document(
  p_record_id   uuid,
  p_account_id  uuid,
  p_document_id uuid,
  p_doc_type    text  -- 'evidence' | 'notice'
)
returns public.rent_review_records
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.rent_review_records;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  perform public.assert_account_feature_access(p_account_id, 'renters_rights_readiness');
  if not public.is_account_manager(p_account_id, v_uid) then
    raise exception 'Access denied';
  end if;

  if p_doc_type not in ('evidence', 'notice') then
    raise exception 'p_doc_type must be ''evidence'' or ''notice''';
  end if;

  update public.rent_review_records
  set evidence_document_id = case when p_doc_type = 'evidence' then p_document_id else evidence_document_id end,
      notice_document_id   = case when p_doc_type = 'notice'   then p_document_id else notice_document_id   end,
      updated_at           = now()
  where id = p_record_id and account_id = p_account_id
  returning * into v_row;

  if v_row.id is null then raise exception 'Record not found'; end if;

  perform public.log_security_event(
    p_account_id, 'rent_review_evidence_linked', 'rent_review_record', p_record_id,
    jsonb_build_object('document_id', p_document_id, 'doc_type', p_doc_type)
  );

  return v_row;
end;
$$;

revoke all  on function public.link_rent_review_document(uuid, uuid, uuid, text) from public;
grant execute on function public.link_rent_review_document(uuid, uuid, uuid, text) to authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- MODULE 2 — Tenancy Agreement Review Prompts
-- Deterministic checks on structured lease fields. No document extraction
-- or AI required in Phase 2 — all checks use columns already in the leases table.
--
-- Prompts are stored as renters_rights_tasks with:
--   requirement_type = 'tenancy_review_prompt'
--   metadata.finding_type, metadata.severity, metadata.explanation,
--   metadata.suggested_action, metadata.lease_id, metadata.lease_end_date
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function public.generate_tenancy_review_prompts(
  p_account_id uuid
)
returns integer   -- count of new prompts created
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid    := auth.uid();
  v_count    integer := 0;
  v_reform   date    := '2026-05-01';
  v_soon     date    := current_date + interval '90 days';
  v_min_notice_days integer := 14;
  v_type     text    := 'tenancy_review_prompt';
  v_l        record;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  perform public.assert_account_feature_access(p_account_id, 'renters_rights_readiness');
  if not public.is_account_manager(p_account_id, v_uid) then
    raise exception 'Access denied';
  end if;

  -- Dismiss any prompts that are now stale (re-generate fresh ones below).
  -- We keep 'reviewed' prompts so managers don't lose their review history;
  -- only reset 'required' prompts so they are regenerated with current data.
  delete from public.renters_rights_tasks
  where account_id       = p_account_id
    and requirement_type = v_type
    and status           = 'required';

  for v_l in (
    select l.id        as lease_id,
           l.tenant_id,
           l.property_id,
           l.lease_end_date,
           l.renewal_status,
           l.notice_period_days
    from public.leases l
    where l.account_id = p_account_id
      and l.renewal_status not in ('ended')
  ) loop

    -- Check 1: Fixed end date falls after the reform date
    -- Prompt: Review whether fixed-term wording aligns with the new rules.
    if v_l.lease_end_date is not null and v_l.lease_end_date > v_reform then
      if not exists (
        select 1 from public.renters_rights_tasks
        where account_id       = p_account_id
          and tenant_id        = v_l.tenant_id
          and requirement_type = v_type
          and status           = 'reviewed'
          and (metadata->>'finding_type') = 'fixed_term_post_reform'
      ) then
        insert into public.renters_rights_tasks (
          account_id, property_id, tenant_id, lease_id,
          requirement_type, jurisdiction, due_date, status, metadata
        ) values (
          p_account_id, v_l.property_id, v_l.tenant_id, v_l.lease_id,
          v_type, 'GB-ENG', current_date + interval '30 days', 'required',
          jsonb_build_object(
            'finding_type', 'fixed_term_post_reform',
            'severity', 'warning',
            'explanation', 'This lease has a fixed end date after the Renters'' Rights Act reform date. Review whether the fixed-term wording aligns with the current rules.',
            'suggested_action', 'Review tenancy wording with a qualified adviser.',
            'lease_end_date', v_l.lease_end_date
          )
        );
        v_count := v_count + 1;
      end if;
    end if;

    -- Check 2: Lease ending within 90 days
    -- Prompt: Renewal or possession decision may be needed soon.
    if v_l.lease_end_date is not null
       and v_l.lease_end_date <= v_soon
       and v_l.lease_end_date >= current_date then
      if not exists (
        select 1 from public.renters_rights_tasks
        where account_id       = p_account_id
          and tenant_id        = v_l.tenant_id
          and requirement_type = v_type
          and status           = 'reviewed'
          and (metadata->>'finding_type') = 'lease_expiring_soon'
      ) then
        insert into public.renters_rights_tasks (
          account_id, property_id, tenant_id, lease_id,
          requirement_type, jurisdiction, due_date, status, metadata
        ) values (
          p_account_id, v_l.property_id, v_l.tenant_id, v_l.lease_id,
          v_type, 'GB-ENG', v_l.lease_end_date, 'required',
          jsonb_build_object(
            'finding_type', 'lease_expiring_soon',
            'severity', 'warning',
            'explanation', 'This tenancy ends within 90 days. Consider whether a renewal or other arrangement is needed.',
            'suggested_action', 'Discuss next steps with the tenant and, if needed, your adviser.',
            'lease_end_date', v_l.lease_end_date
          )
        );
        v_count := v_count + 1;
      end if;
    end if;

    -- Check 3: Notice period shorter than common threshold (14 days)
    -- Prompt: Very short notice periods may warrant review.
    if v_l.notice_period_days is not null and v_l.notice_period_days < v_min_notice_days then
      if not exists (
        select 1 from public.renters_rights_tasks
        where account_id       = p_account_id
          and tenant_id        = v_l.tenant_id
          and requirement_type = v_type
          and status           = 'reviewed'
          and (metadata->>'finding_type') = 'short_notice_period'
      ) then
        insert into public.renters_rights_tasks (
          account_id, property_id, tenant_id, lease_id,
          requirement_type, jurisdiction, due_date, status, metadata
        ) values (
          p_account_id, v_l.property_id, v_l.tenant_id, v_l.lease_id,
          v_type, 'GB-ENG', current_date + interval '30 days', 'required',
          jsonb_build_object(
            'finding_type', 'short_notice_period',
            'severity', 'info',
            'explanation', format('This tenancy records a notice period of %s days, which is below the common threshold. Review with your adviser.', v_l.notice_period_days),
            'suggested_action', 'Confirm notice period wording with a qualified adviser.',
            'notice_period_days', v_l.notice_period_days
          )
        );
        v_count := v_count + 1;
      end if;
    end if;

    -- Check 4: Renewal status is 'renewal_in_progress'
    -- Prompt: Ongoing renewal may need attention.
    if v_l.renewal_status = 'renewal_in_progress' then
      if not exists (
        select 1 from public.renters_rights_tasks
        where account_id       = p_account_id
          and tenant_id        = v_l.tenant_id
          and requirement_type = v_type
          and status           = 'reviewed'
          and (metadata->>'finding_type') = 'renewal_in_progress'
      ) then
        insert into public.renters_rights_tasks (
          account_id, property_id, tenant_id, lease_id,
          requirement_type, jurisdiction, due_date, status, metadata
        ) values (
          p_account_id, v_l.property_id, v_l.tenant_id, v_l.lease_id,
          v_type, 'GB-ENG', current_date + interval '14 days', 'required',
          jsonb_build_object(
            'finding_type', 'renewal_in_progress',
            'severity', 'info',
            'explanation', 'Renewal is recorded as in progress. Ensure the process is documented and the new terms are agreed in writing.',
            'suggested_action', 'Confirm renewal terms are documented.',
            'renewal_status', v_l.renewal_status
          )
        );
        v_count := v_count + 1;
      end if;
    end if;

  end loop;

  if v_count > 0 then
    perform public.log_security_event(
      p_account_id, 'renters_rights_review_prompts_generated', 'renters_rights_task', null,
      jsonb_build_object('prompts_created', v_count)
    );
  end if;

  return v_count;
end;
$$;

revoke all  on function public.generate_tenancy_review_prompts(uuid) from public;
grant execute on function public.generate_tenancy_review_prompts(uuid) to authenticated;

-- ── RPC: dismiss_tenancy_review_prompt ───────────────────────────────────────

create or replace function public.dismiss_tenancy_review_prompt(
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
  if v_uid is null then raise exception 'Not authenticated'; end if;
  perform public.assert_account_feature_access(p_account_id, 'renters_rights_readiness');
  if not public.is_account_manager(p_account_id, v_uid) then
    raise exception 'Access denied';
  end if;

  update public.renters_rights_tasks
  set status     = 'reviewed',
      notes      = coalesce(p_notes, notes),
      updated_at = now()
  where id               = p_task_id
    and account_id       = p_account_id
    and requirement_type = 'tenancy_review_prompt'
    and status           = 'required'
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Prompt not found or already reviewed';
  end if;

  perform public.log_security_event(
    p_account_id, 'renters_rights_review_prompt_dismissed', 'renters_rights_task', p_task_id,
    jsonb_build_object('finding_type', v_row.metadata->>'finding_type')
  );

  return v_row;
end;
$$;

revoke all  on function public.dismiss_tenancy_review_prompt(uuid, uuid, text) from public;
grant execute on function public.dismiss_tenancy_review_prompt(uuid, uuid, text) to authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- Updated list_rr_attention_items — Phase 2 additions
-- Adds: renters_rights_lease_review_needed, renters_rights_rent_review_needs_evidence
-- ══════════════════════════════════════════════════════════════════════════════

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

  -- Information sheet: overdue or due soon
  select
    'rr_info_sheet_' || t.id::text,
    case when t.due_date < current_date then 'renters_rights_information_sheet_overdue'
         else                               'renters_rights_information_sheet_due'    end,
    case when t.due_date < current_date then 'urgent' else 'action' end,
    coalesce(pr.address, '—'),
    coalesce(tn.name, '—'),
    'Information Sheet'::text,
    0::numeric,
    greatest(0, extract(epoch from (now() - t.due_date::timestamptz))::integer / 3600),
    (t.due_date - current_date)::integer,
    '/compliance/renters-rights'::text,
    'renters_rights_tasks'::text,
    case when t.due_date < current_date then 5 else 50 end
  from public.renters_rights_tasks t
  left join public.tenants    tn on tn.id = t.tenant_id
  left join public.properties pr on pr.id = t.property_id
  where t.account_id       = p_account_id
    and t.requirement_type = 'renters_rights_information_sheet'
    and t.status           = 'required'
    and t.due_date         <= current_date + interval '60 days'

  union all

  -- Tenancy review prompts: open prompts needing manager attention
  select
    'rr_lease_review_' || t.id::text,
    'renters_rights_lease_review_needed'::text,
    'action'::text,
    coalesce(pr.address, '—'),
    coalesce(tn.name, '—'),
    coalesce(t.metadata->>'finding_type', 'Review'),
    0::numeric,
    0::integer,
    (t.due_date - current_date)::integer,
    '/compliance/renters-rights'::text,
    'renters_rights_tasks'::text,
    60::integer
  from public.renters_rights_tasks t
  left join public.tenants    tn on tn.id = t.tenant_id
  left join public.properties pr on pr.id = t.property_id
  where t.account_id       = p_account_id
    and t.requirement_type = 'tenancy_review_prompt'
    and t.status           = 'required'

  union all

  -- Rent reviews: missing evidence or notice document
  select
    'rr_rent_review_' || r.id::text,
    'renters_rights_rent_review_needs_evidence'::text,
    'action'::text,
    coalesce(pr.address, '—'),
    coalesce(tn.name, '—'),
    'Rent Review'::text,
    coalesce(r.proposed_rent, 0),
    0::integer,
    (r.proposed_effective_date - current_date)::integer,
    '/compliance/renters-rights'::text,
    'rent_review_records'::text,
    70::integer
  from public.rent_review_records r
  left join public.tenants    tn on tn.id = r.tenant_id
  left join public.properties pr on pr.id = r.property_id
  where r.account_id = p_account_id
    and r.status in ('evidence_needed', 'draft')
    and (r.evidence_document_id is null or r.notice_document_id is null)

  order by sort_order, due_days asc nulls last
  limit greatest(1, least(coalesce(p_limit, 20), 100));
end;
$$;

revoke all  on function public.list_rr_attention_items(uuid, integer) from public;
grant execute on function public.list_rr_attention_items(uuid, integer) to authenticated;

commit;
