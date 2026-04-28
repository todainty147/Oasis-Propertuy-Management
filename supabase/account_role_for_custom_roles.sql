create or replace function public.account_role_for(
  p_account_id uuid
) returns text
language sql
volatile
security definer
set search_path = public
as $$
  select public.account_member_effective_role(p_account_id, auth.uid());
$$;

revoke all on function public.account_role_for(uuid) from public;
grant execute on function public.account_role_for(uuid) to authenticated;
grant execute on function public.account_role_for(uuid) to service_role;
