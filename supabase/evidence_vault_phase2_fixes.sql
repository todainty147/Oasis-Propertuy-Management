-- Evidence Vault Phase 2 fixes: dispute pack referential integrity and query support.
-- Idempotent overlay intended to run after evidence_vault_phase2.sql.

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

create index if not exists idx_deposit_dispute_packs_tenancy
  on public.deposit_dispute_packs(account_id, tenancy_id)
  where tenancy_id is not null;

create index if not exists idx_deposit_dispute_pack_audit_events_pack
  on public.deposit_dispute_pack_audit_events(account_id, dispute_pack_id, created_at desc);

create index if not exists idx_inspection_signatures_tenant_share
  on public.inspection_signatures(account_id, share_id)
  where share_id is not null and signer_role = 'tenant';

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

drop trigger if exists trg_inspection_report_shares_tenant_update_guard on public.inspection_report_shares;
create trigger trg_inspection_report_shares_tenant_update_guard
  before update on public.inspection_report_shares
  for each row execute function public.enforce_inspection_report_share_tenant_update();

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
