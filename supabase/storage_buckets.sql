insert into storage.buckets (id, name, public)
values
  ('maintenance-request-attachments', 'maintenance-request-attachments', false),
  ('work-order-attachments', 'work-order-attachments', false)
on conflict (id) do nothing;
