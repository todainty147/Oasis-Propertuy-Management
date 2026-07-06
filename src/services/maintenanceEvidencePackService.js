/**
 * Assembles a Maintenance Evidence Pack v0 payload from existing DB tables.
 * Queries:
 *   work_orders by account_id + id
 *   maintenance_requests via work_order.maintenance_request_id
 *   properties via work_order.property_id
 *   contractors via account_id + contractor_user_id
 *   work_order_attachments by work_order_id
 *   provenance_events where entity_type='work_order' and entity_id=workOrderId
 *
 * No new SQL or RPC is created. Fields absent from the DB are returned as null
 * so the PDF exporter renders a clear "Not recorded" label.
 *
 * Does not include scan_status, photo.scan_clean, or any E-158 fields.
 */

export async function assembleMaintenanceEvidencePackPayload(admin, accountId, workOrderId) {
  const { data: workOrder, error: woErr } = await admin
    .from("work_orders")
    .select(
      "id, account_id, property_id, maintenance_request_id, contractor_user_id, " +
      "contractor_name, contractor_phone, status, quote_amount, invoice_amount, " +
      "notes, scheduled_at, created_at, updated_at",
    )
    .eq("account_id", accountId)
    .eq("id", workOrderId)
    .single();
  if (woErr) throw new Error(`Work order fetch failed: ${woErr.message}`);
  if (!workOrder) throw new Error(`Work order ${workOrderId} not found in account ${accountId}`);

  let maintenanceRequest = null;
  if (workOrder.maintenance_request_id) {
    const { data: mr } = await admin
      .from("maintenance_requests")
      .select("id, title, description, priority, status, created_at, updated_at")
      .eq("id", workOrder.maintenance_request_id)
      .single();
    maintenanceRequest = mr ?? null;
  }

  const { data: property } = await admin
    .from("properties")
    .select("id, address, city")
    .eq("id", workOrder.property_id)
    .single();

  let contractor = null;
  if (workOrder.contractor_user_id) {
    const { data: c } = await admin
      .from("contractors")
      .select("id, name, phone, email, user_id")
      .eq("account_id", accountId)
      .eq("user_id", workOrder.contractor_user_id)
      .maybeSingle();
    contractor = c ?? null;
  }

  const { data: attachments } = await admin
    .from("work_order_attachments")
    .select(
      "id, file_name, mime_type, file_size, maintenance_stage, attester_role, " +
      "capture_method, content_hash_client_asserted, content_hash_server_computed, " +
      "hash_trust, content_hash_verified_at, created_at, provenance_event_id",
    )
    .eq("work_order_id", workOrderId)
    .order("created_at", { ascending: true });

  const { data: provenance } = await admin
    .from("provenance_events")
    .select(
      "id, event_type, entity_type, entity_id, occurred_at, sequence_number, " +
      "summary, metadata, account_id",
    )
    .eq("account_id", accountId)
    .eq("entity_type", "work_order")
    .eq("entity_id", workOrderId)
    .order("sequence_number", { ascending: true });

  return {
    workOrder,
    maintenanceRequest: maintenanceRequest ?? null,
    property: property ?? null,
    contractor: contractor ?? null,
    attachments: attachments ?? [],
    provenance: provenance ?? [],
    generatedAt: new Date().toISOString(),
  };
}
