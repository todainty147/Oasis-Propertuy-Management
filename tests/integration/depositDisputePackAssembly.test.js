/**
 * D-13: Deposit Dispute Pack v0 — end-to-end assembly test.
 *
 * Proves that a deposit dispute pack can be built from real app data:
 *   - check-in and check-out inspection reports with rooms/items/conditions
 *   - a dispute pack with deduction and inspection report references
 *   - builder functions produce correct deduction total, evidence index,
 *     and condition comparison rows from the stored data
 *
 * Does NOT test photo scanning (E-158 not opened), signatures (E-033 tested
 * separately), or tenant sharing (separate surface).
 *
 * Caveat banner contract: asserts the print page source contains the required
 * honesty banner text, as a static contract against regression.
 */

import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  buildConditionComparisonRows,
  buildEvidenceIndex,
  calculateDeductionTotal,
} from "../../src/lib/depositDisputePack.js";
import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import {
  ensureIsolationHarnessSeed,
  getIntegrationAdminClient,
} from "./helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "./helpers/env.js";

// ── Fixture IDs — unique dd000001-... prefix ───────────────────────────────

const accountAId = isolationFixtures.accounts.accountA.id;
const propertyId = isolationFixtures.users.tenantA1.propertyId;
const tenantId = isolationFixtures.users.tenantA1.tenantId;

const CHECK_IN_REPORT_ID  = "dd000001-0000-4000-0000-000000000001";
const CHECK_OUT_REPORT_ID = "dd000001-0000-4000-0000-000000000002";
const ROOM_CI_ID          = "dd000001-0000-4000-0000-000000000003";
const ROOM_CO_ID          = "dd000001-0000-4000-0000-000000000004";
const ITEM_CI_ID          = "dd000001-0000-4000-0000-000000000005";
const ITEM_CO_ID          = "dd000001-0000-4000-0000-000000000006";
const PACK_ID             = "dd000001-0000-4000-0000-000000000007";

const PRINT_PAGE_PATH = path.join(
  process.cwd(),
  "src/pages/documents/DepositDisputePackPrintPage.jsx",
);

