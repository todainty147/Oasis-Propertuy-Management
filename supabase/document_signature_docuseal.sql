alter table public.document_packets
  add column if not exists signature_submitter_slug text,
  add column if not exists signature_submitter_url text;

create or replace function public.record_document_packet_signature_submission(
  p_packet_id uuid,
  p_provider text,
  p_submission_id text,
  p_signature_status text default 'pending'
) returns public.document_packets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_packet public.document_packets;
  v_status text := lower(trim(coalesce(p_signature_status, 'pending')));
  v_provider text := lower(trim(coalesce(p_provider, '')));
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Not permitted'; end if;
  if v_status not in ('requested', 'pending', 'completed', 'failed', 'cancelled') then raise exception 'Invalid signature status'; end if;
  if v_provider not in ('docuseal', 'opensign', 'libresign', 'manual') then raise exception 'Unsupported signature provider'; end if;
  if nullif(trim(coalesce(p_submission_id, '')), '') is null then raise exception 'signature_submission_id is required'; end if;

  select * into v_packet
  from public.document_packets
  where id = p_packet_id;
  if not found then raise exception 'Packet not found'; end if;
  if coalesce(v_packet.signature_provider, v_provider) <> v_provider then raise exception 'Signature provider mismatch'; end if;

  update public.document_packets
  set signature_provider = v_provider,
      signature_submission_id = trim(p_submission_id),
      signature_status = v_status,
      signature_requested_at = coalesce(signature_requested_at, now()),
      signature_synced_at = now(),
      signature_error = null,
      status = case when status = 'draft' then 'sent' else status end,
      sent_at = case when sent_at is null then now() else sent_at end
  where id = p_packet_id
  returning * into v_packet;

  update public.document_packet_recipients
  set status = case when status = 'pending' then 'sent' else status end
  where packet_id = p_packet_id;

  insert into public.document_packet_events (account_id, packet_id, event_type, message, metadata)
  values (
    v_packet.account_id,
    v_packet.id,
    'signature_requested',
    'External signature submission recorded',
    jsonb_build_object('provider', v_provider, 'signature_status', v_status)
  );

  return v_packet;
end;
$$;

create or replace function public.sync_document_packet_signature_status(
  p_packet_id uuid,
  p_submission_id text,
  p_signature_status text,
  p_completed_document_id uuid default null,
  p_error text default null
) returns public.document_packets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_packet public.document_packets;
  v_status text := lower(trim(coalesce(p_signature_status, '')));
  v_event text := 'signature_synced';
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Not permitted'; end if;
  if v_status not in ('requested', 'pending', 'completed', 'failed', 'cancelled') then raise exception 'Invalid signature status'; end if;

  select * into v_packet
  from public.document_packets
  where id = p_packet_id
    and (p_submission_id is null or signature_submission_id = p_submission_id);
  if not found then raise exception 'Packet not found'; end if;

  if p_completed_document_id is not null and not exists (
    select 1
    from public.documents d
    where d.id = p_completed_document_id
      and d.account_id = v_packet.account_id
  ) then
    raise exception 'Completed document not found';
  end if;

  if v_status = 'completed' then
    v_event := 'signature_completed';
  elsif v_status = 'failed' then
    v_event := 'signature_failed';
  end if;

  update public.document_packets
  set signature_status = v_status,
      signature_completed_document_id = case when v_status = 'completed' then p_completed_document_id else signature_completed_document_id end,
      signature_synced_at = now(),
      signature_error = nullif(trim(coalesce(p_error, '')), ''),
      status = case when v_status = 'completed' then 'completed' else status end,
      completed_at = case when v_status = 'completed' then coalesce(completed_at, now()) else completed_at end
  where id = p_packet_id
  returning * into v_packet;

  if v_status = 'completed' then
    update public.document_packet_recipients
    set status = 'completed',
        viewed_at = coalesce(viewed_at, now()),
        completed_at = coalesce(completed_at, now())
    where packet_id = p_packet_id
      and status <> 'voided';
  end if;

  insert into public.document_packet_events (account_id, packet_id, event_type, message, metadata)
  values (
    v_packet.account_id,
    v_packet.id,
    v_event,
    'External signature status synced',
    jsonb_build_object('signature_status', v_status, 'has_completed_document', p_completed_document_id is not null)
  );

  return v_packet;
end;
$$;

