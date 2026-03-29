create or replace function public.account_plan_rank(
  p_plan text
)
returns integer
language sql
stable
set search_path = public
as $$
  select case lower(trim(coalesce(p_plan, 'starter')))
    when 'pro' then 3
    when 'growth' then 2
    else 1
  end;
$$;

comment on function public.account_plan_rank(text) is
  'Maps canonical billing plan keys to a comparable numeric rank.';

revoke all on function public.account_plan_rank(text) from public;
grant execute on function public.account_plan_rank(text) to authenticated;

create or replace function public.account_subscription_plan(
  p_account_id uuid
)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select case
    when a.is_root then 'pro'
    else lower(trim(coalesce(a.subscription_plan, 'starter')))
  end
  from public.accounts a
  where a.id = p_account_id;
$$;

comment on function public.account_subscription_plan(uuid) is
  'Returns the normalized subscription plan key for the target account.';

revoke all on function public.account_subscription_plan(uuid) from public;
grant execute on function public.account_subscription_plan(uuid) to authenticated;

create or replace function public.account_feature_required_plan(
  p_feature text
)
returns text
language sql
stable
set search_path = public
as $$
  select case lower(trim(coalesce(p_feature, '')))
    when 'command_center' then 'growth'
    when 'portfolio_health' then 'growth'
    when 'maintenance_kpi' then 'growth'
    when 'playbooks' then 'pro'
    when 'advanced_automation' then 'pro'
    when 'security_audit' then 'pro'
    when 'root_telemetry' then 'pro'
    when 'support_tooling' then 'pro'
    else 'starter'
  end;
$$;

comment on function public.account_feature_required_plan(text) is
  'Returns the minimum billing plan required for a feature key.';

revoke all on function public.account_feature_required_plan(text) from public;
grant execute on function public.account_feature_required_plan(text) to authenticated;

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
  select
    public.account_plan_rank(public.account_subscription_plan(p_account_id))
    >= public.account_plan_rank(public.account_feature_required_plan(p_feature));
$$;

comment on function public.account_has_feature(uuid, text) is
  'Returns whether the target account billing plan includes the requested feature.';

revoke all on function public.account_has_feature(uuid, text) from public;
grant execute on function public.account_has_feature(uuid, text) to authenticated;

create or replace function public.assert_account_feature_access(
  p_account_id uuid,
  p_feature text
)
returns uuid
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_feature text := lower(trim(coalesce(p_feature, '')));
  v_required_plan text;
begin
  if p_account_id is null then
    raise exception 'Missing account id';
  end if;

  if nullif(v_feature, '') is null then
    raise exception 'Missing feature key';
  end if;

  if public.account_has_feature(p_account_id, v_feature) then
    return p_account_id;
  end if;

  v_required_plan := public.account_feature_required_plan(v_feature);
  raise exception 'Feature % requires % plan or higher for this account', v_feature, v_required_plan;
end;
$$;

comment on function public.assert_account_feature_access(uuid, text) is
  'Raises when the target account plan does not include the requested feature.';

revoke all on function public.assert_account_feature_access(uuid, text) from public;
grant execute on function public.assert_account_feature_access(uuid, text) to authenticated;

create or replace function public.account_usage_limit(
  p_account_id uuid,
  p_resource text
)
returns integer
language sql
security definer
stable
set search_path = public
as $$
  select case lower(trim(coalesce(p_resource, '')))
    when 'properties' then
      case public.account_subscription_plan(p_account_id)
        when 'pro' then null
        when 'growth' then 50
        else 10
      end
    else null
  end;
$$;

comment on function public.account_usage_limit(uuid, text) is
  'Returns the current billing-plan usage limit for the requested resource, or null for unlimited.';

revoke all on function public.account_usage_limit(uuid, text) from public;
grant execute on function public.account_usage_limit(uuid, text) to authenticated;

create or replace function public.assert_account_property_capacity(
  p_account_id uuid,
  p_exclude_property_id uuid default null
)
returns uuid
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_limit integer;
  v_count integer;
begin
  if p_account_id is null then
    raise exception 'Missing account id';
  end if;

  v_limit := public.account_usage_limit(p_account_id, 'properties');
  if v_limit is null then
    return p_account_id;
  end if;

  select count(*)
  into v_count
  from public.properties p
  where p.account_id = p_account_id
    and (p_exclude_property_id is null or p.id <> p_exclude_property_id);

  if coalesce(v_count, 0) >= v_limit then
    raise exception 'Plan limit reached: this account allows up to % properties', v_limit;
  end if;

  return p_account_id;
end;
$$;

comment on function public.assert_account_property_capacity(uuid, uuid) is
  'Raises when a property create/move would exceed the current billing-plan property cap.';

revoke all on function public.assert_account_property_capacity(uuid, uuid) from public;
grant execute on function public.assert_account_property_capacity(uuid, uuid) to authenticated;

create or replace function public.tg_enforce_property_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.account_id is null then
    raise exception 'Missing account id';
  end if;

  if tg_op = 'INSERT' then
    perform public.assert_account_property_capacity(new.account_id, null);
  elsif tg_op = 'UPDATE' and new.account_id is distinct from old.account_id then
    perform public.assert_account_property_capacity(new.account_id, old.id);
  end if;

  return new;
end;
$$;

comment on function public.tg_enforce_property_plan_limit() is
  'Trigger guard that enforces billing-plan property caps on property inserts and cross-account moves.';

drop trigger if exists trg_enforce_property_plan_limit on public.properties;
create trigger trg_enforce_property_plan_limit
before insert or update on public.properties
for each row
execute function public.tg_enforce_property_plan_limit();
