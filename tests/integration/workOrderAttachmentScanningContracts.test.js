/**
 * E-158 — Work-Order Photo Attachment Scanning / Quarantine
 *
 * Integration tests against the local Supabase DB.
 * Skipped if the harness is not configured (INTEGRATION_SUPABASE_URL not set).
 *
 * Coverage map:
 *  T01 — New upload anchors with scan_status='pending_scan' (D5: not blocked on scan)
 *  T02 — clean verdict → scan_status='clean', scanned_at set, photo.scan_clean event
 *  T03 — flagged verdict → scan_status='flagged', scan_signature set, photo.scan_flagged event; file NOT deleted
 *  T04 — scan_failed verdict → scan_status='scan_failed', reason set, photo.scan_failed event; NOT 'flagged'
 *  T05 — serve gate (can_serve): clean attachment → returns true for member
 *  T06 — serve gate (can_serve): pending_scan → returns false
 *  T07 — serve gate (can_serve): flagged → returns false
 *  T08 — serve gate (can_serve): legacy_unscanned → returns false
 *  T09 — deny-test positive control: clean → scan_status='clean' + photo.scan_clean (no GUC)
 *  T10 — deny-test rollback: forced failure → scan_status stays pending_scan, no event
 *  T11 — deny-test retry after rollback: succeeds, exactly 1 photo.scan_clean event
 *  T12 — security: authenticated user cannot call recording function directly
 *  T13 — terminal idempotency: clean is final; re-recording 'flagged' on a clean row stays clean
 *  T14 — terminal idempotency: scan_failed is retryable; re-recording clean succeeds
 *  T15 — pack exclusion: flagged attachment absent from can_serve gate; clean attachment present
 *  T16 — E-150.1 / E-160 / E-163 regression: photo.received still emits on contractor upload
 */

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ensureIsolationHarnessSeed,
  getIntegrationAdminClient,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "./helpers/env.js";

const integrationIt = isIntegrationHarnessConfigured() ? it : it.skip;

const BUCKET = "work-order-attachments";

// ── Cleanup tracking ────────────────────────────────────────────────────────
const createdAccountIds    = [];
const createdWorkOrderIds  = [];
const createdAttachmentIds = [];
const createdStoragePaths  = [];

// ── Helpers ─────────────────────────────────────────────────────────────────

async function ensureBucket(admin) {
  const { error } = await admin.storage.createBucket(BUCKET, {
    public: false,
    allowedMimeTypes: ["image/jpeg", "image/png"],
    fileSizeLimit: 10 * 1024 * 1024,
  });
  if (error && !/already exists/i.test(error.message ?? "")) {
    throw new Error(`Bucket create: ${error.message}`);
  }
}

function makePath(accountId, workOrderId, suffix = "photo.jpg") {
  return `account/${accountId}/work_orders/${workOrderId}/${Date.now()}_${randomUUID().slice(0, 8)}_${suffix}`;
}

async function seedStorageObject(admin, storagePath) {
  const fakeBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
  const { error } = await admin.storage.from(BUCKET).upload(storagePath, fakeBytes, {
    contentType: "image/jpeg",
    upsert: true,
  });
  if (error) throw new Error(`Storage seed (${storagePath}): ${error.message}`);
  createdStoragePaths.push(storagePath);
}

