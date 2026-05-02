create table if not exists public.outbound_sms_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid null references public.accounts(id) on delete cascade,
  template_key text not null,
  provider text not null default 'twilio',
  status text not null,
  recipient_phone text not null,
  recipient_user_id uuid null,
  entity_type text null,
  entity_id uuid null,
  body text null,
  provider_message_id text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint outbound_sms_events_template_key_check check (nullif(trim(template_key), '') is not null),
  constraint outbound_sms_events_provider_check check (nullif(trim(provider), '') is not null),
  constraint outbound_sms_events_status_check check (lower(trim(status)) in ('queued', 'sent', 'failed', 'skipped'))
);

create index if not exists outbound_sms_events_account_created_idx
  on public.outbound_sms_events(account_id, created_at desc);

create index if not exists outbound_sms_events_template_created_idx
  on public.outbound_sms_events(lower(template_key), created_at desc);

alter table public.outbound_sms_events enable row level security;

drop policy if exists outbound_sms_events_no_direct_select on public.outbound_sms_events;
create policy outbound_sms_events_no_direct_select
on public.outbound_sms_events
for select
to authenticated
using (false);

drop policy if exists outbound_sms_events_no_direct_write on public.outbound_sms_events;
create policy outbound_sms_events_no_direct_write
on public.outbound_sms_events
to authenticated
using (false)
with check (false);

grant select, insert on public.outbound_sms_events to service_role;
