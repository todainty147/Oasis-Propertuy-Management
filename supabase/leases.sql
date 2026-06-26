create table if not exists public.leases (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  lease_start_date date not null,
  lease_end_date date,
  renewal_status text not null default 'active',
  term_type text,
  term_type_effective_from date,
  term_type_evidence_basis text,
  company_let boolean,
  resident_landlord boolean,
  rent_act_1977 boolean,
  is_wholly_oral boolean,
  tenancy_class text,
  notice_period_days integer not null default 30,
  auto_renew boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leases_date_order check (lease_end_date >= lease_start_date),
  constraint leases_renewal_status check (
    renewal_status in ('active', 'expiring_soon', 'renewal_in_progress', 'renewed', 'ended')
  ),
  constraint leases_term_type_check check (
    term_type in ('fixed', 'periodic', 'open_ended')
  ),
  constraint leases_tenancy_class_check check (
    tenancy_class in ('assured_shorthold', 'assured', 'regulated_rent_act', 'business', 'agricultural', 'licence', 'other')
  )
);

alter table public.leases
  add column if not exists account_id uuid references public.accounts(id) on delete cascade,
  add column if not exists property_id uuid references public.properties(id) on delete cascade,
  add column if not exists tenant_id uuid references public.tenants(id) on delete cascade,
  add column if not exists lease_start_date date,
  add column if not exists lease_end_date date,
  add column if not exists renewal_status text default 'active',
  add column if not exists term_type text,
  add column if not exists term_type_effective_from date,
  add column if not exists term_type_evidence_basis text,
  add column if not exists company_let boolean,
  add column if not exists resident_landlord boolean,
  add column if not exists rent_act_1977 boolean,
  add column if not exists is_wholly_oral boolean,
  add column if not exists tenancy_class text,
  add column if not exists notice_period_days integer default 30,
  add column if not exists auto_renew boolean default false,
  add column if not exists notes text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

update public.leases
set
  renewal_status = coalesce(nullif(renewal_status, ''), 'active'),
  notice_period_days = coalesce(notice_period_days, 30),
  auto_renew = coalesce(auto_renew, false),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now())
where
  renewal_status is null
  or notice_period_days is null
  or auto_renew is null
  or created_at is null
  or updated_at is null;

alter table public.leases
  alter column renewal_status set default 'active',
  alter column renewal_status set not null,
  alter column lease_end_date drop not null,
  alter column notice_period_days set default 30,
  alter column notice_period_days set not null,
  alter column auto_renew set default false,
  alter column auto_renew set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'leases_date_order'
      and conrelid = 'public.leases'::regclass
  ) then
    alter table public.leases
      add constraint leases_date_order check (lease_end_date >= lease_start_date);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'leases_renewal_status'
      and conrelid = 'public.leases'::regclass
  ) then
    alter table public.leases
      add constraint leases_renewal_status check (
        renewal_status in ('active', 'expiring_soon', 'renewal_in_progress', 'renewed', 'ended')
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'leases_term_type_check'
      and conrelid = 'public.leases'::regclass
  ) then
    alter table public.leases
      add constraint leases_term_type_check check (
        term_type in ('fixed', 'periodic', 'open_ended')
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'leases_tenancy_class_check'
      and conrelid = 'public.leases'::regclass
  ) then
    alter table public.leases
      add constraint leases_tenancy_class_check check (
        tenancy_class in ('assured_shorthold', 'assured', 'regulated_rent_act', 'business', 'agricultural', 'licence', 'other')
      );
  end if;
end
$$;

create index if not exists leases_account_id_idx on public.leases(account_id);
create index if not exists leases_property_id_idx on public.leases(property_id);
create index if not exists leases_tenant_id_idx on public.leases(tenant_id);
create index if not exists leases_lease_end_date_idx on public.leases(lease_end_date);

create or replace function public.tg_set_updated_at_leases()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_leases_updated_at on public.leases;
create trigger trg_leases_updated_at
before update on public.leases
for each row
execute function public.tg_set_updated_at_leases();

