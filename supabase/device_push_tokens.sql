-- =========================================================
-- device_push_tokens — Phase 6: Push Notification Readiness
--
-- Stores APNs / FCM device tokens per user per device.
-- Used by Supabase Edge Functions to send push notifications.
--
-- Security:
--   - RLS enabled: users can only manage their own tokens
--   - Tokens are account-scoped for multi-account support
--   - Tokens are automatically revoked on sign-out (handled in client)
-- =========================================================

create table if not exists public.device_push_tokens (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  account_id      uuid not null references public.accounts(id) on delete cascade,
  token           text not null,
  platform        text not null check (platform in ('ios', 'android', 'web')),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  last_used_at    timestamptz,
  failure_count   integer not null default 0,

  -- Unique per user + token (device may appear across accounts)
  unique (user_id, token)
);

-- Index for fast lookup by account (for sending notifications to all account users)
create index if not exists idx_device_push_tokens_account_id
  on public.device_push_tokens (account_id)
  where is_active = true;

-- Index for lookup by user
create index if not exists idx_device_push_tokens_user_id
  on public.device_push_tokens (user_id)
  where is_active = true;

-- ── RLS ──────────────────────────────────────────────────────────────────────

alter table public.device_push_tokens enable row level security;

-- Users can upsert their own tokens
drop policy if exists "device_push_tokens: user manages own" on public.device_push_tokens;
create policy "device_push_tokens: user manages own" on public.device_push_tokens
  for all
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Service role (Edge Functions) can read all active tokens to send notifications
-- (service role key bypasses RLS — no additional policy needed)

-- ── Auto-update updated_at ────────────────────────────────────────────────────

create or replace function public.touch_device_push_token_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_device_push_tokens_updated_at on public.device_push_tokens;
create trigger trg_device_push_tokens_updated_at
  before update on public.device_push_tokens
  for each row execute function public.touch_device_push_token_updated_at();

-- ── Revocation helper ─────────────────────────────────────────────────────────
-- Called by the client on sign-out to deactivate the device token.

create or replace function public.revoke_device_push_token(p_token text)
returns void
language sql security definer set search_path = public as $$
  update public.device_push_tokens
  set is_active = false, updated_at = now()
  where user_id = auth.uid()
    and token = p_token;
$$;

grant execute on function public.revoke_device_push_token(text) to authenticated;

-- ── Cleanup stale / failed tokens ─────────────────────────────────────────────
-- Tokens with failure_count >= 5 or not updated in 180 days are deactivated.
-- Run this periodically via a Supabase scheduled function or pg_cron.

create or replace function public.cleanup_stale_push_tokens()
returns integer
language sql security definer set search_path = public as $$
  with deactivated as (
    update public.device_push_tokens
    set is_active = false, updated_at = now()
    where is_active = true
      and (
        failure_count >= 5
        or updated_at < now() - interval '180 days'
      )
    returning id
  )
  select count(*)::integer from deactivated;
$$;

grant execute on function public.cleanup_stale_push_tokens() to service_role;

-- ── Push notification event map (documentation comment) ──────────────────────
-- Priority events → push notification triggers:
--
--   Event type                          | Recipient(s)         | deep_link
--   ------------------------------------|----------------------|--------------------------------
--   urgent_maintenance_created          | account managers     | /mobile/maintenance/:id
--   contractor_assigned                 | contractor           | /mobile/work-orders/:id
--   contractor_uploaded_photos          | account managers     | /mobile/work-orders/:id
--   quote_submitted                     | account managers     | /mobile/work-orders/:id
--   invoice_submitted                   | account managers     | /mobile/work-orders/:id
--   work_order_completed                | account managers     | /mobile/work-orders/:id
--   rent_expected_charge_overdue        | account managers     | /mobile/finance/payments/:id
--   document_request_completed          | account managers     | /mobile/documents/:id
--   compliance_deadline_due_soon        | account managers     | /mobile/compliance/:id
--   tenant_submitted_issue              | account managers     | /mobile/maintenance/:id

grant select on public.device_push_tokens to service_role;
grant insert, update, delete on public.device_push_tokens to authenticated;
