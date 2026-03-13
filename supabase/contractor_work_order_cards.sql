-- Contractor-safe card data for mobile work-order list
-- Returns property label + issue summary for work orders assigned to auth.uid().

create or replace function public.contractor_work_order_cards(
  p_work_order_ids uuid[] default null
)
returns table (
  work_order_id uuid,
  property_label text,
  issue_title text,
  issue_description text,
  issue_priority text
)
language sql
security definer
set search_path = public
as $$
  select
    wo.id as work_order_id,
    trim(
      both ', '
      from concat(coalesce(p.address, ''), case when p.city is not null and p.city <> '' then ', ' || p.city else '' end)
    ) as property_label,
    mr.title as issue_title,
    mr.description as issue_description,
    mr.priority as issue_priority
  from public.work_orders wo
  left join public.properties p
    on p.id = wo.property_id
  left join public.maintenance_requests mr
    on mr.id = wo.maintenance_request_id
  where wo.contractor_user_id = auth.uid()
    and (p_work_order_ids is null or wo.id = any(p_work_order_ids));
$$;

grant execute on function public.contractor_work_order_cards(uuid[]) to authenticated;
