insert into public.work_order_status_definitions (
  status,
  label,
  description,
  is_terminal,
  visible_to_tenant,
  sort_order
)
values
  ('assigned', 'Przypisane', 'Zlecenie zostalo utworzone', false, true, 1),
  ('in_progress', 'W trakcie', 'Prace sa realizowane', false, true, 2),
  ('completed', 'Zakonczone', 'Prace zakonczone', true, true, 3),
  ('cancelled', 'Anulowane', 'Zlecenie anulowane', true, true, 4)
on conflict (status) do update
set
  label = excluded.label,
  description = excluded.description,
  is_terminal = excluded.is_terminal,
  visible_to_tenant = excluded.visible_to_tenant,
  sort_order = excluded.sort_order;

insert into public.work_order_status_transitions (from_status, to_status)
values
  ('assigned', 'in_progress'),
  ('assigned', 'cancelled'),
  ('in_progress', 'completed'),
  ('in_progress', 'cancelled')
on conflict (from_status, to_status) do nothing;
