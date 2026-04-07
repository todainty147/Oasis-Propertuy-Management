begin;

create table if not exists public.compliance_document_links (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  compliance_item_id uuid not null references public.compliance_items(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (compliance_item_id, document_id)
);

create index if not exists compliance_document_links_account_idx
  on public.compliance_document_links(account_id, compliance_item_id);

create index if not exists compliance_document_links_document_idx
  on public.compliance_document_links(document_id);

alter table public.compliance_document_links enable row level security;

drop policy if exists "compliance_document_links_select_managers" on public.compliance_document_links;
create policy "compliance_document_links_select_managers"
on public.compliance_document_links
for select
to authenticated
using (
  public.user_can_manage_account(compliance_document_links.account_id)
);

drop policy if exists "compliance_document_links_write_managers" on public.compliance_document_links;
create policy "compliance_document_links_write_managers"
on public.compliance_document_links
for all
to authenticated
using (
  public.user_can_manage_account(compliance_document_links.account_id)
)
with check (
  public.user_can_manage_account(compliance_document_links.account_id)
);

commit;
