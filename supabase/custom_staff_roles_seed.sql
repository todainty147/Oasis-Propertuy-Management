create or replace function public.ensure_default_system_account_roles(
  p_account_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_account_id is null then
    raise exception 'account_id is required';
  end if;

  perform public.ensure_system_account_role(p_account_id, 'owner'::public.account_role);
  perform public.ensure_system_account_role(p_account_id, 'admin'::public.account_role);
  perform public.ensure_system_account_role(p_account_id, 'staff'::public.account_role);
end;
$$;

revoke all on function public.ensure_default_system_account_roles(uuid) from public;
grant execute on function public.ensure_default_system_account_roles(uuid) to authenticated;
grant execute on function public.ensure_default_system_account_roles(uuid) to service_role;

create or replace function public.seed_default_account_roles_trg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ensure_default_system_account_roles(new.id);
  return new;
end;
$$;

drop trigger if exists trg_seed_default_account_roles on public.accounts;
create trigger trg_seed_default_account_roles
after insert on public.accounts
for each row
execute function public.seed_default_account_roles_trg();

do $$
declare
  v_account record;
begin
  for v_account in
    select a.id
    from public.accounts a
  loop
    perform public.ensure_default_system_account_roles(v_account.id);
  end loop;
end
$$;
