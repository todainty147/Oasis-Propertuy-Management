-- OASIS Operating Calendar
-- Adds operating_calendar_items for custom tasks, and get_operating_calendar RPC
-- that unions 7 source modules into a single chronological event stream.

begin;

-- ─── Custom calendar items ─────────────────────────────────────────────────────

create table if not exists public.operating_calendar_items (
  id           uuid        primary key default gen_random_uuid(),
  account_id   uuid        not null references public.accounts(id) on delete cascade,
  property_id  uuid        references public.properties(id) on delete set null,
  title        text        not null,
  notes        text,
  due_date     date        not null,
  status       text        not null default 'scheduled',
  urgency      text        not null default 'medium',
  created_by   uuid        references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint operating_calendar_items_status_check check (
    status in ('scheduled', 'due_soon', 'overdue', 'completed', 'blocked')
  ),
  constraint operating_calendar_items_urgency_check check (
    urgency in ('critical', 'high', 'medium', 'low')
  )
);

create index if not exists operating_calendar_items_account_due_idx
  on public.operating_calendar_items(account_id, due_date);

create index if not exists operating_calendar_items_property_idx
  on public.operating_calendar_items(property_id)
  where property_id is not null;

alter table public.operating_calendar_items enable row level security;

drop policy if exists "account_members_manage_calendar_items" on public.operating_calendar_items;
create policy "account_members_manage_calendar_items"
  on public.operating_calendar_items
  for all
  using (public.assert_manage_account_access(account_id) = account_id)
  with check (public.assert_manage_account_access(account_id) = account_id);

-- ─── RPC: get_operating_calendar ──────────────────────────────────────────────

drop function if exists public.get_operating_calendar(uuid, date, date, uuid, text, text, text);

