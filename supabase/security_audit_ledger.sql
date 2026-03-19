create table if not exists public.security_audit_ledger (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  actor_user_id uuid null references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.security_audit_ledger is
  'Append-only ledger for sensitive security and administrative actions.';

comment on column public.security_audit_ledger.metadata is
  'Structured event payload for security-relevant context such as role changes, invite acceptance, billing plan changes, or document deletion.';

create index if not exists security_audit_ledger_account_created_idx
  on public.security_audit_ledger(account_id, created_at desc);

create index if not exists security_audit_ledger_actor_created_idx
  on public.security_audit_ledger(actor_user_id, created_at desc);

create index if not exists security_audit_ledger_action_created_idx
  on public.security_audit_ledger(action, created_at desc);

create index if not exists security_audit_ledger_entity_idx
  on public.security_audit_ledger(entity_type, entity_id, created_at desc);

create or replace function public.security_audit_ledger_block_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'security_audit_ledger is append-only';
end;
$$;

drop trigger if exists trg_security_audit_ledger_block_update on public.security_audit_ledger;
create trigger trg_security_audit_ledger_block_update
before update on public.security_audit_ledger
for each row
execute function public.security_audit_ledger_block_mutation();

drop trigger if exists trg_security_audit_ledger_block_delete on public.security_audit_ledger;
create trigger trg_security_audit_ledger_block_delete
before delete on public.security_audit_ledger
for each row
execute function public.security_audit_ledger_block_mutation();

alter table public.security_audit_ledger enable row level security;

drop policy if exists "security_audit_ledger_select_managers" on public.security_audit_ledger;
create policy "security_audit_ledger_select_managers"
on public.security_audit_ledger
for select
to authenticated
using (public.user_can_manage_account(account_id));

drop policy if exists "security_audit_ledger_insert_managers" on public.security_audit_ledger;
create policy "security_audit_ledger_insert_managers"
on public.security_audit_ledger
for insert
to authenticated
with check (public.user_can_manage_account(account_id));

grant select, insert on table public.security_audit_ledger to authenticated;
