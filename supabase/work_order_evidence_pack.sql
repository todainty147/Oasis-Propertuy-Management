-- supabase/work_order_evidence_pack.sql
--
-- P-002: Work Order Evidence Pack — product-side authorized read model.
--
-- Scope: SECURITY DEFINER RPC that assembles a work-order evidence pack payload
-- for the landlord self-serve export path. Mirrors the authorization posture of
-- get_obligation_proof_pack.
--
-- Authorization: manager-only via user_can_manage_account(p_account_id).
-- Contractor access is out of scope for v0.
--
-- Explicit attachment field list — no SELECT *, no storage_bucket/storage_path,
-- no E-158 scan columns (scan_status, scan_engine, scanned_at, scan_signature,
-- scan_failed_reason, scan_attempted_at).
--
-- Does not block export; returns a readiness/warning object instead.
-- Does not include signed URLs, photo bytes, or AV verdicts.

begin;

drop function if exists public.get_work_order_evidence_pack(uuid, uuid);

create or replace function public.get_work_order_evidence_pack(
  p_account_id    uuid,
  p_work_order_id uuid
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_work_order  record;
  v_mr          record;
  v_property    record;
  v_contractor  record;
  v_attachments jsonb;
  v_provenance  jsonb;
  v_attachment_count   int;
  v_has_photo_received bool;
  v_has_hash_verified  bool;
  v_missing_items      text[];
begin
  if not public.user_can_manage_account(p_account_id) then
    raise exception 'Not authorized for account';
  end if;

  select id, account_id, property_id, maintenance_request_id,
         contractor_user_id, contractor_name, contractor_phone,
         status, quote_amount, invoice_amount, notes,
         scheduled_at, created_at, updated_at
    into v_work_order
    from public.work_orders
   where id         = p_work_order_id
     and account_id = p_account_id;

  if not found then
    raise exception 'Work order not found for account';
  end if;

  -- Maintenance request (optional — null if not linked)
  if v_work_order.maintenance_request_id is not null then
    select id, title, description, priority, status, created_at, updated_at
      into v_mr
      from public.maintenance_requests
     where id = v_work_order.maintenance_request_id;
  end if;

  -- Property (best-effort; null if deleted)
  select id, address, city
    into v_property
    from public.properties
   where id = v_work_order.property_id;

  -- Contractor directory entry (best-effort; WO holds name/phone directly)
  if v_work_order.contractor_user_id is not null then
    select id, name, phone, email, user_id
      into v_contractor
      from public.contractors
     where account_id = p_account_id
       and user_id    = v_work_order.contractor_user_id
     limit 1;
  end if;

  -- Attachments — explicit field selection.
  -- NEVER use SELECT * here: that would leak storage_bucket, storage_path,
  -- and all parked E-158 scan columns (scan_status, scan_engine, scanned_at,
  -- scan_signature, scan_failed_reason, scan_attempted_at).
  -- Filtered by both work_order_id and account_id (defence-in-depth).
  select jsonb_agg(
    jsonb_build_object(
      'id',                           woa.id,
      'file_name',                    woa.file_name,
      'file_size',                    woa.file_size,
      'mime_type',                    woa.mime_type,
      'maintenance_stage',            woa.maintenance_stage,
      'attester_role',                woa.attester_role,
      'capture_method',               woa.capture_method,
      'hash_trust',                   woa.hash_trust,
      'content_hash_client_asserted', woa.content_hash_client_asserted,
      'content_hash_server_computed', woa.content_hash_server_computed,
      'content_hash_verified_at',     woa.content_hash_verified_at,
      'created_at',                   woa.created_at
    )
    order by woa.created_at
  )
  into v_attachments
  from public.work_order_attachments woa
  where woa.work_order_id = p_work_order_id
    and woa.account_id    = p_account_id;

  v_attachments      := coalesce(v_attachments, '[]'::jsonb);
  v_attachment_count := jsonb_array_length(v_attachments);

  -- Provenance events for this work order, scoped to the account
  select jsonb_agg(
    jsonb_build_object(
      'id',              pe.id,
      'event_type',      pe.event_type,
      'entity_type',     pe.entity_type,
      'entity_id',       pe.entity_id,
      'occurred_at',     pe.occurred_at,
      'sequence_number', pe.sequence_number,
      'summary',         pe.summary,
      'metadata',        pe.metadata,
      'account_id',      pe.account_id
    )
    order by pe.sequence_number, pe.occurred_at, pe.id
  )
  into v_provenance
  from public.provenance_events pe
  where pe.account_id   = p_account_id
    and pe.entity_type  = 'work_order'
    and pe.entity_id    = p_work_order_id;

  v_provenance := coalesce(v_provenance, '[]'::jsonb);

  -- Readiness sub-queries (warning-only; export is never blocked here)
  select exists(
    select 1 from public.provenance_events
    where account_id  = p_account_id
      and entity_type = 'work_order'
      and entity_id   = p_work_order_id
      and event_type  = 'photo.received'
  ) into v_has_photo_received;

  select exists(
    select 1 from public.provenance_events
    where account_id  = p_account_id
      and entity_type = 'work_order'
      and entity_id   = p_work_order_id
      and event_type  = 'photo.hash_verified'
  ) into v_has_hash_verified;

  v_missing_items := array[]::text[];
  if v_attachment_count = 0 then
    v_missing_items := v_missing_items || array['No photo evidence recorded yet.'];
  end if;
  if not v_has_hash_verified then
    v_missing_items := v_missing_items || array['Hash verification not recorded yet.'];
  end if;
  if v_work_order.status <> 'completed' then
    v_missing_items := v_missing_items || array['Work order is not marked completed.'];
  end if;

  return jsonb_build_object(
    'workOrder', jsonb_build_object(
      'id',                     v_work_order.id,
      'account_id',             v_work_order.account_id,
      'property_id',            v_work_order.property_id,
      'maintenance_request_id', v_work_order.maintenance_request_id,
      'contractor_user_id',     v_work_order.contractor_user_id,
      'contractor_name',        v_work_order.contractor_name,
      'contractor_phone',       v_work_order.contractor_phone,
      'status',                 v_work_order.status,
      'quote_amount',           v_work_order.quote_amount,
      'invoice_amount',         v_work_order.invoice_amount,
      'notes',                  v_work_order.notes,
      'scheduled_at',           v_work_order.scheduled_at,
      'created_at',             v_work_order.created_at,
      'updated_at',             v_work_order.updated_at
    ),
    'maintenanceRequest', case
      when v_mr.id is not null then jsonb_build_object(
        'id',          v_mr.id,
        'title',       v_mr.title,
        'description', v_mr.description,
        'priority',    v_mr.priority,
        'status',      v_mr.status,
        'created_at',  v_mr.created_at,
        'updated_at',  v_mr.updated_at
      )
      else null
    end,
    'property', case
      when v_property.id is not null then jsonb_build_object(
        'id',      v_property.id,
        'address', v_property.address,
        'city',    v_property.city
      )
      else null
    end,
    'contractor', case
      when v_contractor.id is not null then jsonb_build_object(
        'id',      v_contractor.id,
        'name',    v_contractor.name,
        'phone',   v_contractor.phone,
        'email',   v_contractor.email,
        'user_id', v_contractor.user_id
      )
      else null
    end,
    'attachments', v_attachments,
    'provenance',  v_provenance,
    'status', jsonb_build_object(
      'work_order_present',        true,
      'maintenance_request_present', v_mr.id is not null,
      'property_present',          v_property.id is not null,
      'attachment_count',          v_attachment_count,
      'has_photo_received_event',  v_has_photo_received,
      'has_hash_verified_event',   v_has_hash_verified,
      'is_completed_status',       v_work_order.status = 'completed',
      'missing_items',             to_jsonb(v_missing_items),
      'pack_status_label',         'Demo maintenance pack — not legal sign-off'
    ),
    'generatedAt', now()
  );
end;
$$;

revoke all on function public.get_work_order_evidence_pack(uuid, uuid) from public;
grant execute on function public.get_work_order_evidence_pack(uuid, uuid) to authenticated;

commit;
