begin;

alter table public.compliance_items
  add column if not exists recurrence_interval_months integer not null default 0,
  add column if not exists last_completed_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'compliance_items_recurrence_interval_check'
  ) then
    alter table public.compliance_items
      add constraint compliance_items_recurrence_interval_check
      check (recurrence_interval_months between 0 and 60);
  end if;
end $$;

create index if not exists compliance_items_property_status_idx
  on public.compliance_items(property_id, status, category, due_date);

commit;
