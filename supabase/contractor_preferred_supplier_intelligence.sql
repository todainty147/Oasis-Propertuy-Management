begin;

create table if not exists public.contractor_preferred_suppliers (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  contractor_id uuid not null references public.contractors(id) on delete cascade,
  preferred boolean not null default true,
  reason text,
  marked_by uuid default auth.uid() references auth.users(id) on delete set null,
  marked_at timestamptz not null default now(),
  removed_by uuid references auth.users(id) on delete set null,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contractor_preferred_suppliers_unique unique (account_id, contractor_id),
  constraint contractor_preferred_suppliers_reason_length check (reason is null or length(reason) <= 500)
);

create index if not exists contractor_preferred_suppliers_account_idx
  on public.contractor_preferred_suppliers(account_id, preferred, marked_at desc);
create index if not exists contractor_preferred_suppliers_contractor_idx
  on public.contractor_preferred_suppliers(contractor_id);

create or replace function public.contractor_preferred_suppliers_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_contractor_preferred_suppliers_updated_at on public.contractor_preferred_suppliers;
create trigger trg_contractor_preferred_suppliers_updated_at
before update on public.contractor_preferred_suppliers
for each row execute function public.contractor_preferred_suppliers_set_updated_at();

alter table public.contractor_preferred_suppliers enable row level security;

drop policy if exists contractor_preferred_suppliers_select_managers on public.contractor_preferred_suppliers;
create policy contractor_preferred_suppliers_select_managers
on public.contractor_preferred_suppliers
for select
to authenticated
using (public.user_can_manage_account(account_id));

drop policy if exists contractor_preferred_suppliers_write_managers on public.contractor_preferred_suppliers;

revoke all on public.contractor_preferred_suppliers from anon;
revoke all on public.contractor_preferred_suppliers from authenticated;
grant select on public.contractor_preferred_suppliers to authenticated;

create or replace function public.set_contractor_preferred_supplier(
  p_account_id uuid,
  p_contractor_id uuid,
  p_preferred boolean default true,
  p_reason text default null
)
returns public.contractor_preferred_suppliers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contractor public.contractors;
  v_row public.contractor_preferred_suppliers;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  perform public.assert_manage_account_access(p_account_id);

  select *
    into v_contractor
  from public.contractors c
  where c.id = p_contractor_id
    and c.account_id = p_account_id;

  if not found then
    raise exception 'Contractor not found for this account' using errcode = 'P0002';
  end if;

  if coalesce(v_reason, '') <> '' and length(v_reason) > 500 then
    raise exception 'Preferred supplier reason is too long';
  end if;

  insert into public.contractor_preferred_suppliers(
    account_id,
    contractor_id,
    preferred,
    reason,
    marked_by,
    marked_at,
    removed_by,
    removed_at
  )
  values (
    p_account_id,
    p_contractor_id,
    coalesce(p_preferred, true),
    v_reason,
    case when coalesce(p_preferred, true) then auth.uid() else null end,
    case when coalesce(p_preferred, true) then now() else now() end,
    case when coalesce(p_preferred, true) then null else auth.uid() end,
    case when coalesce(p_preferred, true) then null else now() end
  )
  on conflict (account_id, contractor_id) do update set
    preferred = excluded.preferred,
    reason = case when excluded.preferred then excluded.reason else public.contractor_preferred_suppliers.reason end,
    marked_by = case when excluded.preferred then auth.uid() else public.contractor_preferred_suppliers.marked_by end,
    marked_at = case when excluded.preferred then now() else public.contractor_preferred_suppliers.marked_at end,
    removed_by = case when excluded.preferred then null else auth.uid() end,
    removed_at = case when excluded.preferred then null else now() end,
    updated_at = now()
  returning * into v_row;

  begin
    perform public.log_security_event(
      p_account_id,
      case when v_row.preferred then 'preferred_supplier_marked' else 'preferred_supplier_removed' end,
      'contractor',
      p_contractor_id,
      jsonb_build_object('contractor_id', p_contractor_id, 'preferred', v_row.preferred)
    );
  exception when others then
    null;
  end;

  return v_row;
end;
$$;