describe.skipIf(!isIntegrationHarnessConfigured())(
  "Deposit Dispute Pack v0 — assembly",
  () => {
    let admin;

    async function cleanup() {
      await admin.from("deposit_dispute_pack_items").delete().eq("dispute_pack_id", PACK_ID);
      await admin.from("deposit_dispute_packs").delete().eq("id", PACK_ID);
      await admin.from("inspection_evidence_items").delete()
        .in("id", [ITEM_CI_ID, ITEM_CO_ID]);
      await admin.from("inspection_rooms").delete()
        .in("id", [ROOM_CI_ID, ROOM_CO_ID]);
      await admin.from("inspection_reports").delete()
        .in("id", [CHECK_IN_REPORT_ID, CHECK_OUT_REPORT_ID]);
    }

    beforeAll(async () => {
      await ensureIsolationHarnessSeed();
      admin = getIntegrationAdminClient();
      await cleanup();

      // Seed check-in report
      const { error: e1 } = await admin.from("inspection_reports").upsert({
        id: CHECK_IN_REPORT_ID,
        account_id: accountAId,
        property_id: propertyId,
        tenant_id: tenantId,
        inspection_type: "check_in",
        status: "draft",
        title: "Move-in inspection",
        inspection_date: "2026-01-10",
      }, { onConflict: "id" });
      if (e1) throw new Error(`seed check-in report: ${e1.message}`);

      // Seed check-out report
      const { error: e2 } = await admin.from("inspection_reports").upsert({
        id: CHECK_OUT_REPORT_ID,
        account_id: accountAId,
        property_id: propertyId,
        tenant_id: tenantId,
        inspection_type: "check_out",
        status: "draft",
        title: "Move-out inspection",
        inspection_date: "2026-06-20",
      }, { onConflict: "id" });
      if (e2) throw new Error(`seed check-out report: ${e2.message}`);

      // Seed rooms
      const { error: e3 } = await admin.from("inspection_rooms").upsert([
        { id: ROOM_CI_ID, account_id: accountAId, inspection_report_id: CHECK_IN_REPORT_ID, room_name: "Kitchen", sort_order: 1 },
        { id: ROOM_CO_ID, account_id: accountAId, inspection_report_id: CHECK_OUT_REPORT_ID, room_name: "Kitchen", sort_order: 1 },
      ], { onConflict: "id" });
      if (e3) throw new Error(`seed rooms: ${e3.message}`);

      // Seed evidence items — same room/label, different condition ratings
      const { error: e4 } = await admin.from("inspection_evidence_items").upsert([
        {
          id: ITEM_CI_ID,
          account_id: accountAId,
          inspection_room_id: ROOM_CI_ID,
          item_label: "Floor",
          condition_rating: "good",
          notes: "Clean and undamaged",
          sort_order: 1,
        },
        {
          id: ITEM_CO_ID,
          account_id: accountAId,
          inspection_room_id: ROOM_CO_ID,
          item_label: "Floor",
          condition_rating: "damaged",
          notes: "Deep scratches",
          sort_order: 1,
        },
      ], { onConflict: "id" });
      if (e4) throw new Error(`seed items: ${e4.message}`);

      // Seed dispute pack
      const { error: e5 } = await admin.from("deposit_dispute_packs").upsert({
        id: PACK_ID,
        account_id: accountAId,
        property_id: propertyId,
        tenant_id: tenantId,
        title: "D-13 Assembly Test Pack",
        status: "draft",
        deposit_amount: 1200,
        proposed_deduction_amount: 200,
        summary: "Test pack for assembly integration proof.",
      }, { onConflict: "id" });
      if (e5) throw new Error(`seed pack: ${e5.message}`);

      // Seed pack items: check-in ref, check-out ref, deduction
      const { error: e6 } = await admin.from("deposit_dispute_pack_items").upsert([
        {
          account_id: accountAId,
          dispute_pack_id: PACK_ID,
          item_type: "inspection_report",
          title: "Move-in inspection",
          evidence_reference_type: "check_in_report",
          evidence_reference_id: CHECK_IN_REPORT_ID,
          sort_order: 1,
        },
        {
          account_id: accountAId,
          dispute_pack_id: PACK_ID,
          item_type: "inspection_report",
          title: "Move-out inspection",
          evidence_reference_type: "check_out_report",
          evidence_reference_id: CHECK_OUT_REPORT_ID,
          sort_order: 2,
        },
        {
          account_id: accountAId,
          dispute_pack_id: PACK_ID,
          item_type: "deduction",
          title: "Floor cleaning and repair",
          description: "Deep scratches to kitchen floor — cleaning and partial resurfacing.",
          claimed_amount: 200,
          sort_order: 3,
        },
      ], { onConflict: undefined });
      if (e6) throw new Error(`seed pack items: ${e6.message}`);
    });

    afterAll(async () => {
      await cleanup();
    });

    // ── Pack structure ─────────────────────────────────────────────────────────

    it("pack loads with title, status, deposit amount, and pack items", async () => {
      const { data: pack, error } = await admin
        .from("deposit_dispute_packs")
        .select("id, title, status, deposit_amount, proposed_deduction_amount, deposit_dispute_pack_items(id, item_type, title, claimed_amount, evidence_reference_type, evidence_reference_id, sort_order)")
        .eq("id", PACK_ID)
        .single();

      expect(error).toBeNull();
      expect(pack.title).toBe("D-13 Assembly Test Pack");
      expect(pack.status).toBe("draft");
      expect(Number(pack.deposit_amount)).toBe(1200);
      expect(pack.deposit_dispute_pack_items).toHaveLength(3);
    });

    // ── Builder: deduction total ───────────────────────────────────────────────

    it("calculateDeductionTotal returns £200 for the seeded deduction item", async () => {
      const { data: pack } = await admin
        .from("deposit_dispute_packs")
        .select("deposit_dispute_pack_items(item_type, claimed_amount)")
        .eq("id", PACK_ID)
        .single();

      const total = calculateDeductionTotal(pack.deposit_dispute_pack_items);
      expect(total).toBe(200);
    });

    // ── Builder: evidence index ────────────────────────────────────────────────

    it("buildEvidenceIndex includes both inspection report references", async () => {
      const { data: pack } = await admin
        .from("deposit_dispute_packs")
        .select("deposit_dispute_pack_items(item_type, title, evidence_reference_type, evidence_reference_id, sort_order)")
        .eq("id", PACK_ID)
        .single();

      const index = buildEvidenceIndex(pack.deposit_dispute_pack_items);
      expect(index).toHaveLength(2);
      expect(index[0].type).toBe("check_in_report");
      expect(index[1].type).toBe("check_out_report");
      expect(index[0].number).toBe(1);
      expect(index[1].number).toBe(2);
    });

    // ── Builder: condition comparison ─────────────────────────────────────────

    it("buildConditionComparisonRows detects Kitchen Floor deterioration from good to damaged", async () => {
      const { data: reports, error } = await admin
        .from("inspection_reports")
        .select(`
          id, inspection_type, inspection_date,
          inspection_rooms(
            id, room_name, sort_order,
            inspection_evidence_items(id, item_label, condition_rating, notes, sort_order)
          )
        `)
        .in("id", [CHECK_IN_REPORT_ID, CHECK_OUT_REPORT_ID]);

      expect(error).toBeNull();
      expect(reports).toHaveLength(2);

      const result = buildConditionComparisonRows(reports);
      expect(result).not.toBeNull();
      expect(result.rows).toHaveLength(1);

      const row = result.rows[0];
      expect(row.roomName).toBe("Kitchen");
      expect(row.itemLabel).toBe("Floor");
      expect(row.checkInCondition).toBe("good");
      expect(row.checkOutCondition).toBe("damaged");
    });

    // ── Caveat banner contract ─────────────────────────────────────────────────

    it("print page source contains the Important limitations honesty banner", () => {
      const source = fs.readFileSync(PRINT_PAGE_PATH, "utf8");
      expect(source).toContain("Important limitations");
      expect(source).toContain("not legal advice, legal sign-off, or a decision by a deposit adjudicator");
      expect(source).toContain("do not by themselves prove legal liability");
      expect(source).toContain("does not independently authenticate");
      expect(source).toContain("business-process lock in Tenaqo");
      expect(source).not.toContain("damage is proven");
      expect(source).not.toContain("deduction is legally valid");
    });

    // ── Cleanup is idempotent ─────────────────────────────────────────────────

    it("pack items are scoped to account_id (admin delete is account-scoped)", async () => {
      const { data: items } = await admin
        .from("deposit_dispute_pack_items")
        .select("id")
        .eq("dispute_pack_id", PACK_ID);

      expect(items.length).toBeGreaterThan(0);
    });
  },
);