alter table public.leases enable row level security;

drop policy if exists "leases_select_account_members" on public.leases;
create policy "leases_select_account_members"
on public.leases
for select
to authenticated
using (
  public.user_can_manage_account(leases.account_id)
  or exists (
    select 1
    from public.tenants t
    where t.id = leases.tenant_id
      and t.user_id = auth.uid()
  )
);

drop policy if exists "leases_insert_account_members" on public.leases;
create policy "leases_insert_account_members"
on public.leases
for insert
to authenticated
with check (
  public.user_can_manage_account(leases.account_id)
);

drop policy if exists "leases_update_account_members" on public.leases;
create policy "leases_update_account_members"
on public.leases
for update
to authenticated
using (
  public.user_can_manage_account(leases.account_id)
)
with check (
  public.user_can_manage_account(leases.account_id)
);

drop policy if exists "leases_delete_account_members" on public.leases;
create policy "leases_delete_account_members"
on public.leases
for delete
to authenticated
using (
  public.user_can_manage_account(leases.account_id)
);

create or replace function public.lease_attention_items(
  p_account_id uuid,
  p_limit integer default 10,
  p_expiring_days integer default 60
)
returns table (
  item_key text,
  item_type text,
  property_label text,
  tenant_label text,
  lease_end_date date,
  days_until_end integer,
  link_path text,
  sort_order integer
)
language sql
security definer
set search_path = public
as $$
  with cfg as (
    select
      greatest(1, least(coalesce(p_limit, 10), 50)) as max_items,
      greatest(1, least(coalesce(p_expiring_days, 60), 365)) as expiring_days
  ),
  authz as (
    select public.assert_manage_account_access(p_account_id) as account_id
  ),
  scoped_leases as (
    select
      l.id,
      l.tenant_id,
      l.lease_end_date,
      lower(coalesce(l.renewal_status, 'active')) as renewal_status,
      coalesce(p.address, '—') as property_label,
      coalesce(t.name, '—') as tenant_label,
      (l.lease_end_date - current_date)::int as days_until_end
    from public.leases l
    cross join authz a
    left join public.properties p on p.id = l.property_id
    left join public.tenants t on t.id = l.tenant_id
    where l.account_id = a.account_id
  ),
  items as (
    select
      'lease-expired-' || sl.id::text as item_key,
      'lease_expired'::text as item_type,
      sl.property_label,
      sl.tenant_label,
      sl.lease_end_date,
      sl.days_until_end,
      ('/tenants/' || sl.tenant_id::text) as link_path,
      10 as sort_order
    from scoped_leases sl
    where sl.lease_end_date < current_date
      and sl.renewal_status not in ('renewed', 'ended')

    union all

    select
      'lease-expiring-' || sl.id::text as item_key,
      'lease_expiring_soon'::text as item_type,
      sl.property_label,
      sl.tenant_label,
      sl.lease_end_date,
      sl.days_until_end,
      ('/tenants/' || sl.tenant_id::text) as link_path,
      20 as sort_order
    from scoped_leases sl
    where sl.lease_end_date >= current_date
      and sl.lease_end_date <= current_date + (select expiring_days from cfg)
      and sl.renewal_status not in ('renewed', 'ended')

    union all

    select
      'lease-renewal-' || sl.id::text as item_key,
      'lease_renewal_in_progress'::text as item_type,
      sl.property_label,
      sl.tenant_label,
      sl.lease_end_date,
      sl.days_until_end,
      ('/tenants/' || sl.tenant_id::text) as link_path,
      30 as sort_order
    from scoped_leases sl
    where sl.renewal_status = 'renewal_in_progress'
  )
  select
    i.item_key,
    i.item_type,
    i.property_label,
    i.tenant_label,
    i.lease_end_date,
    i.days_until_end,
    i.link_path,
    i.sort_order
  from items i
  order by 8, 5 asc nulls last, 1
  limit (select max_items from cfg);
$$;

grant execute on function public.lease_attention_items(uuid, integer, integer) to authenticated;
