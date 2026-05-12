-- ============================================================================
-- Rent Reminders RPC
-- Generates system notifications for upcoming expected charges and overdue
-- expected charges that have not been acted on.
--
-- Guardrails:
--   • Never writes to ledger_entries.
--   • Uses the existing notify_account_event() side-effect RPC for notifications.
--   • idempotent: calling twice in the same day produces no duplicate notifications
--     (deduped by the notifications table unique index on account+type+source_id).
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- notify_upcoming_rent_charges
-- Called by a scheduled job or manually to fire upcoming-charge notifications.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.notify_upcoming_rent_charges(
  p_account_id    uuid,
  p_days_ahead    integer default 7   -- notify for charges due within this many days
)
returns integer                         -- count of notifications created
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id  uuid;
  v_count       integer := 0;
  v_charge      record;
begin
  v_account_id := public.assert_manage_account_access(p_account_id);

  for v_charge in
    select
      ec.id,
      ec.amount,
      ec.currency,
      ec.due_date,
      ec.tenant_id,
      coalesce(t.name, 'tenant') as tenant_name,
      coalesce(pr.address, 'property')  as property_address
    from public.expected_charges ec
    left join public.tenants t on t.id = ec.tenant_id
    left join public.properties pr on pr.id = ec.property_id
    where ec.account_id = v_account_id
      and ec.status = 'scheduled'
      and ec.due_date between current_date and current_date + (p_days_ahead || ' days')::interval
      -- Skip charges that already have a notification from today
      and not exists (
        select 1
        from public.notifications n
        where n.account_id = v_account_id
          and n.notification_type = 'rent_charge_upcoming'
          and n.source_id = ec.id::text
          and n.created_at >= current_date::timestamptz
      )
  loop
    insert into public.notifications (
      account_id,
      notification_type,
      title,
      body,
      source_id,
      link_path,
      is_read,
      created_at
    ) values (
      v_account_id,
      'rent_charge_upcoming',
      'Upcoming rent charge: ' || v_charge.tenant_name,
      v_charge.currency || ' ' || v_charge.amount::text || ' due ' || v_charge.due_date::text ||
        ' for ' || v_charge.tenant_name || ' — ' || v_charge.property_address,
      v_charge.id::text,
      '/finance/rent-plans',
      false,
      now()
    )
    on conflict do nothing;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.notify_upcoming_rent_charges(uuid, integer) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- notify_overdue_rent_charges
-- Fires notifications for expected charges that have passed their due date
-- and are still in 'scheduled' status.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.notify_overdue_rent_charges(
  p_account_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id  uuid;
  v_count       integer := 0;
  v_charge      record;
begin
  v_account_id := public.assert_manage_account_access(p_account_id);

  for v_charge in
    select
      ec.id,
      ec.amount,
      ec.currency,
      ec.due_date,
      coalesce(t.name, 'tenant') as tenant_name,
      coalesce(pr.address, 'property')  as property_address
    from public.expected_charges ec
    left join public.tenants t on t.id = ec.tenant_id
    left join public.properties pr on pr.id = ec.property_id
    where ec.account_id = v_account_id
      and ec.status = 'scheduled'
      and ec.due_date < current_date
      and not exists (
        select 1
        from public.notifications n
        where n.account_id = v_account_id
          and n.notification_type = 'rent_charge_overdue'
          and n.source_id = ec.id::text
          and n.created_at >= current_date::timestamptz
      )
  loop
    insert into public.notifications (
      account_id,
      notification_type,
      title,
      body,
      source_id,
      link_path,
      is_read,
      created_at
    ) values (
      v_account_id,
      'rent_charge_overdue',
      'Overdue rent charge: ' || v_charge.tenant_name,
      v_charge.currency || ' ' || v_charge.amount::text || ' was due ' || v_charge.due_date::text ||
        ' — not yet posted to Finance. ' || v_charge.tenant_name || ' — ' || v_charge.property_address,
      v_charge.id::text,
      '/finance/rent-plans',
      false,
      now()
    )
    on conflict do nothing;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.notify_overdue_rent_charges(uuid) to authenticated;
