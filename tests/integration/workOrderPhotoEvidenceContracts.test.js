/**
 * E-150.1 — Work-Order Contractor Completion Photo Evidence
 *
 * Integration tests that run against the local Supabase DB.
 * Skipped automatically when TEST_SUPABASE_URL is not configured.
 *
 * Coverage map:
 *  T1  — contractor upload sets attester_role='contractor'; manager upload not mislabelled
 *  T2  — maintenance_stage recorded; work_order_status_at_received server-observed; received_at server-assigned
 *  T3  — capture_method='uploaded'; in_app_camera not used on this path
 *  T4  — photo.received provenance event emitted with correct metadata fields
 *  T5  — storage-absent → RPC errors → no anchored row/event (forbidden direction impossible)
 *        (provenance-failure direction is proven by SQL contract: single-function PL/pgSQL transaction)
 *  T6  — content_hash_client_asserted set; hash_trust='client_asserted_unverified'; no image_content_hash
 *  T7  — received_at / occurred_at is server-assigned; EXIF/client timestamp not used as anchor
 *  T8  — post-completion upload blocked; valid upload window tested
 *  T9  — E-159 RLS: non-assigned contractor blocked; cross-account blocked; managers/staff read correctly
 *  T10 — no deposit-pack or maintenance-pack rendering overclaim (static in workOrderEvidenceLockContracts.test.js)
 *
 * Storage objects are seeded via admin.storage API.
 * All scaffolded accounts/WOs/attachments are cleaned up in afterAll.
 */

import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ensureIsolationHarnessSeed,
  getIntegrationAdminClient,
  isolationSeedIds,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "./helpers/env.js";
import { isolationFixtures } from "../fixtures/isolationFixtures.js";

const integrationIt = isIntegrationHarnessConfigured() ? it : it.skip;

const BUCKET = "work-order-attachments";
const ACCOUNT_A = isolationFixtures.accounts.accountA.id;
const ACCOUNT_B = isolationFixtures.accounts.accountB.id;

// Scaffolded entities to clean up after all tests.
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
  // Ignore "already exists" — that's fine.
  if (error && !/already exists/i.test(error.message || "")) {
    throw new Error(`Bucket create: ${error.message}`);
  }
}

/**
 * Uploads a minimal JPEG-like buffer into the storage bucket and returns the path.
 * The content is 4 bytes — enough to satisfy the storage.objects existence check.
 */
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

/** Returns a unique storage path for a given work order. */
function makePath(accountId, workOrderId, suffix = "photo.jpg") {
  return `account/${accountId}/work_orders/${workOrderId}/${Date.now()}_${suffix}`;
}

/**
 * Scaffolds: fresh account, owner membership, property, WO with assigned contractor.
 * Returns { accountId, workOrderId } for use in tests.
 */
async function scaffoldWorkOrder(admin, ownerUser, contractorUserId, status = "assigned") {
  const accountId = randomUUID();
  createdAccountIds.push(accountId);

  const { error: acctErr } = await admin.from("accounts").insert({
    id: accountId,
    name: `E-150 probe ${accountId.slice(0, 8)}`,
    created_by: ownerUser.id,
    is_root: false,
    subscription_status: "active",
    subscription_plan: "pro",
  });
  if (acctErr) throw new Error(`scaffold account: ${acctErr.message}`);

  const { error: memberErr } = await admin.from("account_members").insert({
    account_id: accountId,
    user_id: ownerUser.id,
    role: "owner",
  });
  if (memberErr) throw new Error(`scaffold member: ${memberErr.message}`);

  const propertyId = randomUUID();
  const { error: propErr } = await admin.from("properties").insert({
    id: propertyId,
    account_id: accountId,
    owner_id: ownerUser.id,
    address: "1 Test Street",
    city: "London",
    size: "1 bed",
    rent: 1000,
    status: "Wolne",
  });
  if (propErr) throw new Error(`scaffold property: ${propErr.message}`);

  // Add contractor to this account's contractors table so WO assignment triggers can validate them.
  const contractorId = randomUUID();
  const { error: cErr } = await admin.from("contractors").insert({
    id: contractorId,
    account_id: accountId,
    user_id: contractorUserId,
    name: "Test Contractor",
    phone: "+447700900199",
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
    contractor_name: "Test Contractor",
    contractor_phone: "+447700900199",
    status,
    created_by: ownerUser.id,
  });
  if (woErr) throw new Error(`scaffold work_order: ${woErr.message}`);

  return { accountId, workOrderId, propertyId };
}

/** Reads a single work_order_attachments row by id via admin. */
async function readAttachment(admin, attachmentId) {
  const { data, error } = await admin
    .from("work_order_attachments")
    .select("*")
    .eq("id", attachmentId)
    .single();
  if (error) throw new Error(`readAttachment: ${error.message}`);
  return data;
}

