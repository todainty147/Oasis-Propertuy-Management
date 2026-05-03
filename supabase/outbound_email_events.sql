create table if not exists public.outbound_email_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid null references public.accounts(id) on delete cascade,
  template_key text not null,
  provider text not null default 'resend',
  status text not null,
  recipient_email text not null,
  recipient_user_id uuid null,
  entity_type text null,
  entity_id uuid null,
  subject text null,
  provider_message_id text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint outbound_email_events_template_key_check check (nullif(trim(template_key), '') is not null),
  constraint outbound_email_events_provider_check check (nullif(trim(provider), '') is not null),
  constraint outbound_email_events_status_check check (lower(trim(status)) in ('queued', 'sent', 'failed', 'skipped'))
);

create index if not exists outbound_email_events_account_created_idx
  on public.outbound_email_events(account_id, created_at desc);

create index if not exists outbound_email_events_template_created_idx
  on public.outbound_email_events(lower(template_key), created_at desc);

alter table public.outbound_email_events enable row level security;

drop policy if exists outbound_email_events_no_direct_select on public.outbound_email_events;
create policy outbound_email_events_no_direct_select
on public.outbound_email_events
for select
to authenticated
using (false);

drop policy if exists outbound_email_events_no_direct_write on public.outbound_email_events;
create policy outbound_email_events_no_direct_write
on public.outbound_email_events
to authenticated
using (false)
with check (false);

grant select, insert on public.outbound_email_events to service_role;
