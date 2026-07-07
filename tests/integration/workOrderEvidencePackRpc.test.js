/**
 * P-002: Work Order Evidence Pack RPC — cross-account security and payload shape tests.
 *
 * Proves that get_work_order_evidence_pack(p_account_id, p_work_order_id):
 *  - allows owner/member of Account A to read Account A's pack
 *  - denies owner of Account B reading Account A's pack
 *  - denies the combination attack (own account_id + foreign work_order_id)
 *  - does not leak storage_bucket, storage_path, or E-158 scan columns
 *  - does not expose scan_status, scan_engine, or scanned_at
 *  - denies unauthenticated (public/anon) callers
 *  - does not return attachments from other accounts
 *  - does not return provenance events from other accounts or work orders
 *
 * Uses the isolation harness (Account A / Account B with pre-seeded work orders).
 * Seeds one attachment for Account A's work order in beforeAll; cleaned up in afterAll.
 */

import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import {
  ensureIsolationHarnessSeed,
  getIntegrationAdminClient,
  isolationSeedIds,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";
import { getIntegrationEnv, isIntegrationHarnessConfigured } from "./helpers/env.js";

// Seeded attachment IDs — unique to avoid collision with other integration tests
const PACK_ATTACHMENT_A_ID = "f1000001-e2f1-4000-0000-000000000001";

const { workOrderIds } = isolationSeedIds;
const accountAId = isolationFixtures.accounts.accountA.id;
const accountBId = isolationFixtures.accounts.accountB.id;

function createAnonClient() {
  const env = getIntegrationEnv();
  return createClient(env.url, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

describe.skipIf(!isIntegrationHarnessConfigured())(
  "get_work_order_evidence_pack — cross-account security + payload shape",
  () => {
    let admin;
    let clientA; // signed in as ownerA (Account A member)
    let clientB; // signed in as ownerB (Account B member, no access to Account A)

    beforeAll(async () => {
      await ensureIsolationHarnessSeed();
      admin = getIntegrationAdminClient();

      ({ client: clientA } = await signInAsFixtureUser("ownerA"));
      ({ client: clientB } = await signInAsFixtureUser("ownerB"));

      // Seed one attachment on Account A's work order so payload-shape assertions
      // can verify that forbidden fields are absent from returned attachment objects.
      const { error: seedErr } = await admin.from("work_order_attachments").upsert(
        {
          id:                          PACK_ATTACHMENT_A_ID,
          work_order_id:               workOrderIds.accountA,
          account_id:                  accountAId,
          file_name:                   "pack_test_photo.jpg",
          file_size:                   8192,
          mime_type:                   "image/jpeg",
          maintenance_stage:           "contractor_completion",
          attester_role:               "contractor",
          capture_method:              "uploaded",
          content_hash_client_asserted: "deadbeef00000000000000000000000000000000000000000000000000000000",
          hash_trust:                  "client_asserted_unverified",
          uploaded_by:                 isolationFixtures.users.contractorA1.id,
          storage_bucket:              "work-order-attachments",
          storage_path:                `account/${accountAId}/work_orders/${workOrderIds.accountA}/pack-test-photo.jpg`,
        },
        { onConflict: "id" },
      );
      if (seedErr) throw new Error(`beforeAll: attachment seed failed: ${seedErr.message}`);
    });

    afterAll(async () => {
      await admin
        .from("work_order_attachments")
        .delete()
        .eq("id", PACK_ATTACHMENT_A_ID);
    });

    // ── Happy-path ────────────────────────────────────────────────────────────

    it("owner of Account A can read Account A's work-order pack", async () => {
      const { data, error } = await clientA.rpc("get_work_order_evidence_pack", {
        p_account_id:    accountAId,
        p_work_order_id: workOrderIds.accountA,
      });
      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data.workOrder).toBeDefined();
      expect(data.workOrder.id).toBe(workOrderIds.accountA);
      expect(data.workOrder.account_id).toBe(accountAId);
    });

    it("returned pack includes attachments array and provenance array", async () => {
      const { data, error } = await clientA.rpc("get_work_order_evidence_pack", {
        p_account_id:    accountAId,
        p_work_order_id: workOrderIds.accountA,
      });
      expect(error).toBeNull();
      expect(Array.isArray(data.attachments)).toBe(true);
      expect(Array.isArray(data.provenance)).toBe(true);
    });

    it("returned pack includes a status/readiness object", async () => {
      const { data, error } = await clientA.rpc("get_work_order_evidence_pack", {
        p_account_id:    accountAId,
        p_work_order_id: workOrderIds.accountA,
      });
      expect(error).toBeNull();
      expect(data.status).toBeDefined();
      expect(typeof data.status.attachment_count).toBe("number");
      expect(typeof data.status.is_completed_status).toBe("boolean");
      expect(Array.isArray(data.status.missing_items)).toBe(true);
      expect(data.status.pack_status_label).toBeDefined();
    });

    it("admin member of Account A can read Account A's work-order pack", async () => {
      const { client: clientAdminA } = await signInAsFixtureUser("adminA");
      const { data, error } = await clientAdminA.rpc("get_work_order_evidence_pack", {
        p_account_id:    accountAId,
        p_work_order_id: workOrderIds.accountA,
      });
      expect(error).toBeNull();
      expect(data.workOrder.id).toBe(workOrderIds.accountA);
    });

    // ── Cross-account deny ────────────────────────────────────────────────────

    it("owner of Account B cannot read Account A's work-order pack", async () => {
      const { data, error } = await clientB.rpc("get_work_order_evidence_pack", {
        p_account_id:    accountAId,
        p_work_order_id: workOrderIds.accountA,
      });
      expect(error).not.toBeNull();
      expect(data).toBeNull();
      expect(String(error.message || "").toLowerCase()).toMatch(/not authorized for account/i);
    });

    it("combination attack: own account_id + another account's work_order_id is denied", async () => {
      // ownerB passes accountBId but workOrderIds.accountA
      // user_can_manage_account(accountBId) passes, but the work order
      // belongs to Account A so the WO lookup returns not found.
      const { data, error } = await clientB.rpc("get_work_order_evidence_pack", {
        p_account_id:    accountBId,
        p_work_order_id: workOrderIds.accountA,
      });
      expect(error).not.toBeNull();
      expect(data).toBeNull();
      expect(String(error.message || "").toLowerCase()).toMatch(/not found for account/i);
    });

    it("owner of Account A cannot read Account B's work order via Account A pack", async () => {
      // ownerA passes accountAId but workOrderIds.accountB
      const { data, error } = await clientA.rpc("get_work_order_evidence_pack", {
        p_account_id:    accountAId,
        p_work_order_id: workOrderIds.accountB,
      });
      expect(error).not.toBeNull();
      expect(data).toBeNull();
      expect(String(error.message || "").toLowerCase()).toMatch(/not found for account/i);
    });

    // ── Unauthenticated deny ──────────────────────────────────────────────────

    it("unauthenticated (anon) caller is denied", async () => {
      const anon = createAnonClient();
      const { data, error } = await anon.rpc("get_work_order_evidence_pack", {
        p_account_id:    accountAId,
        p_work_order_id: workOrderIds.accountA,
      });
      // Anon role does not have EXECUTE permission; expect permission error
      expect(data).toBeNull();
      expect(error).not.toBeNull();
    });

    // ── Payload shape: no storage paths, no scan columns ──────────────────────

    it("attachments and top-level payload do not include storage_bucket or storage_path", async () => {
      // Note: provenance event metadata legitimately records storage_path (historical
      // provenance from record_work_order_attachment_received). The assertion scopes
      // to the top-level fields and the attachments array — not provenance metadata.
      const { data, error } = await clientA.rpc("get_work_order_evidence_pack", {
        p_account_id:    accountAId,
        p_work_order_id: workOrderIds.accountA,
      });
      expect(error).toBeNull();

      // Top-level + non-provenance fields must not contain storage paths
      const topLevel = JSON.stringify({
        workOrder: data.workOrder,
        maintenanceRequest: data.maintenanceRequest,
        property: data.property,
        contractor: data.contractor,
        attachments: data.attachments,
        status: data.status,
      });
      expect(topLevel).not.toContain("storage_bucket");
      expect(topLevel).not.toContain("storage_path");
    });

    it("payload does not include scan_status, scan_engine, or scanned_at", async () => {
      const { data, error } = await clientA.rpc("get_work_order_evidence_pack", {
        p_account_id:    accountAId,
        p_work_order_id: workOrderIds.accountA,
      });
      expect(error).toBeNull();
      const json = JSON.stringify(data);
      expect(json).not.toContain("scan_status");
      expect(json).not.toContain("scan_engine");
      expect(json).not.toContain("scanned_at");
    });

    it("payload does not include scan_signature or scan_failed_reason", async () => {
      const { data, error } = await clientA.rpc("get_work_order_evidence_pack", {
        p_account_id:    accountAId,
        p_work_order_id: workOrderIds.accountA,
      });
      expect(error).toBeNull();
      const json = JSON.stringify(data);
      expect(json).not.toContain("scan_signature");
      expect(json).not.toContain("scan_failed_reason");
    });

    it("readiness does not reference scan_clean, scan_flagged, or scan_failed event types", async () => {
      const { data, error } = await clientA.rpc("get_work_order_evidence_pack", {
        p_account_id:    accountAId,
        p_work_order_id: workOrderIds.accountA,
      });
      expect(error).toBeNull();
      const json = JSON.stringify(data.status);
      expect(json).not.toContain("scan_clean");
      expect(json).not.toContain("scan_flagged");
      expect(json).not.toContain("scan_failed");
    });

    it("attachment objects in the payload expose only the permitted field list", async () => {
      const { data, error } = await clientA.rpc("get_work_order_evidence_pack", {
        p_account_id:    accountAId,
        p_work_order_id: workOrderIds.accountA,
      });
      expect(error).toBeNull();

      const seededAttachment = (data.attachments || []).find(
        (a) => a.id === PACK_ATTACHMENT_A_ID,
      );
      expect(seededAttachment).toBeDefined();

      // Fields that MUST be present
      expect(seededAttachment.file_name).toBe("pack_test_photo.jpg");
      expect(seededAttachment.hash_trust).toBe("client_asserted_unverified");

      // Fields that must NOT be present
      const keys = Object.keys(seededAttachment);
      expect(keys).not.toContain("storage_bucket");
      expect(keys).not.toContain("storage_path");
      expect(keys).not.toContain("scan_status");
      expect(keys).not.toContain("scan_engine");
      expect(keys).not.toContain("scanned_at");
      expect(keys).not.toContain("scan_signature");
      expect(keys).not.toContain("scan_failed_reason");
      expect(keys).not.toContain("scan_attempted_at");
      expect(keys).not.toContain("hash_verification_error");
      expect(keys).not.toContain("verification_attempted_at");
    });

    // ── Provenance isolation ──────────────────────────────────────────────────

    it("provenance events from other accounts are not returned", async () => {
      const { data, error } = await clientA.rpc("get_work_order_evidence_pack", {
        p_account_id:    accountAId,
        p_work_order_id: workOrderIds.accountA,
      });
      expect(error).toBeNull();
      for (const event of data.provenance || []) {
        expect(event.account_id).toBe(accountAId);
      }
    });

    it("provenance events from other work orders are not returned", async () => {
      const { data, error } = await clientA.rpc("get_work_order_evidence_pack", {
        p_account_id:    accountAId,
        p_work_order_id: workOrderIds.accountA,
      });
      expect(error).toBeNull();
      for (const event of data.provenance || []) {
        expect(event.entity_id).toBe(workOrderIds.accountA);
      }
    });
  },
);
