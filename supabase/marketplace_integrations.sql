create table if not exists public.marketplace_providers (
  provider_key text primary key,
  country_code text not null,
  label text not null,
  submission_mode text not null check (submission_mode in ('manual', 'api')),
  description text,
  website_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketplace_integration_settings (
  account_id uuid not null references public.accounts(id) on delete cascade,
  provider_key text not null references public.marketplace_providers(provider_key) on delete cascade,
  enabled boolean not null default false,
  configuration jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (account_id, provider_key)
);

create index if not exists marketplace_integration_settings_account_idx
  on public.marketplace_integration_settings(account_id);

create table if not exists public.work_order_fulfilment_routes (
  work_order_id uuid primary key references public.work_orders(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  route text not null check (route in ('internal', 'marketplace', 'hybrid', 'undecided')),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists work_order_fulfilment_routes_account_idx
  on public.work_order_fulfilment_routes(account_id);

create table if not exists public.external_marketplace_jobs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  provider_key text not null references public.marketplace_providers(provider_key) on delete restrict,
  country_code text not null default '',
  trade_category text not null default '',
  external_job_id text not null default '',
  external_reference text not null default '',
  external_url text not null default '',
  status text not null default 'draft' check (
    status in (
      'draft',
      'ready_to_submit',
      'submitted',
      'acknowledged',
      'matched',
      'quote_received',
      'appointment_scheduled',
      'in_progress',
      'completed',
      'cancelled',
      'failed',
      'manual_follow_up'
    )
  ),
  submission_mode text not null default 'manual' check (submission_mode in ('manual', 'api')),
  title text not null default '',
  description text not null default '',
  urgency text not null default '',
  postcode text not null default '',
  city text not null default '',
  property_label text not null default '',
  contact_name text not null default '',
  contact_email text not null default '',
  contact_phone text not null default '',
  consent_confirmed_at timestamptz,
  submitted_at timestamptz,
  last_synced_at timestamptz,
  last_error text not null default '',
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists external_marketplace_jobs_account_work_order_idx
  on public.external_marketplace_jobs(account_id, work_order_id, created_at desc);

create index if not exists external_marketplace_jobs_provider_status_idx
  on public.external_marketplace_jobs(provider_key, status);

create table if not exists public.external_marketplace_events (
  id uuid primary key default gen_random_uuid(),
  marketplace_job_id uuid not null references public.external_marketplace_jobs(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  actor_user_id uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists external_marketplace_events_job_created_idx
  on public.external_marketplace_events(marketplace_job_id, created_at desc);

create index if not exists external_marketplace_events_account_work_order_idx
  on public.external_marketplace_events(account_id, work_order_id, created_at desc);

create or replace function public.marketplace_integrations_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();

  if tg_table_name = 'work_order_fulfilment_routes' then
    new.updated_by = auth.uid();
  elsif tg_table_name = 'external_marketplace_jobs' then
    new.updated_by = auth.uid();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_marketplace_providers_touch_updated_at on public.marketplace_providers;
create trigger trg_marketplace_providers_touch_updated_at
before update on public.marketplace_providers
for each row
execute function public.marketplace_integrations_touch_updated_at();

drop trigger if exists trg_marketplace_settings_touch_updated_at on public.marketplace_integration_settings;
create trigger trg_marketplace_settings_touch_updated_at
before update on public.marketplace_integration_settings
for each row
execute function public.marketplace_integrations_touch_updated_at();

drop trigger if exists trg_marketplace_routes_touch_updated_at on public.work_order_fulfilment_routes;
create trigger trg_marketplace_routes_touch_updated_at
before update on public.work_order_fulfilment_routes
for each row
execute function public.marketplace_integrations_touch_updated_at();

drop trigger if exists trg_marketplace_jobs_touch_updated_at on public.external_marketplace_jobs;
create trigger trg_marketplace_jobs_touch_updated_at
before update on public.external_marketplace_jobs
for each row
execute function public.marketplace_integrations_touch_updated_at();

insert into public.marketplace_providers (
  provider_key,
  country_code,
  label,
  submission_mode,
  description,
  website_url
)
values
  ('checkatrade', 'GB', 'Checkatrade', 'api', 'Find a vetted UK trade via Checkatrade.', 'https://www.checkatrade.com'),
  ('fixly', 'PL', 'Fixly', 'manual', 'Prepare a Fixly handoff for Polish properties.', 'https://fixly.pl'),
  ('myhammer', 'DE', 'MyHammer', 'manual', 'Prepare a MyHammer handoff for German properties.', 'https://www.my-hammer.de')
on conflict (provider_key) do update
set country_code = excluded.country_code,
    label = excluded.label,
    submission_mode = excluded.submission_mode,
    description = excluded.description,
    website_url = excluded.website_url,
    updated_at = now();

alter table public.marketplace_providers enable row level security;
alter table public.marketplace_integration_settings enable row level security;
alter table public.work_order_fulfilment_routes enable row level security;
alter table public.external_marketplace_jobs enable row level security;
alter table public.external_marketplace_events enable row level security;

drop policy if exists marketplace_providers_no_direct_access on public.marketplace_providers;
create policy marketplace_providers_no_direct_access
on public.marketplace_providers
for all
to authenticated
using (false)
with check (false);

drop policy if exists marketplace_integration_settings_no_direct_access on public.marketplace_integration_settings;
create policy marketplace_integration_settings_no_direct_access
on public.marketplace_integration_settings
for all
to authenticated
using (false)
with check (false);

drop policy if exists work_order_fulfilment_routes_no_direct_access on public.work_order_fulfilment_routes;
create policy work_order_fulfilment_routes_no_direct_access
on public.work_order_fulfilment_routes
for all
to authenticated
using (false)
with check (false);

drop policy if exists external_marketplace_jobs_no_direct_access on public.external_marketplace_jobs;
create policy external_marketplace_jobs_no_direct_access
on public.external_marketplace_jobs
for all
to authenticated
using (false)
with check (false);

drop policy if exists external_marketplace_events_no_direct_access on public.external_marketplace_events;
create policy external_marketplace_events_no_direct_access
on public.external_marketplace_events
for all
to authenticated
using (false)
with check (false);

create or replace function public.list_marketplace_integration_settings(
  p_account_id uuid
)
returns table(
  provider_key text,
  enabled boolean,
  configuration jsonb,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_account_id uuid;
begin
  v_account_id := public.assert_manage_account_access(p_account_id);

  return query
  select
    mp.provider_key,
    coalesce(s.enabled, false) as enabled,
    coalesce(s.configuration, '{}'::jsonb) as configuration,
    s.updated_at
  from public.marketplace_providers mp
  left join public.marketplace_integration_settings s
    on s.provider_key = mp.provider_key
   and s.account_id = v_account_id
  order by mp.provider_key;
end;
$$;

create or replace function public.upsert_marketplace_integration_setting(
  p_account_id uuid,
  p_provider_key text,
  p_enabled boolean default false,
  p_configuration jsonb default '{}'::jsonb
)
returns table(
  provider_key text,
  enabled boolean,
  configuration jsonb,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid;
begin
  v_account_id := public.assert_manage_account_access(p_account_id);

  if not exists (
    select 1
    from public.marketplace_providers mp
    where mp.provider_key = p_provider_key
  ) then
    raise exception 'Unknown marketplace provider';
  end if;

  insert into public.marketplace_integration_settings (
    account_id,
    provider_key,
    enabled,
    configuration
  )
  values (
    v_account_id,
    p_provider_key,
    coalesce(p_enabled, false),
    coalesce(p_configuration, '{}'::jsonb)
  )
  on conflict on constraint marketplace_integration_settings_pkey do update
  set enabled = excluded.enabled,
      configuration = excluded.configuration,
      updated_at = now();

  return query
  select
    s.provider_key,
    s.enabled,
    s.configuration,
    s.updated_at
  from public.marketplace_integration_settings s
  where s.account_id = v_account_id
    and s.provider_key = p_provider_key;
end;
$$;

create or replace function public.marketplace_manager_recipient_ids(
  p_account_id uuid,
  p_exclude_user_id uuid default auth.uid()
)
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    array_agg(distinct am.user_id) filter (where am.user_id is not null),
    '{}'::uuid[]
  )
  from public.account_members am
  where am.account_id = p_account_id
    and am.user_id is not null
    and am.user_id is distinct from p_exclude_user_id
    and public.account_member_effective_role(p_account_id, am.user_id) = any (array['owner', 'admin', 'staff']);
$$;

create or replace function public.marketplace_notify_managers(
  p_account_id uuid,
  p_work_order_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient_user_ids uuid[];
begin
  v_recipient_user_ids := public.marketplace_manager_recipient_ids(p_account_id, auth.uid());

  if coalesce(array_length(v_recipient_user_ids, 1), 0) = 0 then
    return;
  end if;

  perform public.create_notifications_system(
    p_account_id,
    v_recipient_user_ids,
    p_type,
    p_title,
    p_body,
    'work_order',
    p_work_order_id,
    '/work-orders/' || p_work_order_id::text,
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

create or replace function public.get_work_order_fulfilment_route(
  p_account_id uuid,
  p_work_order_id uuid
)
returns table(
  account_id uuid,
  work_order_id uuid,
  route text,
  updated_at timestamptz,
  is_persisted boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_account_id uuid;
begin
  v_account_id := public.assert_manage_account_access(p_account_id);

  if not exists (
    select 1
    from public.work_orders wo
    where wo.id = p_work_order_id
      and wo.account_id = v_account_id
  ) then
    raise exception 'Work order not found' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.work_order_fulfilment_routes r
    where r.work_order_id = p_work_order_id
      and r.account_id = v_account_id
  ) then
    return query
    select
      r.account_id,
      r.work_order_id,
      r.route,
      r.updated_at,
      true as is_persisted
    from public.work_order_fulfilment_routes r
    where r.work_order_id = p_work_order_id
      and r.account_id = v_account_id;
    return;
  end if;

  return query
  select
    v_account_id,
    p_work_order_id,
    'internal'::text,
    null::timestamptz,
    false as is_persisted;
end;
$$;

create or replace function public.set_work_order_fulfilment_route(
  p_account_id uuid,
  p_work_order_id uuid,
  p_route text
)
returns table(
  account_id uuid,
  work_order_id uuid,
  route text,
  updated_at timestamptz,
  is_persisted boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid;
begin
  v_account_id := public.assert_manage_account_access(p_account_id);

  if p_route not in ('internal', 'marketplace', 'hybrid', 'undecided') then
    raise exception 'Unsupported fulfilment route';
  end if;

  if not exists (
    select 1
    from public.work_orders wo
    where wo.id = p_work_order_id
      and wo.account_id = v_account_id
  ) then
    raise exception 'Work order not found' using errcode = 'P0002';
  end if;

  insert into public.work_order_fulfilment_routes (
    work_order_id,
    account_id,
    route,
    updated_by
  )
  values (
    p_work_order_id,
    v_account_id,
    p_route,
    auth.uid()
  )
  on conflict on constraint work_order_fulfilment_routes_pkey do update
  set route = excluded.route,
      account_id = excluded.account_id,
      updated_by = auth.uid(),
      updated_at = now();

  perform public.activity_log_write(
    v_account_id,
    'work_order',
    p_work_order_id,
    'marketplace_route_changed',
    'fulfilment_route',
    null,
    p_route,
    jsonb_build_object(
      'table', 'work_order_fulfilment_routes',
      'route', p_route
    )
  );

  return query
  select
    r.account_id as account_id,
    r.work_order_id as work_order_id,
    r.route as route,
    r.updated_at as updated_at,
    true as is_persisted
  from public.work_order_fulfilment_routes r
  where r.work_order_id = p_work_order_id
    and r.account_id = v_account_id;
end;
$$;

create or replace function public.list_marketplace_jobs(
  p_account_id uuid,
  p_work_order_id uuid
)
returns setof public.external_marketplace_jobs
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_account_id uuid;
begin
  v_account_id := public.assert_manage_account_access(p_account_id);

  if not exists (
    select 1
    from public.work_orders wo
    where wo.id = p_work_order_id
      and wo.account_id = v_account_id
  ) then
    raise exception 'Work order not found' using errcode = 'P0002';
  end if;

  return query
  select j.*
  from public.external_marketplace_jobs j
  where j.account_id = v_account_id
    and j.work_order_id = p_work_order_id
  order by j.created_at desc;
end;
$$;

create or replace function public.create_marketplace_job(
  p_account_id uuid,
  p_work_order_id uuid,
  p_provider_key text,
  p_trade_category text default '',
  p_contact_name text default '',
  p_contact_email text default '',
  p_contact_phone text default '',
  p_consent_confirmed boolean default false,
  p_title text default '',
  p_description text default '',
  p_urgency text default '',
  p_postcode text default '',
  p_city text default '',
  p_property_label text default '',
  p_request_payload jsonb default '{}'::jsonb,
  p_metadata jsonb default '{}'::jsonb
)
returns setof public.external_marketplace_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid;
  v_provider public.marketplace_providers%rowtype;
  v_job public.external_marketplace_jobs%rowtype;
begin
  v_account_id := public.assert_manage_account_access(p_account_id);

  select *
  into v_provider
  from public.marketplace_providers mp
  where mp.provider_key = p_provider_key;

  if v_provider.provider_key is null then
    raise exception 'Unknown marketplace provider';
  end if;

  if not exists (
    select 1
    from public.work_orders wo
    where wo.id = p_work_order_id
      and wo.account_id = v_account_id
  ) then
    raise exception 'Work order not found' using errcode = 'P0002';
  end if;

  insert into public.external_marketplace_jobs (
    account_id,
    work_order_id,
    provider_key,
    country_code,
    trade_category,
    external_job_id,
    external_reference,
    external_url,
    status,
    submission_mode,
    title,
    description,
    urgency,
    postcode,
    city,
    property_label,
    contact_name,
    contact_email,
    contact_phone,
    consent_confirmed_at,
    request_payload,
    metadata,
    created_by,
    updated_by
  )
  values (
    v_account_id,
    p_work_order_id,
    v_provider.provider_key,
    v_provider.country_code,
    coalesce(p_trade_category, ''),
    '',
    '',
    '',
    case when p_consent_confirmed then 'ready_to_submit' else 'draft' end,
    v_provider.submission_mode,
    coalesce(p_title, ''),
    coalesce(p_description, ''),
    coalesce(p_urgency, ''),
    coalesce(p_postcode, ''),
    coalesce(p_city, ''),
    coalesce(p_property_label, ''),
    case when p_consent_confirmed then coalesce(p_contact_name, '') else '' end,
    case when p_consent_confirmed then coalesce(p_contact_email, '') else '' end,
    case when p_consent_confirmed then coalesce(p_contact_phone, '') else '' end,
    case when p_consent_confirmed then now() else null end,
    coalesce(p_request_payload, '{}'::jsonb),
    coalesce(p_metadata, '{}'::jsonb),
    auth.uid(),
    auth.uid()
  )
  returning *
  into v_job;

  insert into public.external_marketplace_events (
    marketplace_job_id,
    account_id,
    work_order_id,
    event_type,
    payload,
    actor_user_id
  )
  values (
    v_job.id,
    v_job.account_id,
    v_job.work_order_id,
    'job_created',
    jsonb_build_object(
      'provider_key', v_job.provider_key,
      'status', v_job.status,
      'submission_mode', v_job.submission_mode
    ),
    auth.uid()
  );

  perform public.activity_log_write(
    v_job.account_id,
    'work_order',
    v_job.work_order_id,
    'marketplace_job_created',
    'provider_key',
    null,
    v_job.provider_key,
    jsonb_build_object(
      'table', 'external_marketplace_jobs',
      'marketplace_job_id', v_job.id,
      'provider_key', v_job.provider_key,
      'submission_mode', v_job.submission_mode,
      'status', v_job.status,
      'trade_category', v_job.trade_category
    )
  );

  perform public.marketplace_notify_managers(
    v_job.account_id,
    v_job.work_order_id,
    'marketplace_handoff_created',
    'Marketplace handoff created',
    coalesce(v_job.title, 'Work order handoff') || ' → ' || coalesce(v_provider.label, v_job.provider_key),
    jsonb_build_object(
      'marketplace_job_id', v_job.id,
      'provider_key', v_job.provider_key,
      'submission_mode', v_job.submission_mode,
      'status', v_job.status
    )
  );

  return query
  select *
  from public.external_marketplace_jobs j
  where j.id = v_job.id;
end;
$$;

create or replace function public.mark_marketplace_job_submitted(
  p_account_id uuid,
  p_marketplace_job_id uuid,
  p_external_job_id text default '',
  p_external_reference text default '',
  p_external_url text default '',
  p_response_payload jsonb default '{}'::jsonb
)
returns setof public.external_marketplace_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid;
  v_job public.external_marketplace_jobs%rowtype;
begin
  v_account_id := public.assert_manage_account_access(p_account_id);

  update public.external_marketplace_jobs j
  set status = 'submitted',
      submitted_at = coalesce(j.submitted_at, now()),
      external_job_id = case when coalesce(p_external_job_id, '') = '' then j.external_job_id else p_external_job_id end,
      external_reference = case when coalesce(p_external_reference, '') = '' then j.external_reference else p_external_reference end,
      external_url = case when coalesce(p_external_url, '') = '' then j.external_url else p_external_url end,
      last_error = '',
      response_payload = case
        when p_response_payload is null or p_response_payload = '{}'::jsonb then j.response_payload
        else p_response_payload
      end,
      updated_by = auth.uid(),
      updated_at = now()
  where j.id = p_marketplace_job_id
    and j.account_id = v_account_id
  returning *
  into v_job;

  if v_job.id is null then
    raise exception 'Marketplace job not found' using errcode = 'P0002';
  end if;

  insert into public.external_marketplace_events (
    marketplace_job_id,
    account_id,
    work_order_id,
    event_type,
    payload,
    actor_user_id
  )
  values (
    v_job.id,
    v_job.account_id,
    v_job.work_order_id,
    'job_submitted',
    jsonb_build_object(
      'external_job_id', v_job.external_job_id,
      'external_reference', v_job.external_reference,
      'external_url', v_job.external_url
    ),
    auth.uid()
  );

  perform public.activity_log_write(
    v_job.account_id,
    'work_order',
    v_job.work_order_id,
    'marketplace_job_submitted',
    'status',
    null,
    v_job.status,
    jsonb_build_object(
      'table', 'external_marketplace_jobs',
      'marketplace_job_id', v_job.id,
      'provider_key', v_job.provider_key,
      'external_job_id', v_job.external_job_id,
      'external_reference', v_job.external_reference,
      'external_url', v_job.external_url
    )
  );

  perform public.marketplace_notify_managers(
    v_job.account_id,
    v_job.work_order_id,
    'marketplace_handoff_submitted',
    'Marketplace handoff submitted',
    coalesce(v_job.title, 'Work order handoff') || ' submitted to ' || coalesce(v_job.provider_key, 'marketplace'),
    jsonb_build_object(
      'marketplace_job_id', v_job.id,
      'provider_key', v_job.provider_key,
      'external_job_id', v_job.external_job_id,
      'external_reference', v_job.external_reference,
      'external_url', v_job.external_url
    )
  );

  return query
  select *
  from public.external_marketplace_jobs j
  where j.id = v_job.id;
end;
$$;

create or replace function public.update_marketplace_job_status(
  p_account_id uuid,
  p_marketplace_job_id uuid,
  p_status text,
  p_payload jsonb default '{}'::jsonb
)
returns setof public.external_marketplace_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid;
  v_job public.external_marketplace_jobs%rowtype;
  v_previous_status text;
begin
  v_account_id := public.assert_manage_account_access(p_account_id);

  if p_status not in (
    'draft',
    'ready_to_submit',
    'submitted',
    'acknowledged',
    'matched',
    'quote_received',
    'appointment_scheduled',
    'in_progress',
    'completed',
    'cancelled',
    'failed',
    'manual_follow_up'
  ) then
    raise exception 'Unsupported marketplace job status';
  end if;

  select j.status
  into v_previous_status
  from public.external_marketplace_jobs j
  where j.id = p_marketplace_job_id
    and j.account_id = v_account_id;

  update public.external_marketplace_jobs j
  set status = p_status,
      last_synced_at = now(),
      last_error = case
        when p_status = 'submitted' then ''
        when p_status in ('failed', 'manual_follow_up') then coalesce(
          nullif(coalesce(p_payload->>'error', ''), ''),
          nullif(coalesce(p_payload->>'message', ''), ''),
          j.last_error
        )
        else j.last_error
      end,
      response_payload = case
        when p_payload is null or p_payload = '{}'::jsonb then j.response_payload
        else p_payload
      end,
      updated_by = auth.uid(),
      updated_at = now()
  where j.id = p_marketplace_job_id
    and j.account_id = v_account_id
  returning *
  into v_job;

  if v_job.id is null then
    raise exception 'Marketplace job not found' using errcode = 'P0002';
  end if;

  insert into public.external_marketplace_events (
    marketplace_job_id,
    account_id,
    work_order_id,
    event_type,
    payload,
    actor_user_id
  )
  values (
    v_job.id,
    v_job.account_id,
    v_job.work_order_id,
    'status_updated',
    jsonb_build_object(
      'status', v_job.status,
      'payload', coalesce(p_payload, '{}'::jsonb)
    ),
    auth.uid()
  );

  perform public.activity_log_write(
    v_job.account_id,
    'work_order',
    v_job.work_order_id,
    'marketplace_job_status_changed',
    'status',
    v_previous_status,
    v_job.status,
    jsonb_build_object(
      'table', 'external_marketplace_jobs',
      'marketplace_job_id', v_job.id,
      'provider_key', v_job.provider_key,
      'status', v_job.status,
      'payload', coalesce(p_payload, '{}'::jsonb)
    )
  );

  perform public.marketplace_notify_managers(
    v_job.account_id,
    v_job.work_order_id,
    'marketplace_handoff_status_changed',
    'Marketplace handoff status changed',
    coalesce(v_job.title, 'Work order handoff') || ' status: ' || v_job.status,
    jsonb_build_object(
      'marketplace_job_id', v_job.id,
      'provider_key', v_job.provider_key,
      'status', v_job.status,
      'old_status', v_previous_status
    )
  );

  return query
  select *
  from public.external_marketplace_jobs j
  where j.id = v_job.id;
end;
$$;

create or replace function public.edge_record_marketplace_submission_result(
  p_account_id uuid,
  p_marketplace_job_id uuid,
  p_actor_user_id uuid,
  p_outcome text,
  p_external_job_id text default '',
  p_external_reference text default '',
  p_external_url text default '',
  p_last_error text default '',
  p_response_payload jsonb default '{}'::jsonb
)
returns setof public.external_marketplace_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.external_marketplace_jobs%rowtype;
  v_previous_status text;
  v_event_type text;
  v_notification_type text;
  v_notification_title text;
  v_notification_body text;
begin
  if p_outcome not in ('submitted', 'failed', 'manual_follow_up') then
    raise exception 'Unsupported marketplace submission outcome';
  end if;

  select j.status
  into v_previous_status
  from public.external_marketplace_jobs j
  where j.id = p_marketplace_job_id
    and j.account_id = p_account_id;

  update public.external_marketplace_jobs j
  set status = p_outcome,
      submitted_at = case when p_outcome = 'submitted' then coalesce(j.submitted_at, now()) else j.submitted_at end,
      last_synced_at = now(),
      external_job_id = case when coalesce(p_external_job_id, '') = '' then j.external_job_id else p_external_job_id end,
      external_reference = case when coalesce(p_external_reference, '') = '' then j.external_reference else p_external_reference end,
      external_url = case when coalesce(p_external_url, '') = '' then j.external_url else p_external_url end,
      last_error = case when p_outcome = 'submitted' then '' else coalesce(p_last_error, '') end,
      response_payload = case
        when p_response_payload is null or p_response_payload = '{}'::jsonb then j.response_payload
        else p_response_payload
      end,
      updated_by = p_actor_user_id,
      updated_at = now()
  where j.id = p_marketplace_job_id
    and j.account_id = p_account_id
  returning *
  into v_job;

  if v_job.id is null then
    raise exception 'Marketplace job not found' using errcode = 'P0002';
  end if;

  if p_outcome = 'submitted' then
    v_event_type := 'job_submitted';
    v_notification_type := 'marketplace_handoff_submitted';
    v_notification_title := 'Marketplace handoff submitted';
    v_notification_body := coalesce(v_job.title, 'Work order handoff') || ' submitted to ' || coalesce(v_job.provider_key, 'marketplace');
  else
    v_event_type := 'status_updated';
    v_notification_type := 'marketplace_handoff_status_changed';
    v_notification_title := 'Marketplace handoff status changed';
    v_notification_body := coalesce(v_job.title, 'Work order handoff') || ' status: ' || v_job.status;
  end if;

  insert into public.external_marketplace_events (
    marketplace_job_id,
    account_id,
    work_order_id,
    event_type,
    payload,
    actor_user_id
  )
  values (
    v_job.id,
    v_job.account_id,
    v_job.work_order_id,
    v_event_type,
    jsonb_build_object(
      'status', v_job.status,
      'external_job_id', v_job.external_job_id,
      'external_reference', v_job.external_reference,
      'external_url', v_job.external_url,
      'last_error', v_job.last_error,
      'payload', coalesce(p_response_payload, '{}'::jsonb)
    ),
    p_actor_user_id
  );

  if p_outcome = 'submitted' then
    perform public.activity_log_write(
      v_job.account_id,
      'work_order',
      v_job.work_order_id,
      'marketplace_job_submitted',
      'status',
      v_previous_status,
      v_job.status,
      jsonb_build_object(
        'table', 'external_marketplace_jobs',
        'marketplace_job_id', v_job.id,
        'provider_key', v_job.provider_key,
        'external_job_id', v_job.external_job_id,
        'external_reference', v_job.external_reference,
        'external_url', v_job.external_url,
        'payload', coalesce(p_response_payload, '{}'::jsonb)
      )
    );
  else
    perform public.activity_log_write(
      v_job.account_id,
      'work_order',
      v_job.work_order_id,
      'marketplace_job_status_changed',
      'status',
      v_previous_status,
      v_job.status,
      jsonb_build_object(
        'table', 'external_marketplace_jobs',
        'marketplace_job_id', v_job.id,
        'provider_key', v_job.provider_key,
        'status', v_job.status,
        'last_error', v_job.last_error,
        'payload', coalesce(p_response_payload, '{}'::jsonb)
      )
    );
  end if;

  perform public.marketplace_notify_managers(
    v_job.account_id,
    v_job.work_order_id,
    v_notification_type,
    v_notification_title,
    v_notification_body,
    jsonb_build_object(
      'marketplace_job_id', v_job.id,
      'provider_key', v_job.provider_key,
      'status', v_job.status,
      'old_status', v_previous_status,
      'external_job_id', v_job.external_job_id,
      'external_reference', v_job.external_reference,
      'external_url', v_job.external_url
    )
  );

  return query
  select *
  from public.external_marketplace_jobs j
  where j.id = v_job.id;
end;
$$;

grant execute on function public.list_marketplace_integration_settings(uuid) to authenticated;
grant execute on function public.upsert_marketplace_integration_setting(uuid, text, boolean, jsonb) to authenticated;
grant execute on function public.marketplace_manager_recipient_ids(uuid, uuid) to authenticated;
grant execute on function public.marketplace_notify_managers(uuid, uuid, text, text, text, jsonb) to authenticated;
grant execute on function public.get_work_order_fulfilment_route(uuid, uuid) to authenticated;
grant execute on function public.set_work_order_fulfilment_route(uuid, uuid, text) to authenticated;
grant execute on function public.list_marketplace_jobs(uuid, uuid) to authenticated;
grant execute on function public.create_marketplace_job(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  boolean,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  jsonb
) to authenticated;
grant execute on function public.mark_marketplace_job_submitted(
  uuid,
  uuid,
  text,
  text,
  text,
  jsonb
) to authenticated;
grant execute on function public.update_marketplace_job_status(
  uuid,
  uuid,
  text,
  jsonb
) to authenticated;
grant execute on function public.edge_record_marketplace_submission_result(
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  jsonb
) to service_role;
