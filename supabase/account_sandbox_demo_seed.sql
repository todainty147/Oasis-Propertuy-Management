-- Demo/sandbox fixture seeding and reset semantics.
-- This builds on account_sandbox_profiles and only operates on accounts that
-- are explicitly marked as mode = 'demo'.

create or replace function public.sandbox_exec_if_relation_exists(
  p_relation text,
  p_sql text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if to_regclass(p_relation) is not null then
    execute p_sql;
  end if;
end;
$$;

create or replace function public.purge_demo_account_fixtures(
  p_account_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sandbox_exec_if_relation_exists(
    'public.document_packet_events',
    format('delete from public.document_packet_events where account_id = %L::uuid', p_account_id)
  );
  perform public.sandbox_exec_if_relation_exists(
    'public.document_packet_recipients',
    format('delete from public.document_packet_recipients where account_id = %L::uuid', p_account_id)
  );
  perform public.sandbox_exec_if_relation_exists(
    'public.document_packets',
    format('delete from public.document_packets where account_id = %L::uuid', p_account_id)
  );
  perform public.sandbox_exec_if_relation_exists(
    'public.document_request_uploads',
    format('delete from public.document_request_uploads where account_id = %L::uuid', p_account_id)
  );
  perform public.sandbox_exec_if_relation_exists(
    'public.document_requests',
    format('delete from public.document_requests where account_id = %L::uuid', p_account_id)
  );
  perform public.sandbox_exec_if_relation_exists(
    'public.documents',
    format('delete from public.documents where account_id = %L::uuid', p_account_id)
  );
  perform public.sandbox_exec_if_relation_exists(
    'public.notifications',
    format('delete from public.notifications where account_id = %L::uuid', p_account_id)
  );
  perform public.sandbox_exec_if_relation_exists(
    'public.automation_execution_log',
    format('delete from public.automation_execution_log where account_id = %L::uuid', p_account_id)
  );
  perform public.sandbox_exec_if_relation_exists(
    'public.payment_events',
    format('delete from public.payment_events where account_id = %L::uuid', p_account_id)
  );

  delete from public.work_orders where account_id = p_account_id;
  delete from public.maintenance_requests where account_id = p_account_id;
  delete from public.leases where account_id = p_account_id;
  delete from public.compliance_items where account_id = p_account_id;
  delete from public.property_operating_expenses where account_id = p_account_id;
  delete from public.property_financial_profiles where account_id = p_account_id;
  delete from public.payments where account_id = p_account_id;
  delete from public.contractors where account_id = p_account_id;
  delete from public.tenants where account_id = p_account_id;
  delete from public.properties where account_id = p_account_id;
end;
$$;

drop function if exists public.seed_demo_account_fixtures(uuid, boolean);
create or replace function public.seed_demo_account_fixtures(
  p_account_id uuid,
  p_force_reset boolean default false
)
returns table (
  account_id uuid,
  seeded_fixture_version text,
  reset_performed boolean,
  property_count integer,
  tenant_count integer,
  contractor_count integer,
  payment_count integer,
  maintenance_request_count integer,
  work_order_count integer,
  compliance_item_count integer,
  lease_count integer,
  document_request_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.account_sandbox_profiles%rowtype;
  v_owner_user_id uuid;
  v_reset boolean := coalesce(p_force_reset, false);
  v_property_occupied uuid := gen_random_uuid();
  v_property_vacant uuid := gen_random_uuid();
  v_tenant uuid := gen_random_uuid();
  v_contractor uuid := gen_random_uuid();
  v_request_open uuid := gen_random_uuid();
  v_request_waiting uuid := gen_random_uuid();
  v_work_order uuid := gen_random_uuid();
  v_payment_overdue uuid := gen_random_uuid();
  v_payment_due uuid := gen_random_uuid();
  v_today date := current_date;
begin
  perform public.assert_manage_account_access(p_account_id);

  select *
  into v_profile
  from public.account_sandbox_profiles asp
  where asp.account_id = p_account_id
  limit 1;

  if v_profile.account_id is null or coalesce(v_profile.mode, 'production') <> 'demo' then
    raise exception 'Demo fixtures can only be managed on demo accounts';
  end if;

  select am.user_id
  into v_owner_user_id
  from public.account_members am
  where am.account_id = p_account_id
    and public.account_member_effective_role(am.account_id, am.user_id) = 'owner'
  order by am.created_at asc nulls last, am.user_id
  limit 1;

  if v_owner_user_id is null then
    raise exception 'Demo account must have an owner membership before seeding';
  end if;

  if not v_reset then
    if coalesce(v_profile.seeded_fixture_version, '') <> '' then
      return query
      select
        p_account_id,
        v_profile.seeded_fixture_version,
        false,
        (select count(*)::int from public.properties p where p.account_id = p_account_id),
        (select count(*)::int from public.tenants t where t.account_id = p_account_id),
        (select count(*)::int from public.contractors c where c.account_id = p_account_id),
        (select count(*)::int from public.payments p where p.account_id = p_account_id),
        (select count(*)::int from public.maintenance_requests mr where mr.account_id = p_account_id),
        (select count(*)::int from public.work_orders wo where wo.account_id = p_account_id),
        (select count(*)::int from public.compliance_items ci where ci.account_id = p_account_id),
        (select count(*)::int from public.leases l where l.account_id = p_account_id),
        case
          when to_regclass('public.document_requests') is null then 0
          else (select count(*)::int from public.document_requests dr where dr.account_id = p_account_id)
        end;
      return;
    end if;

    if exists (select 1 from public.properties p where p.account_id = p_account_id)
      or exists (select 1 from public.tenants t where t.account_id = p_account_id)
      or exists (select 1 from public.payments p where p.account_id = p_account_id)
      or exists (select 1 from public.maintenance_requests mr where mr.account_id = p_account_id)
      or exists (select 1 from public.work_orders wo where wo.account_id = p_account_id)
    then
      raise exception 'Demo account already contains data. Use reset to reseed fixtures.';
    end if;
  end if;

  update public.account_sandbox_profiles asp
  set lifecycle_status = case when v_reset then 'resetting' else 'active' end,
      reset_requested_at = case when v_reset then now() else reset_requested_at end,
      updated_by = coalesce(v_uid, updated_by)
  where asp.account_id = p_account_id;

  if v_reset then
    perform public.purge_demo_account_fixtures(p_account_id);
  end if;

  insert into public.properties (
    id, owner_id, account_id, address, city, size, rent, status, tenant_id
  )
  values
    (
      v_property_occupied,
      v_owner_user_id,
      p_account_id,
      '21 Demo Crescent',
      'Bristol',
      '2 bed',
      1450,
      'Wolne',
      null
    ),
    (
      v_property_vacant,
      v_owner_user_id,
      p_account_id,
      '8 Harbour Lane',
      'Bristol',
      '1 bed',
      975,
      'Wolne',
      null
    );

  insert into public.tenants (
    id, owner_id, account_id, user_id, property_id, name, email, phone, status
  )
  values (
    v_tenant,
    v_owner_user_id,
    p_account_id,
    null,
    v_property_occupied,
    'Ava Carter',
    'ava.demo@oasis.test',
    '+447700900210',
    'active'
  );

  update public.properties p
  set status = 'Wynajęte',
      tenant_id = v_tenant
  where p.id = v_property_occupied
    and p.account_id = p_account_id;

  insert into public.contractors (
    id, account_id, user_id, name, phone, active
  )
  values (
    v_contractor,
    p_account_id,
    null,
    'BrightSpark Maintenance',
    '+447700900310',
    true
  );

  insert into public.payments (
    id, owner_id, account_id, property_id, tenant_id, amount, status, due_date
  )
  values
    (
      v_payment_overdue,
      v_owner_user_id,
      p_account_id,
      v_property_occupied,
      v_tenant,
      1450,
      'overdue',
      v_today - 12
    ),
    (
      v_payment_due,
      v_owner_user_id,
      p_account_id,
      v_property_occupied,
      v_tenant,
      1450,
      'due',
      v_today + 5
    );

  insert into public.maintenance_requests (
    id, account_id, property_id, reported_by_tenant_id, title, description, priority, status
  )
  values
    (
      v_request_open,
      p_account_id,
      v_property_occupied,
      v_tenant,
      'Boiler pressure keeps dropping',
      'Heating works for a while, then the boiler loses pressure and needs topping up.',
      'high',
      'open'
    ),
    (
      v_request_waiting,
      p_account_id,
      v_property_vacant,
      null,
      'Front-door lock replacement',
      'Vacant property handover needs a new lock before the next viewing.',
      'normal',
      'waiting'
    );

  insert into public.work_orders (
    id,
    account_id,
    property_id,
    maintenance_request_id,
    contractor_user_id,
    contractor_name,
    contractor_phone,
    status,
    created_by,
    assigned_at,
    acknowledgement_due_at,
    acknowledgement_status
  )
  values (
    v_work_order,
    p_account_id,
    v_property_occupied,
    v_request_open,
    null,
    'BrightSpark Maintenance',
    '+447700900310',
    'assigned',
    v_owner_user_id,
    now() - interval '3 days',
    now() - interval '1 day',
    'pending'
  );

  insert into public.compliance_items (
    account_id,
    property_id,
    tenant_id,
    title,
    category,
    due_date,
    status,
    reminder_window_days,
    notes
  )
  values
    (
      p_account_id,
      v_property_occupied,
      v_tenant,
      'Gas safety certificate review',
      'safety',
      v_today + 10,
      'active',
      30,
      'Demo fixture: due soon so portfolio health has a compliance signal.'
    ),
    (
      p_account_id,
      v_property_vacant,
      null,
      'Electrical condition report',
      'safety',
      v_today - 3,
      'active',
      30,
      'Demo fixture: overdue compliance item on the vacant unit.'
    );

  insert into public.leases (
    account_id,
    property_id,
    tenant_id,
    lease_start_date,
    lease_end_date,
    renewal_status,
    notice_period_days,
    auto_renew,
    notes
  )
  values (
    p_account_id,
    v_property_occupied,
    v_tenant,
    v_today - 300,
    v_today + 45,
    'expiring_soon',
    30,
    false,
    'Demo fixture lease for onboarding and portfolio-health flows.'
  );

  insert into public.property_operating_expenses (
    account_id,
    property_id,
    category,
    expense_date,
    amount,
    notes,
    created_by
  )
  values
    (
      p_account_id,
      v_property_occupied,
      'utilities',
      v_today - 20,
      180,
      'Demo boiler inspection visit.',
      v_owner_user_id
    ),
    (
      p_account_id,
      v_property_vacant,
      'vacancy_loss',
      v_today - 7,
      300,
      'Demo vacancy turnover cost.',
      v_owner_user_id
    );

  if to_regclass('public.document_requests') is not null then
    execute format(
      $seed$
      insert into public.document_requests (
        account_id,
        target_role,
        tenant_id,
        contractor_id,
        property_id,
        request_type,
        title,
        instructions,
        due_at,
        status,
        requested_by
      )
      values (
        %L::uuid,
        'tenant',
        %L::uuid,
        null,
        %L::uuid,
        'bank_payment_receipt',
        'Upload your latest rent receipt',
        'Use the demo portal to upload a receipt after payment is made.',
        current_date + 3,
        'requested',
        %L::uuid
      )
      $seed$,
      p_account_id,
      v_tenant,
      v_property_occupied,
      v_owner_user_id
    );
  end if;

  update public.account_sandbox_profiles asp
  set mode = 'demo',
      lifecycle_status = 'active',
      seeded_fixture_version = 'demo-fixtures-v1',
      reset_completed_at = case when v_reset then now() else reset_completed_at end,
      updated_by = coalesce(v_uid, updated_by)
  where asp.account_id = p_account_id;

  return query
  select
    p_account_id,
    'demo-fixtures-v1'::text,
    v_reset,
    (select count(*)::int from public.properties p where p.account_id = p_account_id),
    (select count(*)::int from public.tenants t where t.account_id = p_account_id),
    (select count(*)::int from public.contractors c where c.account_id = p_account_id),
    (select count(*)::int from public.payments p where p.account_id = p_account_id),
    (select count(*)::int from public.maintenance_requests mr where mr.account_id = p_account_id),
    (select count(*)::int from public.work_orders wo where wo.account_id = p_account_id),
    (select count(*)::int from public.compliance_items ci where ci.account_id = p_account_id),
    (select count(*)::int from public.leases l where l.account_id = p_account_id),
    case
      when to_regclass('public.document_requests') is null then 0
      else (select count(*)::int from public.document_requests dr where dr.account_id = p_account_id)
    end;
exception
  when others then
    update public.account_sandbox_profiles asp
    set lifecycle_status = 'active',
        updated_by = coalesce(v_uid, updated_by)
    where asp.account_id = p_account_id;
    raise;
end;
$$;

drop function if exists public.reset_demo_account(uuid);
create or replace function public.reset_demo_account(
  p_account_id uuid
)
returns table (
  account_id uuid,
  seeded_fixture_version text,
  reset_performed boolean,
  property_count integer,
  tenant_count integer,
  contractor_count integer,
  payment_count integer,
  maintenance_request_count integer,
  work_order_count integer,
  compliance_item_count integer,
  lease_count integer,
  document_request_count integer
)
language sql
security definer
set search_path = public
as $$
  select *
  from public.seed_demo_account_fixtures(p_account_id, true);
$$;

grant execute on function public.seed_demo_account_fixtures(uuid, boolean) to authenticated;
grant execute on function public.reset_demo_account(uuid) to authenticated;
