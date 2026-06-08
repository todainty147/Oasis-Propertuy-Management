begin;

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  phone text,
  preferred_language text not null default 'en',
  country text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.signup_intelligence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete cascade,
  signup_type text not null,
  signup_source text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  referrer text,
  landing_path text,
  locale text,
  created_at timestamptz not null default now(),
  constraint signup_intelligence_type_check
    check (signup_type in ('landlord_self_serve', 'tenant_invite', 'contractor_invite', 'staff_invite', 'unknown'))
);

create table if not exists public.user_contact_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  product_updates_opt_in boolean not null default false,
  feedback_contact_opt_in boolean not null default false,
  marketing_opt_in boolean not null default false,
  opted_in_at timestamptz,
  opted_out_at timestamptz,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_feedback_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete cascade,
  status text not null default 'not_contacted',
  channel text,
  requested_at timestamptz,
  responded_at timestamptz,
  rating integer,
  feedback_summary text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_feedback_requests_status_check
    check (status in ('not_contacted', 'contacted', 'responded', 'declined', 'do_not_contact')),
  constraint user_feedback_requests_rating_check
    check (rating is null or (rating between 1 and 5))
);

create table if not exists public.user_activation_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete cascade,
  event_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists signup_intelligence_account_created_idx
  on public.signup_intelligence(account_id, created_at desc);
create index if not exists signup_intelligence_type_created_idx
  on public.signup_intelligence(signup_type, created_at desc);
create unique index if not exists user_feedback_requests_user_account_uidx
  on public.user_feedback_requests(user_id, account_id);
create index if not exists user_feedback_requests_status_idx
  on public.user_feedback_requests(status);
create index if not exists user_activation_events_account_created_idx
  on public.user_activation_events(account_id, created_at desc);
create unique index if not exists user_activation_events_first_event_uidx
  on public.user_activation_events(user_id, account_id, event_key)
  where event_key like 'first\_%' escape '\';

create or replace function public.early_users_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_user_profiles_updated_at on public.user_profiles;
create trigger trg_user_profiles_updated_at
before update on public.user_profiles
for each row execute function public.early_users_set_updated_at();

drop trigger if exists trg_user_contact_preferences_updated_at on public.user_contact_preferences;
create trigger trg_user_contact_preferences_updated_at
before update on public.user_contact_preferences
for each row execute function public.early_users_set_updated_at();

drop trigger if exists trg_user_feedback_requests_updated_at on public.user_feedback_requests;
create trigger trg_user_feedback_requests_updated_at
before update on public.user_feedback_requests
for each row execute function public.early_users_set_updated_at();

alter table public.user_profiles enable row level security;
alter table public.signup_intelligence enable row level security;
alter table public.user_contact_preferences enable row level security;
alter table public.user_feedback_requests enable row level security;
alter table public.user_activation_events enable row level security;

drop policy if exists user_profiles_select_self on public.user_profiles;
create policy user_profiles_select_self
on public.user_profiles
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists user_profiles_update_self on public.user_profiles;
create policy user_profiles_update_self
on public.user_profiles
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists user_contact_preferences_select_self on public.user_contact_preferences;
create policy user_contact_preferences_select_self
on public.user_contact_preferences
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists user_contact_preferences_update_self on public.user_contact_preferences;
create policy user_contact_preferences_update_self
on public.user_contact_preferences
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

revoke all on public.user_profiles from anon;
revoke all on public.signup_intelligence from anon;
revoke all on public.user_contact_preferences from anon;
revoke all on public.user_feedback_requests from anon;
revoke all on public.user_activation_events from anon;

