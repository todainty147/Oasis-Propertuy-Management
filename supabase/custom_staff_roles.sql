create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint roles_name_not_blank check (length(trim(coalesce(name, ''))) > 0)
);

create unique index if not exists roles_account_id_name_uidx
  on public.roles (account_id, lower(trim(name)));

create index if not exists roles_account_id_idx
  on public.roles (account_id);

create table if not exists public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_key text not null,
  created_at timestamptz not null default now(),
  constraint role_permissions_permission_key_not_blank
    check (length(trim(coalesce(permission_key, ''))) > 0),
  primary key (role_id, permission_key)
);

create index if not exists role_permissions_permission_key_idx
  on public.role_permissions (permission_key);