create function public.get_operating_calendar(
  p_account_id    uuid,
  p_start_date    date,
  p_end_date      date,
  p_property_id   uuid  default null,
  p_source_module text  default null,
  p_urgency       text  default null,
  p_status        text  default null
)
returns table (
  id             uuid,
  source_module  text,
  title          text,
  due_date       date,
  status         text,
  urgency        text,
  property_id    uuid,
  property_label text,
  tenant_id      uuid,
  tenant_label   text,
  amount         numeric,
  link_path      text,
  notes          text
)
language sql
security definer
set search_path = public
as $$
  with
  authz as materialized (
    select public.assert_manage_account_access(p_account_id) as account_id
  ),

  -- Payments: non-paid rent due in window
  payment_rows as (
    select
      p.id,
      'payment'::text                                         as source_module,
      coalesce('Rent: ' || pr.address, 'Rent payment')       as title,
      p.due_date::date                                        as due_date,
      case
        when lower(coalesce(p.status, '')) = 'paid'          then 'completed'
        when lower(coalesce(p.status, '')) = 'overdue'
          or p.due_date::date < current_date                  then 'overdue'
        when p.due_date::date <= current_date + 7             then 'due_soon'
        else                                                       'scheduled'
      end                                                     as status,
      case
        when p.due_date::date < current_date - 30            then 'critical'
        when p.due_date::date < current_date
          or p.due_date::date <= current_date + 3             then 'high'
        when p.due_date::date <= current_date + 14            then 'medium'
        else                                                       'low'
      end                                                     as urgency,
      p.property_id,
      coalesce(pr.address, '—')                               as property_label,
      p.tenant_id,
      coalesce(t.name, '—')                                   as tenant_label,
      p.amount,
      '/finance'::text                                        as link_path,
      null::text                                              as notes
    from public.payments p
    cross join authz a
    left join public.properties pr on pr.id = p.property_id
    left join public.tenants t     on t.id  = p.tenant_id
    where p.account_id = a.account_id
      and lower(coalesce(p.status, '')) <> 'paid'
      and p.due_date::date between p_start_date and p_end_date
  ),

  -- Leases: expirations in window (excluding already-ended)
  lease_rows as (
    select
      l.id,
      'lease'::text                                           as source_module,
      coalesce('Lease expiry: ' || pr.address, 'Lease expiry') as title,
      l.lease_end_date::date                                  as due_date,
      case
        when l.renewal_status in ('renewed', 'ended')         then 'completed'
        when l.lease_end_date::date < current_date            then 'overdue'
        when l.lease_end_date::date <= current_date + 30      then 'due_soon'
        else                                                       'scheduled'
      end                                                     as status,
      case
        when l.lease_end_date::date < current_date            then 'critical'
        when l.lease_end_date::date <= current_date + 7       then 'high'
        when l.lease_end_date::date <= current_date + 30      then 'medium'
        else                                                       'low'
      end                                                     as urgency,
      l.property_id,
      coalesce(pr.address, '—')                               as property_label,
      l.tenant_id,
      coalesce(t.name, '—')                                   as tenant_label,
      null::numeric                                           as amount,
      '/tenants'::text                                        as link_path,
      l.notes
    from public.leases l
    cross join authz a
    left join public.properties pr on pr.id = l.property_id
    left join public.tenants t     on t.id  = l.tenant_id
    where l.account_id = a.account_id
      and l.renewal_status not in ('ended')
      and l.lease_end_date::date between p_start_date and p_end_date
  ),

  -- Compliance items: not waived, due in window
  compliance_rows as (
    select
      ci.id,
      'compliance'::text                                      as source_module,
      coalesce(ci.category, 'Compliance item')                as title,
      ci.due_date::date                                       as due_date,
      case
        when lower(coalesce(ci.status, '')) in ('complete', 'waived')
                                                              then 'completed'
        when ci.due_date::date < current_date                 then 'overdue'
        when ci.due_date::date <= current_date
          + coalesce(ci.reminder_window_days, 14)             then 'due_soon'
        else                                                       'scheduled'
      end                                                     as status,
      case
        when lower(coalesce(ci.status, '')) not in ('complete', 'waived')
          and ci.due_date::date < current_date - 30           then 'critical'
        when lower(coalesce(ci.status, '')) not in ('complete', 'waived')
          and ci.due_date::date < current_date                then 'high'
        when ci.due_date::date <= current_date + 14           then 'medium'
        else                                                       'low'
      end                                                     as urgency,
      ci.property_id,
      coalesce(pr.address, '—')                               as property_label,
      null::uuid                                              as tenant_id,
      null::text                                              as tenant_label,
      null::numeric                                           as amount,
      '/compliance/tax'::text                                 as link_path,
      null::text                                              as notes
    from public.compliance_items ci
    cross join authz a
    left join public.properties pr on pr.id = ci.property_id
    where ci.account_id = a.account_id
      and lower(coalesce(ci.status, '')) not in ('waived')
      and ci.due_date::date between p_start_date and p_end_date
  ),

  -- Maintenance requests: unresolved, created in window
  maintenance_rows as (
    select
      mr.id,
      'maintenance'::text                                     as source_module,
      coalesce(mr.title, 'Maintenance request')               as title,
      mr.created_at::date                                     as due_date,
      case
        when lower(coalesce(mr.status, '')) = 'resolved'      then 'completed'
        when lower(coalesce(mr.status, '')) = 'blocked'       then 'blocked'
        when lower(coalesce(mr.priority, '')) = 'urgent'      then 'due_soon'
        else                                                       'scheduled'
      end                                                     as status,
      case
        when lower(coalesce(mr.priority, '')) = 'urgent'
          and lower(coalesce(mr.status, '')) not in ('resolved', 'blocked')
                                                              then 'critical'
        when lower(coalesce(mr.priority, '')) = 'high'
          and lower(coalesce(mr.status, '')) not in ('resolved', 'blocked')
                                                              then 'high'
        when lower(coalesce(mr.priority, '')) = 'medium'      then 'medium'
        else                                                       'low'
      end                                                     as urgency,
      mr.property_id,
      coalesce(pr.address, '—')                               as property_label,
      null::uuid                                              as tenant_id,
      null::text                                              as tenant_label,
      null::numeric                                           as amount,
      '/maintenance-inbox'::text                              as link_path,
      mr.description                                          as notes
    from public.maintenance_requests mr
    cross join authz a
    left join public.properties pr on pr.id = mr.property_id
    where mr.account_id = a.account_id
      and lower(coalesce(mr.status, '')) not in ('resolved')
      and mr.created_at::date between p_start_date and p_end_date
  ),

  -- Work orders: open/pending acknowledgement in window
  work_order_rows as (
    select
      wo.id,
      'work_order'::text                                      as source_module,
      coalesce(
        'Work order: ' || wo.contractor_name,
        'Work order'
      )                                                       as title,
      coalesce(
        wo.acknowledgement_due_at::date,
        wo.created_at::date
      )                                                       as due_date,
      case
        when lower(coalesce(wo.status, '')) = 'completed'     then 'completed'
        when lower(coalesce(wo.acknowledgement_status, '')) = 'pending'
          and wo.acknowledgement_due_at < now()               then 'overdue'
        else                                                       'scheduled'
      end                                                     as status,
      case
        when lower(coalesce(wo.status, '')) not in ('completed')
          and wo.acknowledgement_due_at < now() - interval '3 days'
                                                              then 'critical'
        when lower(coalesce(wo.status, '')) not in ('completed')
          and wo.acknowledgement_due_at < now()               then 'high'
        else                                                       'medium'
      end                                                     as urgency,
      wo.property_id,
      coalesce(pr.address, '—')                               as property_label,
      null::uuid                                              as tenant_id,
      null::text                                              as tenant_label,
      wo.invoice_amount                                       as amount,
      '/maintenance-inbox'::text                              as link_path,
      null::text                                              as notes
    from public.work_orders wo
    cross join authz a
    left join public.properties pr on pr.id = wo.property_id
    where wo.account_id = a.account_id
      and lower(coalesce(wo.status, '')) not in ('completed', 'cancelled')
      and coalesce(
            wo.acknowledgement_due_at::date,
            wo.created_at::date
          ) between p_start_date and p_end_date
  ),

  -- Preventive maintenance tasks: active/overdue in window
  preventive_rows as (
    select
      pt.id,
      'preventive'::text                                      as source_module,
      coalesce(pt.title, 'Preventive maintenance')            as title,
      pt.next_due_date::date                                  as due_date,
      case
        when lower(coalesce(pt.status, '')) = 'completed'     then 'completed'
        when lower(coalesce(pt.status, '')) = 'paused'        then 'blocked'
        when pt.next_due_date::date < current_date            then 'overdue'
        when pt.next_due_date::date <= current_date + 14      then 'due_soon'
        else                                                       'scheduled'
      end                                                     as status,
      case
        when lower(coalesce(pt.status, '')) = 'active'
          and pt.next_due_date::date < current_date - 14      then 'critical'
        when lower(coalesce(pt.status, '')) = 'active'
          and pt.next_due_date::date < current_date           then 'high'
        when pt.next_due_date::date <= current_date + 14      then 'medium'
        else                                                       'low'
      end                                                     as urgency,
      pt.property_id,
      coalesce(pr.address, '—')                               as property_label,
      null::uuid                                              as tenant_id,
      null::text                                              as tenant_label,
      null::numeric                                           as amount,
      '/maintenance-inbox'::text                              as link_path,
      pt.notes
    from public.preventive_maintenance_tasks pt
    cross join authz a
    left join public.properties pr on pr.id = pt.property_id
    where pt.account_id = a.account_id
      and lower(coalesce(pt.status, '')) not in ('completed')
      and pt.next_due_date::date between p_start_date and p_end_date
  ),

  -- Custom calendar items
  custom_rows as (
    select
      oci.id,
      'custom'::text                                          as source_module,
      oci.title,
      oci.due_date::date                                      as due_date,
      case
        when lower(coalesce(oci.status, '')) in ('completed', 'blocked')
                                                              then oci.status
        when oci.due_date::date < current_date                then 'overdue'
        when oci.due_date::date <= current_date + 7           then 'due_soon'
        else coalesce(oci.status, 'scheduled')
      end                                                     as status,
      coalesce(oci.urgency, 'medium')                         as urgency,
      oci.property_id,
      coalesce(pr.address, '—')                               as property_label,
      null::uuid                                              as tenant_id,
      null::text                                              as tenant_label,
      null::numeric                                           as amount,
      null::text                                              as link_path,
      oci.notes
    from public.operating_calendar_items oci
    cross join authz a
    left join public.properties pr on pr.id = oci.property_id
    where oci.account_id = a.account_id
      and oci.due_date::date between p_start_date and p_end_date
  ),

  all_items as (
    select * from payment_rows
    union all
    select * from lease_rows
    union all
    select * from compliance_rows
    union all
    select * from maintenance_rows
    union all
    select * from work_order_rows
    union all
    select * from preventive_rows
    union all
    select * from custom_rows
  )

  select
    ai.id,
    ai.source_module,
    ai.title,
    ai.due_date,
    ai.status,
    ai.urgency,
    ai.property_id,
    ai.property_label,
    ai.tenant_id,
    ai.tenant_label,
    ai.amount,
    ai.link_path,
    ai.notes
  from all_items ai
  where
    (p_property_id   is null or ai.property_id   = p_property_id)
    and (p_source_module is null or ai.source_module = p_source_module)
    and (p_urgency       is null or ai.urgency       = p_urgency)
    and (p_status        is null or ai.status        = p_status)
  order by
    ai.due_date asc,
    case ai.urgency
      when 'critical' then 1
      when 'high'     then 2
      when 'medium'   then 3
      else                 4
    end,
    ai.source_module
$$;

grant execute on function public.get_operating_calendar(uuid, date, date, uuid, text, text, text)
  to authenticated;

commit;
