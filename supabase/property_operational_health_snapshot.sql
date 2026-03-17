drop function if exists public.property_operational_health_snapshot(uuid, uuid, integer);

create function public.property_operational_health_snapshot(
  p_account_id uuid,
  p_property_id uuid default null,
  p_limit integer default 200
)
returns table (
  property_id uuid,
  property_label text,
  score integer,
  category text,
  reasons jsonb,
  overdue_rent_amount numeric,
  open_request_count bigint,
  active_work_order_count bigint,
  stalled_repair_count bigint,
  ack_overdue_count bigint,
  long_running_repair_count bigint,
  requests_90_count bigint,
  overdue_preventive_count bigint,
  due_soon_preventive_count bigint,
  overdue_compliance_count bigint,
  due_soon_compliance_count bigint,
  missing_compliance_count bigint,
  expired_lease_count bigint,
  expiring_lease_count bigint,
  renewal_in_progress_count bigint,
  recent_operating_expenses numeric,
  recent_maintenance_cost numeric,
  tenant_count bigint
)
language sql
security definer
set search_path = public
as $$
  with recommended_compliance(category) as (
    values
      ('gas_safety'::text),
      ('epc_expiry'::text),
      ('insurance_renewal'::text),
      ('electrical_inspection'::text),
      ('fire_alarm_inspection'::text),
      ('smoke_alarm_check'::text),
      ('landlord_licensing'::text)
  ),
  scoped_properties as (
    select
      p.id,
      coalesce(p.address, '') as property_label,
      coalesce(p.rent, 0)::numeric as monthly_rent
    from public.properties p
    where p.account_id = p_account_id
      and (p_property_id is null or p.id = p_property_id)
    order by p.address asc
    limit greatest(coalesce(p_limit, 200), 1)
  ),
  payment_signals as (
    select
      sp.id as property_id,
      coalesce(sum(
        case
          when pay.paid_at is null
           and (
             lower(coalesce(pay.status, '')) in ('overdue', 'zaległe', 'zalegle')
             or (pay.due_date is not null and pay.due_date < current_date)
           )
          then coalesce(pay.amount, 0)
          else 0
        end
      ), 0)::numeric as overdue_rent_amount
    from scoped_properties sp
    left join public.payments pay
      on pay.account_id = p_account_id
     and pay.property_id = sp.id
    group by sp.id
  ),
  request_signals as (
    select
      sp.id as property_id,
      count(*) filter (
        where lower(coalesce(r.status, '')) not in ('closed', 'zamkniete', 'zamknięte')
      )::bigint as open_request_count,
      count(*) filter (
        where r.created_at >= now() - interval '90 days'
      )::bigint as requests_90_count
    from scoped_properties sp
    left join public.maintenance_requests r
      on r.account_id = p_account_id
     and r.property_id = sp.id
    group by sp.id
  ),
  work_order_signals as (
    select
      sp.id as property_id,
      count(*) filter (
        where lower(coalesce(w.status, '')) not in ('completed', 'cancelled', 'closed', 'zakończone', 'zakonczone', 'anulowane')
      )::bigint as active_work_order_count,
      count(*) filter (
        where lower(coalesce(w.status, '')) in ('in_progress', 'w trakcie', 'blocked', 'zablokowane')
          and coalesce(w.updated_at, w.created_at) <= now() - interval '5 days'
      )::bigint as stalled_repair_count,
      count(*) filter (
        where lower(coalesce(w.status, '')) not in ('completed', 'cancelled', 'closed', 'zakończone', 'zakonczone', 'anulowane')
          and coalesce(lower(w.acknowledgement_status), 'pending') not in ('acknowledged', 'not_required')
          and w.acknowledgement_due_at is not null
          and w.acknowledgement_due_at < now()
      )::bigint as ack_overdue_count,
      count(*) filter (
        where lower(coalesce(w.status, '')) not in ('completed', 'cancelled', 'closed', 'zakończone', 'zakonczone', 'anulowane')
          and w.created_at <= now() - interval '14 days'
      )::bigint as long_running_repair_count,
      coalesce(sum(
        case
          when coalesce(w.updated_at, w.created_at) >= now() - interval '90 days'
          then coalesce(w.invoice_amount, 0)
          else 0
        end
      ), 0)::numeric as recent_maintenance_cost
    from scoped_properties sp
    left join public.work_orders w
      on w.account_id = p_account_id
     and w.property_id = sp.id
    group by sp.id
  ),
  preventive_signals as (
    select
      sp.id as property_id,
      count(*) filter (
        where lower(coalesce(t.status, '')) = 'active'
          and t.next_due_date < current_date
      )::bigint as overdue_preventive_count,
      count(*) filter (
        where lower(coalesce(t.status, '')) = 'active'
          and t.next_due_date >= current_date
          and t.next_due_date <= current_date + 14
      )::bigint as due_soon_preventive_count
    from scoped_properties sp
    left join public.preventive_maintenance_tasks t
      on t.account_id = p_account_id
     and t.property_id = sp.id
    group by sp.id
  ),
  compliance_signals as (
    select
      sp.id as property_id,
      count(*) filter (
        where lower(coalesce(c.status, '')) not in ('completed', 'cancelled')
          and c.due_date < current_date
      )::bigint as overdue_compliance_count,
      count(*) filter (
        where lower(coalesce(c.status, '')) not in ('completed', 'cancelled')
          and c.due_date >= current_date
          and c.due_date <= current_date + greatest(coalesce(c.reminder_window_days, 30), 0)
      )::bigint as due_soon_compliance_count
    from scoped_properties sp
    left join public.compliance_items c
      on c.account_id = p_account_id
     and c.property_id = sp.id
    group by sp.id
  ),
  missing_compliance_signals as (
    select
      sp.id as property_id,
      case
        when count(ci.id) filter (
          where lower(coalesce(ci.status, '')) not in ('completed', 'cancelled')
        ) = 0 then 1::bigint
        else greatest(
          count(rc.category)::bigint -
          count(distinct case
            when lower(coalesce(ci.status, '')) not in ('completed', 'cancelled') then lower(coalesce(ci.category, ''))
            else null
          end)::bigint,
          0::bigint
        )
      end as missing_compliance_count
    from scoped_properties sp
    cross join recommended_compliance rc
    left join public.compliance_items ci
      on ci.account_id = p_account_id
     and ci.property_id = sp.id
    group by sp.id
  ),
  lease_signals as (
    select
      sp.id as property_id,
      count(*) filter (
        where (
          lower(coalesce(l.renewal_status, '')) = 'ended'
          or l.lease_end_date < current_date
        )
        and lower(coalesce(l.renewal_status, '')) <> 'renewed'
      )::bigint as expired_lease_count,
      count(*) filter (
        where lower(coalesce(l.renewal_status, '')) not in ('ended', 'renewed')
          and l.lease_end_date >= current_date
          and l.lease_end_date <= current_date + 60
      )::bigint as expiring_lease_count,
      count(*) filter (
        where lower(coalesce(l.renewal_status, '')) = 'renewal_in_progress'
      )::bigint as renewal_in_progress_count
    from scoped_properties sp
    left join public.leases l
      on l.account_id = p_account_id
     and l.property_id = sp.id
    group by sp.id
  ),
  tenant_signals as (
    select
      sp.id as property_id,
      count(t.id)::bigint as tenant_count
    from scoped_properties sp
    left join public.tenants t
      on t.account_id = p_account_id
     and t.property_id = sp.id
    group by sp.id
  ),
  expense_signals as (
    select
      sp.id as property_id,
      coalesce(sum(
        case
          when e.expense_date >= current_date - 90 then coalesce(e.amount, 0)
          else 0
        end
      ), 0)::numeric as recent_operating_expenses
    from scoped_properties sp
    left join public.property_operating_expenses e
      on e.account_id = p_account_id
     and e.property_id = sp.id
    group by sp.id
  ),
  assembled as (
    select
      sp.id as property_id,
      sp.property_label,
      sp.monthly_rent,
      coalesce(pay.overdue_rent_amount, 0)::numeric as overdue_rent_amount,
      coalesce(req.open_request_count, 0)::bigint as open_request_count,
      coalesce(wo.active_work_order_count, 0)::bigint as active_work_order_count,
      coalesce(wo.stalled_repair_count, 0)::bigint as stalled_repair_count,
      coalesce(wo.ack_overdue_count, 0)::bigint as ack_overdue_count,
      coalesce(wo.long_running_repair_count, 0)::bigint as long_running_repair_count,
      coalesce(req.requests_90_count, 0)::bigint as requests_90_count,
      coalesce(pm.overdue_preventive_count, 0)::bigint as overdue_preventive_count,
      coalesce(pm.due_soon_preventive_count, 0)::bigint as due_soon_preventive_count,
      coalesce(cs.overdue_compliance_count, 0)::bigint as overdue_compliance_count,
      coalesce(cs.due_soon_compliance_count, 0)::bigint as due_soon_compliance_count,
      coalesce(mc.missing_compliance_count, 0)::bigint as missing_compliance_count,
      coalesce(ls.expired_lease_count, 0)::bigint as expired_lease_count,
      coalesce(ls.expiring_lease_count, 0)::bigint as expiring_lease_count,
      coalesce(ls.renewal_in_progress_count, 0)::bigint as renewal_in_progress_count,
      coalesce(es.recent_operating_expenses, 0)::numeric as recent_operating_expenses,
      coalesce(wo.recent_maintenance_cost, 0)::numeric as recent_maintenance_cost,
      coalesce(ts.tenant_count, 0)::bigint as tenant_count
    from scoped_properties sp
    left join payment_signals pay on pay.property_id = sp.id
    left join request_signals req on req.property_id = sp.id
    left join work_order_signals wo on wo.property_id = sp.id
    left join preventive_signals pm on pm.property_id = sp.id
    left join compliance_signals cs on cs.property_id = sp.id
    left join missing_compliance_signals mc on mc.property_id = sp.id
    left join lease_signals ls on ls.property_id = sp.id
    left join tenant_signals ts on ts.property_id = sp.id
    left join expense_signals es on es.property_id = sp.id
  ),
  scored as (
    select
      a.*,
      greatest(
        0,
        100
        - (
          case
            when a.overdue_rent_amount > 0 and a.monthly_rent > 0 and a.overdue_rent_amount >= a.monthly_rent then 30
            when a.overdue_rent_amount > 0 then 22
            else 0
          end
          + case
              when (a.open_request_count + a.active_work_order_count) >= 4 then 10
              when (a.open_request_count + a.active_work_order_count) >= 2 then 6
              when (a.open_request_count + a.active_work_order_count) > 0 then 3
              else 0
            end
          + least(18, a.stalled_repair_count * 9)
          + least(16, a.ack_overdue_count * 8)
          + least(12, a.long_running_repair_count * 6)
          + case when a.requests_90_count >= 3 then 8 else 0 end
          + case
              when a.overdue_preventive_count > 0 then 8
              when a.due_soon_preventive_count > 0 then 3
              else 0
            end
          + case
              when a.overdue_compliance_count > 0 then 12
              when a.due_soon_compliance_count > 0 then 4
              else 0
            end
          + case when a.missing_compliance_count > 0 then 6 else 0 end
          + case
              when a.expired_lease_count > 0 then 15
              when a.expiring_lease_count > 0 then 6
              when a.renewal_in_progress_count > 0 then 4
              else 0
            end
          + case
              when a.monthly_rent > 0 and (a.recent_operating_expenses + a.recent_maintenance_cost) >= (a.monthly_rent * 2) then 6
              else 0
            end
          + case when a.tenant_count = 0 then 4 else 0 end
        )
      )::integer as score
    from assembled a
  )
  select
    s.property_id,
    s.property_label,
    s.score,
    case
      when s.score >= 85 then 'healthy'
      when s.score >= 60 then 'attention_needed'
      else 'high_risk'
    end as category,
    (
      select coalesce(jsonb_agg(reason order by (reason->>'penalty')::int desc), '[]'::jsonb)
      from (
        select jsonb_build_object('key', 'overdue_rent', 'penalty',
          case
            when s.overdue_rent_amount > 0 and s.monthly_rent > 0 and s.overdue_rent_amount >= s.monthly_rent then 30
            else 22
          end,
          'amount', s.overdue_rent_amount
        ) as reason
        where s.overdue_rent_amount > 0

        union all
        select jsonb_build_object('key', 'maintenance_pressure', 'penalty',
          case
            when (s.open_request_count + s.active_work_order_count) >= 4 then 10
            when (s.open_request_count + s.active_work_order_count) >= 2 then 6
            else 3
          end,
          'count', (s.open_request_count + s.active_work_order_count)
        )
        where (s.open_request_count + s.active_work_order_count) > 0

        union all
        select jsonb_build_object('key', 'stalled_repairs', 'penalty', least(18, s.stalled_repair_count * 9), 'count', s.stalled_repair_count)
        where s.stalled_repair_count > 0

        union all
        select jsonb_build_object('key', 'contractor_ack_overdue', 'penalty', least(16, s.ack_overdue_count * 8), 'count', s.ack_overdue_count)
        where s.ack_overdue_count > 0

        union all
        select jsonb_build_object('key', 'long_running_repairs', 'penalty', least(12, s.long_running_repair_count * 6), 'count', s.long_running_repair_count)
        where s.long_running_repair_count > 0

        union all
        select jsonb_build_object('key', 'repeat_repairs', 'penalty', 8, 'count', s.requests_90_count)
        where s.requests_90_count >= 3

        union all
        select jsonb_build_object('key', 'preventive_overdue', 'penalty', 8, 'count', s.overdue_preventive_count)
        where s.overdue_preventive_count > 0

        union all
        select jsonb_build_object('key', 'preventive_due_soon', 'penalty', 3, 'count', s.due_soon_preventive_count)
        where s.overdue_preventive_count = 0 and s.due_soon_preventive_count > 0

        union all
        select jsonb_build_object('key', 'compliance_overdue', 'penalty', 12, 'count', s.overdue_compliance_count)
        where s.overdue_compliance_count > 0

        union all
        select jsonb_build_object('key', 'compliance_due_soon', 'penalty', 4, 'count', s.due_soon_compliance_count)
        where s.overdue_compliance_count = 0 and s.due_soon_compliance_count > 0

        union all
        select jsonb_build_object('key', 'compliance_missing_setup', 'penalty', 6, 'count', s.missing_compliance_count)
        where s.missing_compliance_count > 0

        union all
        select jsonb_build_object('key', 'lease_expired', 'penalty', 15)
        where s.expired_lease_count > 0

        union all
        select jsonb_build_object('key', 'lease_expiring', 'penalty', 6)
        where s.expired_lease_count = 0 and s.expiring_lease_count > 0

        union all
        select jsonb_build_object('key', 'lease_renewal_in_progress', 'penalty', 4)
        where s.expired_lease_count = 0 and s.expiring_lease_count = 0 and s.renewal_in_progress_count > 0

        union all
        select jsonb_build_object('key', 'operating_cost_pressure', 'penalty', 6, 'amount', (s.recent_operating_expenses + s.recent_maintenance_cost))
        where s.monthly_rent > 0 and (s.recent_operating_expenses + s.recent_maintenance_cost) >= (s.monthly_rent * 2)

        union all
        select jsonb_build_object('key', 'vacant_property', 'penalty', 4)
        where s.tenant_count = 0
      ) reasons(reason)
    ) as reasons,
    s.overdue_rent_amount,
    s.open_request_count,
    s.active_work_order_count,
    s.stalled_repair_count,
    s.ack_overdue_count,
    s.long_running_repair_count,
    s.requests_90_count,
    s.overdue_preventive_count,
    s.due_soon_preventive_count,
    s.overdue_compliance_count,
    s.due_soon_compliance_count,
    s.missing_compliance_count,
    s.expired_lease_count,
    s.expiring_lease_count,
    s.renewal_in_progress_count,
    s.recent_operating_expenses,
    s.recent_maintenance_cost,
    s.tenant_count
  from scored s
  order by s.score asc, s.property_label asc;
$$;

grant execute on function public.property_operational_health_snapshot(uuid, uuid, integer) to authenticated;