create or replace function public.record_signup_intelligence(
  p_user_id uuid,
  p_account_id uuid,
  p_signup_type text,
  p_email text,
  p_full_name text default null,
  p_signup_source text default null,
  p_utm_source text default null,
  p_utm_medium text default null,
  p_utm_campaign text default null,
  p_referrer text default null,
  p_landing_path text default null,
  p_locale text default null,
  p_feedback_contact_opt_in boolean default false,
  p_product_updates_opt_in boolean default false,
  p_marketing_opt_in boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_signup_type text := coalesce(nullif(lower(trim(p_signup_type)), ''), 'unknown');
  v_email text := lower(trim(coalesce(p_email, '')));
  v_now timestamptz := now();
  v_event_key text;
  v_feedback_status text;
  v_any_opt_in boolean;
begin
  if auth.role() is distinct from 'service_role' and auth.uid() is distinct from p_user_id then
    raise exception 'record_signup_intelligence: user mismatch';
  end if;

  if p_user_id is null then
    raise exception 'Missing user id';
  end if;

  if v_email = '' then
    raise exception 'Missing email';
  end if;

  if v_signup_type not in ('landlord_self_serve', 'tenant_invite', 'contractor_invite', 'staff_invite', 'unknown') then
    v_signup_type := 'unknown';
  end if;

  insert into public.user_profiles(user_id, email, full_name, preferred_language)
  values (p_user_id, v_email, nullif(trim(coalesce(p_full_name, '')), ''), coalesce(nullif(trim(coalesce(p_locale, '')), ''), 'en'))
  on conflict (user_id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.user_profiles.full_name),
    preferred_language = coalesce(excluded.preferred_language, public.user_profiles.preferred_language),
    updated_at = now();

  insert into public.signup_intelligence(
    user_id, account_id, signup_type, signup_source, utm_source, utm_medium,
    utm_campaign, referrer, landing_path, locale
  )
  values (
    p_user_id, p_account_id, v_signup_type, nullif(trim(coalesce(p_signup_source, '')), ''),
    nullif(trim(coalesce(p_utm_source, '')), ''), nullif(trim(coalesce(p_utm_medium, '')), ''),
    nullif(trim(coalesce(p_utm_campaign, '')), ''), nullif(trim(coalesce(p_referrer, '')), ''),
    nullif(trim(coalesce(p_landing_path, '')), ''), nullif(trim(coalesce(p_locale, '')), '')
  );

  v_any_opt_in := coalesce(p_feedback_contact_opt_in, false)
    or coalesce(p_product_updates_opt_in, false)
    or coalesce(p_marketing_opt_in, false);

  insert into public.user_contact_preferences(
    user_id,
    product_updates_opt_in,
    feedback_contact_opt_in,
    marketing_opt_in,
    opted_in_at,
    opted_out_at,
    source
  )
  values (
    p_user_id,
    coalesce(p_product_updates_opt_in, false),
    coalesce(p_feedback_contact_opt_in, false),
    coalesce(p_marketing_opt_in, false),
    case when v_any_opt_in then v_now else null end,
    case when v_any_opt_in then null else v_now end,
    coalesce(nullif(trim(coalesce(p_signup_source, '')), ''), v_signup_type)
  )
  on conflict (user_id) do update set
    product_updates_opt_in = excluded.product_updates_opt_in,
    feedback_contact_opt_in = excluded.feedback_contact_opt_in,
    marketing_opt_in = excluded.marketing_opt_in,
    opted_in_at = case
      when excluded.product_updates_opt_in or excluded.feedback_contact_opt_in or excluded.marketing_opt_in
      then coalesce(public.user_contact_preferences.opted_in_at, excluded.opted_in_at)
      else public.user_contact_preferences.opted_in_at
    end,
    opted_out_at = case
      when not (excluded.product_updates_opt_in or excluded.feedback_contact_opt_in or excluded.marketing_opt_in)
      then excluded.opted_out_at
      else null
    end,
    source = excluded.source,
    updated_at = now();

  v_event_key := case v_signup_type
    when 'landlord_self_serve' then 'landlord_signup_completed'
    when 'tenant_invite' then 'tenant_invite_accepted'
    when 'contractor_invite' then 'contractor_invite_accepted'
    else null
  end;

  if v_event_key is not null then
    insert into public.user_activation_events(user_id, account_id, event_key, metadata)
    values (p_user_id, p_account_id, v_event_key, jsonb_build_object('signup_type', v_signup_type));
  end if;

  v_feedback_status := case when coalesce(p_feedback_contact_opt_in, false) then 'not_contacted' else 'do_not_contact' end;

  insert into public.user_feedback_requests(user_id, account_id, status, requested_at)
  values (p_user_id, p_account_id, v_feedback_status, case when v_feedback_status = 'not_contacted' then v_now else null end)
  on conflict (user_id, account_id) do update set
    status = case
      when public.user_feedback_requests.status = 'do_not_contact' and excluded.status = 'not_contacted' then 'not_contacted'
      else public.user_feedback_requests.status
    end,
    requested_at = coalesce(public.user_feedback_requests.requested_at, excluded.requested_at),
    updated_at = now();

  begin
    perform public.log_security_event(
      p_account_id,
      'signup_intelligence_recorded',
      'signup_intelligence',
      null,
      jsonb_build_object('signup_type', v_signup_type, 'feedback_opt_in', coalesce(p_feedback_contact_opt_in, false))
    );
  exception when undefined_function then
    null;
  end;

  return jsonb_build_object('ok', true, 'feedback_status', v_feedback_status, 'activation_event', v_event_key);
end;
$$;

create or replace function public.record_user_activation_event(
  p_account_id uuid,
  p_event_key text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_event_key text := lower(trim(coalesce(p_event_key, '')));
  v_existing_id uuid;
  v_event_id uuid;
begin
  if auth.role() is distinct from 'service_role' and v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_account_id is null then
    raise exception 'Missing account id';
  end if;

  if v_event_key = '' then
    raise exception 'Missing event key';
  end if;

  if auth.role() is distinct from 'service_role' then
    perform public.assert_manage_account_access(p_account_id);
  end if;

  if v_event_key like 'first\_%' escape '\' then
    select id
    into v_existing_id
    from public.user_activation_events
    where user_id = v_uid
      and account_id = p_account_id
      and event_key = v_event_key
    limit 1;

    if v_existing_id is not null then
      return v_existing_id;
    end if;
  end if;

  insert into public.user_activation_events(user_id, account_id, event_key, metadata)
  values (v_uid, p_account_id, v_event_key, coalesce(p_metadata, '{}'::jsonb))
  returning id into v_event_id;

  return v_event_id;
end;
$$;

create or replace function public.early_users_admin_list(
  p_signup_type text default null,
  p_feedback_status text default null,
  p_founder_only boolean default false,
  p_limit integer default 100
)
returns table (
  user_id uuid,
  email text,
  full_name text,
  account_id uuid,
  account_name text,
  signup_type text,
  signup_source text,
  utm_source text,
  utm_campaign text,
  created_at timestamptz,
  preferred_language text,
  country text,
  founder_status text,
  founder_position integer,
  activation_score integer,
  last_activation_at timestamptz,
  feedback_contact_opt_in boolean,
  product_updates_opt_in boolean,
  marketing_opt_in boolean,
  feedback_status text,
  last_feedback_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.user_is_root_operator() then
    raise exception 'early_users_admin_list: requires root operator';
  end if;

  return query
  with latest_signup as (
    select distinct on (si.user_id, si.account_id)
      si.*
    from public.signup_intelligence si
    where (p_signup_type is null or si.signup_type = p_signup_type)
    order by si.user_id, si.account_id, si.created_at desc
  ),
  activation as (
    select
      uae.user_id,
      uae.account_id,
      count(distinct uae.event_key)::integer as activation_score,
      max(uae.created_at) as last_activation_at
    from public.user_activation_events uae
    group by uae.user_id, uae.account_id
  ),
  founder as (
    select distinct on (lor.account_id)
      lor.account_id,
      lor.status as founder_status,
      lor.position as founder_position
    from public.launch_offer_redemptions lor
    order by lor.account_id, lor.created_at desc
  )
  select
    ls.user_id,
    up.email,
    up.full_name,
    ls.account_id,
    a.name as account_name,
    ls.signup_type,
    ls.signup_source,
    ls.utm_source,
    ls.utm_campaign,
    ls.created_at,
    up.preferred_language,
    up.country,
    coalesce(f.founder_status, 'none') as founder_status,
    f.founder_position,
    coalesce(act.activation_score, 0) as activation_score,
    act.last_activation_at,
    coalesce(ucp.feedback_contact_opt_in, false) as feedback_contact_opt_in,
    coalesce(ucp.product_updates_opt_in, false) as product_updates_opt_in,
    coalesce(ucp.marketing_opt_in, false) as marketing_opt_in,
    coalesce(ufr.status, 'not_contacted') as feedback_status,
    nullif(greatest(
      coalesce(ufr.requested_at, '-infinity'::timestamptz),
      coalesce(ufr.responded_at, '-infinity'::timestamptz),
      coalesce(ufr.updated_at, '-infinity'::timestamptz)
    ), '-infinity'::timestamptz) as last_feedback_at
  from latest_signup ls
  left join public.user_profiles up on up.user_id = ls.user_id
  left join public.accounts a on a.id = ls.account_id
  left join public.user_contact_preferences ucp on ucp.user_id = ls.user_id
  left join public.user_feedback_requests ufr on ufr.user_id = ls.user_id and ufr.account_id = ls.account_id
  left join activation act on act.user_id = ls.user_id and act.account_id = ls.account_id
  left join founder f on f.account_id = ls.account_id
  where (p_feedback_status is null or coalesce(ufr.status, 'not_contacted') = p_feedback_status)
    and (not coalesce(p_founder_only, false) or f.account_id is not null)
  order by ls.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;

create or replace function public.update_feedback_status(
  p_user_id uuid,
  p_account_id uuid,
  p_status text,
  p_notes text default null,
  p_rating integer default null,
  p_channel text default null
)
returns public.user_feedback_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := lower(trim(coalesce(p_status, '')));
  v_row public.user_feedback_requests;
begin
  if not public.user_is_root_operator() then
    raise exception 'update_feedback_status: requires root operator';
  end if;

  if v_status not in ('not_contacted', 'contacted', 'responded', 'declined', 'do_not_contact') then
    raise exception 'Invalid feedback status';
  end if;

  insert into public.user_feedback_requests(
    user_id,
    account_id,
    status,
    channel,
    requested_at,
    responded_at,
    rating,
    notes
  )
  values (
    p_user_id,
    p_account_id,
    v_status,
    nullif(trim(coalesce(p_channel, '')), ''),
    case when v_status in ('contacted', 'responded') then now() else null end,
    case when v_status = 'responded' then now() else null end,
    p_rating,
    nullif(trim(coalesce(p_notes, '')), '')
  )
  on conflict (user_id, account_id) do update set
    status = excluded.status,
    channel = coalesce(excluded.channel, public.user_feedback_requests.channel),
    requested_at = case
      when excluded.status in ('contacted', 'responded')
      then coalesce(public.user_feedback_requests.requested_at, now())
      else public.user_feedback_requests.requested_at
    end,
    responded_at = case
      when excluded.status = 'responded'
      then coalesce(public.user_feedback_requests.responded_at, now())
      else public.user_feedback_requests.responded_at
    end,
    rating = coalesce(excluded.rating, public.user_feedback_requests.rating),
    notes = coalesce(excluded.notes, public.user_feedback_requests.notes),
    updated_at = now()
  returning * into v_row;

  begin
    perform public.log_security_event(
      p_account_id,
      'feedback_status_updated',
      'user_feedback_request',
      v_row.id,
      jsonb_build_object('status', v_status, 'has_notes', p_notes is not null, 'rating', p_rating)
    );
  exception when undefined_function then
    null;
  end;

  return v_row;
end;
$$;

create or replace function public.early_user_detail(
  p_user_id uuid,
  p_account_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.user_is_root_operator() then
    raise exception 'early_user_detail: requires root operator';
  end if;

  select jsonb_build_object(
    'profile', to_jsonb(up),
    'account', jsonb_build_object('id', a.id, 'name', a.name, 'is_disabled', coalesce(a.is_disabled, false)),
    'signup', coalesce((
      select jsonb_agg(to_jsonb(si) order by si.created_at desc)
      from public.signup_intelligence si
      where si.user_id = p_user_id and si.account_id = p_account_id
    ), '[]'::jsonb),
    'activationEvents', coalesce((
      select jsonb_agg(to_jsonb(uae) order by uae.created_at desc)
      from public.user_activation_events uae
      where uae.user_id = p_user_id and uae.account_id = p_account_id
    ), '[]'::jsonb),
    'contactPreferences', to_jsonb(ucp),
    'feedback', to_jsonb(ufr)
  )
  into v_result
  from public.user_profiles up
  left join public.accounts a on a.id = p_account_id
  left join public.user_contact_preferences ucp on ucp.user_id = up.user_id
  left join public.user_feedback_requests ufr on ufr.user_id = up.user_id and ufr.account_id = p_account_id
  where up.user_id = p_user_id;

  return coalesce(v_result, '{}'::jsonb);
end;
$$;

revoke all on function public.record_signup_intelligence(
  uuid, uuid, text, text, text, text, text, text, text, text, text, text, boolean, boolean, boolean
) from public;
grant execute on function public.record_signup_intelligence(
  uuid, uuid, text, text, text, text, text, text, text, text, text, text, boolean, boolean, boolean
) to authenticated, service_role;

revoke all on function public.record_user_activation_event(uuid, text, jsonb) from public;
grant execute on function public.record_user_activation_event(uuid, text, jsonb) to authenticated, service_role;

revoke all on function public.early_users_admin_list(text, text, boolean, integer) from public;
grant execute on function public.early_users_admin_list(text, text, boolean, integer) to authenticated;

revoke all on function public.update_feedback_status(uuid, uuid, text, text, integer, text) from public;
grant execute on function public.update_feedback_status(uuid, uuid, text, text, integer, text) to authenticated;

revoke all on function public.early_user_detail(uuid, uuid) from public;
grant execute on function public.early_user_detail(uuid, uuid) to authenticated;

commit;
