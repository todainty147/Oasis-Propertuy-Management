alter table public.account_members
  add column if not exists role_id uuid;

create index if not exists account_members_role_id_idx
  on public.account_members (role_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'account_members_role_id_fkey'
      and conrelid = 'public.account_members'::regclass
  ) then
    alter table public.account_members
      add constraint account_members_role_id_fkey
      foreign key (role_id)
      references public.roles(id)
      on delete set null;
  end if;
end
$$;

create or replace function public.ensure_system_account_role(
  p_account_id uuid,
  p_role public.account_role
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role_id uuid;
  v_role_name text := lower(trim(p_role::text));
begin
  if p_account_id is null then
    raise exception 'account_id is required';
  end if;

  if v_role_name not in ('owner', 'admin', 'staff') then
    return null;
  end if;

  select r.id
    into v_role_id
  from public.roles r
  where r.account_id = p_account_id
    and lower(trim(r.name)) = v_role_name
  limit 1;

  if v_role_id is not null then
    return v_role_id;
  end if;

  insert into public.roles (account_id, name)
  values (p_account_id, v_role_name)
  returning id into v_role_id;

  insert into public.role_permissions (role_id, permission_key)
  select v_role_id, permission_key
  from (
    values
      ('owner', 'properties.read'),
      ('owner', 'properties.create'),
      ('owner', 'properties.update'),
      ('owner', 'properties.delete'),
      ('owner', 'tenants.read'),
      ('owner', 'tenants.create'),
      ('owner', 'tenants.update'),
      ('owner', 'tenants.delete'),
      ('owner', 'documents.read'),
      ('owner', 'documents.upload'),
      ('owner', 'documents.tag'),
      ('owner', 'documents.delete'),
      ('owner', 'finance.read'),
      ('owner', 'finance.create'),
      ('owner', 'finance.update'),
      ('owner', 'finance.delete'),
      ('owner', 'users.invite'),
      ('owner', 'users.role'),
      ('admin', 'properties.read'),
      ('admin', 'properties.create'),
      ('admin', 'properties.update'),
      ('admin', 'tenants.read'),
      ('admin', 'tenants.create'),
      ('admin', 'tenants.update'),
      ('admin', 'documents.read'),
      ('admin', 'documents.upload'),
      ('admin', 'documents.tag'),
      ('admin', 'finance.read'),
      ('admin', 'finance.create'),
      ('admin', 'finance.update'),
      ('staff', 'properties.read'),
      ('staff', 'tenants.read'),
      ('staff', 'documents.read'),
      ('staff', 'documents.upload'),
      ('staff', 'documents.tag'),
      ('staff', 'finance.read')
  ) as seed(role_name, permission_key)
  where seed.role_name = v_role_name
  on conflict (role_id, permission_key) do nothing;

  return v_role_id;
end;
$$;

revoke all on function public.ensure_system_account_role(uuid, public.account_role) from public;
grant execute on function public.ensure_system_account_role(uuid, public.account_role) to authenticated;
grant execute on function public.ensure_system_account_role(uuid, public.account_role) to service_role;

insert into public.roles (account_id, name)
select distinct am.account_id, lower(trim(am.role::text))
from public.account_members am
where lower(trim(am.role::text)) in ('owner', 'admin', 'staff')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_key)
select r.id, seed.permission_key
from public.roles r
join (
  values
    ('owner', 'properties.read'),
    ('owner', 'properties.create'),
    ('owner', 'properties.update'),
    ('owner', 'properties.delete'),
    ('owner', 'tenants.read'),
    ('owner', 'tenants.create'),
    ('owner', 'tenants.update'),
    ('owner', 'tenants.delete'),
    ('owner', 'documents.read'),
    ('owner', 'documents.upload'),
    ('owner', 'documents.tag'),
    ('owner', 'documents.delete'),
    ('owner', 'finance.read'),
    ('owner', 'finance.create'),
    ('owner', 'finance.update'),
    ('owner', 'finance.delete'),
    ('owner', 'users.invite'),
    ('owner', 'users.role'),
    ('admin', 'properties.read'),
    ('admin', 'properties.create'),
    ('admin', 'properties.update'),
    ('admin', 'tenants.read'),
    ('admin', 'tenants.create'),
    ('admin', 'tenants.update'),
    ('admin', 'documents.read'),
    ('admin', 'documents.upload'),
    ('admin', 'documents.tag'),
    ('admin', 'finance.read'),
    ('admin', 'finance.create'),
    ('admin', 'finance.update'),
    ('staff', 'properties.read'),
    ('staff', 'tenants.read'),
    ('staff', 'documents.read'),
    ('staff', 'documents.upload'),
    ('staff', 'documents.tag'),
    ('staff', 'finance.read')
) as seed(role_name, permission_key)
  on lower(trim(r.name)) = seed.role_name
on conflict (role_id, permission_key) do nothing;

update public.account_members am
set role_id = r.id
from public.roles r
where r.account_id = am.account_id
  and lower(trim(r.name)) = lower(trim(am.role::text))
  and (
    am.role_id is distinct from r.id
    or am.role_id is null
  );

create or replace function public.sync_account_member_role_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.account_id is null then
    new.role_id := null;
    return new;
  end if;

  if new.role is null then
    new.role_id := null;
    return new;
  end if;

  new.role_id := public.ensure_system_account_role(new.account_id, new.role);
  return new;
end;
$$;

drop trigger if exists trg_sync_account_member_role_id on public.account_members;
create trigger trg_sync_account_member_role_id
before insert or update of account_id, role
on public.account_members
for each row
execute function public.sync_account_member_role_id();
