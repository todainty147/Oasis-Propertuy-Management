begin;

drop policy if exists payments_select_member on public.payments;
create policy payments_select_member
on public.payments
for select
to authenticated
using (public.user_can_manage_account(account_id));

drop policy if exists properties_select_member on public.properties;
create policy properties_select_member
on public.properties
for select
to authenticated
using (public.user_can_manage_account(account_id));

commit;
