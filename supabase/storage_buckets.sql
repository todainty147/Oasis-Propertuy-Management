insert into storage.buckets (id, name, public)
values
  ('documents', 'documents', false),
  ('maintenance-request-attachments', 'maintenance-request-attachments', false),
  ('work-order-attachments', 'work-order-attachments', false)
on conflict (id) do nothing;
