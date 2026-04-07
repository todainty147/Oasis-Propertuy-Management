create table if not exists public.custom_field_definitions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  entity_type text not null,
  field_type text not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint custom_field_definitions_entity_type_check
    check (lower(trim(entity_type)) in ('property', 'tenant')),
  constraint custom_field_definitions_field_type_check
    check (lower(trim(field_type)) in ('text', 'number', 'date')),
  constraint custom_field_definitions_name_check
    check (nullif(trim(name), '') is not null)
);

create unique index if not exists custom_field_definitions_account_entity_name_idx
  on public.custom_field_definitions(account_id, lower(trim(entity_type)), lower(trim(name)));

create index if not exists custom_field_definitions_account_entity_idx
  on public.custom_field_definitions(account_id, lower(trim(entity_type)));

create table if not exists public.custom_field_values (
  id uuid primary key default gen_random_uuid(),
  definition_id uuid not null references public.custom_field_definitions(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  entity_id uuid not null,
  text_value text null,
  number_value numeric null,
  date_value date null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint custom_field_values_unique_entity_definition
    unique (definition_id, entity_id)
);

create index if not exists custom_field_values_account_entity_idx
  on public.custom_field_values(account_id, entity_id);

create index if not exists custom_field_values_definition_idx
  on public.custom_field_values(definition_id);

create or replace function public.custom_field_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_custom_field_definitions_set_updated_at on public.custom_field_definitions;
create trigger trg_custom_field_definitions_set_updated_at
before update on public.custom_field_definitions
for each row
execute function public.custom_field_set_updated_at();

drop trigger if exists trg_custom_field_values_set_updated_at on public.custom_field_values;
create trigger trg_custom_field_values_set_updated_at
before update on public.custom_field_values
for each row
execute function public.custom_field_set_updated_at();

create or replace function public.validate_custom_field_value()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_definition public.custom_field_definitions%rowtype;
  v_populated_count integer := 0;
begin
  select *
    into v_definition
  from public.custom_field_definitions cfd
  where cfd.id = new.definition_id;

  if v_definition.id is null then
    raise exception 'Custom field definition not found';
  end if;

  if new.account_id <> v_definition.account_id then
    raise exception 'Custom field value account does not match its definition';
  end if;

  v_populated_count :=
    (case when new.text_value is null then 0 else 1 end) +
    (case when new.number_value is null then 0 else 1 end) +
    (case when new.date_value is null then 0 else 1 end);

  if v_populated_count <> 1 then
    raise exception 'Exactly one custom field value column must be populated';
  end if;

  case lower(trim(v_definition.field_type))
    when 'text' then
      if new.text_value is null or new.number_value is not null or new.date_value is not null then
        raise exception 'Text custom fields must use text_value only';
      end if;
    when 'number' then
      if new.number_value is null or new.text_value is not null or new.date_value is not null then
        raise exception 'Number custom fields must use number_value only';
      end if;
    when 'date' then
      if new.date_value is null or new.text_value is not null or new.number_value is not null then
        raise exception 'Date custom fields must use date_value only';
      end if;
    else
      raise exception 'Unsupported custom field type';
  end case;

  case lower(trim(v_definition.entity_type))
    when 'property' then
      if not exists (
        select 1
        from public.properties p
        where p.id = new.entity_id
          and p.account_id = new.account_id
      ) then
        raise exception 'Custom field entity must be an in-scope property';
      end if;
    when 'tenant' then
      if not exists (
        select 1
        from public.tenants t
        where t.id = new.entity_id
          and t.account_id = new.account_id
      ) then
        raise exception 'Custom field entity must be an in-scope tenant';
      end if;
    else
      raise exception 'Unsupported custom field entity type';
  end case;

  return new;
end;
$$;

drop trigger if exists trg_validate_custom_field_value on public.custom_field_values;
create trigger trg_validate_custom_field_value
before insert or update on public.custom_field_values
for each row
execute function public.validate_custom_field_value();

alter table public.custom_field_definitions enable row level security;
alter table public.custom_field_values enable row level security;

drop policy if exists custom_field_definitions_select_managers on public.custom_field_definitions;
create policy custom_field_definitions_select_managers
on public.custom_field_definitions
for select
to authenticated
using (public.user_can_manage_account(account_id));

drop policy if exists custom_field_definitions_write_managers on public.custom_field_definitions;
create policy custom_field_definitions_write_managers
on public.custom_field_definitions
to authenticated
using (public.user_can_manage_account(account_id))
with check (public.user_can_manage_account(account_id));

drop policy if exists custom_field_values_select_managers on public.custom_field_values;
create policy custom_field_values_select_managers
on public.custom_field_values
for select
to authenticated
using (public.user_can_manage_account(account_id));

drop policy if exists custom_field_values_write_managers on public.custom_field_values;
create policy custom_field_values_write_managers
on public.custom_field_values
to authenticated
using (public.user_can_manage_account(account_id))
with check (public.user_can_manage_account(account_id));

grant select, insert, update, delete on public.custom_field_definitions to authenticated;
grant select, insert, update, delete on public.custom_field_values to authenticated;
grant select, insert, update, delete on public.custom_field_definitions to service_role;
grant select, insert, update, delete on public.custom_field_values to service_role;