async function scaffoldWorkOrder(admin, ownerUserId, contractorUserId, status = "assigned") {
  const accountId = randomUUID();
  createdAccountIds.push(accountId);

  const { error: acctErr } = await admin.from("accounts").insert({
    id: accountId,
    name: `E-158 probe ${accountId.slice(0, 8)}`,
    created_by: ownerUserId,
    is_root: false,
    subscription_status: "active",
    subscription_plan: "pro",
  });
  if (acctErr) throw new Error(`scaffold account: ${acctErr.message}`);

  const { error: memberErr } = await admin.from("account_members").insert({
    account_id: accountId,
    user_id: ownerUserId,
    role: "owner",
  });
  if (memberErr) throw new Error(`scaffold member: ${memberErr.message}`);

  const propertyId = randomUUID();
  const { error: propErr } = await admin.from("properties").insert({
    id: propertyId,
    account_id: accountId,
    owner_id: ownerUserId,
    address: "1 E158 Street",
    city: "London",
    size: "1 bed",
    rent: 1000,
    status: "Wolne",
  });
  if (propErr) throw new Error(`scaffold property: ${propErr.message}`);

  const { error: cErr } = await admin.from("contractors").insert({
    account_id: accountId,
    user_id: contractorUserId,
    name: "E158 Contractor",
    phone: "+447700900158",
    active: true,
  });
  if (cErr) throw new Error(`scaffold contractor: ${cErr.message}`);

  const workOrderId = randomUUID();
  createdWorkOrderIds.push(workOrderId);

  const { error: woErr } = await admin.from("work_orders").insert({
    id: workOrderId,
    account_id: accountId,
    property_id: propertyId,
    contractor_user_id: contractorUserId,
    contractor_name: "E158 Contractor",
    contractor_phone: "+447700900158",
    status,
    created_by: ownerUserId,
  });
  if (woErr) throw new Error(`scaffold work_order: ${woErr.message}`);

  return { accountId, workOrderId, propertyId };
}

/**
 * Seeds a work_order_attachments row directly via admin for test control.
 * Does NOT call the RPC (bypasses upload trigger logic) so scan_status can be set freely.
 */
async function seedAttachment(admin, accountId, workOrderId, uploadedByUserId, overrides = {}) {
  const attachmentId = randomUUID();
  const storagePath = makePath(accountId, workOrderId, `${attachmentId.slice(0, 8)}.jpg`);
  await seedStorageObject(admin, storagePath);

  const { error } = await admin.from("work_order_attachments").insert({
    id: attachmentId,
    account_id: accountId,
    work_order_id: workOrderId,
    uploaded_by: uploadedByUserId,
    attester_role: "contractor",
    file_name: "photo.jpg",
    mime_type: "image/jpeg",
    file_size: 4,
    storage_bucket: BUCKET,
    storage_path: storagePath,
    kind: "photo",
    maintenance_stage: "contractor_completion",
    capture_method: "uploaded",
    work_order_status_at_received: "assigned",
    late_upload: false,
    content_hash_client_asserted: null,
    content_hash_algorithm: null,
    scan_status: "pending_scan",
    ...overrides,
  });
  if (error) throw new Error(`seedAttachment: ${error.message}`);
  createdAttachmentIds.push(attachmentId);
  return { attachmentId, storagePath };
}

async function readAttachment(admin, attachmentId) {
  const { data, error } = await admin
    .from("work_order_attachments")
    .select("*")
    .eq("id", attachmentId)
    .single();
  if (error) throw new Error(`readAttachment: ${error.message}`);
  return data;
}

async function readProvenanceEvents(admin, accountId, entityId, eventType) {
  let q = admin
    .from("provenance_events")
    .select("id, event_type, entity_type, entity_id, occurred_at, metadata, account_id")
    .eq("account_id", accountId)
    .eq("entity_type", "work_order")
    .eq("entity_id", entityId);
  if (eventType) q = q.eq("event_type", eventType);
  const { data, error } = await q;
  if (error) throw new Error(`readProvenanceEvents: ${error.message}`);
  return data ?? [];
}

/** Calls the service-role recording function directly (system path). */
async function callScanResult(admin, attachmentId, scanStatus, opts = {}) {
  return admin.rpc("record_work_order_attachment_scan_result", {
    p_attachment_id:      attachmentId,
    p_scan_status:        scanStatus,
    p_scan_engine:        opts.scanEngine        ?? "clamav",
    p_scan_signature:     opts.scanSignature      ?? null,
    p_scan_failed_reason: opts.scanFailedReason   ?? null,
  });
}

