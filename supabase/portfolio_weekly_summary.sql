create or replace function public.portfolio_weekly_summary(p_account_id uuid)
returns table (
  occupancy_rate integer,
  open_requests bigint,
  waiting_over_48h bigint,
  overdue_balance numeric
)
language sql
security definer
set search_path = public
as $$
  with props as (
    select p.id
    from properties p
    where p.account_id = p_account_id
  ),
  occupied as (
    select p.id
    from props p
    where exists (
      select 1 from tenants t where t.property_id = p.id
    )
  ),
  req as (
    select status, created_at
    from maintenance_requests
    where account_id = p_account_id
  ),
  pay as (
    select amount, status, due_date
    from payments
    where account_id = p_account_id
  )
  select
    case
      when (select count(*) from props) = 0 then 0
      else round(((select count(*) from occupied)::numeric / (select count(*) from props)::numeric) * 100)::int
    end as occupancy_rate,
    (select count(*) from req where lower(coalesce(status, '')) <> 'closed') as open_requests,
    (
      select count(*)
      from req
      where lower(coalesce(status, '')) = 'waiting'
        and created_at <= now() - interval '48 hours'
    ) as waiting_over_48h,
    (
      select coalesce(sum(amount), 0)
      from pay
      where (
          lower(coalesce(status, '')) in ('overdue', 'zalegle', 'zaległe', 'due', 'oczekujace', 'oczekujące', 'pending')
        )
        and (
          lower(coalesce(status, '')) in ('overdue', 'zalegle', 'zaległe')
          or due_date < now()::date
        )
    ) as overdue_balance;
$$;

grant execute on function public.portfolio_weekly_summary(uuid) to authenticated;
