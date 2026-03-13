create table if not exists public.contractor_ratings (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  contractor_user_id uuid null references auth.users(id) on delete set null,
  rating smallint not null check (rating between 1 and 5),
  comment text null,
  rated_by uuid not null default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (work_order_id)
);

grant usage on schema public to authenticated;
grant select, insert, update on table public.contractor_ratings to authenticated;

create index if not exists contractor_ratings_account_idx on public.contractor_ratings(account_id);
create index if not exists contractor_ratings_work_order_idx on public.contractor_ratings(work_order_id);

create or replace function public.contractor_ratings_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_contractor_ratings_set_updated_at on public.contractor_ratings;
create trigger trg_contractor_ratings_set_updated_at
before update on public.contractor_ratings
for each row
execute function public.contractor_ratings_set_updated_at();

alter table public.contractor_ratings enable row level security;

drop policy if exists contractor_ratings_select_account_members on public.contractor_ratings;
create policy contractor_ratings_select_account_members
on public.contractor_ratings
for select
to authenticated
using (
  exists (
    select 1
    from public.account_members am
    where am.account_id = contractor_ratings.account_id
      and am.user_id = auth.uid()
  )
);

drop policy if exists contractor_ratings_upsert_managers on public.contractor_ratings;
create policy contractor_ratings_upsert_managers
on public.contractor_ratings
for all
to authenticated
using (
  exists (
    select 1
    from public.account_members am
    where am.account_id = contractor_ratings.account_id
      and am.user_id = auth.uid()
      and lower(coalesce(am.role::text, '')) in ('owner', 'admin', 'staff')
  )
)
with check (
  exists (
    select 1
    from public.account_members am
    where am.account_id = contractor_ratings.account_id
      and am.user_id = auth.uid()
      and lower(coalesce(am.role::text, '')) in ('owner', 'admin', 'staff')
  )
);
