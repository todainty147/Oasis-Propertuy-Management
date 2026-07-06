/**
 * E-163 — Server-Side Byte-Hash Verification for Work-Order Photo Evidence
 *
 * Integration tests running against the local Supabase DB (skipped if harness unconfigured).
 *
 * Coverage map:
 *  T01 — match → hash_trust='verified', content_hash_server_computed set, content_hash_verified_at set
 *  T02 — match → photo.hash_verified provenance event emitted with correct metadata
 *  T03 — match → content_hash_client_asserted NOT overwritten (preserved)
 *  T04 — mismatch → hash_trust='verification_failed', both hashes preserved (client ≠ server)
 *  T05 — mismatch → photo.hash_verification_failed event emitted
 *  T06 — mismatch → content_hash_client_asserted NOT overwritten
 *  T07 — transient read error (p_match=null) → hash_trust stays 'client_asserted_unverified'
 *  T08 — transient → hash_verification_error + verification_attempted_at set, no event
 *  T09 — transient → NOT 'verification_failed' (hard rule: only confirmed mismatch red-flags)
 *  T10 — terminal idempotency: already 'verified' → early return, no second event
 *  T11 — terminal idempotency: already 'verification_failed' → early return, no second event
 *  T12 — deny-test: positive control (match → verified + event without GUC)
 *  T13 — deny-test: verified path rollback → row stays client_asserted_unverified, server hash NULL, verified_at NULL, no event
 *  T14 — deny-test: verified path retry → succeeds, exactly 1 photo.hash_verified event
 *  T15 — deny-test: mismatch path rollback → row stays client_asserted_unverified, no photo.hash_verification_failed
 *  T16 — security: authenticated user cannot call record_work_order_photo_hash_verification directly
 *  T17 — E-150.1 / E-160 intact: photo.received event still emits on upload
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

// Track scaffolded entities for cleanup
const createdAccountIds = [];
const createdWorkOrderIds = [];
const createdAttachmentIds = [];
const createdStoragePaths = [];

// ─── Helpers ────────────────────────────────────────────────────────────────

async function ensureBucket(admin) {
  const { error } = await admin.storage.createBucket(BUCKET, {
    public: false,
    allowedMimeTypes: ["image/jpeg", "image/png"],
    fileSizeLimit: 10 * 1024 * 1024,
  });
  if (error && !/already exists/i.test(error.message || "")) {
    throw new Error(`Bucket create: ${error.message}`);
  }
}

async function seedStorageObject(admin, storagePath) {
  const fakeBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
  const { error } = await admin.storage.from(BUCKET).upload(storagePath, fakeBytes, {
    contentType: "image/jpeg",
    upsert: true,
  });
  if (error) throw new Error(`Storage seed (${storagePath}): ${error.message}`);
  createdStoragePaths.push(storagePath);
  return storagePath;
}

function makePath(accountId, workOrderId, suffix = "photo.jpg") {
  return `account/${accountId}/work_orders/${workOrderId}/${Date.now()}_${suffix}`;
}

async function scaffoldWorkOrder(admin, ownerUserId, contractorUserId, status = "assigned") {
  const accountId = randomUUID();
  createdAccountIds.push(accountId);

  const { error: acctErr } = await admin.from("accounts").insert({
    id: accountId,
    name: `E-163 probe ${accountId.slice(0, 8)}`,
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
    address: "1 E163 Street",
    city: "London",
    size: "1 bed",
    rent: 1000,
    status: "Wolne",
  });
  if (propErr) throw new Error(`scaffold property: ${propErr.message}`);

  const contractorId = randomUUID();
  const { error: cErr } = await admin.from("contractors").insert({
    id: contractorId,
    account_id: accountId,
    user_id: contractorUserId,
    name: "E163 Contractor",
    phone: "+447700900163",
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
    contractor_name: "E163 Contractor",
    contractor_phone: "+447700900163",
    status,
    created_by: ownerUserId,
  });
  if (woErr) throw new Error(`scaffold work_order: ${woErr.message}`);

  return { accountId, workOrderId, propertyId };
}

/** Seeds a work_order_attachments row directly via admin for test control. */
async function seedAttachment(admin, accountId, workOrderId, uploadedByUserId, clientHash = null) {
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
    content_hash_client_asserted: clientHash,
    content_hash_algorithm: clientHash ? "sha256" : null,
    content_hash_verified_at: null,
    hash_trust: "client_asserted_unverified",
  });
  if (error) throw new Error(`seedAttachment: ${error.message}`);
  createdAttachmentIds.push(attachmentId);
  return attachmentId;
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

