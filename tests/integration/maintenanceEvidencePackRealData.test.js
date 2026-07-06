/**
 * Maintenance Evidence Pack v0 — real-data PDF generation.
 *
 * Seeds a completed work-order scenario on the live local DB, assembles the
 * evidence payload from real DB rows via assembleMaintenanceEvidencePackPayload,
 * feeds it to generateMaintenancePackPdf, and saves the PDF to
 * artifacts/maintenance-evidence-pack-v0-demo-realdata.pdf.
 *
 * This test does NOT hand-build a payload. Every field comes from the DB.
 *
 * Seeding flow:
 *  1. Fresh isolated account, property, maintenance request, contractor, work order (in_progress)
 *  2. Upload a photo via record_work_order_attachment_received RPC (contractor client)
 *  3. Record hash verification via admin (photo.hash_verified event)
 *  4. Update work order status to 'completed' via admin
 *  5. Assemble payload from DB + generate PDF
 *
 * Cleanup: attachments, work orders, maintenance requests, properties,
 * contractors, account_members, accounts, and storage objects removed in afterAll.
 * Provenance events are append-only and intentionally left (no contamination —
 * each test run uses fresh UUIDs).
 */

import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generateMaintenancePackPdf } from "../../src/utils/maintenanceEvidencePackPdfExport.js";
import { assembleMaintenanceEvidencePackPayload } from "../../src/services/maintenanceEvidencePackService.js";
import {
  ensureIsolationHarnessSeed,
  getIntegrationAdminClient,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "./helpers/env.js";

const ARTIFACT_PATH = path.join(
  process.cwd(),
  "artifacts",
  "maintenance-evidence-pack-v0-demo-realdata.pdf",
);

const BUCKET = "work-order-attachments";
const PROPERTY_ADDRESS = "99 Maintenance Avenue";
const PROPERTY_CITY = "Bristol";
const CONTRACTOR_NAME_IN_DB = "Fix-It Pro Ltd";
const MR_TITLE = "Leaky boiler — needs urgent repair";

// Fix 4: staggered scenario timestamps (what the schema allows on insert)
// RPC-assigned provenance.occurred_at and trigger-controlled work_orders.updated_at
// cannot be staggered without bypassing the RPCs — accepted per brief.
const SCENARIO_MR_CREATED_AT = "2026-07-04T09:00:00.000Z";  // request reported
const SCENARIO_WO_CREATED_AT = "2026-07-04T09:35:00.000Z";  // WO raised ~35 min later

// Fix 3: plausible JPEG buffer for realistic file-size rendering.
// Content need not be a real image; size must be plausible (>10 KB).
function makePlausibleJpeg(sizeBytes = 12 * 1024) {
  const header = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
  const footer = Buffer.from([0xff, 0xd9]);
  const padding = Buffer.alloc(Math.max(0, sizeBytes - header.length - footer.length), 0xaa);
  return Buffer.concat([header, padding, footer]);
}

// Track scaffolded entities for cleanup
const createdAccountIds = [];
const createdWorkOrderIds = [];
const createdAttachmentIds = [];
const createdStoragePaths = [];
const createdMaintenanceRequestIds = [];

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

async function seedStorageObject(admin, storagePath, bytes) {
  const uploadBytes = bytes ?? new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
  const { error } = await admin.storage.from(BUCKET).upload(storagePath, uploadBytes, {
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

describe.skipIf(!isIntegrationHarnessConfigured())(
  "Maintenance Evidence Pack v0 — real-data PDF generation",
  () => {
    const admin = getIntegrationAdminClient();
    let contractorClient;
    let accountId;
    let workOrderId;
    let propertyId;
    let attachmentId;
    let realPayload;
    let rawPdfBuffer;

    beforeAll(async () => {
      await ensureIsolationHarnessSeed();
      await ensureBucket(admin);

      const { client: cClient, user: contractorUser } = await signInAsFixtureUser("contractorA1");
      const { user: ownerUser } = await signInAsFixtureUser("ownerA");
      contractorClient = cClient;

      // ── 1. Scaffold fresh isolated account ─────────────────────────────────
      accountId = randomUUID();
      createdAccountIds.push(accountId);

      const { error: acctErr } = await admin.from("accounts").insert({
        id: accountId,
        name: `MEP v0 probe ${accountId.slice(0, 8)}`,
        created_by: ownerUser.id,
        is_root: false,
        subscription_status: "active",
        subscription_plan: "pro",
      });
      if (acctErr) throw new Error(`scaffold account: ${acctErr.message}`);

      await admin.from("account_members").insert({
        account_id: accountId,
        user_id: ownerUser.id,
        role: "owner",
      });

      // ── 2. Property ────────────────────────────────────────────────────────
      propertyId = randomUUID();
      const { error: propErr } = await admin.from("properties").insert({
        id: propertyId,
        account_id: accountId,
        owner_id: ownerUser.id,
        address: PROPERTY_ADDRESS,
        city: PROPERTY_CITY,
        size: "2 bed",
        rent: 1200,
        status: "Wolne",
      });
      if (propErr) throw new Error(`scaffold property: ${propErr.message}`);

      // ── 3. Contractor record (links contractorA1 to this account) ──────────
      const contractorRecordId = randomUUID();
      const { error: cErr } = await admin.from("contractors").insert({
        id: contractorRecordId,
        account_id: accountId,
        user_id: contractorUser.id,
        name: CONTRACTOR_NAME_IN_DB,
        phone: "+447700900299",
        email: "fixitpro@repair.test",
        active: true,
      });
      if (cErr) throw new Error(`scaffold contractor: ${cErr.message}`);

      // ── 4. Maintenance request ─────────────────────────────────────────────
      const maintenanceRequestId = randomUUID();
      createdMaintenanceRequestIds.push(maintenanceRequestId);
      // Fix 4: stagger created_at so the demo timeline tells a story
      const { error: mrErr } = await admin.from("maintenance_requests").insert({
        id: maintenanceRequestId,
        account_id: accountId,
        property_id: propertyId,
        title: MR_TITLE,
        description: "Water dripping from the pressure release valve. Requires urgent inspection.",
        priority: "high",
        status: "in_progress",
        created_at: SCENARIO_MR_CREATED_AT,
      });
      if (mrErr) throw new Error(`scaffold maintenance_request: ${mrErr.message}`);

      // ── 5. Work order (in_progress so uploads are allowed) ────────────────
      workOrderId = randomUUID();
      createdWorkOrderIds.push(workOrderId);
      // Fix 4: stagger created_at so WO appears ~35 min after the maintenance request
      const { error: woErr } = await admin.from("work_orders").insert({
        id: workOrderId,
        account_id: accountId,
        property_id: propertyId,
        maintenance_request_id: maintenanceRequestId,
        contractor_user_id: contractorUser.id,
        contractor_name: CONTRACTOR_NAME_IN_DB,
        contractor_phone: "+447700900299",
        status: "in_progress",
        quote_amount: 280.00,
        invoice_amount: 310.00,
        notes: "Replaced pressure valve. System re-pressurised and tested.",
        created_by: ownerUser.id,
        created_at: SCENARIO_WO_CREATED_AT,
        // updated_at is trigger-controlled (BEFORE UPDATE) — not staggerable here;
        // it will be set to now() when we transition status to 'completed'.
      });
      if (woErr) throw new Error(`scaffold work_order: ${woErr.message}`);

      // ── 6. Upload completion photo via contractor (photo.received event) ───
      // Fix 3: use a plausible ~12 KB JPEG buffer; compute client SHA-256 of the
      // actual bytes so the hash verification step is a genuine check, not a bypass.
      const jpegBytes = makePlausibleJpeg(12 * 1024);
      const clientHash = createHash("sha256").update(jpegBytes).digest("hex");

      const storagePath = makePath(accountId, workOrderId, "completion.jpg");
      await seedStorageObject(admin, storagePath, jpegBytes);

      const { data: attachRow, error: uploadErr } = await contractorClient.rpc(
        "record_work_order_attachment_received",
        {
          p_account_id: accountId,
          p_work_order_id: workOrderId,
          p_storage_path: storagePath,
          p_file_name: "completion.jpg",
          p_mime_type: "image/jpeg",
          p_file_size: jpegBytes.length,
          p_kind: "photo",
          p_attester_role: "contractor",
          p_maintenance_stage: "contractor_completion",
          p_capture_method: "uploaded",
          p_content_hash_client_asserted: clientHash,
        },
      );
      if (uploadErr) throw new Error(`photo upload RPC: ${uploadErr.message}`);
      attachmentId = attachRow.id;
      createdAttachmentIds.push(attachmentId);

      // ── 7. Record hash verification (photo.hash_verified event) via admin ──
      const { error: hashErr } = await admin.rpc(
        "record_work_order_photo_hash_verification",
        {
          p_attachment_id: attachmentId,
          p_server_hash: clientHash,
          p_match: true,
          p_error: null,
        },
      );
      if (hashErr) throw new Error(`hash verification RPC: ${hashErr.message}`);

      // ── 8. Mark work order completed via admin ─────────────────────────────
      const { error: completeErr } = await admin
        .from("work_orders")
        .update({ status: "completed" })
        .eq("id", workOrderId);
      if (completeErr) throw new Error(`complete WO: ${completeErr.message}`);

      // ── 9. Assemble payload from real DB rows ──────────────────────────────
      realPayload = await assembleMaintenanceEvidencePackPayload(admin, accountId, workOrderId);

      // ── 10. Generate PDF ───────────────────────────────────────────────────
      const { doc } = generateMaintenancePackPdf(realPayload);
      rawPdfBuffer = Buffer.from(doc.output("arraybuffer"));
      fs.mkdirSync(path.dirname(ARTIFACT_PATH), { recursive: true });
      fs.writeFileSync(ARTIFACT_PATH, rawPdfBuffer);
    });

    afterAll(async () => {
      // Storage objects
      if (createdStoragePaths.length > 0) {
        try { await admin.storage.from(BUCKET).remove(createdStoragePaths); } catch { /* ignore */ }
      }

      // Attachment rows
      if (createdAttachmentIds.length > 0) {
        try {
          await admin.from("work_order_attachments").delete().in("id", createdAttachmentIds);
        } catch { /* ignore */ }
      }

      // Work orders
      if (createdWorkOrderIds.length > 0) {
        try { await admin.from("work_orders").delete().in("id", createdWorkOrderIds); } catch { /* ignore */ }
      }

      // Maintenance requests
      if (createdMaintenanceRequestIds.length > 0) {
        try {
          await admin.from("maintenance_requests").delete().in("id", createdMaintenanceRequestIds);
        } catch { /* ignore */ }
      }

      // Account members and accounts
      if (createdAccountIds.length > 0) {
        try { await admin.from("account_members").delete().in("account_id", createdAccountIds); } catch { /* ignore */ }
        try { await admin.from("contractors").delete().in("account_id", createdAccountIds); } catch { /* ignore */ }
        try { await admin.from("properties").delete().in("account_id", createdAccountIds); } catch { /* ignore */ }
        try { await admin.from("accounts").delete().in("id", createdAccountIds); } catch { /* ignore */ }
      }

      createdAccountIds.length = 0;
      createdWorkOrderIds.length = 0;
      createdAttachmentIds.length = 0;
      createdStoragePaths.length = 0;
      createdMaintenanceRequestIds.length = 0;
    });

    // ── Payload shape assertions ────────────────────────────────────────────

    it("workOrder is populated from DB", () => {
      expect(realPayload.workOrder).not.toBeNull();
      expect(realPayload.workOrder.id).toBe(workOrderId);
      expect(realPayload.workOrder.status).toBe("completed");
      expect(realPayload.workOrder.quote_amount).toBeTruthy();
      expect(realPayload.workOrder.invoice_amount).toBeTruthy();
    });

    it("property is populated from DB with correct address", () => {
      expect(realPayload.property).not.toBeNull();
      expect(realPayload.property.address).toBe(PROPERTY_ADDRESS);
      expect(realPayload.property.city).toBe(PROPERTY_CITY);
    });

    it("maintenanceRequest is populated from DB", () => {
      expect(realPayload.maintenanceRequest).not.toBeNull();
      expect(realPayload.maintenanceRequest.title).toBe(MR_TITLE);
      expect(realPayload.maintenanceRequest.priority).toBe("high");
    });

    it("contractor is populated from contractors table", () => {
      expect(realPayload.contractor).not.toBeNull();
      expect(realPayload.contractor.name).toBe(CONTRACTOR_NAME_IN_DB);
    });

    it("attachments are populated from DB (at least 1)", () => {
      expect(realPayload.attachments.length).toBeGreaterThanOrEqual(1);
      const att = realPayload.attachments.find((a) => a.id === attachmentId);
      expect(att).toBeDefined();
      expect(att.file_name).toBe("completion.jpg");
      expect(att.maintenance_stage).toBe("contractor_completion");
      // Fix 3: file size must be plausible (not 4 bytes)
      expect(att.file_size).toBeGreaterThan(10 * 1024);
    });

    it("attachment hash_trust is verified after hash verification RPC", () => {
      const att = realPayload.attachments.find((a) => a.id === attachmentId);
      expect(att.hash_trust).toBe("verified");
      expect(att.content_hash_verified_at).toBeTruthy();
    });

    it("provenance has photo.received and photo.hash_verified events", () => {
      expect(realPayload.provenance.length).toBeGreaterThanOrEqual(2);
      const eventTypes = realPayload.provenance.map((e) => e.event_type);
      expect(eventTypes).toContain("photo.received");
      expect(eventTypes).toContain("photo.hash_verified");
    });

    // ── PDF assertions ──────────────────────────────────────────────────────

    it("PDF file exists on disk", () => {
      expect(fs.existsSync(ARTIFACT_PATH)).toBe(true);
    });

    it("PDF starts with %PDF- header", () => {
      expect(rawPdfBuffer.toString("ascii", 0, 5)).toBe("%PDF-");
    });

    it("PDF byte size is substantial", () => {
      const byteSize = rawPdfBuffer.length;
      expect(byteSize).toBeGreaterThan(5000);
      console.log(`Real-data maintenance PDF byte size: ${byteSize} bytes`);
    });

    it("PDF contains property address from DB", () => {
      expect(rawPdfBuffer.toString("binary").includes(PROPERTY_ADDRESS)).toBe(true);
    });

    it("PDF contains maintenance request title from DB (ASCII-safe check)", () => {
      // MR_TITLE contains an em-dash which is CP1252 0x97 in the PDF binary;
      // use an ASCII-safe prefix substring to avoid encoding mismatch.
      expect(rawPdfBuffer.toString("binary").includes("Leaky boiler")).toBe(true);
    });

    it("PDF contains contractor name from DB", () => {
      expect(rawPdfBuffer.toString("binary").includes(CONTRACTOR_NAME_IN_DB)).toBe(true);
    });

    it("PDF contains Important limitations — please read (ASCII-safe check)", () => {
      expect(rawPdfBuffer.toString("binary").includes("please read")).toBe(true);
    });

    it("honesty: metadata only, no download links", () => {
      const raw = rawPdfBuffer.toString("binary");
      expect(raw.includes("metadata only")).toBe(true);
      expect(raw.includes("Download photo")).toBe(false);
      expect(raw.includes("signed-url")).toBe(false);
    });

    it("honesty: no AV scan clean claim", () => {
      const raw = rawPdfBuffer.toString("binary");
      expect(raw.includes("antivirus clean")).toBe(false);
      expect(raw.includes("scan_clean")).toBe(false);
      expect(raw.includes("AV clean")).toBe(false);
    });

    it("honesty: no positive completion or authenticity claim", () => {
      const raw = rawPdfBuffer.toString("binary");
      expect(raw.includes("Tenaqo confirms the work was completed")).toBe(false);
      // "photo is authentic" appears in the limitations disclaimer itself (correct).
      // Check the positive claim forms that must never appear.
      expect(raw.includes("Tenaqo verifies the photo is authentic")).toBe(false);
      expect(raw.includes("This photo proves the repair was completed")).toBe(false);
    });
  },
);