create or replace function public.import_document_packet_signed_document(
  p_packet_id uuid,
  p_storage_path text,
  p_filename text,
  p_size_bytes integer,
  p_mime_type text default 'application/pdf'
) returns public.documents
language plpgsql
security definer
set search_path = public
as $$
declare
  v_packet public.document_packets;
  v_document public.documents;
  v_scope text;
  v_visibility text;
  v_actor uuid;
  v_name text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Not permitted'; end if;
  if p_packet_id is null then raise exception 'packet_id is required'; end if;
  if nullif(trim(coalesce(p_storage_path, '')), '') is null then raise exception 'storage_path is required'; end if;
  if nullif(trim(coalesce(p_filename, '')), '') is null then raise exception 'filename is required'; end if;
  if coalesce(p_size_bytes, 0) <= 0 then raise exception 'size_bytes must be > 0'; end if;
  if p_mime_type not in (
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) then
    raise exception 'Invalid mime_type: %', p_mime_type;
  end if;

  select * into v_packet
  from public.document_packets
  where id = p_packet_id;
  if not found then raise exception 'Packet not found'; end if;

  v_name := replace(replace(trim(p_filename), '/', '_'), '\', '_');
  v_actor := coalesce(v_packet.sent_by, v_packet.created_by);

  if v_packet.tenant_id is not null and v_packet.property_id is not null then
    v_scope := 'shared';
    v_visibility := 'tenant';
  elsif v_packet.tenant_id is not null then
    v_scope := 'tenant';
    v_visibility := 'tenant';
  elsif v_packet.property_id is not null then
    v_scope := 'property';
    v_visibility := 'staff';
  else
    v_scope := 'account';
    v_visibility := 'staff';
  end if;

  insert into public.documents (
    account_id,
    property_id,
    tenant_id,
    name,
    original_filename,
    storage_path,
    mime_type,
    size_bytes,
    scope,
    visibility,
    created_via,
    created_by_user_id,
    uploaded_by,
    upload_status,
    uploaded_at,
    source,
    review_status,
    tags
  )
  values (
    v_packet.account_id,
    v_packet.property_id,
    v_packet.tenant_id,
    v_name,
    v_name,
    trim(p_storage_path),
    p_mime_type,
    p_size_bytes,
    v_scope,
    v_visibility,
    'signature_provider',
    v_actor,
    v_actor,
    'uploaded',
    now(),
    'signature_completed',
    'accepted',
    '{}'::public.document_tag[]
  )
  returning * into v_document;

  insert into public.document_audit_log (
    document_id,
    action,
    performed_by,
    performed_at,
    account_id,
    property_id,
    tenant_id,
    created_at
  )
  values (
    v_document.id,
    'upload',
    v_actor,
    now(),
    v_document.account_id,
    v_document.property_id,
    v_document.tenant_id,
    now()
  );

  return v_document;
end;
$$;

revoke all on function public.import_document_packet_signed_document(uuid, text, text, integer, text) from public;
grant execute on function public.import_document_packet_signed_document(uuid, text, text, integer, text) to service_role;

create or replace function public.complete_document_packet(
  p_packet_id uuid,
  p_actor_user_id uuid default auth.uid()
) returns public.document_packets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_packet public.document_packets;
begin
  if v_actor is null then raise exception 'Not authenticated'; end if;
  if p_actor_user_id is not null and p_actor_user_id <> v_actor then raise exception 'Actor mismatch'; end if;

  select * into v_packet from public.document_packets where id = p_packet_id;
  if not found then raise exception 'Packet not found'; end if;
  if not public.is_document_packet_recipient(p_packet_id, v_actor) then raise exception 'Not permitted'; end if;
  if v_packet.status not in ('sent', 'viewed') then raise exception 'Packet cannot be completed from current status'; end if;
  if coalesce(v_packet.signature_status, 'not_configured') in ('ready', 'requested', 'pending') then
    raise exception 'Packet completion must come from the signature provider';
  end if;

  update public.document_packet_recipients
  set status = 'completed',
      viewed_at = coalesce(viewed_at, now()),
      completed_at = now()
  where packet_id = p_packet_id
    and public.is_document_packet_recipient(packet_id, v_actor);

  update public.document_packets
  set status = 'completed',
      completed_at = now()
  where id = p_packet_id
  returning * into v_packet;

  insert into public.document_packet_events (account_id, packet_id, actor_user_id, event_type, message)
  values (v_packet.account_id, v_packet.id, v_actor, 'completed', 'Agreement packet completed');

  return v_packet;
end;
$$;