async function readProvenanceEvents(admin, accountId, entityType, entityId, eventType) {
  let q = admin
    .from("provenance_events")
    .select("id, event_type, entity_type, entity_id, occurred_at, metadata, account_id")
    .eq("account_id", accountId)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId);
  if (eventType) q = q.eq("event_type", eventType);
  const { data, error } = await q;
  if (error) throw new Error(`readProvenanceEvents: ${error.message}`);
  return data ?? [];
}

/** Calls the recording function via admin (service_role). */
async function callHashVerification(admin, attachmentId, serverHash, match, errStr = null) {
  return admin.rpc("record_work_order_photo_hash_verification", {
    p_attachment_id: attachmentId,
    p_server_hash: serverHash,
    p_match: match,
    p_error: errStr,
  });
}

/** Calls the deny-test wrapper via an authenticated user client. */
async function callDenyTestWrapper(userClient, attachmentId, serverHash, match, errStr = null) {
  return userClient.rpc("record_work_order_photo_hash_verification_atomicity_deny_test", {
    p_attachment_id: attachmentId,
    p_server_hash: serverHash,
    p_match: match,
    p_error: errStr,
  });
}

// Stable test hash values
const CLIENT_HASH =
  "a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3";
const DIFFERENT_HASH =
  "b3a8e0e1f9ef1a9d9a2a5e2a5e2a5e2a5e2a5e2a5e2a5e2a5e2a5e2a5e2a5e2";

// ─── Suite ──────────────────────────────────────────────────────────────────

