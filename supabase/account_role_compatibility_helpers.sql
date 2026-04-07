create or replace function public.has_account_role(p_account_id uuid, p_roles text[])
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from unnest(coalesce(p_roles, array[]::text[])) as requested(role_name)
    where lower(requested.role_name) = public.account_member_effective_role(p_account_id, auth.uid())
  );
$$;

create or replace function public.is_account_manager(p_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.account_member_effective_role(p_account_id, auth.uid()) in ('owner', 'admin', 'staff');
$$;

create or replace function public.is_account_manager(p_account_id uuid, p_user_id uuid)
returns boolean
language sql
stable
as $$
  select public.account_member_effective_role(p_account_id, p_user_id) in ('owner', 'admin', 'staff');
$$;

create or replace function public.is_account_owner_or_staff(p_account_id uuid)
returns boolean
language sql
stable
as $$
  select public.account_member_effective_role(p_account_id, auth.uid()) in ('owner', 'staff');
$$;
