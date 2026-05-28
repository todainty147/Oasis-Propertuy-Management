-- HMRC MTD Phase 1: sandbox OAuth connection foundation.
-- No live submission endpoints are enabled by this migration.

create table if not exists public.account_feature_flags (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  feature_key text not null,
  enabled boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(account_id, feature_key)
);

create table if not exists public.hmrc_connections (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  created_by uuid,
  environment text not null default 'sandbox',
  connection_status text not null default 'not_connected',
  hmrc_subject_type text,
  hmrc_display_label text,
  scopes text[] not null default '{}',
  access_token_ciphertext text,
  refresh_token_ciphertext text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  last_connected_at timestamptz,
  last_refreshed_at timestamptz,
  disconnected_at timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(account_id, environment),
  constraint hmrc_connections_environment_check check (environment in ('sandbox')),
  constraint hmrc_connections_status_check check (connection_status in ('not_connected', 'pending', 'connected', 'expired', 'revoked', 'failed', 'disconnected'))
);

create table if not exists public.hmrc_oauth_states (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid,
  state_token text not null unique,
  code_verifier_hash text,
  redirect_uri text not null,
  requested_scopes text[] not null default '{}',
  environment text not null default 'sandbox',
  consumed_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint hmrc_oauth_states_environment_check check (environment in ('sandbox'))
);

create table if not exists public.hmrc_api_audit_log (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid,
  environment text not null default 'sandbox',
  action text not null,
  endpoint text,
  method text,
  status text not null,
  http_status integer,
  request_summary jsonb not null default '{}',
  response_summary jsonb not null default '{}',
  error_message text,
  correlation_id text,
  created_at timestamptz not null default now(),
  constraint hmrc_api_audit_log_environment_check check (environment in ('sandbox')),
  constraint hmrc_api_audit_log_status_check check (status in ('started', 'success', 'failed', 'blocked'))
);

create index if not exists account_feature_flags_account_idx
  on public.account_feature_flags (account_id, feature_key)
  where enabled is true;

create index if not exists hmrc_connections_account_environment_idx
  on public.hmrc_connections (account_id, environment);

create index if not exists hmrc_oauth_states_state_token_idx
  on public.hmrc_oauth_states (state_token);

create index if not exists hmrc_oauth_states_expiry_idx
  on public.hmrc_oauth_states (expires_at)
  where consumed_at is null;

create index if not exists hmrc_api_audit_log_account_created_idx
  on public.hmrc_api_audit_log (account_id, created_at desc);

create or replace function public.hmrc_mtd_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists account_feature_flags_set_updated_at on public.account_feature_flags;
create trigger account_feature_flags_set_updated_at
  before update on public.account_feature_flags
  for each row execute function public.hmrc_mtd_set_updated_at();

drop trigger if exists hmrc_connections_set_updated_at on public.hmrc_connections;
create trigger hmrc_connections_set_updated_at
  before update on public.hmrc_connections
  for each row execute function public.hmrc_mtd_set_updated_at();

alter table public.account_feature_flags enable row level security;
alter table public.hmrc_connections enable row level security;
alter table public.hmrc_oauth_states enable row level security;
alter table public.hmrc_api_audit_log enable row level security;

drop policy if exists account_feature_flags_select_managers on public.account_feature_flags;
create policy account_feature_flags_select_managers
  on public.account_feature_flags
  for select to authenticated
  using (public.user_can_manage_account(account_id));

drop policy if exists hmrc_api_audit_log_select_managers on public.hmrc_api_audit_log;
create policy hmrc_api_audit_log_select_managers
  on public.hmrc_api_audit_log
  for select to authenticated
  using (public.user_can_manage_account(account_id));

-- Do not grant browser access to token-bearing tables. Edge Functions use the
-- service-role client and return only safe metadata to the browser.
revoke all on public.account_feature_flags from anon, authenticated;
revoke all on public.hmrc_connections from anon, authenticated;
revoke all on public.hmrc_oauth_states from anon, authenticated;
grant select (
  id,
  account_id,
  environment,
  connection_status,
  hmrc_subject_type,
  hmrc_display_label,
  scopes,
  access_token_expires_at,
  refresh_token_expires_at,
  last_connected_at,
  last_refreshed_at,
  disconnected_at,
  created_at,
  updated_at
) on public.hmrc_connections to authenticated;
grant select on public.account_feature_flags to authenticated;
grant select on public.hmrc_api_audit_log to authenticated;

create or replace view public.hmrc_connection_status as
select
  id,
  account_id,
  environment,
  connection_status,
  hmrc_subject_type,
  hmrc_display_label,
  scopes,
  access_token_expires_at,
  refresh_token_expires_at,
  last_connected_at,
  last_refreshed_at,
  disconnected_at,
  created_at,
  updated_at
from public.hmrc_connections;

alter view public.hmrc_connection_status set (security_invoker = true);
grant select on public.hmrc_connection_status to authenticated;

drop policy if exists hmrc_connections_status_select_managers on public.hmrc_connections;
create policy hmrc_connections_status_select_managers
  on public.hmrc_connections
  for select to authenticated
  using (public.user_can_manage_account(account_id));

create or replace function public.account_has_feature(
  p_account_id uuid,
  p_feature text
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  with normalized as (
    select lower(trim(coalesce(p_feature, ''))) as feature_key
  )
  select case
    when (select feature_key from normalized) in (
      'hmrc_mtd_connection',
      'hmrc_mtd_sandbox',
      'hmrc_mtd_read_only',
      'hmrc_mtd_live_submission'
    ) then exists (
      select 1
      from public.account_feature_flags aff, normalized n
      where aff.account_id = p_account_id
        and aff.feature_key = n.feature_key
        and aff.enabled is true
    )
    else exists (
      select 1
      from public.account_feature_flags aff, normalized n
      where aff.account_id = p_account_id
        and aff.feature_key = n.feature_key
        and aff.enabled is true
    )
    or public.account_plan_rank(public.account_subscription_plan(p_account_id))
       >= public.account_plan_rank(public.account_feature_required_plan((select feature_key from normalized)))
  end;
$$;

comment on function public.account_has_feature(uuid, text) is
  'Returns whether the account has a plan entitlement or account-level feature flag. HMRC MTD flags are account-flag only and disabled by default.';

revoke all on function public.account_has_feature(uuid, text) from public;
grant execute on function public.account_has_feature(uuid, text) to authenticated;

insert into public.account_feature_flags (account_id, feature_key, enabled, created_by)
select a.id, flag.feature_key, false, null
from public.accounts a
cross join (values
  ('hmrc_mtd_connection'),
  ('hmrc_mtd_sandbox'),
  ('hmrc_mtd_read_only'),
  ('hmrc_mtd_live_submission')
) as flag(feature_key)
on conflict (account_id, feature_key) do nothing;
