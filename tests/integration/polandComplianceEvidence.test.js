// tests/integration/polandComplianceEvidence.test.js
//
// Integration and RLS tests for poland_compliance_evidence.sql:
//   - handover_protocols table RLS
//   - meter_readings table RLS
//   - update_checklist_item_evidence RPC (link / replace)
//   - remove_checklist_item_evidence RPC
//   - get_evidence_pack RPC
//   - create_or_update_handover_protocol RPC
//   - add_meter_reading RPC
//   - list_handover_protocols / list_meter_readings functions
//   - Cross-account isolation for all new tables and RPCs
//   - Regression: existing compliance_checklist_items unaffected

import { randomUUID } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import { isIntegrationHarnessConfigured } from "./helpers/env.js";
import {
  ensureIsolationHarnessSeed,
  getIntegrationAdminClient,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";
import { expectAccessDenied } from "./helpers/rpcAssertions.js";

const ACCOUNT_A = isolationFixtures.accounts.accountA.id;
const ACCOUNT_B = isolationFixtures.accounts.accountB.id;

function expectManagementDenied(result) {
  expect(result.error).toBeTruthy();
  const msg = String(result.error?.message || "").toLowerCase();
  expect(
    msg.includes("access denied") ||
      msg.includes("unauthorized") ||
      msg.includes("not permitted") ||
      msg.includes("permission denied") ||
      msg.includes("not authenticated") ||
      msg.includes("not a member"),
  ).toBe(true);
}

describe.skipIf(!isIntegrationHarnessConfigured())("Poland Compliance Evidence Pack — integration", () => {
  const admin = getIntegrationAdminClient();
  const cleanup = { handoverIds: new Set(), meterIds: new Set(), checklistItemIds: new Set() };

  beforeAll(async () => {
    await ensureIsolationHarnessSeed();
  });

  afterEach(async () => {
    if (cleanup.handoverIds.size > 0) {
      await admin.from("handover_protocols").delete().in("id", Array.from(cleanup.handoverIds));
      cleanup.handoverIds.clear();
    }
    if (cleanup.meterIds.size > 0) {
      await admin.from("meter_readings").delete().in("id", Array.from(cleanup.meterIds));
      cleanup.meterIds.clear();
    }
    if (cleanup.checklistItemIds.size > 0) {
      await admin.from("compliance_checklist_items").delete().in("id", Array.from(cleanup.checklistItemIds));
      cleanup.checklistItemIds.clear();
    }
  });

  // ── Helpers ────────────────────────────────────────────────────────────────

  async function getFixtureProperty(accountId) {
    const { data } = await admin
      .from("properties")
      .select("id")
      .eq("account_id", accountId)
      .limit(1)
      .maybeSingle();
    return data?.id || null;
  }

  async function getFixtureTenant(accountId, propertyId) {
    const { data } = await admin
      .from("tenants")
      .select("id")
      .eq("account_id", accountId)
      .eq("property_id", propertyId)
      .is("archived_at", null)
      .limit(1)
      .maybeSingle();
    return data?.id || null;
  }

  async function seedChecklistItem(accountId, propertyId, tenantId, itemKey = "lease_agreement") {
    const { data, error } = await admin
      .from("compliance_checklist_items")
      .insert({
        account_id:     accountId,
        property_id:    propertyId,
        tenant_id:      tenantId,
        market:         "pl",
        checklist_type: "najem_okazjonalny",
        item_key:       itemKey,
        title:          itemKey,
        status:         "pending",
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    cleanup.checklistItemIds.add(data.id);
    return data.id;
  }

  async function seedDocument(accountId) {
    const { data, error } = await admin
      .from("documents")
      .insert({
        account_id:     accountId,
        name:           `test-doc-${randomUUID().slice(0, 8)}.pdf`,
        mime_type:      "application/pdf",
        upload_status:  "uploaded",
        size_bytes:     1024,
        storage_path:   `${accountId}/test.pdf`,
        scope:          "account", // required NOT NULL; account-scoped when no property/tenant
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    return data.id;
  }

  // ── handover_protocols RLS ─────────────────────────────────────────────────

  describe("handover_protocols RLS", () => {
    it("owner A can insert and select own handover protocol", async () => {
      const { client } = await signInAsFixtureUser("ownerA");
      const propId = await getFixtureProperty(ACCOUNT_A);
      if (!propId) return;

      const { data, error } = await client
        .from("handover_protocols")
        .insert({
          account_id:    ACCOUNT_A,
          property_id:   propId,
          protocol_type: "move_in",
        })
        .select("id")
        .single();
      expect(error).toBeNull();
      cleanup.handoverIds.add(data.id);

      const { data: rows } = await client
        .from("handover_protocols")
        .select("id")
        .eq("account_id", ACCOUNT_A);
      expect(rows.some((r) => r.id === data.id)).toBe(true);
    });

    it("owner A cannot see account B handover protocols", async () => {
      const propIdB = await getFixtureProperty(ACCOUNT_B);
      if (!propIdB) return;

      const { data: hp } = await admin
        .from("handover_protocols")
        .insert({ account_id: ACCOUNT_B, property_id: propIdB, protocol_type: "move_out" })
        .select("id")
        .single();
      cleanup.handoverIds.add(hp.id);

      const { client } = await signInAsFixtureUser("ownerA");
      const { data: rows } = await client
        .from("handover_protocols")
        .select("id")
        .eq("id", hp.id);
      expect(rows).toEqual([]);
    });

    it("tenant user cannot select handover protocols", async () => {
      const { client } = await signInAsFixtureUser("tenantA1");
      const { data: rows } = await client
        .from("handover_protocols")
        .select("id")
        .eq("account_id", ACCOUNT_A);
      expect(rows).toEqual([]);
    });
  });

  // ── meter_readings RLS ─────────────────────────────────────────────────────

  describe("meter_readings RLS", () => {
    it("owner A can insert and select own meter reading", async () => {
      const { client } = await signInAsFixtureUser("ownerA");
      const propId = await getFixtureProperty(ACCOUNT_A);
      if (!propId) return;

      const { data, error } = await client
        .from("meter_readings")
        .insert({
          account_id:    ACCOUNT_A,
          property_id:   propId,
          meter_type:    "electricity",
          reading_value: "12345",
          unit:          "kWh",
        })
        .select("id")
        .single();
      expect(error).toBeNull();
      cleanup.meterIds.add(data.id);
    });

    it("owner A cannot see account B meter readings", async () => {
      const propIdB = await getFixtureProperty(ACCOUNT_B);
      if (!propIdB) return;

      const { data: mr } = await admin
        .from("meter_readings")
        .insert({ account_id: ACCOUNT_B, property_id: propIdB, meter_type: "gas", reading_value: "999" })
        .select("id")
        .single();
      cleanup.meterIds.add(mr.id);

      const { client } = await signInAsFixtureUser("ownerA");
      const { data: rows } = await client
        .from("meter_readings")
        .select("id")
        .eq("id", mr.id);
      expect(rows).toEqual([]);
    });

    it("tenant user cannot select meter readings", async () => {
      const { client } = await signInAsFixtureUser("tenantA1");
      const { data: rows } = await client
        .from("meter_readings")
        .select("id")
        .eq("account_id", ACCOUNT_A);
      expect(rows).toEqual([]);
    });
  });

  // ── update_checklist_item_evidence RPC ────────────────────────────────────

  describe("update_checklist_item_evidence", () => {
    it("links a document to a checklist item", async () => {
      const { client } = await signInAsFixtureUser("ownerA");
      const propId = await getFixtureProperty(ACCOUNT_A);
      const tenId  = await getFixtureTenant(ACCOUNT_A, propId);
      if (!propId || !tenId) return;

      const itemId = await seedChecklistItem(ACCOUNT_A, propId, tenId);
      const docId  = await seedDocument(ACCOUNT_A);

      const { error } = await client.rpc("update_checklist_item_evidence", {
        p_account_id:  ACCOUNT_A,
        p_item_id:     itemId,
        p_document_id: docId,
        p_mark_complete: false,
      });
      expect(error).toBeNull();

      const { data } = await admin.from("compliance_checklist_items").select("evidence_document_id").eq("id", itemId).single();
      expect(data.evidence_document_id).toBe(docId);

      // cleanup document
      await admin.from("documents").delete().eq("id", docId);
    });

    it("cross-account link is denied", async () => {
      const { client } = await signInAsFixtureUser("ownerA");
      const propIdB = await getFixtureProperty(ACCOUNT_B);
      const tenIdB  = await getFixtureTenant(ACCOUNT_B, propIdB);
      if (!propIdB || !tenIdB) return;

      const itemIdB = await seedChecklistItem(ACCOUNT_B, propIdB, tenIdB);
      const docIdA  = await seedDocument(ACCOUNT_A);

      const result = await client.rpc("update_checklist_item_evidence", {
        p_account_id:  ACCOUNT_B,
        p_item_id:     itemIdB,
        p_document_id: docIdA,
        p_mark_complete: false,
      });
      expectManagementDenied(result);

      await admin.from("documents").delete().eq("id", docIdA);
    });

    it("tenant is denied", async () => {
      const { client } = await signInAsFixtureUser("tenantA1");
      const result = await client.rpc("update_checklist_item_evidence", {
        p_account_id:  ACCOUNT_A,
        p_item_id:     randomUUID(),
        p_document_id: randomUUID(),
        p_mark_complete: false,
      });
      expectManagementDenied(result);
    });
  });

  // ── remove_checklist_item_evidence RPC ────────────────────────────────────

  describe("remove_checklist_item_evidence", () => {
    it("unlinks a document from a checklist item", async () => {
      const { client } = await signInAsFixtureUser("ownerA");
      const propId = await getFixtureProperty(ACCOUNT_A);
      const tenId  = await getFixtureTenant(ACCOUNT_A, propId);
      if (!propId || !tenId) return;

      const itemId = await seedChecklistItem(ACCOUNT_A, propId, tenId);
      const docId  = await seedDocument(ACCOUNT_A);

      // Link first
      await admin.from("compliance_checklist_items").update({ evidence_document_id: docId }).eq("id", itemId);

      const { error } = await client.rpc("remove_checklist_item_evidence", {
        p_account_id: ACCOUNT_A,
        p_item_id:    itemId,
      });
      expect(error).toBeNull();

      const { data } = await admin.from("compliance_checklist_items").select("evidence_document_id").eq("id", itemId).single();
      expect(data.evidence_document_id).toBeNull();

      await admin.from("documents").delete().eq("id", docId);
    });

    it("cross-account remove is denied", async () => {
      const { client } = await signInAsFixtureUser("ownerA");
      const result = await client.rpc("remove_checklist_item_evidence", {
        p_account_id: ACCOUNT_B,
        p_item_id:    randomUUID(),
      });
      expectManagementDenied(result);
    });
  });

  // ── get_evidence_pack RPC ─────────────────────────────────────────────────

  describe("get_evidence_pack", () => {
    it("returns JSONB with completion stats for account A items", async () => {
      const { client } = await signInAsFixtureUser("ownerA");
      const propId = await getFixtureProperty(ACCOUNT_A);
      const tenId  = await getFixtureTenant(ACCOUNT_A, propId);
      if (!propId || !tenId) return;

      await seedChecklistItem(ACCOUNT_A, propId, tenId, "lease_agreement");
      await seedChecklistItem(ACCOUNT_A, propId, tenId, "notarial_declaration");

      const { data, error } = await client.rpc("get_evidence_pack", {
        p_account_id:  ACCOUNT_A,
        p_property_id: propId,
        p_tenant_id:   tenId,
      });
      expect(error).toBeNull();
      expect(data).toHaveProperty("total");
      expect(data).toHaveProperty("completion_pct");
      expect(data).toHaveProperty("items");
      expect(data.total).toBeGreaterThanOrEqual(2);
    });

    it("returns 0 completion for all-pending items", async () => {
      const { client } = await signInAsFixtureUser("ownerA");
      const propId = await getFixtureProperty(ACCOUNT_A);
      const tenId  = await getFixtureTenant(ACCOUNT_A, propId);
      if (!propId || !tenId) return;

      await seedChecklistItem(ACCOUNT_A, propId, tenId, "deposit_confirmation");

      const { data } = await client.rpc("get_evidence_pack", {
        p_account_id:  ACCOUNT_A,
        p_property_id: propId,
        p_tenant_id:   tenId,
      });
      expect(data.completion_pct).toBe(0);
    });

    it("cross-account query returns empty/denied", async () => {
      const { client } = await signInAsFixtureUser("ownerA");
      const result = await client.rpc("get_evidence_pack", {
        p_account_id:  ACCOUNT_B,
        p_property_id: randomUUID(),
        p_tenant_id:   randomUUID(),
      });
      expectManagementDenied(result);
    });
  });

  // ── create_or_update_handover_protocol RPC ────────────────────────────────

  describe("create_or_update_handover_protocol", () => {
    it("creates a new handover protocol", async () => {
      const { client } = await signInAsFixtureUser("ownerA");
      const propId = await getFixtureProperty(ACCOUNT_A);
      const tenId  = await getFixtureTenant(ACCOUNT_A, propId);
      if (!propId || !tenId) return;

      const { data, error } = await client.rpc("create_or_update_handover_protocol", {
        p_account_id:      ACCOUNT_A,
        p_property_id:     propId,
        p_tenant_id:       tenId,
        p_lease_id:        null,
        p_protocol_type:   "move_in",
        p_general_condition: "Good overall condition.",
        p_room_notes:      [{ room: "Kitchen", condition: "good", notes: "" }],
        p_keys_handed_over: true,
        p_appliances_notes: null,
        p_additional_notes: null,
        p_protocol_id:     null,
      });
      expect(error).toBeNull();
      expect(data).toBeTruthy();
      cleanup.handoverIds.add(data);
    });

    it("cross-account create is denied", async () => {
      const { client } = await signInAsFixtureUser("ownerA");
      const result = await client.rpc("create_or_update_handover_protocol", {
        p_account_id:      ACCOUNT_B,
        p_property_id:     randomUUID(),
        p_tenant_id:       null,
        p_lease_id:        null,
        p_protocol_type:   "move_in",
        p_general_condition: null,
        p_room_notes:      [],
        p_keys_handed_over: false,
        p_appliances_notes: null,
        p_additional_notes: null,
        p_protocol_id:     null,
      });
      expectManagementDenied(result);
    });
  });

  // ── add_meter_reading RPC ─────────────────────────────────────────────────

  describe("add_meter_reading", () => {
    it("adds a meter reading for account A", async () => {
      const { client } = await signInAsFixtureUser("ownerA");
      const propId = await getFixtureProperty(ACCOUNT_A);
      const tenId  = await getFixtureTenant(ACCOUNT_A, propId);
      if (!propId || !tenId) return;

      const { data, error } = await client.rpc("add_meter_reading", {
        p_account_id:          ACCOUNT_A,
        p_property_id:         propId,
        p_meter_type:          "electricity",
        p_reading_value:       "12345.6",
        p_unit:                "kWh",
        p_read_at:             new Date().toISOString(),
        p_notes:               null,
        p_tenant_id:           tenId,
        p_handover_protocol_id: null,
        p_evidence_document_id: null,
      });
      expect(error).toBeNull();
      expect(data).toBeTruthy();
      cleanup.meterIds.add(data);
    });

    it("cross-account meter reading is denied", async () => {
      const { client } = await signInAsFixtureUser("ownerA");
      const result = await client.rpc("add_meter_reading", {
        p_account_id:          ACCOUNT_B,
        p_property_id:         randomUUID(),
        p_meter_type:          "gas",
        p_reading_value:       "100",
        p_unit:                null,
        p_read_at:             new Date().toISOString(),
        p_notes:               null,
        p_tenant_id:           null,
        p_handover_protocol_id: null,
        p_evidence_document_id: null,
      });
      expectManagementDenied(result);
    });

    it("tenant cannot add meter readings via RPC", async () => {
      const { client } = await signInAsFixtureUser("tenantA1");
      const result = await client.rpc("add_meter_reading", {
        p_account_id:          ACCOUNT_A,
        p_property_id:         randomUUID(),
        p_meter_type:          "electricity",
        p_reading_value:       "100",
        p_unit:                null,
        p_read_at:             new Date().toISOString(),
        p_notes:               null,
        p_tenant_id:           null,
        p_handover_protocol_id: null,
        p_evidence_document_id: null,
      });
      expectManagementDenied(result);
    });
  });

  // ── list functions ─────────────────────────────────────────────────────────

  describe("list_handover_protocols", () => {
    it("returns protocols for account A only", async () => {
      const { client } = await signInAsFixtureUser("ownerA");
      const propId = await getFixtureProperty(ACCOUNT_A);
      if (!propId) return;

      const { data: hp } = await admin
        .from("handover_protocols")
        .insert({ account_id: ACCOUNT_A, property_id: propId, protocol_type: "move_in" })
        .select("id")
        .single();
      cleanup.handoverIds.add(hp.id);

      const { data, error } = await client.rpc("list_handover_protocols", {
        p_account_id:  ACCOUNT_A,
        p_property_id: propId,
        p_tenant_id:   null,
      });
      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
      expect(data.some((r) => r.id === hp.id)).toBe(true);
    });

    it("cross-account list returns empty or denied", async () => {
      const { client } = await signInAsFixtureUser("ownerA");
      const result = await client.rpc("list_handover_protocols", {
        p_account_id:  ACCOUNT_B,
        p_property_id: null,
        p_tenant_id:   null,
      });
      if (!result.error) {
        expect(result.data).toEqual([]);
      } else {
        expectManagementDenied(result);
      }
    });
  });

  describe("list_meter_readings", () => {
    it("returns readings for account A only", async () => {
      const { client } = await signInAsFixtureUser("ownerA");
      const propId = await getFixtureProperty(ACCOUNT_A);
      if (!propId) return;

      const { data: mr } = await admin
        .from("meter_readings")
        .insert({ account_id: ACCOUNT_A, property_id: propId, meter_type: "heat", reading_value: "500" })
        .select("id")
        .single();
      cleanup.meterIds.add(mr.id);

      const { data, error } = await client.rpc("list_meter_readings", {
        p_account_id:          ACCOUNT_A,
        p_property_id:         propId,
        p_tenant_id:           null,
        p_handover_protocol_id: null,
      });
      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
      expect(data.some((r) => r.id === mr.id)).toBe(true);
    });
  });

  // ── Regression: existing compliance_checklist_items unaffected ─────────────

  describe("regression — existing compliance_checklist_items", () => {
    it("can still read compliance_checklist_items with ownerA", async () => {
      const { client } = await signInAsFixtureUser("ownerA");
      const { error } = await client.from("compliance_checklist_items").select("id").eq("account_id", ACCOUNT_A).limit(1);
      expect(error).toBeNull();
    });
  });
});
