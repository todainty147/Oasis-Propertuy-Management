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