/** Calls the deny-test wrapper via an authenticated user client. */
async function callDenyTestWrapper(userClient, attachmentId, scanStatus, opts = {}) {
  return userClient.rpc("record_work_order_attachment_scan_result_atomicity_deny_test", {
    p_attachment_id:      attachmentId,
    p_scan_status:        scanStatus,
    p_scan_engine:        opts.scanEngine        ?? "clamav",
    p_scan_signature:     opts.scanSignature      ?? null,
    p_scan_failed_reason: opts.scanFailedReason   ?? null,
  });
}

/** Calls can_serve_work_order_attachment_storage via authenticated user client. */
async function canServe(userClient, storagePath) {
  const { data, error } = await userClient.rpc(
    "can_serve_work_order_attachment_storage",
    { p_storage_path: storagePath },
  );
  if (error) throw new Error(`canServe: ${error.message}`);
  return data;
}

const SCAN_SIGNATURE = "Eicar-Test-Signature";
const SCAN_FAIL_REASON = "clamav_timeout";

// ── Suite ───────────────────────────────────────────────────────────────────

describe("E-158 — work-order attachment scanning contracts (integration)", () => {
  if (!isIntegrationHarnessConfigured()) return;

  let admin;
  let ownerSession;
  let contractorSession;
  let scaffold;

  beforeAll(async () => {
    await ensureIsolationHarnessSeed();
    admin = getIntegrationAdminClient();
    await ensureBucket(admin);

    ownerSession       = await signInAsFixtureUser("ownerA");
    contractorSession  = await signInAsFixtureUser("contractorA1");

    scaffold = await scaffoldWorkOrder(
      admin,
      ownerSession.user.id,
      contractorSession.user.id,
      "assigned",
    );
  });

  afterAll(async () => {
    if (createdStoragePaths.length > 0) {
      try { await admin.storage.from(BUCKET).remove(createdStoragePaths); } catch { /* ignore */ }
    }
    if (createdAttachmentIds.length > 0) {
      try {
        await admin.from("work_order_attachments").delete().in("id", createdAttachmentIds);
      } catch { /* ignore */ }
    }
    if (createdWorkOrderIds.length > 0) {
      try { await admin.from("work_orders").delete().in("id", createdWorkOrderIds); } catch { /* ignore */ }
    }
    if (createdAccountIds.length > 0) {
      try { await admin.from("accounts").delete().in("id", createdAccountIds); } catch { /* ignore */ }
    }
  });

  // ── T01: Anchoring not gated on scan (D5) ──────────────────────────────────

  integrationIt("T01 new upload via RPC → scan_status='pending_scan' (anchoring not blocked)", async () => {
    const { accountId, workOrderId } = scaffold;

    // Upload a fake file to storage so the RPC's existence check passes
    const storagePath = makePath(accountId, workOrderId, "t01_anchor.jpg");
    await seedStorageObject(admin, storagePath);

    const { data, error } = await contractorSession.client.rpc(
      "record_work_order_attachment_received",
      {
        p_account_id:    accountId,
        p_work_order_id: workOrderId,
        p_storage_path:  storagePath,
        p_file_name:     "t01_anchor.jpg",
        p_mime_type:     "image/jpeg",
        p_file_size:     4,
        p_kind:          "photo",
        p_attester_role: "contractor",
        p_maintenance_stage: "contractor_completion",
        p_capture_method:    "uploaded",
        p_content_hash_client_asserted: null,
      },
    );

    expect(error, `record_received error: ${error?.message}`).toBeNull();

    const row = data ?? {};
    expect(row.scan_status).toBe("pending_scan");
    expect(row.scanned_at).toBeNull();
    expect(row.scan_engine).toBeNull();

    if (row.id) createdAttachmentIds.push(row.id);
  });

  // ── T02: clean verdict ──────────────────────────────────────────────────────

  integrationIt("T02 clean verdict → scan_status='clean', scanned_at set, photo.scan_clean event", async () => {
    const { accountId, workOrderId } = scaffold;
    const { attachmentId } = await seedAttachment(admin, accountId, workOrderId, contractorSession.user.id);

    const { error } = await callScanResult(admin, attachmentId, "clean", { scanEngine: "clamav" });
    expect(error, `record error: ${error?.message}`).toBeNull();

    const row = await readAttachment(admin, attachmentId);
    expect(row.scan_status).toBe("clean");
    expect(row.scanned_at).not.toBeNull();
    expect(row.scan_engine).toBe("clamav");
    expect(row.scan_signature).toBeNull();
    expect(row.scan_failed_reason).toBeNull();

    const events = await readProvenanceEvents(admin, accountId, workOrderId, "photo.scan_clean");
    const ev = events.find((e) => e.metadata?.attachment_id === attachmentId);
    expect(ev, "photo.scan_clean event not found").toBeDefined();
    expect(ev.metadata.scan_status).toBe("clean");
    expect(ev.metadata.attachment_id).toBe(attachmentId);
    expect(ev.metadata.work_order_id).toBe(workOrderId);
  });

  // ── T03: flagged verdict ────────────────────────────────────────────────────

  integrationIt("T03 flagged verdict → scan_status='flagged', scan_signature set, photo.scan_flagged event; file not deleted", async () => {
    const { accountId, workOrderId } = scaffold;
    const { attachmentId, storagePath } = await seedAttachment(admin, accountId, workOrderId, contractorSession.user.id);

    const { error } = await callScanResult(admin, attachmentId, "flagged", {
      scanEngine:    "clamav",
      scanSignature: SCAN_SIGNATURE,
    });
    expect(error, `record error: ${error?.message}`).toBeNull();

    const row = await readAttachment(admin, attachmentId);
    expect(row.scan_status).toBe("flagged");
    expect(row.scan_signature).toBe(SCAN_SIGNATURE);
    expect(row.scanned_at).not.toBeNull();
    expect(row.scan_failed_reason).toBeNull();

    const events = await readProvenanceEvents(admin, accountId, workOrderId, "photo.scan_flagged");
    const ev = events.find((e) => e.metadata?.attachment_id === attachmentId);
    expect(ev, "photo.scan_flagged event not found").toBeDefined();
    expect(ev.metadata.scan_signature).toBe(SCAN_SIGNATURE);

    // D3 / D8: file MUST still exist in storage after a flagged verdict
    const { data: fileData, error: dlErr } = await admin.storage.from(BUCKET).download(storagePath);
    expect(dlErr, "flagged file should NOT be deleted from storage").toBeNull();
    expect(fileData).not.toBeNull();
  });

  // ── T04: scan_failed verdict ────────────────────────────────────────────────

  integrationIt("T04 scan_failed → scan_status='scan_failed', reason set, photo.scan_failed event; NOT flagged", async () => {
    const { accountId, workOrderId } = scaffold;
    const { attachmentId } = await seedAttachment(admin, accountId, workOrderId, contractorSession.user.id);

    const { error } = await callScanResult(admin, attachmentId, "scan_failed", {
      scanFailedReason: SCAN_FAIL_REASON,
    });
    expect(error, `record error: ${error?.message}`).toBeNull();

    const row = await readAttachment(admin, attachmentId);
    expect(row.scan_status).toBe("scan_failed");
    expect(row.scan_status).not.toBe("flagged");  // hard rule: transient ≠ malware
    expect(row.scan_failed_reason).toBe(SCAN_FAIL_REASON);
    expect(row.scan_signature).toBeNull();
    expect(row.scanned_at).toBeNull();     // scanned_at only set on clean/flagged
    expect(row.scan_attempted_at).not.toBeNull();

    const events = await readProvenanceEvents(admin, accountId, workOrderId, "photo.scan_failed");
    const ev = events.find((e) => e.metadata?.attachment_id === attachmentId);
    expect(ev, "photo.scan_failed event not found").toBeDefined();
    expect(ev.metadata.scan_failed_reason).toBe(SCAN_FAIL_REASON);
  });

  // ── T05–T08: Serve gate (can_serve_work_order_attachment_storage) ───────────

  integrationIt("T05 serve gate: clean attachment → can_serve returns true for member", async () => {
    const { accountId, workOrderId } = scaffold;
    const { attachmentId, storagePath } = await seedAttachment(
      admin, accountId, workOrderId, contractorSession.user.id,
      { scan_status: "clean" },
    );

    // Update to clean directly via admin for a seeded row
    await admin.from("work_order_attachments")
      .update({ scan_status: "clean", scanned_at: new Date().toISOString() })
      .eq("id", attachmentId);

    const result = await canServe(ownerSession.client, storagePath);
    expect(result).toBe(true);
  });

  integrationIt("T06 serve gate: pending_scan → can_serve returns false", async () => {
    const { accountId, workOrderId } = scaffold;
    const { storagePath } = await seedAttachment(
      admin, accountId, workOrderId, contractorSession.user.id,
      { scan_status: "pending_scan" },
    );
    const result = await canServe(ownerSession.client, storagePath);
    expect(result).toBe(false);
  });

  integrationIt("T07 serve gate: flagged → can_serve returns false", async () => {
    const { accountId, workOrderId } = scaffold;
    const { storagePath } = await seedAttachment(
      admin, accountId, workOrderId, contractorSession.user.id,
      { scan_status: "flagged", scan_signature: SCAN_SIGNATURE },
    );
    const result = await canServe(ownerSession.client, storagePath);
    expect(result).toBe(false);
  });

  integrationIt("T08 serve gate: legacy_unscanned → can_serve returns false", async () => {
    const { accountId, workOrderId } = scaffold;
    const { storagePath } = await seedAttachment(
      admin, accountId, workOrderId, contractorSession.user.id,
      { scan_status: "legacy_unscanned" },
    );
    const result = await canServe(ownerSession.client, storagePath);
    expect(result).toBe(false);
  });

  // ── T09–T11: Atomicity deny-test ───────────────────────────────────────────

  integrationIt("T09 deny-test positive control: clean → scan_status='clean' + photo.scan_clean (no GUC)", async () => {
    const { accountId, workOrderId } = scaffold;
    const { attachmentId } = await seedAttachment(admin, accountId, workOrderId, contractorSession.user.id);

    // Positive control: call real function via admin (no deny-test GUC)
    const { error } = await callScanResult(admin, attachmentId, "clean", { scanEngine: "clamav" });
    expect(error).toBeNull();

    const row = await readAttachment(admin, attachmentId);
    expect(row.scan_status).toBe("clean");

    const events = await readProvenanceEvents(admin, accountId, workOrderId, "photo.scan_clean");
    expect(events.some((e) => e.metadata?.attachment_id === attachmentId)).toBe(true);
  });

  integrationIt("T10 deny-test rollback: forced failure → scan_status stays pending_scan, no event", async () => {
    const { accountId, workOrderId } = scaffold;
    const { attachmentId } = await seedAttachment(admin, accountId, workOrderId, contractorSession.user.id);

    // Deny-test wrapper arms the GUC and calls the real function in-transaction
    const { error } = await callDenyTestWrapper(ownerSession.client, attachmentId, "clean");

    // The raised exception is surfaced to the caller as an error
    expect(error).not.toBeNull();
    expect(error.message).toMatch(/forced photo scan provenance failure/i);

    // Row must be restored to pending_scan — the UPDATE was rolled back
    const row = await readAttachment(admin, attachmentId);
    expect(row.scan_status).toBe("pending_scan");
    expect(row.scanned_at).toBeNull();

    // No photo.scan_clean event must have been emitted
    const events = await readProvenanceEvents(admin, accountId, workOrderId, "photo.scan_clean");
    expect(events.some((e) => e.metadata?.attachment_id === attachmentId)).toBe(false);
  });

  integrationIt("T11 deny-test retry after rollback: succeeds, exactly 1 photo.scan_clean event", async () => {
    const { accountId, workOrderId } = scaffold;
    const { attachmentId } = await seedAttachment(admin, accountId, workOrderId, contractorSession.user.id);

    // Pass 1: deny-test triggers rollback (same pattern as T10)
    await callDenyTestWrapper(ownerSession.client, attachmentId, "clean");
    const rowAfterRollback = await readAttachment(admin, attachmentId);
    expect(rowAfterRollback.scan_status).toBe("pending_scan");

    // Pass 2: retry without the GUC → succeeds
    const { error: retryErr } = await callScanResult(admin, attachmentId, "clean", { scanEngine: "clamav" });
    expect(retryErr).toBeNull();

    const rowAfterRetry = await readAttachment(admin, attachmentId);
    expect(rowAfterRetry.scan_status).toBe("clean");

    // Exactly one photo.scan_clean event for this attachment
    const events = await readProvenanceEvents(admin, accountId, workOrderId, "photo.scan_clean");
    const matching = events.filter((e) => e.metadata?.attachment_id === attachmentId);
    expect(matching).toHaveLength(1);
  });

  // ── T12: Security ───────────────────────────────────────────────────────────

  integrationIt("T12 security: authenticated user cannot call record_work_order_attachment_scan_result directly", async () => {
    const { accountId, workOrderId } = scaffold;
    const { attachmentId } = await seedAttachment(admin, accountId, workOrderId, contractorSession.user.id);

    // Call via user client (not service role) — must be denied
    const { error } = await ownerSession.client.rpc(
      "record_work_order_attachment_scan_result",
      {
        p_attachment_id: attachmentId,
        p_scan_status:   "clean",
        p_scan_engine:   "clamav",
      },
    );

    expect(error, "should have been denied").not.toBeNull();
    expect(error.message).toMatch(/permission denied|not found|does not exist/i);
  });

  // ── T13: Terminal idempotency ───────────────────────────────────────────────

  integrationIt("T13 idempotency: clean is final; re-recording flagged on a clean row stays clean", async () => {
    const { accountId, workOrderId } = scaffold;
    const { attachmentId } = await seedAttachment(admin, accountId, workOrderId, contractorSession.user.id);

    // First: transition to clean
    await callScanResult(admin, attachmentId, "clean", { scanEngine: "clamav" });

    // Second: attempt to transition to flagged (must be rejected by idempotency guard)
    const { error } = await callScanResult(admin, attachmentId, "flagged", {
      scanSignature: SCAN_SIGNATURE,
    });
    expect(error).toBeNull(); // function returns without error (early return)

    const row = await readAttachment(admin, attachmentId);
    expect(row.scan_status).toBe("clean"); // must stay clean
    expect(row.scan_signature).toBeNull(); // flagged signature must not have been written
  });

  integrationIt("T14 idempotency: scan_failed is retryable; re-recording clean after scan_failed succeeds", async () => {
    const { accountId, workOrderId } = scaffold;
    const { attachmentId } = await seedAttachment(admin, accountId, workOrderId, contractorSession.user.id);

    // First: transient failure
    const { error: err1 } = await callScanResult(admin, attachmentId, "scan_failed", {
      scanFailedReason: SCAN_FAIL_REASON,
    });
    expect(err1).toBeNull();

    let row = await readAttachment(admin, attachmentId);
    expect(row.scan_status).toBe("scan_failed");

    // Second: retry succeeds (scan_failed is NOT terminal)
    const { error: err2 } = await callScanResult(admin, attachmentId, "clean", { scanEngine: "clamav" });
    expect(err2).toBeNull();

    row = await readAttachment(admin, attachmentId);
    expect(row.scan_status).toBe("clean");
    expect(row.scanned_at).not.toBeNull();
  });

  // ── T15: Pack exclusion proof ───────────────────────────────────────────────

  integrationIt("T15 pack exclusion: flagged absent from serve gate; clean present", async () => {
    const { accountId, workOrderId } = scaffold;

    // Seed a clean and a flagged attachment
    const { attachmentId: cleanId, storagePath: cleanPath } = await seedAttachment(
      admin, accountId, workOrderId, contractorSession.user.id,
      { scan_status: "pending_scan" },
    );
    const { attachmentId: flaggedId, storagePath: flaggedPath } = await seedAttachment(
      admin, accountId, workOrderId, contractorSession.user.id,
      { scan_status: "pending_scan" },
    );

    // Transition clean attachment
    await callScanResult(admin, cleanId, "clean", { scanEngine: "clamav" });
    // Transition flagged attachment
    await callScanResult(admin, flaggedId, "flagged", { scanSignature: SCAN_SIGNATURE });

    // Serve gate returns true for clean, false for flagged
    const cleanServed   = await canServe(ownerSession.client, cleanPath);
    const flaggedServed = await canServe(ownerSession.client, flaggedPath);

    expect(cleanServed).toBe(true);    // clean: accessible via serve gate
    expect(flaggedServed).toBe(false); // flagged: refused by serve gate (D3 / D4)

    // List query confirms scan_status is exposed so consumers can filter
    const { data: rows } = await admin
      .from("work_order_attachments")
      .select("id, scan_status")
      .in("id", [cleanId, flaggedId]);

    const cleanRow   = rows?.find((r) => r.id === cleanId);
    const flaggedRow = rows?.find((r) => r.id === flaggedId);

    expect(cleanRow?.scan_status).toBe("clean");
    expect(flaggedRow?.scan_status).toBe("flagged");

    // Pack-consumer simulation: filter list to scan_status='clean' only
    const packRows = (rows ?? []).filter((r) => r.scan_status === "clean");
    expect(packRows.map((r) => r.id)).toContain(cleanId);
    expect(packRows.map((r) => r.id)).not.toContain(flaggedId);
  });

  // ── T16: Regression — prior suites still green ─────────────────────────────

  integrationIt("T16 regression: photo.received event still emits on contractor_completion upload", async () => {
    const { accountId, workOrderId } = scaffold;

    const storagePath = makePath(accountId, workOrderId, "t16_regression.jpg");
    await seedStorageObject(admin, storagePath);

    const { data, error } = await contractorSession.client.rpc(
      "record_work_order_attachment_received",
      {
        p_account_id:                   accountId,
        p_work_order_id:                workOrderId,
        p_storage_path:                 storagePath,
        p_file_name:                    "t16_regression.jpg",
        p_mime_type:                    "image/jpeg",
        p_file_size:                    4,
        p_kind:                         "photo",
        p_attester_role:                "contractor",
        p_maintenance_stage:            "contractor_completion",
        p_capture_method:               "uploaded",
        p_content_hash_client_asserted: null,
      },
    );
    expect(error, `record_received: ${error?.message}`).toBeNull();
    if (data?.id) createdAttachmentIds.push(data.id);

    // photo.received event must still be emitted (E-150.1 / E-160 / E-163 not regressed)
    const events = await readProvenanceEvents(admin, accountId, workOrderId, "photo.received");
    const ev = events.find((e) => e.metadata?.storage_path === storagePath);
    expect(ev, "photo.received event not found").toBeDefined();
    expect(ev.metadata.maintenance_stage).toBe("contractor_completion");

    // E-158: new upload must anchor with pending_scan
    const row = data ?? {};
    expect(row.scan_status).toBe("pending_scan");
  });
});