/** Reads provenance_events for a given entity. */
async function readProvenanceEvents(admin, accountId, entityType, entityId, eventType) {
  const { data, error } = await admin
    .from("provenance_events")
    .select("id, event_type, entity_type, entity_id, occurred_at, metadata, account_id")
    .eq("account_id", accountId)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .eq("event_type", eventType);
  if (error) throw new Error(`readProvenanceEvents: ${error.message}`);
  return data ?? [];
}

/** Calls record_work_order_attachment_received RPC via a given client. */
async function callRecordRpc(client, params) {
  return client.rpc("record_work_order_attachment_received", {
    p_account_id: params.accountId,
    p_work_order_id: params.workOrderId,
    p_storage_path: params.storagePath,
    p_file_name: params.fileName ?? "photo.jpg",
    p_mime_type: params.mimeType ?? "image/jpeg",
    p_file_size: params.fileSize ?? 4,
    p_kind: params.kind ?? "photo",
    p_attester_role: params.attesterRole ?? null,
    p_maintenance_stage: params.maintenanceStage ?? null,
    p_capture_method: params.captureMethod ?? "uploaded",
    p_content_hash_client_asserted: params.contentHash ?? null,
  });
}

// ─── Setup / teardown ───────────────────────────────────────────────────────

describe("E-150.1 — work-order photo evidence (integration)", () => {
  if (isIntegrationHarnessConfigured()) {
    beforeAll(async () => {
      await ensureIsolationHarnessSeed();
      const admin = getIntegrationAdminClient();
      await ensureBucket(admin);
    });

    afterAll(async () => {
      const admin = getIntegrationAdminClient();

      // Remove storage objects created during tests.
      if (createdStoragePaths.length > 0) {
        try { await admin.storage.from(BUCKET).remove(createdStoragePaths); } catch { /* ignore */ }
      }

      // Remove attachment rows.
      if (createdAttachmentIds.length > 0) {
        try {
          await admin.from("work_order_attachments").delete().in("id", createdAttachmentIds);
        } catch { /* ignore */ }
      }

      // Remove work orders and then accounts (memberships cascade).
      if (createdWorkOrderIds.length > 0) {
        try { await admin.from("work_orders").delete().in("id", createdWorkOrderIds); } catch { /* ignore */ }
      }

      if (createdAccountIds.length > 0) {
        try { await admin.from("account_members").delete().in("account_id", createdAccountIds); } catch { /* ignore */ }
        try { await admin.from("accounts").delete().in("id", createdAccountIds); } catch { /* ignore */ }
      }

      createdAccountIds.length = 0;
      createdWorkOrderIds.length = 0;
      createdAttachmentIds.length = 0;
      createdStoragePaths.length = 0;
    });
  }

  // ─── T1: attester_role ─────────────────────────────────────────────────────
  integrationIt(
    "T1 — contractor completion upload sets attester_role=contractor; manager upload not labelled contractor",
    async () => {
      const admin = getIntegrationAdminClient();
      const { client: ownerClient, user: ownerUser } = await signInAsFixtureUser("ownerA");
      const { client: contractorClient, user: contractorUser } = await signInAsFixtureUser("contractorA1");

      const { accountId, workOrderId } = await scaffoldWorkOrder(
        admin,
        ownerUser,
        contractorUser.id,
      );

      // Contractor upload: attester_role must be stored as 'contractor'.
      const contractorPath = makePath(accountId, workOrderId, "contractor.jpg");
      await seedStorageObject(admin, contractorPath);

      const { data: contractorRow, error: contractorErr } = await callRecordRpc(contractorClient, {
        accountId,
        workOrderId,
        storagePath: contractorPath,
        attesterRole: "contractor",
        maintenanceStage: "contractor_completion",
      });
      expect(contractorErr, `contractor upload: ${contractorErr?.message}`).toBeNull();
      expect(contractorRow.attester_role).toBe("contractor");
      createdAttachmentIds.push(contractorRow.id);

      // Manager upload with attesterRole='landlord': must NOT be labelled contractor.
      const managerPath = makePath(accountId, workOrderId, "manager.jpg");
      await seedStorageObject(admin, managerPath);

      const { data: managerRow, error: managerErr } = await callRecordRpc(ownerClient, {
        accountId,
        workOrderId,
        storagePath: managerPath,
        attesterRole: "landlord",
        maintenanceStage: null,
      });
      expect(managerErr, `manager upload: ${managerErr?.message}`).toBeNull();
      expect(managerRow.attester_role).toBe("landlord");
      expect(managerRow.attester_role).not.toBe("contractor");
      createdAttachmentIds.push(managerRow.id);
    },
  );

  // ─── T2: stage and status observed ─────────────────────────────────────────
  integrationIt(
    "T2 — maintenance_stage recorded; work_order_status_at_received is server-observed; received_at is server-assigned",
    async () => {
      const admin = getIntegrationAdminClient();
      const { client: ownerClient, user: ownerUser } = await signInAsFixtureUser("ownerA");
      const { client: contractorClient, user: contractorUser } = await signInAsFixtureUser("contractorA1");

      const { accountId, workOrderId } = await scaffoldWorkOrder(
        admin,
        ownerUser,
        contractorUser.id,
        "in_progress",
      );

      const storagePath = makePath(accountId, workOrderId, "t2.jpg");
      await seedStorageObject(admin, storagePath);

      const before = new Date();
      const { data: row, error } = await callRecordRpc(contractorClient, {
        accountId,
        workOrderId,
        storagePath,
        attesterRole: "contractor",
        maintenanceStage: "contractor_completion",
      });
      const after = new Date();

      expect(error, `RPC: ${error?.message}`).toBeNull();
      createdAttachmentIds.push(row.id);

      // maintenance_stage stored correctly.
      expect(row.maintenance_stage).toBe("contractor_completion");

      // work_order_status_at_received reflects the server-observed WO status.
      expect(row.work_order_status_at_received).toBe("in_progress");

      // received_at (created_at) is server-assigned and recent.
      const receivedAt = new Date(row.created_at);
      expect(receivedAt.getTime()).toBeGreaterThanOrEqual(before.getTime() - 2000);
      expect(receivedAt.getTime()).toBeLessThanOrEqual(after.getTime() + 2000);

      // Verify the status is stored in the provenance event too.
      const events = await readProvenanceEvents(admin, accountId, "work_order", workOrderId, "photo.received");
      const evt = events.find((e) => e.metadata?.attachment_id === row.id);
      expect(evt, "photo.received event not found").toBeDefined();
      expect(evt.metadata.work_order_status_at_received).toBe("in_progress");
    },
  );

  // ─── T3: capture method ─────────────────────────────────────────────────────
  integrationIt(
    "T3 — capture_method='uploaded' is stored; in_app_camera is not used on this path",
    async () => {
      const admin = getIntegrationAdminClient();
      const { client: ownerClient, user: ownerUser } = await signInAsFixtureUser("ownerA");
      const { client: contractorClient, user: contractorUser } = await signInAsFixtureUser("contractorA1");

      const { accountId, workOrderId } = await scaffoldWorkOrder(
        admin,
        ownerUser,
        contractorUser.id,
      );

      const storagePath = makePath(accountId, workOrderId, "t3.jpg");
      await seedStorageObject(admin, storagePath);

      const { data: row, error } = await callRecordRpc(contractorClient, {
        accountId,
        workOrderId,
        storagePath,
        attesterRole: "contractor",
        maintenanceStage: "contractor_completion",
        captureMethod: "uploaded",
      });
      expect(error, `RPC: ${error?.message}`).toBeNull();
      createdAttachmentIds.push(row.id);

      expect(row.capture_method).toBe("uploaded");
      expect(row.capture_method).not.toBe("in_app_camera");
    },
  );

  // ─── T4: provenance event emitted ──────────────────────────────────────────
  integrationIt(
    "T4 — photo.received provenance event emitted with correct metadata fields",
    async () => {
      const admin = getIntegrationAdminClient();
      const { client: ownerClient, user: ownerUser } = await signInAsFixtureUser("ownerA");
      const { client: contractorClient, user: contractorUser } = await signInAsFixtureUser("contractorA1");

      const { accountId, workOrderId } = await scaffoldWorkOrder(
        admin,
        ownerUser,
        contractorUser.id,
      );

      const storagePath = makePath(accountId, workOrderId, "t4.jpg");
      await seedStorageObject(admin, storagePath);
      const fakeHash = "a".repeat(64);

      const { data: row, error } = await callRecordRpc(contractorClient, {
        accountId,
        workOrderId,
        storagePath,
        attesterRole: "contractor",
        maintenanceStage: "contractor_completion",
        captureMethod: "uploaded",
        contentHash: fakeHash,
        fileSize: 4,
      });
      expect(error, `RPC: ${error?.message}`).toBeNull();
      createdAttachmentIds.push(row.id);

      // provenance_event_id must be set on the attachment row.
      expect(row.provenance_event_id).toBeTruthy();

      // Event must exist in provenance_events.
      const events = await readProvenanceEvents(admin, accountId, "work_order", workOrderId, "photo.received");
      const evt = events.find((e) => e.metadata?.attachment_id === row.id);
      expect(evt, "photo.received event not found for attachment").toBeDefined();

      // entity_type and entity_id.
      expect(evt.entity_type).toBe("work_order");
      expect(evt.entity_id).toBe(workOrderId);

      // occurred_at must match the attachment's created_at.
      expect(new Date(evt.occurred_at).getTime()).toBeCloseTo(
        new Date(row.created_at).getTime(),
        -3,
      );

      // Required metadata fields.
      const m = evt.metadata;
      expect(m.attachment_id).toBe(row.id);
      expect(m.work_order_id).toBe(workOrderId);
      expect(m.account_id).toBe(accountId);
      expect(m.attester_role).toBe("contractor");
      expect(m.maintenance_stage).toBe("contractor_completion");
      expect(m.work_order_status_at_received).toBeTruthy();
      expect(m.capture_method).toBe("uploaded");
      expect(m.storage_bucket).toBe(BUCKET);
      expect(m.storage_path).toBe(storagePath);
      expect(m.mime_type).toBe("image/jpeg");
      expect(m.file_size).toBe(4);
      expect(m.content_hash_client_asserted).toBe(fakeHash);
      expect(m.content_hash_algorithm).toBe("sha256");
      expect(m.hash_trust).toBe("client_asserted_unverified");
      expect(m).toHaveProperty("late_upload");
    },
  );

  // ─── T5 / T5b: atomicity — forbidden direction impossible ──────────────────
  integrationIt(
    "T5 — storage object absent: RPC errors; no attachment row or provenance event created (forbidden direction impossible)",
    async () => {
      const admin = getIntegrationAdminClient();
      const { client: ownerClient, user: ownerUser } = await signInAsFixtureUser("ownerA");
      const { client: contractorClient, user: contractorUser } = await signInAsFixtureUser("contractorA1");

      const { accountId, workOrderId } = await scaffoldWorkOrder(
        admin,
        ownerUser,
        contractorUser.id,
      );

      // Deliberately DO NOT seed the storage object — simulates a storage upload failure.
      const absentPath = makePath(accountId, workOrderId, "absent.jpg");

      const { data: row, error } = await callRecordRpc(contractorClient, {
        accountId,
        workOrderId,
        storagePath: absentPath,
        attesterRole: "contractor",
        maintenanceStage: "contractor_completion",
      });

      // RPC must fail.
      expect(error, "RPC must error when storage object is absent").not.toBeNull();
      expect(error.message).toMatch(/storage object not found for work-order attachment/i);
      expect(row, "no row must be returned").toBeNull();

      // No attachment row must have been created.
      const { data: attachments } = await admin
        .from("work_order_attachments")
        .select("id")
        .eq("work_order_id", workOrderId)
        .eq("storage_path", absentPath);
      expect(attachments ?? [], "no attachment row must exist for the absent path").toHaveLength(0);

      // No provenance event must have been created.
      const events = await readProvenanceEvents(admin, accountId, "work_order", workOrderId, "photo.received");
      expect(events, "no provenance event must exist for the absent path").toHaveLength(0);
    },
  );

  // ─── T6: hash naming discipline ─────────────────────────────────────────────
  integrationIt(
    "T6 — content_hash_client_asserted stored; hash_trust='client_asserted_unverified'; content_hash_verified_at null",
    async () => {
      const admin = getIntegrationAdminClient();
      const { client: ownerClient, user: ownerUser } = await signInAsFixtureUser("ownerA");
      const { client: contractorClient, user: contractorUser } = await signInAsFixtureUser("contractorA1");

      const { accountId, workOrderId } = await scaffoldWorkOrder(
        admin,
        ownerUser,
        contractorUser.id,
      );

      const storagePath = makePath(accountId, workOrderId, "t6.jpg");
      await seedStorageObject(admin, storagePath);

      // Simulate client-side SHA-256 (hex).
      const clientHash = "b".repeat(64);

      const { data: row, error } = await callRecordRpc(contractorClient, {
        accountId,
        workOrderId,
        storagePath,
        attesterRole: "contractor",
        maintenanceStage: "contractor_completion",
        contentHash: clientHash,
      });
      expect(error, `RPC: ${error?.message}`).toBeNull();
      createdAttachmentIds.push(row.id);

      // Hash stored under the honest field name (not image_content_hash / photo_content_hash).
      expect(row.content_hash_client_asserted).toBe(clientHash);
      expect(row.content_hash_algorithm).toBe("sha256");
      expect(row.content_hash_verified_at).toBeNull();
      expect(row).not.toHaveProperty("image_content_hash");
      expect(row).not.toHaveProperty("photo_content_hash");

      // Provenance event must carry hash_trust=client_asserted_unverified.
      const events = await readProvenanceEvents(admin, accountId, "work_order", workOrderId, "photo.received");
      const evt = events.find((e) => e.metadata?.attachment_id === row.id);
      expect(evt).toBeDefined();
      expect(evt.metadata.hash_trust).toBe("client_asserted_unverified");
      expect(evt.metadata.content_hash_verified_at).toBeNull();

      // Upload WITHOUT a hash: hash_trust must be 'not_available', not 'client_asserted_unverified'.
      const noHashPath = makePath(accountId, workOrderId, "t6-nohash.jpg");
      await seedStorageObject(admin, noHashPath);

      const { data: noHashRow, error: noHashErr } = await callRecordRpc(contractorClient, {
        accountId,
        workOrderId,
        storagePath: noHashPath,
        attesterRole: "contractor",
        maintenanceStage: "contractor_completion",
        contentHash: null,
      });
      expect(noHashErr, `no-hash RPC: ${noHashErr?.message}`).toBeNull();
      createdAttachmentIds.push(noHashRow.id);

      expect(noHashRow.content_hash_client_asserted).toBeNull();
      expect(noHashRow.content_hash_algorithm).toBeNull();

      const noHashEvents = await readProvenanceEvents(admin, accountId, "work_order", workOrderId, "photo.received");
      const noHashEvt = noHashEvents.find((e) => e.metadata?.attachment_id === noHashRow.id);
      expect(noHashEvt).toBeDefined();
      expect(noHashEvt.metadata.hash_trust).toBe("not_available");
    },
  );

  // ─── T7: server-assigned timestamp; EXIF not trusted ───────────────────────
  integrationIt(
    "T7 — provenance occurred_at equals server-observed received_at; no EXIF/client timestamp is anchor",
    async () => {
      const admin = getIntegrationAdminClient();
      const { client: ownerClient, user: ownerUser } = await signInAsFixtureUser("ownerA");
      const { client: contractorClient, user: contractorUser } = await signInAsFixtureUser("contractorA1");

      const { accountId, workOrderId } = await scaffoldWorkOrder(
        admin,
        ownerUser,
        contractorUser.id,
      );

      const storagePath = makePath(accountId, workOrderId, "t7.jpg");
      await seedStorageObject(admin, storagePath);

      const before = new Date();
      const { data: row, error } = await callRecordRpc(contractorClient, {
        accountId,
        workOrderId,
        storagePath,
        attesterRole: "contractor",
        maintenanceStage: "contractor_completion",
      });
      const after = new Date();

      expect(error, `RPC: ${error?.message}`).toBeNull();
      createdAttachmentIds.push(row.id);

      // created_at is the server-assigned received_at.
      const receivedAt = new Date(row.created_at);
      expect(receivedAt.getTime()).toBeGreaterThanOrEqual(before.getTime() - 2000);
      expect(receivedAt.getTime()).toBeLessThanOrEqual(after.getTime() + 2000);

      // The provenance event occurred_at must match created_at exactly.
      const events = await readProvenanceEvents(admin, accountId, "work_order", workOrderId, "photo.received");
      const evt = events.find((e) => e.metadata?.attachment_id === row.id);
      expect(evt, "photo.received event not found").toBeDefined();

      const evtOccurredAt = new Date(evt.occurred_at);
      const rowCreatedAt = new Date(row.created_at);
      // Timestamps should be within 1 second of each other
      // (occurred_at is set to v_attachment.created_at inside the RPC).
      expect(Math.abs(evtOccurredAt.getTime() - rowCreatedAt.getTime())).toBeLessThan(1000);

      // The metadata's received_at must also match created_at.
      const metaReceivedAt = new Date(evt.metadata.received_at);
      expect(Math.abs(metaReceivedAt.getTime() - rowCreatedAt.getTime())).toBeLessThan(1000);

      // No separate client-derived timestamp should appear in the event.
      expect(evt.metadata).not.toHaveProperty("exif_datetime");
      expect(evt.metadata).not.toHaveProperty("client_timestamp");
      expect(evt.metadata).not.toHaveProperty("file_last_modified");
    },
  );

  // ─── T8: completion timing gate ─────────────────────────────────────────────
  integrationIt(
    "T8 — upload blocked after WO completion; valid upload succeeds in in_progress window with status recorded",
    async () => {
      const admin = getIntegrationAdminClient();
      const { client: ownerClient, user: ownerUser } = await signInAsFixtureUser("ownerA");
      const { client: contractorClient, user: contractorUser } = await signInAsFixtureUser("contractorA1");

      // Scaffold a COMPLETED work order.
      const { accountId: acctCompleted, workOrderId: woCompleted } = await scaffoldWorkOrder(
        admin,
        ownerUser,
        contractorUser.id,
        "completed",
      );

      const completedPath = makePath(acctCompleted, woCompleted, "t8-blocked.jpg");
      await seedStorageObject(admin, completedPath);

      const { error: blockedErr } = await callRecordRpc(contractorClient, {
        accountId: acctCompleted,
        workOrderId: woCompleted,
        storagePath: completedPath,
        attesterRole: "contractor",
        maintenanceStage: "contractor_completion",
      });
      expect(blockedErr, "upload to completed WO must be blocked").not.toBeNull();
      expect(blockedErr.message).toMatch(
        /contractor completion photo uploads are blocked after work-order completion or cancellation/i,
      );

      // Cancelled WO must also be blocked.
      const { accountId: acctCancelled, workOrderId: woCancelled } = await scaffoldWorkOrder(
        admin,
        ownerUser,
        contractorUser.id,
        "cancelled",
      );
      const cancelledPath = makePath(acctCancelled, woCancelled, "t8-cancelled.jpg");
      await seedStorageObject(admin, cancelledPath);

      const { error: cancelledErr } = await callRecordRpc(contractorClient, {
        accountId: acctCancelled,
        workOrderId: woCancelled,
        storagePath: cancelledPath,
        attesterRole: "contractor",
        maintenanceStage: "contractor_completion",
      });
      expect(cancelledErr, "upload to cancelled WO must be blocked").not.toBeNull();

      // In-progress WO: upload must succeed and work_order_status_at_received must be recorded.
      const { accountId: acctOpen, workOrderId: woOpen } = await scaffoldWorkOrder(
        admin,
        ownerUser,
        contractorUser.id,
        "in_progress",
      );
      const openPath = makePath(acctOpen, woOpen, "t8-open.jpg");
      await seedStorageObject(admin, openPath);

      const { data: openRow, error: openErr } = await callRecordRpc(contractorClient, {
        accountId: acctOpen,
        workOrderId: woOpen,
        storagePath: openPath,
        attesterRole: "contractor",
        maintenanceStage: "contractor_completion",
      });
      expect(openErr, `in_progress upload: ${openErr?.message}`).toBeNull();
      expect(openRow.maintenance_stage).toBe("contractor_completion");
      expect(openRow.work_order_status_at_received).toBe("in_progress");
      expect(openRow.late_upload).toBe(false);
      createdAttachmentIds.push(openRow.id);

      // Assigned WO: also a valid window.
      const { accountId: acctAssigned, workOrderId: woAssigned } = await scaffoldWorkOrder(
        admin,
        ownerUser,
        contractorUser.id,
        "assigned",
      );
      const assignedPath = makePath(acctAssigned, woAssigned, "t8-assigned.jpg");
      await seedStorageObject(admin, assignedPath);

      const { data: assignedRow, error: assignedErr } = await callRecordRpc(contractorClient, {
        accountId: acctAssigned,
        workOrderId: woAssigned,
        storagePath: assignedPath,
        attesterRole: "contractor",
        maintenanceStage: "contractor_completion",
      });
      expect(assignedErr, `assigned window upload: ${assignedErr?.message}`).toBeNull();
      expect(assignedRow.work_order_status_at_received).toBe("assigned");
      createdAttachmentIds.push(assignedRow.id);
    },
  );

  // ─── T9: E-159 RLS hygiene ──────────────────────────────────────────────────
  integrationIt(
    "T9 — non-assigned contractor blocked; cross-account contractor blocked; manager and staff can read list",
    async () => {
      const admin = getIntegrationAdminClient();
      const { client: ownerAClient, user: ownerAUser } = await signInAsFixtureUser("ownerA");
      const { client: contractorAClient, user: contractorAUser } = await signInAsFixtureUser("contractorA1");
      const { client: contractorBClient, user: contractorBUser } = await signInAsFixtureUser("contractorB1");
      const { client: staffAClient } = await signInAsFixtureUser("staffA");

      // Scaffold a WO for ownerA assigned to contractorA.
      const { accountId: acctA, workOrderId: woA } = await scaffoldWorkOrder(
        admin,
        ownerAUser,
        contractorAUser.id,
        "assigned",
      );

      // Add staffA to this test account.
      const { user: staffAUser } = await signInAsFixtureUser("staffA");
      try {
        await admin.from("account_members").insert({
          account_id: acctA,
          user_id: staffAUser.id,
          role: "staff",
        });
      } catch { /* ignore duplicate */ }

      // Seed a storage object that contractorA would upload.
      const contractorAPath = makePath(acctA, woA, "t9-contA.jpg");
      await seedStorageObject(admin, contractorAPath);

      // ContractorA (assigned): upload must SUCCEED.
      const { data: assignedRow, error: assignedErr } = await callRecordRpc(contractorAClient, {
        accountId: acctA,
        workOrderId: woA,
        storagePath: contractorAPath,
        attesterRole: "contractor",
        maintenanceStage: "contractor_completion",
      });
      expect(assignedErr, `assigned contractor upload: ${assignedErr?.message}`).toBeNull();
      expect(assignedRow.attester_role).toBe("contractor");
      createdAttachmentIds.push(assignedRow.id);

      // ContractorB (not assigned to this WO): upload must be BLOCKED.
      const contractorBPath = makePath(acctA, woA, "t9-contB.jpg");
      await seedStorageObject(admin, contractorBPath);

      const { error: unassignedErr } = await callRecordRpc(contractorBClient, {
        accountId: acctA,
        workOrderId: woA,
        storagePath: contractorBPath,
        attesterRole: "contractor",
        maintenanceStage: "contractor_completion",
      });
      expect(unassignedErr, "non-assigned contractor must be blocked").not.toBeNull();
      expect(unassignedErr.message).toMatch(
        /only the assigned contractor can upload contractor completion evidence|not authorized/i,
      );

      // Cross-account contractor B trying to access account A's WO: must be blocked.
      const crossAccountPath = makePath(acctA, woA, "t9-cross.jpg");
      await seedStorageObject(admin, crossAccountPath);

      const { error: crossErr } = await callRecordRpc(contractorBClient, {
        accountId: ACCOUNT_B, // wrong account
        workOrderId: woA,
        storagePath: crossAccountPath,
        attesterRole: "contractor",
        maintenanceStage: "contractor_completion",
      });
      expect(crossErr, "cross-account contractor must be blocked").not.toBeNull();

      // Manager (ownerA) can READ the attachment list via the list RPC.
      const { data: listData, error: listErr } = await ownerAClient.rpc(
        "work_order_attachments_list",
        { p_work_order_id: woA },
      );
      expect(listErr, `manager list: ${listErr?.message}`).toBeNull();
      expect(Array.isArray(listData)).toBe(true);
      const found = listData.find((a) => a.id === assignedRow.id);
      expect(found, "manager must see the contractor attachment in the list").toBeDefined();
      expect(found.maintenance_stage).toBe("contractor_completion");

      // StaffA can also read the list (they're a manager role).
      const { data: staffListData, error: staffListErr } = await staffAClient.rpc(
        "work_order_attachments_list",
        { p_work_order_id: woA },
      );
      expect(staffListErr, `staff list: ${staffListErr?.message}`).toBeNull();
      expect(Array.isArray(staffListData)).toBe(true);
      const staffFound = staffListData.find((a) => a.id === assignedRow.id);
      expect(staffFound, "staff must see the contractor attachment in the list").toBeDefined();

      // Assigned contractor can also READ the list.
      const { data: contractorListData, error: contractorListErr } = await contractorAClient.rpc(
        "work_order_attachments_list",
        { p_work_order_id: woA },
      );
      expect(contractorListErr, `contractor list: ${contractorListErr?.message}`).toBeNull();
      const contractorFound = (contractorListData ?? []).find((a) => a.id === assignedRow.id);
      expect(contractorFound, "assigned contractor must see their own attachment").toBeDefined();

      // Cleanup the storage paths that weren't seeded as part of successful uploads.
      createdStoragePaths.push(contractorBPath, crossAccountPath);
    },
  );

  // ─── Additional: attester_role required for contractor_completion ───────────
  integrationIt(
    "T1b — RPC rejects contractor_completion without attester_role=contractor",
    async () => {
      const admin = getIntegrationAdminClient();
      const { client: ownerClient, user: ownerUser } = await signInAsFixtureUser("ownerA");
      const { client: contractorClient, user: contractorUser } = await signInAsFixtureUser("contractorA1");

      const { accountId, workOrderId } = await scaffoldWorkOrder(
        admin,
        ownerUser,
        contractorUser.id,
      );

      const storagePath = makePath(accountId, workOrderId, "t1b.jpg");
      await seedStorageObject(admin, storagePath);

      // Attempting contractor_completion without attester_role='contractor' must be rejected.
      const { error } = await callRecordRpc(contractorClient, {
        accountId,
        workOrderId,
        storagePath,
        attesterRole: "landlord", // wrong role for contractor_completion
        maintenanceStage: "contractor_completion",
      });
      expect(error, "wrong attester_role for contractor_completion must be rejected").not.toBeNull();
      expect(error.message).toMatch(
        /contractor completion evidence requires attester_role=contractor/i,
      );
    },
  );

  // ─── E-160: Provenance-failure atomicity deny-test ──────────────────────────
  integrationIt(
    "E-160 — forced provenance-failure rolls back both attachment row and photo.received event (atomicity deny-test)",
    async () => {
      const admin = getIntegrationAdminClient();
      const { client: ownerClient, user: ownerUser } = await signInAsFixtureUser("ownerA");
      const { client: contractorClient, user: contractorUser } = await signInAsFixtureUser("contractorA1");

      const { accountId, workOrderId } = await scaffoldWorkOrder(
        admin,
        ownerUser,
        contractorUser.id,
      );

      // Seed a real storage object so the function PASSES the storage-absent gate
      // and reaches the INSERT + provenance-append phase — the key difference from T5.
      const denyPath = makePath(accountId, workOrderId, "e160-deny.jpg");
      await seedStorageObject(admin, denyPath);

      // DENY PATH: call the atomicity deny-test wrapper (arms GUC, calls real RPC).
      // The GUC fires AFTER the work_order_attachments INSERT is staged in-transaction
      // and BEFORE _append_evidence_provenance_event, then RAISEs — rolling back both.
      const { data: denyData, error: denyError } = await contractorClient.rpc(
        "record_work_order_attachment_received_atomicity_deny_test",
        {
          p_account_id: accountId,
          p_work_order_id: workOrderId,
          p_storage_path: denyPath,
          p_file_name: "e160-deny.jpg",
          p_mime_type: "image/jpeg",
          p_file_size: 4,
          p_kind: "photo",
          p_attester_role: "contractor",
          p_maintenance_stage: "contractor_completion",
          p_capture_method: "uploaded",
          p_content_hash_client_asserted: null,
        },
      );

      // Forced failure must surface as an error.
      expect(denyError, "deny wrapper must raise the forced provenance failure").not.toBeNull();
      expect(String(denyError.message)).toContain("test_force_wo_photo_provenance_failure");
      expect(denyData, "no row must be returned on forced failure").toBeNull();

      // No attachment row must persist — the INSERT rolled back.
      const { data: rowsAfterDeny } = await admin
        .from("work_order_attachments")
        .select("id")
        .eq("work_order_id", workOrderId)
        .eq("storage_path", denyPath);
      expect(rowsAfterDeny ?? [], "no attachment row must survive the rollback").toHaveLength(0);

      // No photo.received event must persist.
      const eventsAfterDeny = await readProvenanceEvents(
        admin, accountId, "work_order", workOrderId, "photo.received",
      );
      expect(eventsAfterDeny, "no photo.received event must survive the rollback").toHaveLength(0);

      // POSITIVE CONTROL: the identical scenario WITHOUT the deny wrapper must succeed.
      // Proves the deny test fails for the injected reason, not some unrelated breakage.
      const controlPath = makePath(accountId, workOrderId, "e160-control.jpg");
      await seedStorageObject(admin, controlPath);

      const { data: controlRow, error: controlError } = await callRecordRpc(contractorClient, {
        accountId,
        workOrderId,
        storagePath: controlPath,
        attesterRole: "contractor",
        maintenanceStage: "contractor_completion",
      });
      expect(controlError, `positive control must succeed: ${controlError?.message}`).toBeNull();
      expect(controlRow, "positive control must return a row").not.toBeNull();
      expect(controlRow.provenance_event_id, "positive control must have provenance_event_id").toBeTruthy();
      createdAttachmentIds.push(controlRow.id);

      const controlEvents = await readProvenanceEvents(
        admin, accountId, "work_order", workOrderId, "photo.received",
      );
      const controlEvt = controlEvents.find((e) => e.metadata?.attachment_id === controlRow.id);
      expect(controlEvt, "positive control photo.received event must exist").toBeDefined();
    },
  );

  // ─── Additional: non-photo rejected for contractor_completion ───────────────
  integrationIt(
    "T3b — document kind rejected for contractor_completion stage",
    async () => {
      const admin = getIntegrationAdminClient();
      const { client: ownerClient, user: ownerUser } = await signInAsFixtureUser("ownerA");
      const { client: contractorClient, user: contractorUser } = await signInAsFixtureUser("contractorA1");

      const { accountId, workOrderId } = await scaffoldWorkOrder(
        admin,
        ownerUser,
        contractorUser.id,
      );

      const storagePath = makePath(accountId, workOrderId, "t3b.pdf");
      await seedStorageObject(admin, storagePath);

      const { error } = await callRecordRpc(contractorClient, {
        accountId,
        workOrderId,
        storagePath,
        attesterRole: "contractor",
        maintenanceStage: "contractor_completion",
        kind: "document",
        mimeType: "application/pdf",
      });
      expect(error, "document kind must be rejected for contractor_completion").not.toBeNull();
      expect(error.message).toMatch(/contractor completion evidence must be a photo/i);
    },
  );
});
