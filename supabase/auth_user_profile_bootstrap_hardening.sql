create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  begin
    insert into public.profiles (id, role)
    values (new.id, 'staff')
    on conflict (id) do nothing;
  exception
    when others then
      -- Profile bootstrap should never block auth signup.
      -- The account can still self-provision on first app login, and support can backfill profiles if needed.
      null;
  end;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
