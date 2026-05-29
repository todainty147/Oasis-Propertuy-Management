-- Evidence Vault Phase 2: tenant sharing and deposit dispute packs.
-- Additive overlay only; live legal/government submission is not involved.

insert into public.account_feature_flags (account_id, feature_key, enabled, created_by)
select a.id, flag.feature_key, false, null
from public.accounts a
cross join (values
  ('evidence_vault_tenant_sharing'),
  ('evidence_vault_dispute_pack')
) as flag(feature_key)
on conflict (account_id, feature_key) do nothing;

create table if not exists public.inspection_report_shares (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  inspection_report_id uuid not null references public.inspection_reports(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  shared_by uuid,
  share_status text not null default 'shared',
  message text,
  response_due_at timestamptz,
  shared_at timestamptz not null default now(),
  viewed_at timestamptz,
  responded_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inspection_report_shares_status_check check (
    share_status in ('shared', 'viewed', 'tenant_signed', 'tenant_disputed', 'revoked', 'expired')
  )
);

create unique index if not exists idx_inspection_report_shares_active_unique
  on public.inspection_report_shares(account_id, inspection_report_id, tenant_id)
  where revoked_at is null;

create index if not exists idx_inspection_report_shares_tenant
  on public.inspection_report_shares(account_id, tenant_id, shared_at desc);

create table if not exists public.inspection_report_tenant_comments (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  inspection_report_id uuid not null references public.inspection_reports(id) on delete cascade,
  share_id uuid not null references public.inspection_report_shares(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  evidence_item_id uuid references public.inspection_evidence_items(id) on delete set null,
  comment_type text not null default 'general',
  comment text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inspection_report_tenant_comments_type_check check (
    comment_type in ('general', 'agree', 'dispute', 'clarification')
  )
);

create index if not exists idx_inspection_report_tenant_comments_share
  on public.inspection_report_tenant_comments(account_id, share_id, created_at desc);

alter table public.inspection_signatures
  add column if not exists signer_role text not null default 'landlord',
  add column if not exists signed_from text not null default 'landlord_portal',
  add column if not exists tenant_id uuid references public.tenants(id) on delete set null,
  add column if not exists share_id uuid,
  add column if not exists signature_status text not null default 'signed';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'inspection_signatures_share_id_fkey'
      and conrelid = 'public.inspection_signatures'::regclass
  ) then
    alter table public.inspection_signatures
      add constraint inspection_signatures_share_id_fkey
      foreign key (share_id) references public.inspection_report_shares(id) on delete set null;
  end if;
end $$;

update public.inspection_signatures
set signer_role = case when signer_type = 'tenant' then 'tenant' else 'landlord' end
where signer_role is null or signer_role = '';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'inspection_signatures_role_check'
      and conrelid = 'public.inspection_signatures'::regclass
  ) then
    alter table public.inspection_signatures
      add constraint inspection_signatures_role_check check (signer_role in ('landlord', 'tenant'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'inspection_signatures_signed_from_check'
      and conrelid = 'public.inspection_signatures'::regclass
  ) then
    alter table public.inspection_signatures
      add constraint inspection_signatures_signed_from_check check (signed_from in ('landlord_portal', 'tenant_portal'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'inspection_signatures_status_check'
      and conrelid = 'public.inspection_signatures'::regclass
  ) then
    alter table public.inspection_signatures
      add constraint inspection_signatures_status_check check (signature_status in ('signed'));
  end if;
end $$;

create index if not exists idx_inspection_signatures_tenant_share
  on public.inspection_signatures(account_id, share_id)
  where share_id is not null and signer_role = 'tenant';

create table if not exists public.deposit_dispute_packs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete set null,
  tenancy_id uuid,
  title text not null,
  status text not null default 'draft',
  deposit_amount numeric(12,2),
  proposed_deduction_amount numeric(12,2),
  summary text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  locked_at timestamptz,
  archived_at timestamptz,
  constraint deposit_dispute_packs_status_check check (status in ('draft', 'ready', 'exported', 'locked', 'archived'))
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'deposit_dispute_packs_tenancy_id_fkey'
      and conrelid = 'public.deposit_dispute_packs'::regclass
  ) then
    alter table public.deposit_dispute_packs
      add constraint deposit_dispute_packs_tenancy_id_fkey
      foreign key (tenancy_id) references public.leases(id) on delete set null;
  end if;
end $$;

create table if not exists public.deposit_dispute_pack_items (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  dispute_pack_id uuid not null references public.deposit_dispute_packs(id) on delete cascade,
  item_type text not null,
  title text not null,
  description text,
  claimed_amount numeric(12,2),
  evidence_reference_type text,
  evidence_reference_id uuid,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deposit_dispute_pack_items_type_check check (
    item_type in (
      'deduction', 'check_in_report', 'check_out_report', 'inspection_report', 'photo_evidence',
      'invoice', 'quote', 'receipt', 'tenancy_agreement', 'rent_statement', 'communication', 'note', 'other'
    )
  )
);

create table if not exists public.deposit_dispute_pack_exports (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  dispute_pack_id uuid not null references public.deposit_dispute_packs(id) on delete cascade,
  export_type text not null default 'pdf',
  status text not null default 'generated',
  document_id uuid,
  storage_path text,
  generated_by uuid,
  generated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.deposit_dispute_pack_audit_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  dispute_pack_id uuid references public.deposit_dispute_packs(id) on delete cascade,
  user_id uuid,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_deposit_dispute_packs_account
  on public.deposit_dispute_packs(account_id, property_id, created_at desc);
create index if not exists idx_deposit_dispute_pack_items_pack
  on public.deposit_dispute_pack_items(account_id, dispute_pack_id, sort_order);
create index if not exists idx_deposit_dispute_packs_tenancy
  on public.deposit_dispute_packs(account_id, tenancy_id)
  where tenancy_id is not null;
create index if not exists idx_deposit_dispute_pack_audit_events_pack
  on public.deposit_dispute_pack_audit_events(account_id, dispute_pack_id, created_at desc);

create or replace function public.enforce_deposit_dispute_pack_child_account()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_pack_account_id uuid;
begin
  if tg_op = 'UPDATE' then
    if old.dispute_pack_id <> new.dispute_pack_id then
      raise exception 'Dispute pack child rows cannot be reassigned to a different pack';
    end if;
  end if;

  select account_id into v_pack_account_id
  from public.deposit_dispute_packs
  where id = new.dispute_pack_id;

  if v_pack_account_id is null or v_pack_account_id <> new.account_id then
    raise exception 'Dispute pack account mismatch';
  end if;

  return new;
end;
$$;

create or replace function public.enforce_deposit_dispute_pack_audit_account()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_pack_account_id uuid;
begin
  if new.dispute_pack_id is null then
    return new;
  end if;

  select account_id into v_pack_account_id
  from public.deposit_dispute_packs
  where id = new.dispute_pack_id;

  if v_pack_account_id is null or v_pack_account_id <> new.account_id then
    raise exception 'Dispute pack account mismatch';
  end if;

  return new;
end;
$$;

create or replace function public.enforce_inspection_report_share_tenant_update()
returns trigger
language plpgsql
security invoker
set search_path = public
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
    raise exception 'Inspection report share update is not allowed';
  end if;

  if new.account_id <> old.account_id
    or new.inspection_report_id <> old.inspection_report_id
    or new.tenant_id <> old.tenant_id
    or new.shared_by is distinct from old.shared_by
    or new.message is distinct from old.message
    or new.response_due_at is distinct from old.response_due_at
    or new.shared_at is distinct from old.shared_at
    or new.revoked_at is distinct from old.revoked_at
  then
    raise exception 'Tenant cannot change landlord-controlled share fields';
  end if;

  if old.revoked_at is not null or old.share_status in ('revoked', 'expired') then
    raise exception 'Inspection report share is no longer active';
  end if;

  if new.share_status not in (old.share_status, 'viewed', 'tenant_signed', 'tenant_disputed') then
    raise exception 'Tenant share status transition is not allowed';
  end if;

  if new.share_status = 'viewed' and old.share_status <> 'shared' then
    raise exception 'Tenant share status transition is not allowed';
  end if;

  if new.share_status = 'tenant_signed' and not exists (
    select 1
    from public.inspection_signatures sig
    where sig.account_id = old.account_id
      and sig.inspection_report_id = old.inspection_report_id
      and sig.share_id = old.id
      and sig.tenant_id = old.tenant_id
      and sig.signer_role = 'tenant'
      and sig.signed_from = 'tenant_portal'
  ) then
    raise exception 'Tenant signature must exist before marking share signed';
  end if;

  if new.share_status = 'tenant_disputed' and not exists (
    select 1
    from public.inspection_report_tenant_comments c
    where c.account_id = old.account_id
      and c.share_id = old.id
      and c.tenant_id = old.tenant_id
      and c.comment_type = 'dispute'
  ) then
    raise exception 'Tenant dispute comment must exist before marking share disputed';
  end if;

  if new.responded_at is not null and new.share_status not in ('tenant_signed', 'tenant_disputed') then
    raise exception 'Tenant response timestamp requires a tenant response';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_deposit_dispute_pack_items_account_match on public.deposit_dispute_pack_items;
create trigger trg_deposit_dispute_pack_items_account_match
  before insert or update on public.deposit_dispute_pack_items
  for each row execute function public.enforce_deposit_dispute_pack_child_account();

drop trigger if exists trg_deposit_dispute_pack_exports_account_match on public.deposit_dispute_pack_exports;
create trigger trg_deposit_dispute_pack_exports_account_match
  before insert on public.deposit_dispute_pack_exports
  for each row execute function public.enforce_deposit_dispute_pack_child_account();

drop trigger if exists trg_deposit_dispute_pack_audit_account_match on public.deposit_dispute_pack_audit_events;
create trigger trg_deposit_dispute_pack_audit_account_match
  before insert or update on public.deposit_dispute_pack_audit_events
  for each row execute function public.enforce_deposit_dispute_pack_audit_account();

drop trigger if exists trg_inspection_report_shares_updated_at on public.inspection_report_shares;
create trigger trg_inspection_report_shares_updated_at
  before update on public.inspection_report_shares
  for each row execute function public.phase3_set_updated_at();

drop trigger if exists trg_inspection_report_shares_tenant_update_guard on public.inspection_report_shares;
create trigger trg_inspection_report_shares_tenant_update_guard
  before update on public.inspection_report_shares
  for each row execute function public.enforce_inspection_report_share_tenant_update();

drop trigger if exists trg_inspection_report_tenant_comments_updated_at on public.inspection_report_tenant_comments;
create trigger trg_inspection_report_tenant_comments_updated_at
  before update on public.inspection_report_tenant_comments
  for each row execute function public.phase3_set_updated_at();

drop trigger if exists trg_deposit_dispute_packs_updated_at on public.deposit_dispute_packs;
create trigger trg_deposit_dispute_packs_updated_at
  before update on public.deposit_dispute_packs
  for each row execute function public.phase3_set_updated_at();

drop trigger if exists trg_deposit_dispute_pack_items_updated_at on public.deposit_dispute_pack_items;
create trigger trg_deposit_dispute_pack_items_updated_at
  before update on public.deposit_dispute_pack_items
  for each row execute function public.phase3_set_updated_at();

alter table public.inspection_report_shares enable row level security;
alter table public.inspection_report_tenant_comments enable row level security;
alter table public.deposit_dispute_packs enable row level security;
alter table public.deposit_dispute_pack_items enable row level security;
alter table public.deposit_dispute_pack_exports enable row level security;
alter table public.deposit_dispute_pack_audit_events enable row level security;

drop policy if exists "Managers manage inspection report shares" on public.inspection_report_shares;
create policy "Managers manage inspection report shares" on public.inspection_report_shares
  for all to authenticated using (public.user_can_manage_account(account_id)) with check (public.user_can_manage_account(account_id));

drop policy if exists "Tenants read assigned inspection report shares" on public.inspection_report_shares;
create policy "Tenants read assigned inspection report shares" on public.inspection_report_shares
  for select to authenticated using (
    revoked_at is null
    and share_status not in ('revoked', 'expired')
    and exists (
      select 1 from public.tenants t
      where t.id = inspection_report_shares.tenant_id
        and t.account_id = inspection_report_shares.account_id
        and t.user_id = auth.uid()
        and t.archived_at is null
    )
  );

drop policy if exists "Tenants update assigned inspection report shares" on public.inspection_report_shares;
create policy "Tenants update assigned inspection report shares" on public.inspection_report_shares
  for update to authenticated using (
    revoked_at is null
    and share_status not in ('revoked', 'expired')
    and exists (
      select 1 from public.tenants t
      where t.id = inspection_report_shares.tenant_id
        and t.account_id = inspection_report_shares.account_id
        and t.user_id = auth.uid()
        and t.archived_at is null
    )
  ) with check (
    revoked_at is null
    and share_status not in ('revoked', 'expired')
    and exists (
      select 1 from public.tenants t
      where t.id = inspection_report_shares.tenant_id
        and t.account_id = inspection_report_shares.account_id
        and t.user_id = auth.uid()
        and t.archived_at is null
    )
  );

drop policy if exists "Managers manage tenant inspection comments" on public.inspection_report_tenant_comments;
create policy "Managers manage tenant inspection comments" on public.inspection_report_tenant_comments
  for all to authenticated using (public.user_can_manage_account(account_id)) with check (public.user_can_manage_account(account_id));

drop policy if exists "Tenants read assigned inspection comments" on public.inspection_report_tenant_comments;
create policy "Tenants read assigned inspection comments" on public.inspection_report_tenant_comments
  for select to authenticated using (
    exists (
      select 1
      from public.inspection_report_shares s
      join public.tenants t on t.id = s.tenant_id and t.account_id = s.account_id
      where s.id = inspection_report_tenant_comments.share_id
        and s.account_id = inspection_report_tenant_comments.account_id
        and s.revoked_at is null
        and s.share_status not in ('revoked', 'expired')
        and t.user_id = auth.uid()
        and t.archived_at is null
    )
  );

drop policy if exists "Tenants insert assigned inspection comments" on public.inspection_report_tenant_comments;
create policy "Tenants insert assigned inspection comments" on public.inspection_report_tenant_comments
  for insert to authenticated with check (
    exists (
      select 1
      from public.inspection_report_shares s
      join public.tenants t on t.id = s.tenant_id and t.account_id = s.account_id
      where s.id = inspection_report_tenant_comments.share_id
        and s.account_id = inspection_report_tenant_comments.account_id
        and s.inspection_report_id = inspection_report_tenant_comments.inspection_report_id
        and s.tenant_id = inspection_report_tenant_comments.tenant_id
        and s.revoked_at is null
        and s.share_status not in ('revoked', 'expired')
        and t.user_id = auth.uid()
        and t.archived_at is null
    )
  );

drop policy if exists "Tenants read assigned inspection reports" on public.inspection_reports;
drop policy if exists "Tenants read shared inspection reports" on public.inspection_reports;
create policy "Tenants read shared inspection reports" on public.inspection_reports
  for select to authenticated using (
    exists (
      select 1
      from public.inspection_report_shares s
      join public.tenants t on t.id = s.tenant_id and t.account_id = s.account_id
      where s.inspection_report_id = inspection_reports.id
        and s.account_id = inspection_reports.account_id
        and s.revoked_at is null
        and s.share_status not in ('revoked', 'expired')
        and t.user_id = auth.uid()
        and t.archived_at is null
    )
  );

drop policy if exists "Tenants read shared inspection rooms" on public.inspection_rooms;
create policy "Tenants read shared inspection rooms" on public.inspection_rooms
  for select to authenticated using (
    exists (
      select 1
      from public.inspection_report_shares s
      join public.tenants t on t.id = s.tenant_id and t.account_id = s.account_id
      where s.inspection_report_id = inspection_rooms.inspection_report_id
        and s.account_id = inspection_rooms.account_id
        and s.revoked_at is null
        and s.share_status not in ('revoked', 'expired')
        and t.user_id = auth.uid()
        and t.archived_at is null
    )
  );

drop policy if exists "Tenants read shared inspection evidence items" on public.inspection_evidence_items;
create policy "Tenants read shared inspection evidence items" on public.inspection_evidence_items
  for select to authenticated using (
    exists (
      select 1
      from public.inspection_rooms r
      join public.inspection_report_shares s on s.inspection_report_id = r.inspection_report_id and s.account_id = r.account_id
      join public.tenants t on t.id = s.tenant_id and t.account_id = s.account_id
      where r.id = inspection_evidence_items.inspection_room_id
        and r.account_id = inspection_evidence_items.account_id
        and s.revoked_at is null
        and s.share_status not in ('revoked', 'expired')
        and t.user_id = auth.uid()
        and t.archived_at is null
    )
  );

drop policy if exists "Tenants read shared inspection photos" on public.inspection_photos;
create policy "Tenants read shared inspection photos" on public.inspection_photos
  for select to authenticated using (
    exists (
      select 1
      from public.inspection_evidence_items item
      join public.inspection_rooms r on r.id = item.inspection_room_id and r.account_id = item.account_id
      join public.inspection_report_shares s on s.inspection_report_id = r.inspection_report_id and s.account_id = r.account_id
      join public.tenants t on t.id = s.tenant_id and t.account_id = s.account_id
      where item.id = inspection_photos.evidence_item_id
        and item.account_id = inspection_photos.account_id
        and s.revoked_at is null
        and s.share_status not in ('revoked', 'expired')
        and t.user_id = auth.uid()
        and t.archived_at is null
    )
  );

drop policy if exists "Tenants sign assigned inspection reports" on public.inspection_signatures;
drop policy if exists "Tenants sign shared inspection reports" on public.inspection_signatures;
create policy "Tenants sign shared inspection reports" on public.inspection_signatures
  for insert to authenticated with check (
    signer_type = 'tenant'
    and signer_role = 'tenant'
    and signed_from = 'tenant_portal'
    and share_id is not null
    and exists (
      select 1
      from public.inspection_report_shares s
      join public.tenants t on t.id = s.tenant_id and t.account_id = s.account_id
      where s.id = inspection_signatures.share_id
        and s.inspection_report_id = inspection_signatures.inspection_report_id
        and s.account_id = inspection_signatures.account_id
        and s.tenant_id = inspection_signatures.tenant_id
        and s.revoked_at is null
        and s.share_status not in ('revoked', 'expired')
        and t.user_id = auth.uid()
        and t.archived_at is null
    )
  );

drop policy if exists "Tenants read assigned inspection signatures" on public.inspection_signatures;
create policy "Tenants read assigned inspection signatures" on public.inspection_signatures
  for select to authenticated using (
    exists (
      select 1
      from public.inspection_report_shares s
      join public.tenants t on t.id = s.tenant_id and t.account_id = s.account_id
      where s.inspection_report_id = inspection_signatures.inspection_report_id
        and s.account_id = inspection_signatures.account_id
        and s.revoked_at is null
        and s.share_status not in ('revoked', 'expired')
        and t.user_id = auth.uid()
        and t.archived_at is null
    )
  );

drop policy if exists "Tenants insert shared inspection audit events" on public.inspection_audit_events;
create policy "Tenants insert shared inspection audit events" on public.inspection_audit_events
  for insert to authenticated with check (
    exists (
      select 1
      from public.inspection_report_shares s
      join public.tenants t on t.id = s.tenant_id and t.account_id = s.account_id
      where s.inspection_report_id = inspection_audit_events.inspection_report_id
        and s.account_id = inspection_audit_events.account_id
        and s.revoked_at is null
        and s.share_status not in ('revoked', 'expired')
        and t.user_id = auth.uid()
        and t.archived_at is null
    )
  );

drop policy if exists "Managers manage deposit dispute packs" on public.deposit_dispute_packs;
create policy "Managers manage deposit dispute packs" on public.deposit_dispute_packs
  for all to authenticated using (public.user_can_manage_account(account_id)) with check (public.user_can_manage_account(account_id));

drop policy if exists "Managers manage deposit dispute pack items" on public.deposit_dispute_pack_items;
create policy "Managers manage deposit dispute pack items" on public.deposit_dispute_pack_items
  for all to authenticated using (public.user_can_manage_account(account_id)) with check (public.user_can_manage_account(account_id));

drop policy if exists "Managers manage deposit dispute pack exports" on public.deposit_dispute_pack_exports;
create policy "Managers manage deposit dispute pack exports" on public.deposit_dispute_pack_exports
  for all to authenticated using (public.user_can_manage_account(account_id)) with check (public.user_can_manage_account(account_id));

drop policy if exists "Managers read deposit dispute pack audit events" on public.deposit_dispute_pack_audit_events;
create policy "Managers read deposit dispute pack audit events" on public.deposit_dispute_pack_audit_events
  for select to authenticated using (public.user_can_manage_account(account_id));

drop policy if exists "Managers insert deposit dispute pack audit events" on public.deposit_dispute_pack_audit_events;
create policy "Managers insert deposit dispute pack audit events" on public.deposit_dispute_pack_audit_events
  for insert to authenticated with check (public.user_can_manage_account(account_id));

grant select, insert, update, delete on public.inspection_report_shares, public.inspection_report_tenant_comments to authenticated;
grant select, insert, update, delete on public.deposit_dispute_packs, public.deposit_dispute_pack_items, public.deposit_dispute_pack_exports to authenticated;
grant select, insert on public.deposit_dispute_pack_audit_events to authenticated;
