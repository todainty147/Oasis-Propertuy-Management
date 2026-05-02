create table if not exists public.account_report_settings (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  weekly_summary_enabled boolean not null default false,
  weekly_summary_day smallint not null default 1 check (weekly_summary_day between 0 and 6),
  weekly_summary_hour smallint not null default 8 check (weekly_summary_hour between 0 and 23),
  timezone text not null default 'Europe/Warsaw',
  updated_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.account_report_settings_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;

drop trigger if exists trg_account_report_settings_set_updated_at on public.account_report_settings;
create trigger trg_account_report_settings_set_updated_at
before update on public.account_report_settings
for each row
execute function public.account_report_settings_set_updated_at();

alter table public.account_report_settings enable row level security;

drop policy if exists account_report_settings_select_members on public.account_report_settings;
create policy account_report_settings_select_members
on public.account_report_settings
for select
to authenticated
using (
  exists (
    select 1
    from public.account_members am
    where am.account_id = account_report_settings.account_id
      and am.user_id = auth.uid()
  )
);

drop policy if exists account_report_settings_upsert_managers on public.account_report_settings;
create policy account_report_settings_upsert_managers
on public.account_report_settings
for all
to authenticated
using (
  public.user_can_manage_account(account_report_settings.account_id)
)
with check (
  public.user_can_manage_account(account_report_settings.account_id)
);

grant usage on schema public to authenticated;
grant select, insert, update on table public.account_report_settings to authenticated;