describe("E-163 — work-order photo hash verification (integration)", () => {
  if (!isIntegrationHarnessConfigured()) return;

  let admin;
  let ownerSession;   // { client, user, fixture }
  let contractorSession;
  let scaffold;       // { accountId, workOrderId }

  beforeAll(async () => {
    await ensureIsolationHarnessSeed();
    admin = getIntegrationAdminClient();
    await ensureBucket(admin);

    ownerSession = await signInAsFixtureUser("ownerA");
    contractorSession = await signInAsFixtureUser("contractorA1");

    scaffold = await scaffoldWorkOrder(
      admin,
      ownerSession.user.id,
      contractorSession.user.id,
      "assigned"
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

  // ── T01–T03: Match path ────────────────────────────────────────────────────

  integrationIt("T01 match → hash_trust=verified, server hash set, verified_at set", async () => {
    const { accountId, workOrderId } = scaffold;
    const attachmentId = await seedAttachment(admin, accountId, workOrderId, contractorSession.user.id, CLIENT_HASH);

    const { error } = await callHashVerification(admin, attachmentId, CLIENT_HASH, true);
    expect(error, `record error: ${error?.message}`).toBeNull();

    const row = await readAttachment(admin, attachmentId);
    expect(row.hash_trust).toBe("verified");
    expect(row.content_hash_server_computed).toBe(CLIENT_HASH);
    expect(row.content_hash_verified_at).not.toBeNull();
    expect(row.verification_attempted_at).not.toBeNull();
    expect(row.hash_verification_error).toBeNull();
  });

  integrationIt("T02 match → photo.hash_verified event with correct metadata", async () => {
    const { accountId, workOrderId } = scaffold;
    const attachmentId = await seedAttachment(admin, accountId, workOrderId, contractorSession.user.id, CLIENT_HASH);

    await callHashVerification(admin, attachmentId, CLIENT_HASH, true);

    const events = await readProvenanceEvents(
      admin, accountId, "work_order", workOrderId, "photo.hash_verified"
    );
    const ev = events.find((e) => e.metadata?.attachment_id === attachmentId);
    expect(ev, "photo.hash_verified event not found").toBeDefined();
    expect(ev.metadata.content_hash_client_asserted).toBe(CLIENT_HASH);
    expect(ev.metadata.content_hash_server_computed).toBe(CLIENT_HASH);
    expect(ev.metadata.content_hash_algorithm).toBe("sha256");
    expect(ev.metadata.hash_trust).toBe("verified");
    expect(ev.metadata.attachment_id).toBe(attachmentId);
    expect(ev.metadata.work_order_id).toBe(workOrderId);
    expect(ev.metadata.account_id).toBe(accountId);
  });

  integrationIt("T03 match → content_hash_client_asserted NOT overwritten", async () => {
    const { accountId, workOrderId } = scaffold;
    const attachmentId = await seedAttachment(admin, accountId, workOrderId, contractorSession.user.id, CLIENT_HASH);

    await callHashVerification(admin, attachmentId, CLIENT_HASH, true);

    const row = await readAttachment(admin, attachmentId);
    expect(row.content_hash_client_asserted).toBe(CLIENT_HASH);
  });

  // ── T04–T06: Mismatch path ─────────────────────────────────────────────────

  integrationIt("T04 mismatch → hash_trust=verification_failed, both hashes preserved", async () => {
    const { accountId, workOrderId } = scaffold;
    const attachmentId = await seedAttachment(admin, accountId, workOrderId, contractorSession.user.id, CLIENT_HASH);

    const { error } = await callHashVerification(admin, attachmentId, DIFFERENT_HASH, false);
    expect(error, `record error: ${error?.message}`).toBeNull();

    const row = await readAttachment(admin, attachmentId);
    expect(row.hash_trust).toBe("verification_failed");
    expect(row.content_hash_client_asserted).toBe(CLIENT_HASH);      // never overwritten
    expect(row.content_hash_server_computed).toBe(DIFFERENT_HASH);    // server value stored
    expect(row.content_hash_verified_at).toBeNull();                  // no verified_at on mismatch
    expect(row.verification_attempted_at).not.toBeNull();
    expect(row.hash_verification_error).toBeNull();
  });

  integrationIt("T05 mismatch → photo.hash_verification_failed event emitted", async () => {
    const { accountId, workOrderId } = scaffold;
    const attachmentId = await seedAttachment(admin, accountId, workOrderId, contractorSession.user.id, CLIENT_HASH);

    await callHashVerification(admin, attachmentId, DIFFERENT_HASH, false);

    const events = await readProvenanceEvents(
      admin, accountId, "work_order", workOrderId, "photo.hash_verification_failed"
    );
    const ev = events.find((e) => e.metadata?.attachment_id === attachmentId);
    expect(ev, "photo.hash_verification_failed event not found").toBeDefined();
    expect(ev.metadata.content_hash_client_asserted).toBe(CLIENT_HASH);
    expect(ev.metadata.content_hash_server_computed).toBe(DIFFERENT_HASH);
    expect(ev.metadata.hash_trust).toBe("verification_failed");
  });

  integrationIt("T06 mismatch → content_hash_client_asserted NOT overwritten", async () => {
    const { accountId, workOrderId } = scaffold;
    const attachmentId = await seedAttachment(admin, accountId, workOrderId, contractorSession.user.id, CLIENT_HASH);

    await callHashVerification(admin, attachmentId, DIFFERENT_HASH, false);

    const row = await readAttachment(admin, attachmentId);
    expect(row.content_hash_client_asserted).toBe(CLIENT_HASH);
  });

  // ── T07–T09: Transient error path ──────────────────────────────────────────

  integrationIt("T07 transient error → hash_trust stays client_asserted_unverified", async () => {
    const { accountId, workOrderId } = scaffold;
    const attachmentId = await seedAttachment(admin, accountId, workOrderId, contractorSession.user.id, CLIENT_HASH);

    const { error } = await callHashVerification(admin, attachmentId, null, null, "storage timeout");
    expect(error, `record error: ${error?.message}`).toBeNull();

    const row = await readAttachment(admin, attachmentId);
    expect(row.hash_trust).toBe("client_asserted_unverified");
  });

  integrationIt("T08 transient error → error + attempted_at set, no hash event", async () => {
    const { accountId, workOrderId } = scaffold;
    const attachmentId = await seedAttachment(admin, accountId, workOrderId, contractorSession.user.id, CLIENT_HASH);

    await callHashVerification(admin, attachmentId, null, null, "storage timeout");

    const row = await readAttachment(admin, attachmentId);
    expect(row.hash_verification_error).toBe("storage timeout");
    expect(row.verification_attempted_at).not.toBeNull();
    expect(row.content_hash_server_computed).toBeNull();
    expect(row.content_hash_verified_at).toBeNull();

    // No provenance event for transient failures
    const allEvents = await readProvenanceEvents(
      admin, accountId, "work_order", workOrderId, null
    );
    const hashEvs = allEvents.filter(
      (e) =>
        e.metadata?.attachment_id === attachmentId &&
        (e.event_type === "photo.hash_verified" ||
          e.event_type === "photo.hash_verification_failed")
    );
    expect(hashEvs).toHaveLength(0);
  });

  integrationIt("T09 transient error → NOT verification_failed (hard rule)", async () => {
    const { accountId, workOrderId } = scaffold;
    const attachmentId = await seedAttachment(admin, accountId, workOrderId, contractorSession.user.id, CLIENT_HASH);

    await callHashVerification(admin, attachmentId, null, null, "object not found in storage");

    const row = await readAttachment(admin, attachmentId);
    expect(row.hash_trust).not.toBe("verification_failed");
    expect(row.hash_trust).toBe("client_asserted_unverified");
  });

  // ── T10–T11: Terminal idempotency ──────────────────────────────────────────

  integrationIt("T10 already verified → early return, no second event", async () => {
    const { accountId, workOrderId } = scaffold;
    const attachmentId = await seedAttachment(admin, accountId, workOrderId, contractorSession.user.id, CLIENT_HASH);

    await callHashVerification(admin, attachmentId, CLIENT_HASH, true);

    const before = await readProvenanceEvents(
      admin, accountId, "work_order", workOrderId, "photo.hash_verified"
    );
    const countBefore = before.filter((e) => e.metadata?.attachment_id === attachmentId).length;
    expect(countBefore).toBe(1);

    // Second call — should early-return, no new event
    const { error: secondErr } = await callHashVerification(admin, attachmentId, CLIENT_HASH, true);
    expect(secondErr).toBeNull();

    const after = await readProvenanceEvents(
      admin, accountId, "work_order", workOrderId, "photo.hash_verified"
    );
    expect(after.filter((e) => e.metadata?.attachment_id === attachmentId)).toHaveLength(1);
  });

  integrationIt("T11 already verification_failed → early return, no flip", async () => {
    const { accountId, workOrderId } = scaffold;
    const attachmentId = await seedAttachment(admin, accountId, workOrderId, contractorSession.user.id, CLIENT_HASH);

    await callHashVerification(admin, attachmentId, DIFFERENT_HASH, false);

    // Second call tries to set verified — should be ignored
    const { error: secondErr } = await callHashVerification(admin, attachmentId, CLIENT_HASH, true);
    expect(secondErr).toBeNull();

    const row = await readAttachment(admin, attachmentId);
    expect(row.hash_trust).toBe("verification_failed"); // unchanged

    const failedEvents = await readProvenanceEvents(
      admin, accountId, "work_order", workOrderId, "photo.hash_verification_failed"
    );
    expect(failedEvents.filter((e) => e.metadata?.attachment_id === attachmentId)).toHaveLength(1);
  });

  // ── T12–T15: Atomicity deny-test ───────────────────────────────────────────

  integrationIt("T12 deny-test positive control: match → verified + event without GUC", async () => {
    const { accountId, workOrderId } = scaffold;
    const attachmentId = await seedAttachment(admin, accountId, workOrderId, contractorSession.user.id, CLIENT_HASH);

    const { error } = await callHashVerification(admin, attachmentId, CLIENT_HASH, true);
    expect(error).toBeNull();

    const row = await readAttachment(admin, attachmentId);
    expect(row.hash_trust).toBe("verified");

    const events = await readProvenanceEvents(
      admin, accountId, "work_order", workOrderId, "photo.hash_verified"
    );
    expect(events.filter((e) => e.metadata?.attachment_id === attachmentId)).toHaveLength(1);
  });

  integrationIt(
    "T13 deny-test verified rollback → row stays client_asserted_unverified, no event",
    async () => {
      const { accountId, workOrderId } = scaffold;
      const attachmentId = await seedAttachment(admin, accountId, workOrderId, contractorSession.user.id, CLIENT_HASH);

      // Snapshot pre-state
      const pre = await readAttachment(admin, attachmentId);
      expect(pre.hash_trust).toBe("client_asserted_unverified");
      expect(pre.content_hash_server_computed).toBeNull();
      expect(pre.content_hash_verified_at).toBeNull();

      // Deny-test wrapper is granted to authenticated — call as contractor
      const { error: denyErr } = await callDenyTestWrapper(
        contractorSession.client,
        attachmentId,
        CLIENT_HASH,
        true
      );
      expect(denyErr, "deny-test must raise an error").not.toBeNull();

      // Full rollback: UPDATE must be undone
      const post = await readAttachment(admin, attachmentId);
      expect(post.hash_trust).toBe("client_asserted_unverified");
      expect(post.content_hash_server_computed).toBeNull();
      expect(post.content_hash_verified_at).toBeNull();

      // No event
      const events = await readProvenanceEvents(
        admin, accountId, "work_order", workOrderId, "photo.hash_verified"
      );
      expect(events.filter((e) => e.metadata?.attachment_id === attachmentId)).toHaveLength(0);
    }
  );

  integrationIt(
    "T14 deny-test retry: after rollback, real call succeeds with exactly 1 event",
    async () => {
      const { accountId, workOrderId } = scaffold;
      const attachmentId = await seedAttachment(admin, accountId, workOrderId, contractorSession.user.id, CLIENT_HASH);

      // Deny-test (expected to fail/rollback)
      await callDenyTestWrapper(contractorSession.client, attachmentId, CLIENT_HASH, true);

      // Real call via admin (no GUC) — must succeed
      const { error } = await callHashVerification(admin, attachmentId, CLIENT_HASH, true);
      expect(error).toBeNull();

      const row = await readAttachment(admin, attachmentId);
      expect(row.hash_trust).toBe("verified");

      // Exactly 1 event, not 2
      const events = await readProvenanceEvents(
        admin, accountId, "work_order", workOrderId, "photo.hash_verified"
      );
      expect(events.filter((e) => e.metadata?.attachment_id === attachmentId)).toHaveLength(1);
    }
  );

  integrationIt(
    "T15 deny-test mismatch rollback → row stays client_asserted_unverified, no event",
    async () => {
      const { accountId, workOrderId } = scaffold;
      const attachmentId = await seedAttachment(admin, accountId, workOrderId, contractorSession.user.id, CLIENT_HASH);

      const { error: denyErr } = await callDenyTestWrapper(
        contractorSession.client,
        attachmentId,
        DIFFERENT_HASH,
        false
      );
      expect(denyErr, "deny-test mismatch must raise an error").not.toBeNull();

      const post = await readAttachment(admin, attachmentId);
      expect(post.hash_trust).toBe("client_asserted_unverified");
      expect(post.content_hash_server_computed).toBeNull();

      const events = await readProvenanceEvents(
        admin, accountId, "work_order", workOrderId, "photo.hash_verification_failed"
      );
      expect(events.filter((e) => e.metadata?.attachment_id === attachmentId)).toHaveLength(0);
    }
  );

  // ── T16: Security ──────────────────────────────────────────────────────────

  integrationIt(
    "T16 security: authenticated user cannot call record_work_order_photo_hash_verification directly",
    async () => {
      const { accountId, workOrderId } = scaffold;
      const attachmentId = await seedAttachment(admin, accountId, workOrderId, contractorSession.user.id, CLIENT_HASH);

      const { error } = await ownerSession.client.rpc(
        "record_work_order_photo_hash_verification",
        {
          p_attachment_id: attachmentId,
          p_server_hash: CLIENT_HASH,
          p_match: true,
          p_error: null,
        }
      );

      expect(error, "authenticated user should not be able to call recording function").not.toBeNull();
      expect(error.message || error.code || "").toMatch(/permission denied|not allowed|42501/i);
    }
  );

  // ── T17: E-150.1 / E-160 intact ───────────────────────────────────────────

  integrationIt(
    "T17 E-150.1/E-160 intact: photo.received event still emits on upload",
    async () => {
      const { accountId, workOrderId } = scaffold;
      const storagePath = makePath(accountId, workOrderId, "t17_integrity.jpg");
      await seedStorageObject(admin, storagePath);

      const { data: row, error } = await contractorSession.client.rpc(
        "record_work_order_attachment_received",
        {
          p_account_id: accountId,
          p_work_order_id: workOrderId,
          p_storage_path: storagePath,
          p_file_name: "t17.jpg",
          p_mime_type: "image/jpeg",
          p_file_size: 4,
          p_kind: "photo",
          p_attester_role: "contractor",
          p_maintenance_stage: "contractor_completion",
          p_capture_method: "uploaded",
          p_content_hash_client_asserted: CLIENT_HASH,
        }
      );
      expect(error, `E-150.1 upload error: ${error?.message}`).toBeNull();

      const inserted = Array.isArray(row) ? row[0] : row;
      if (inserted?.id) createdAttachmentIds.push(inserted.id);

      const events = await readProvenanceEvents(
        admin, accountId, "work_order", workOrderId, "photo.received"
      );
      const ev = events.find((e) => e.metadata?.attachment_id === inserted?.id);
      expect(ev, "photo.received event missing (E-150.1 regression)").toBeDefined();

      const attachment = await readAttachment(admin, inserted.id);
      expect(attachment.content_hash_client_asserted).toBe(CLIENT_HASH);
      expect(attachment.hash_trust).toBe("client_asserted_unverified");
    }
  );
});