create or replace function public.contractor_performance_summary(
  p_account_id uuid,
  p_property_id uuid default null
)
returns table (
  contractor_id uuid,
  account_id uuid,
  name text,
  phone text,
  email text,
  user_id uuid,
  active boolean,
  preferred boolean,
  jobs_assigned integer,
  jobs_completed integer,
  quotes_submitted integer,
  quotes_approved integer,
  average_rating numeric,
  would_use_again_score numeric,
  last_used_at timestamptz,
  average_quote_response_hours numeric,
  average_completion_hours numeric,
  common_job_categories text[],
  used_at_property boolean,
  recommendation_rank integer,
  recommendation_reasons text[]
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_manage_account_access(p_account_id);

  return query
  with base as (
    select
      c.id as contractor_id,
      c.account_id,
      c.name,
      c.phone,
      c.email,
      c.user_id,
      coalesce(c.active, true) as active,
      coalesce(cps.preferred, false) as preferred
    from public.contractors c
    left join public.contractor_preferred_suppliers cps
      on cps.account_id = c.account_id
     and cps.contractor_id = c.id
     and cps.preferred = true
    where c.account_id = p_account_id
  ),
  work_stats as (
    select
      c.id as contractor_id,
      count(wo.id)::integer as jobs_assigned,
      count(*) filter (where wo.status = 'completed')::integer as jobs_completed,
      max(coalesce(wo.updated_at, wo.created_at)) as last_used_at,
      avg(extract(epoch from (coalesce(wo.updated_at, wo.created_at) - wo.created_at)) / 3600)
        filter (where wo.status = 'completed') as average_completion_hours,
      bool_or(wo.property_id = p_property_id) filter (where p_property_id is not null) as used_at_property,
      array[]::text[] as common_job_categories
    from public.contractors c
    left join public.work_orders wo
      on wo.account_id = c.account_id
     and (
       wo.contractor_id = c.id
       or (wo.contractor_id is null and wo.contractor_user_id = c.user_id)
     )
    where c.account_id = p_account_id
    group by c.id
  ),
  quote_stats as (
    select
      c.id as contractor_id,
      count(fin.id) filter (where fin.quote_status in ('submitted', 'approved', 'rejected'))::integer as quotes_submitted,
      count(fin.id) filter (where fin.quote_status = 'approved')::integer as quotes_approved,
      avg(extract(epoch from (fin.quote_submitted_at - wo.created_at)) / 3600)
        filter (where fin.quote_submitted_at is not null and fin.quote_submitted_at >= wo.created_at) as average_quote_response_hours
    from public.contractors c
    left join public.work_orders wo
      on wo.account_id = c.account_id
     and (
       wo.contractor_id = c.id
       or (wo.contractor_id is null and wo.contractor_user_id = c.user_id)
     )
    left join public.work_order_financials fin
      on fin.work_order_id = wo.id
     and fin.account_id = wo.account_id
    where c.account_id = p_account_id
    group by c.id
  ),
  rating_stats as (
    select
      c.id as contractor_id,
      avg(cr.rating)::numeric(4,2) as average_rating,
      avg(case when cr.rating >= 4 then 1 else 0 end)::numeric(4,2) as would_use_again_score
    from public.contractors c
    left join public.contractor_ratings cr
      on cr.account_id = c.account_id
     and cr.contractor_user_id = c.user_id
    where c.account_id = p_account_id
    group by c.id
  )
  select
    b.contractor_id,
    b.account_id,
    b.name,
    b.phone,
    b.email,
    b.user_id,
    b.active,
    b.preferred,
    coalesce(ws.jobs_assigned, 0),
    coalesce(ws.jobs_completed, 0),
    coalesce(qs.quotes_submitted, 0),
    coalesce(qs.quotes_approved, 0),
    rs.average_rating,
    rs.would_use_again_score,
    ws.last_used_at,
    qs.average_quote_response_hours,
    ws.average_completion_hours,
    coalesce(ws.common_job_categories, array[]::text[]),
    coalesce(ws.used_at_property, false),
    (
      case when b.preferred then 0 else 40 end
      + case when coalesce(ws.used_at_property, false) then 0 else 10 end
      + case when coalesce(rs.average_rating, 0) >= 4 then 0 else 20 end
      + case when ws.last_used_at is not null and ws.last_used_at >= now() - interval '180 days' then 0 else 30 end
      + case when b.active then 0 else 1000 end
    )::integer as recommendation_rank,
    array_remove(array[
      case when b.preferred then 'preferred' end,
      case when coalesce(ws.used_at_property, false) then 'used_at_property' end,
      case when coalesce(rs.average_rating, 0) >= 4 then 'highly_rated' end,
      case when ws.last_used_at is not null and ws.last_used_at >= now() - interval '180 days' then 'recently_used' end
    ]::text[], null) as recommendation_reasons
  from base b
  left join work_stats ws on ws.contractor_id = b.contractor_id
  left join quote_stats qs on qs.contractor_id = b.contractor_id
  left join rating_stats rs on rs.contractor_id = b.contractor_id
  order by recommendation_rank asc, lower(b.name) asc, b.contractor_id asc;
end;
$$;

create or replace function public.recommended_contractors_for_work_order(
  p_account_id uuid,
  p_property_id uuid default null,
  p_limit integer default 8
)
returns table (
  contractor_id uuid,
  name text,
  preferred boolean,
  average_rating numeric,
  jobs_completed integer,
  used_at_property boolean,
  recommendation_rank integer,
  recommendation_reasons text[]
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_manage_account_access(p_account_id);

  return query
  select
    s.contractor_id,
    s.name,
    s.preferred,
    s.average_rating,
    s.jobs_completed,
    s.used_at_property,
    s.recommendation_rank,
    s.recommendation_reasons
  from public.contractor_performance_summary(p_account_id, p_property_id) s
  where s.active = true
  order by s.recommendation_rank asc, lower(s.name) asc, s.contractor_id asc
  limit greatest(1, least(coalesce(p_limit, 8), 25));
end;
$$;

revoke all on function public.set_contractor_preferred_supplier(uuid, uuid, boolean, text) from public;
grant execute on function public.set_contractor_preferred_supplier(uuid, uuid, boolean, text) to authenticated;

revoke all on function public.contractor_performance_summary(uuid, uuid) from public;
grant execute on function public.contractor_performance_summary(uuid, uuid) to authenticated;

revoke all on function public.recommended_contractors_for_work_order(uuid, uuid, integer) from public;
grant execute on function public.recommended_contractors_for_work_order(uuid, uuid, integer) to authenticated;

commit;
