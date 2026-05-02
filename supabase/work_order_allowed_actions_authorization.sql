create or replace function public.work_order_allowed_actions_bulk(p_work_order_ids uuid[])
returns table(work_order_id uuid, actions text[])
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    wo.id as work_order_id,
    public.work_order_allowed_actions(wo.id) as actions
  from public.work_orders wo
  where wo.id = any(p_work_order_ids)
    and (
      public.is_account_member(wo.account_id)
      or exists (
        select 1
        from public.tenants t
        where t.user_id = auth.uid()
          and t.archived_at is null
          and t.status = any(array['active','accepted_pending_signing'])
          and t.property_id = wo.property_id
      )
    );
$$;

grant execute on function public.work_order_allowed_actions_bulk(uuid[]) to authenticated;
