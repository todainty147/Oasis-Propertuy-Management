-- Work order audit log security fixes
--
-- 1. Tenants should NOT be able to read the audit log (internal management data).
-- 2. Direct inserts must be blocked — only SECURITY DEFINER RPCs may write audit entries.
-- 3. work_orders_notify_trg_fn must be SECURITY DEFINER so contractor updates can
--    call create_notifications_system without requiring the contractor to hold that privilege.

-- Drop tenant SELECT policies on audit log
DROP POLICY IF EXISTS wo_audit_select_tenant ON public.work_order_audit_log;

-- Replace wo_audit_read: remove the property-tenant join clause, keep can_access_account
DROP POLICY IF EXISTS wo_audit_read ON public.work_order_audit_log;
CREATE POLICY wo_audit_read ON public.work_order_audit_log
  FOR SELECT
  USING (public.can_access_account(account_id));

-- Drop direct INSERT policy — audit entries are written only by SECURITY DEFINER functions
DROP POLICY IF EXISTS wo_audit_insert_actor_member_or_contractor ON public.work_order_audit_log;

-- Make the work orders notification trigger SECURITY DEFINER so any authenticated
-- user's UPDATE on work_orders (e.g. contractor_update_work_order) can fire the
-- notification without needing direct EXECUTE privilege on create_notifications_system.
CREATE OR REPLACE FUNCTION public.work_orders_notify_trg_fn() RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
declare
  v_members uuid[];
  v_contractor uuid;
  v_label text;
  v_title text;
  v_body text;
  v_window int := 60;
  v_uid uuid;
begin
  if new.account_id is null then
    return new;
  end if;

  select array_agg(am.user_id)
    into v_members
  from public.account_members am
  where am.account_id = new.account_id;

  v_contractor := new.contractor_user_id;

  if tg_op = 'INSERT' then
    if v_members is not null and array_length(v_members, 1) is not null then
      foreach v_uid in array v_members loop
        if not public.should_throttle_notification(
          new.account_id, v_uid,
          'work_order_created',
          'work_order', new.id,
          v_window
        ) then
          perform public.create_notifications_system(
            new.account_id,
            array[v_uid],
            'work_order_created',
            'New work order created',
            'A new work order has been created.',
            'work_order',
            new.id,
            '/work-orders/' || new.id::text,
            jsonb_build_object(
              'work_order_id', new.id,
              'property_id', new.property_id,
              'maintenance_request_id', new.maintenance_request_id,
              'status', new.status
            )
          );
        end if;
      end loop;
    end if;

    if v_contractor is not null then
      if not public.should_throttle_notification(
        new.account_id, v_contractor,
        'work_order_assigned',
        'work_order', new.id,
        v_window
      ) then
        perform public.create_notifications_system(
          new.account_id,
          array[v_contractor],
          'work_order_assigned',
          'You have a new work order',
          'You have been assigned a new work order.',
          'work_order',
          new.id,
          '/contractor/jobs/' || new.id::text,
          jsonb_build_object(
            'work_order_id', new.id,
            'property_id', new.property_id,
            'status', new.status
          )
        );
      end if;
    end if;

    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.contractor_user_id is distinct from old.contractor_user_id
       and new.contractor_user_id is not null then
      if not public.should_throttle_notification(
        new.account_id, new.contractor_user_id,
        'work_order_assigned',
        'work_order', new.id,
        v_window
      ) then
        perform public.create_notifications_system(
          new.account_id,
          array[new.contractor_user_id],
          'work_order_assigned',
          'You have a new work order',
          'You have been assigned a work order.',
          'work_order',
          new.id,
          '/contractor/jobs/' || new.id::text,
          jsonb_build_object(
            'work_order_id', new.id,
            'property_id', new.property_id,
            'status', new.status
          )
        );
      end if;
    end if;

    if new.status is distinct from old.status then
      select d.label
        into v_label
      from public.work_order_status_definitions d
      where d.status = new.status
      limit 1;

      v_label := coalesce(nullif(v_label, ''), new.status);
      v_title := 'Work order status changed';
      v_body  := 'New status: ' || v_label;

      if v_members is not null and array_length(v_members, 1) is not null then
        foreach v_uid in array v_members loop
          if not public.should_throttle_notification(
            new.account_id, v_uid,
            'work_order_status_changed',
            'work_order', new.id,
            v_window
          ) then
            perform public.create_notifications_system(
              new.account_id,
              array[v_uid],
              'work_order_status_changed',
              v_title,
              v_body,
              'work_order',
              new.id,
              '/work-orders/' || new.id::text,
              jsonb_build_object(
                'work_order_id', new.id,
                'property_id', new.property_id,
                'old_status', old.status,
                'new_status', new.status,
                'new_status_label', v_label
              )
            );
          end if;
        end loop;
      end if;

      if new.contractor_user_id is not null then
        if not public.should_throttle_notification(
          new.account_id, new.contractor_user_id,
          'work_order_status_changed',
          'work_order', new.id,
          v_window
        ) then
          perform public.create_notifications_system(
            new.account_id,
            array[new.contractor_user_id],
            'work_order_status_changed',
            v_title,
            v_body,
            'work_order',
            new.id,
            '/contractor/jobs/' || new.id::text,
            jsonb_build_object(
              'work_order_id', new.id,
              'property_id', new.property_id,
              'old_status', old.status,
              'new_status', new.status,
              'new_status_label', v_label
            )
          );
        end if;
      end if;
    end if;

    return new;
  end if;

  return new;
end;
$$;
