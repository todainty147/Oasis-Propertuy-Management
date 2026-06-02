-- Compliance Safe Phase 2: evidence attachment, tenant acknowledgement and expiry hardening.
-- Additive overlay only. Tenaqo does not provide legal advice or live government/legal submission.

insert into public.account_feature_flags (account_id, feature_key, enabled, created_by)
select a.id, flag.feature_key, false, null
from public.accounts a
cross join (values
  ('compliance_safe_tenant_acknowledgement'),
  ('compliance_safe_expiry_reminders'),
  ('risk_protection_suite')
) as flag(feature_key)
on conflict (account_id, feature_key) do nothing;

alter table public.tenancy_compliance_items
  add column if not exists served_at timestamptz,
  add column if not exists evidence_source_type text,
  add column if not exists evidence_source_id uuid,
  add column if not exists reminder_days_before integer default 30,
  add column if not exists last_reminder_sent_at timestamptz,
  add column if not exists marked_not_applicable_at timestamptz,
  add column if not exists marked_not_applicable_by uuid,
  add column if not exists needs_review_reason text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tenancy_compliance_items_evidence_source_type_check'
      and conrelid = 'public.tenancy_compliance_items'::regclass
  ) then
    alter table public.tenancy_compliance_items
      add constraint tenancy_compliance_items_evidence_source_type_check
      check (evidence_source_type is null or evidence_source_type in ('document', 'inspection_report', 'manual'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'tenancy_compliance_items_reminder_days_check'
      and conrelid = 'public.tenancy_compliance_items'::regclass
  ) then
    alter table public.tenancy_compliance_items
      add constraint tenancy_compliance_items_reminder_days_check
      check (reminder_days_before is null or reminder_days_before between 0 and 365);
  end if;
end;
$$;

create table if not exists public.compliance_item_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  compliance_item_id uuid not null references public.tenancy_compliance_items(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  acknowledged_by uuid,
  acknowledgement_status text not null default 'pending',
  message text,
  acknowledged_at timestamptz,
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint compliance_item_ack_status_check check (
    acknowledgement_status in ('pending', 'viewed', 'acknowledged', 'disputed', 'revoked')
  )
);

create unique index if not exists idx_compliance_item_ack_active
  on public.compliance_item_acknowledgements(account_id, compliance_item_id, tenant_id)
  where acknowledgement_status <> 'revoked';
create index if not exists idx_compliance_item_ack_tenant_status
  on public.compliance_item_acknowledgements(account_id, tenant_id, acknowledgement_status);
create index if not exists idx_tenancy_compliance_items_expiry
  on public.tenancy_compliance_items(account_id, expires_at)
  where status <> 'not_applicable';

drop trigger if exists trg_compliance_item_ack_updated_at on public.compliance_item_acknowledgements;
create trigger trg_compliance_item_ack_updated_at
  before update on public.compliance_item_acknowledgements
  for each row execute function public.phase3_set_updated_at();

create or replace function public.enforce_compliance_acknowledgement_tenant_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_is_tenant boolean;
begin
  if public.user_can_manage_account(new.account_id) then
    return new;
  end if;

  select exists (
    select 1
    from public.tenants t
    where t.id = old.tenant_id
      and t.account_id = old.account_id
      and t.user_id = auth.uid()
      and t.archived_at is null
  ) into v_is_tenant;

  if not v_is_tenant then
    raise exception 'Only the assigned tenant can update this acknowledgement';
  end if;

  if old.account_id is distinct from new.account_id
    or old.compliance_item_id is distinct from new.compliance_item_id
    or old.tenant_id is distinct from new.tenant_id
    or old.message is distinct from new.message
    or old.created_at is distinct from new.created_at then
    raise exception 'Tenant cannot edit landlord-controlled acknowledgement fields';
  end if;

  if old.acknowledgement_status = 'revoked' then
    raise exception 'Revoked acknowledgements cannot be updated';
  end if;

  if new.acknowledgement_status not in ('viewed', 'acknowledged', 'disputed') then
    raise exception 'Invalid tenant acknowledgement status';
  end if;

  if new.acknowledgement_status = 'acknowledged' then
    new.acknowledged_at := coalesce(new.acknowledged_at, now());
    new.acknowledged_by := coalesce(new.acknowledged_by, auth.uid());
  elsif new.acknowledgement_status = 'disputed' then
    new.acknowledged_at := coalesce(new.acknowledged_at, now());
    new.acknowledged_by := coalesce(new.acknowledged_by, auth.uid());
    if nullif(trim(coalesce(new.comment, '')), '') is null then
      raise exception 'Add a comment before marking this compliance document as disputed';
    end if;
  else
    new.acknowledged_at := old.acknowledged_at;
    new.acknowledged_by := old.acknowledged_by;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_compliance_item_ack_tenant_update_guard on public.compliance_item_acknowledgements;
create trigger trg_compliance_item_ack_tenant_update_guard
  before update on public.compliance_item_acknowledgements
  for each row execute function public.enforce_compliance_acknowledgement_tenant_update();

create or replace function public.apply_compliance_acknowledgement_response()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.acknowledgement_status is not distinct from new.acknowledgement_status then
    return new;
  end if;

  if new.acknowledgement_status = 'acknowledged' then
    update public.tenancy_compliance_items
    set status = 'acknowledged',
        acknowledged_by_tenant_at = coalesce(new.acknowledged_at, now()),
        completed_at = coalesce(completed_at, coalesce(new.acknowledged_at, now())),
        updated_at = now()
    where id = new.compliance_item_id
      and account_id = new.account_id;

    insert into public.compliance_evidence_events(account_id, compliance_item_id, user_id, event_type, metadata)
    values (
      new.account_id,
      new.compliance_item_id,
      new.acknowledged_by,
      'tenant_acknowledged',
      jsonb_build_object('acknowledgement_id', new.id, 'tenant_id', new.tenant_id)
    );
  elsif new.acknowledgement_status = 'disputed' then
    update public.tenancy_compliance_items
    set status = 'needs_review',
        needs_review_reason = coalesce(nullif(trim(new.comment), ''), 'Tenant dispute or question'),
        updated_at = now()
    where id = new.compliance_item_id
      and account_id = new.account_id;

    insert into public.compliance_evidence_events(account_id, compliance_item_id, user_id, event_type, metadata)
    values (
      new.account_id,
      new.compliance_item_id,
      new.acknowledged_by,
      'tenant_disputed',
      jsonb_build_object('acknowledgement_id', new.id, 'tenant_id', new.tenant_id)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_compliance_item_ack_apply_response on public.compliance_item_acknowledgements;
create trigger trg_compliance_item_ack_apply_response
  after update of acknowledgement_status on public.compliance_item_acknowledgements
  for each row execute function public.apply_compliance_acknowledgement_response();

alter table public.compliance_item_acknowledgements enable row level security;

drop policy if exists "Managers manage compliance acknowledgements" on public.compliance_item_acknowledgements;
create policy "Managers manage compliance acknowledgements" on public.compliance_item_acknowledgements
  for all to authenticated
  using (public.user_can_manage_account(account_id))
  with check (public.user_can_manage_account(account_id));

drop policy if exists "Tenants read assigned compliance acknowledgements" on public.compliance_item_acknowledgements;
create policy "Tenants read assigned compliance acknowledgements" on public.compliance_item_acknowledgements
  for select to authenticated
  using (
    acknowledgement_status <> 'revoked'
    and exists (
      select 1
      from public.tenants t
      where t.id = compliance_item_acknowledgements.tenant_id
        and t.account_id = compliance_item_acknowledgements.account_id
        and t.user_id = auth.uid()
        and t.archived_at is null
    )
  );

drop policy if exists "Tenants update assigned compliance acknowledgements" on public.compliance_item_acknowledgements;
create policy "Tenants update assigned compliance acknowledgements" on public.compliance_item_acknowledgements
  for update to authenticated
  using (
    acknowledgement_status <> 'revoked'
    and exists (
      select 1
      from public.tenants t
      where t.id = compliance_item_acknowledgements.tenant_id
        and t.account_id = compliance_item_acknowledgements.account_id
        and t.user_id = auth.uid()
        and t.archived_at is null
    )
  )
  with check (
    acknowledgement_status in ('viewed', 'acknowledged', 'disputed')
    and exists (
      select 1
      from public.tenants t
      where t.id = compliance_item_acknowledgements.tenant_id
        and t.account_id = compliance_item_acknowledgements.account_id
        and t.user_id = auth.uid()
        and t.archived_at is null
    )
  );

drop policy if exists "Tenants read assigned acknowledgement compliance items" on public.tenancy_compliance_items;
create policy "Tenants read assigned acknowledgement compliance items" on public.tenancy_compliance_items
  for select to authenticated
  using (
    exists (
      select 1
      from public.compliance_item_acknowledgements cia
      join public.tenants t
        on t.id = cia.tenant_id
       and t.account_id = cia.account_id
       and t.user_id = auth.uid()
       and t.archived_at is null
      where cia.compliance_item_id = tenancy_compliance_items.id
        and cia.account_id = tenancy_compliance_items.account_id
        and cia.acknowledgement_status <> 'revoked'
    )
  );

drop policy if exists "Tenants insert compliance evidence events for acknowledgement" on public.compliance_evidence_events;
create policy "Tenants insert compliance evidence events for acknowledgement" on public.compliance_evidence_events
  for insert to authenticated
  with check (
    event_type in ('tenant_acknowledged', 'tenant_disputed')
    and exists (
      select 1
      from public.compliance_item_acknowledgements cia
      join public.tenants t
        on t.id = cia.tenant_id
       and t.account_id = cia.account_id
       and t.user_id = auth.uid()
       and t.archived_at is null
      where cia.compliance_item_id = compliance_evidence_events.compliance_item_id
        and cia.account_id = compliance_evidence_events.account_id
        and cia.acknowledgement_status <> 'revoked'
    )
  );

grant select, insert, update, delete on public.compliance_item_acknowledgements to authenticated;
