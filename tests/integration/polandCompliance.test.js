// tests/integration/polandCompliance.test.js
//
// Integration, RLS, and regression tests for the Poland Compliance layer:
//   - compliance_checklist_items table RLS
//   - setup_najem_okazjonalny_checklist RPC (idempotency, auth, guard)
//   - update_checklist_item_evidence RPC (cross-account document guard)
//   - pl_compliance_checklist_command_items helper function
//   - notify_pl_compliance_deadlines RPC
//   - Regression: existing modules unaffected (command_center_items, tax, leases)

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

// Fixtures: account A has at least one property and tenant seeded by isolationFixtures.
// We derive property_id/tenant_id from fixture data or create synthetic ones via admin.

function skipIfMissing(result) {
  return result.error?.code === "PGRST202" || result.error?.code === "42883";
}

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

describe.skipIf(!isIntegrationHarnessConfigured())("Poland Compliance — integration", () => {
  const admin = getIntegrationAdminClient();
  const createdItemIds = new Set();
  const createdLeaseIds = new Set();

  async function cleanupItems() {
    if (createdItemIds.size > 0) {
      await admin
        .from("compliance_checklist_items")
        .delete()
        .in("id", Array.from(createdItemIds));
      createdItemIds.clear();
    }
  }

  async function cleanupLeases() {
    if (createdLeaseIds.size > 0) {
      await admin.from("leases").delete().in("id", Array.from(createdLeaseIds));
      createdLeaseIds.clear();
    }
  }

  beforeAll(async () => {
    await ensureIsolationHarnessSeed();
  });

  afterEach(async () => {
    await cleanupItems();
    await cleanupLeases();
  });

  // ── Helpers ───────────────────────────────────────────────────────────────

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

  async function setupChecklist(client, opts) {
    return client.rpc("setup_najem_okazjonalny_checklist", {
      p_account_id:  opts.accountId,
      p_property_id: opts.propertyId,
      p_tenant_id:   opts.tenantId,
      p_lease_id:    opts.leaseId || null,
      p_lease_start: opts.leaseStart || null,
    });
  }

  async function listCreatedItems(accountId, propertyId, tenantId) {
    const { data } = await admin
      .from("compliance_checklist_items")
      .select("*")
      .eq("account_id", accountId)
      .eq("property_id", propertyId)
      .eq("tenant_id", tenantId)
      .eq("checklist_type", "najem_okazjonalny");
    return data || [];
  }

  // ── Checklist setup — core mechanics ─────────────────────────────────────

  describe("setup_najem_okazjonalny_checklist — core mechanics", () => {
    it("creates 10 checklist items for a valid property/tenant pair", async () => {
      const { client } = await signInAsFixtureUser("ownerA");
      const propId = await getFixtureProperty(ACCOUNT_A);
      const tenId  = await getFixtureTenant(ACCOUNT_A, propId);
      if (!propId || !tenId) return; // fixture not seeded with property/tenant

      const result = await setupChecklist(client, { accountId: ACCOUNT_A, propertyId: propId, tenantId: tenId });
      if (skipIfMissing(result)) return;

      expect(result.error).toBeNull();
      expect(result.data?.created).toBe(10);
      expect(result.data?.skipped).toBe(0);

      const items = await listCreatedItems(ACCOUNT_A, propId, tenId);
      items.forEach((i) => createdItemIds.add(i.id));
      expect(items).toHaveLength(10);
      expect(items.every((i) => i.market === "pl")).toBe(true);
      expect(items.every((i) => i.status === "pending")).toBe(true);
    });

    it("assigns Tax Office deadline as lease_start + 14 days", async () => {
      const { client } = await signInAsFixtureUser("ownerA");
      const propId = await getFixtureProperty(ACCOUNT_A);
      const tenId  = await getFixtureTenant(ACCOUNT_A, propId);
      if (!propId || !tenId) return;

      const leaseStart = "2026-06-01";
      const result = await setupChecklist(client, {
        accountId:  ACCOUNT_A,
        propertyId: propId,
        tenantId:   tenId,
        leaseStart,
      });
      if (skipIfMissing(result)) return;
      expect(result.error).toBeNull();

      const items = await listCreatedItems(ACCOUNT_A, propId, tenId);
      items.forEach((i) => createdItemIds.add(i.id));

      const deadlineItem = items.find((i) => i.item_key === "tax_office_deadline");
      expect(deadlineItem).toBeDefined();
      expect(deadlineItem.due_date).toBe("2026-06-15"); // 2026-06-01 + 14 days
    });

    it("is idempotent — second call skips all 10 items", async () => {
      const { client } = await signInAsFixtureUser("ownerA");
      const propId = await getFixtureProperty(ACCOUNT_A);
      const tenId  = await getFixtureTenant(ACCOUNT_A, propId);
      if (!propId || !tenId) return;

      const first = await setupChecklist(client, { accountId: ACCOUNT_A, propertyId: propId, tenantId: tenId });
      if (skipIfMissing(first)) return;
      expect(first.error).toBeNull();

      const second = await setupChecklist(client, { accountId: ACCOUNT_A, propertyId: propId, tenantId: tenId });
      expect(second.error).toBeNull();
      expect(second.data?.created).toBe(0);
      expect(second.data?.skipped).toBe(10);

      // No duplicate rows
      const items = await listCreatedItems(ACCOUNT_A, propId, tenId);
      items.forEach((i) => createdItemIds.add(i.id));
      expect(items).toHaveLength(10);
    });
  });

  // ── Eligibility guards ────────────────────────────────────────────────────

  describe("setup_najem_okazjonalny_checklist — eligibility guards", () => {
    it("denies tenant from calling setup RPC", async () => {
      const { client } = await signInAsFixtureUser("tenantA1");
      const propId = await getFixtureProperty(ACCOUNT_A);
      const tenId  = await getFixtureTenant(ACCOUNT_A, propId);
      if (!propId || !tenId) return;

      const result = await setupChecklist(client, { accountId: ACCOUNT_A, propertyId: propId, tenantId: tenId });
      if (skipIfMissing(result)) return;
      expectManagementDenied(result);
    });

    it("denies contractor from calling setup RPC", async () => {
      const { client } = await signInAsFixtureUser("contractorA1");
      const propId = await getFixtureProperty(ACCOUNT_A);
      const tenId  = await getFixtureTenant(ACCOUNT_A, propId);
      if (!propId || !tenId) return;

      const result = await setupChecklist(client, { accountId: ACCOUNT_A, propertyId: propId, tenantId: tenId });
      if (skipIfMissing(result)) return;
      expectManagementDenied(result);
    });

    it("denies cross-account setup (account A owner on account B)", async () => {
      const { client } = await signInAsFixtureUser("ownerA");
      const propId = await getFixtureProperty(ACCOUNT_B);
      const tenId  = await getFixtureTenant(ACCOUNT_B, propId);
      if (!propId || !tenId) return;

      const result = await setupChecklist(client, { accountId: ACCOUNT_B, propertyId: propId, tenantId: tenId });
      if (skipIfMissing(result)) return;
      expectManagementDenied(result);
    });
  });

  // ── RLS on compliance_checklist_items ─────────────────────────────────────

  describe("compliance_checklist_items — RLS", () => {
    it("account A owner can SELECT their own checklist items", async () => {
      const propId = await getFixtureProperty(ACCOUNT_A);
      const tenId  = await getFixtureTenant(ACCOUNT_A, propId);
      if (!propId || !tenId) return;

      // Insert via admin so RLS is bypassed for setup
      const { data: inserted } = await admin
        .from("compliance_checklist_items")
        .insert({
          account_id:    ACCOUNT_A,
          property_id:   propId,
          tenant_id:     tenId,
          market:        "pl",
          checklist_type:"najem_okazjonalny",
          item_key:      "rls_test_item_" + randomUUID().slice(0, 8),
          title:         "RLS test item",
        })
        .select()
        .single();
      if (!inserted) return;
      createdItemIds.add(inserted.id);

      const { client } = await signInAsFixtureUser("ownerA");
      const { data, error } = await client
        .from("compliance_checklist_items")
        .select("id")
        .eq("account_id", ACCOUNT_A);

      expect(error).toBeNull();
      expect(data?.map((r) => r.id)).toContain(inserted.id);
    });

    it("tenant cannot SELECT compliance_checklist_items", async () => {
      const { client } = await signInAsFixtureUser("tenantA1");
      const { data, error } = await client
        .from("compliance_checklist_items")
        .select("id")
        .eq("account_id", ACCOUNT_A);

      // RLS returns empty result (not an error) for unauthorized reads on row-level
      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });

    it("contractor cannot SELECT compliance_checklist_items", async () => {
      const { client } = await signInAsFixtureUser("contractorA1");
      const { data, error } = await client
        .from("compliance_checklist_items")
        .select("id")
        .eq("account_id", ACCOUNT_A);

      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });

    it("account A owner cannot see account B checklist items", async () => {
      const propId = await getFixtureProperty(ACCOUNT_B);
      const tenId  = await getFixtureTenant(ACCOUNT_B, propId);
      if (!propId || !tenId) return;

      const { data: inserted } = await admin
        .from("compliance_checklist_items")
        .insert({
          account_id:    ACCOUNT_B,
          property_id:   propId,
          tenant_id:     tenId,
          market:        "pl",
          checklist_type:"najem_okazjonalny",
          item_key:      "rls_cross_test_" + randomUUID().slice(0, 8),
          title:         "Cross-account test item",
        })
        .select()
        .single();
      if (!inserted) return;
      createdItemIds.add(inserted.id);

      const { client } = await signInAsFixtureUser("ownerA");
      const { data } = await client
        .from("compliance_checklist_items")
        .select("id")
        .eq("id", inserted.id);

      expect((data || []).map((r) => r.id)).not.toContain(inserted.id);
    });

    it("account A owner can UPDATE checklist item status", async () => {
      const propId = await getFixtureProperty(ACCOUNT_A);
      const tenId  = await getFixtureTenant(ACCOUNT_A, propId);
      if (!propId || !tenId) return;

      const { data: inserted } = await admin
        .from("compliance_checklist_items")
        .insert({
          account_id:    ACCOUNT_A,
          property_id:   propId,
          tenant_id:     tenId,
          market:        "pl",
          checklist_type:"najem_okazjonalny",
          item_key:      "update_test_" + randomUUID().slice(0, 8),
          title:         "Update test item",
        })
        .select()
        .single();
      if (!inserted) return;
      createdItemIds.add(inserted.id);

      const { client } = await signInAsFixtureUser("ownerA");
      const { error } = await client
        .from("compliance_checklist_items")
        .update({ status: "complete", completed_at: new Date().toISOString() })
        .eq("id", inserted.id)
        .eq("account_id", ACCOUNT_A);

      expect(error).toBeNull();

      const { data: updated } = await admin
        .from("compliance_checklist_items")
        .select("status")
        .eq("id", inserted.id)
        .single();
      expect(updated?.status).toBe("complete");
    });
  });

  // ── update_checklist_item_evidence — cross-account guard ─────────────────

  describe("update_checklist_item_evidence — cross-account document guard", () => {
    it("denies linking a document from a different account", async () => {
      const propIdA = await getFixtureProperty(ACCOUNT_A);
      const tenIdA  = await getFixtureTenant(ACCOUNT_A, propIdA);
      const propIdB = await getFixtureProperty(ACCOUNT_B);
      if (!propIdA || !tenIdA || !propIdB) return;

      // Create a checklist item in account A
      const { data: item } = await admin
        .from("compliance_checklist_items")
        .insert({
          account_id:    ACCOUNT_A,
          property_id:   propIdA,
          tenant_id:     tenIdA,
          market:        "pl",
          checklist_type:"najem_okazjonalny",
          item_key:      "evidence_test_" + randomUUID().slice(0, 8),
          title:         "Evidence cross-account test",
        })
        .select()
        .single();
      if (!item) return;
      createdItemIds.add(item.id);

      // Get a document from account B (if exists)
      const { data: docB } = await admin
        .from("documents")
        .select("id")
        .eq("account_id", ACCOUNT_B)
        .limit(1)
        .maybeSingle();
      if (!docB) return; // can't test without account B document

      const { client } = await signInAsFixtureUser("ownerA");
      const result = await client.rpc("update_checklist_item_evidence", {
        p_account_id:    ACCOUNT_A,
        p_item_id:       item.id,
        p_document_id:   docB.id,
        p_mark_complete: false,
      });

      if (skipIfMissing(result)) return;
      // Should be denied (cross-account)
      expect(result.error).toBeTruthy();
    });
  });

  // ── pl_compliance_checklist_command_items ─────────────────────────────────

  describe("pl_compliance_checklist_command_items", () => {
    it("returns items in the correct shape for account A owner", async () => {
      const { client } = await signInAsFixtureUser("ownerA");
      const result = await client.rpc("pl_compliance_checklist_command_items", {
        p_account_id: ACCOUNT_A,
        p_limit:      40,
      });

      if (skipIfMissing(result)) return;
      expect(result.error).toBeNull();
      expect(Array.isArray(result.data)).toBe(true);

      // Verify shape of each row if any exist
      for (const row of result.data || []) {
        expect(typeof row.item_key).toBe("string");
        expect(typeof row.item_type).toBe("string");
        expect(row.category).toBe("compliance");
        expect(["urgent", "action", "upcoming"]).toContain(row.bucket);
        expect(row.source_table).toBe("compliance_checklist_items");
      }
    });

    it("denies account A owner from reading account B items", async () => {
      const { client } = await signInAsFixtureUser("ownerA");
      const result = await client.rpc("pl_compliance_checklist_command_items", {
        p_account_id: ACCOUNT_B,
        p_limit:      40,
      });

      if (skipIfMissing(result)) return;
      expectAccessDenied(result);
    });

    it("denies tenant from calling pl_compliance_checklist_command_items", async () => {
      const { client } = await signInAsFixtureUser("tenantA1");
      const result = await client.rpc("pl_compliance_checklist_command_items", {
        p_account_id: ACCOUNT_A,
        p_limit:      40,
      });

      if (skipIfMissing(result)) return;
      expectAccessDenied(result);
    });

    it("surfaces tax_office_deadline_overdue items in urgent bucket", async () => {
      const propId = await getFixtureProperty(ACCOUNT_A);
      const tenId  = await getFixtureTenant(ACCOUNT_A, propId);
      if (!propId || !tenId) return;

      // Insert an overdue tax_office_deadline item via admin
      const { data: item } = await admin
        .from("compliance_checklist_items")
        .insert({
          account_id:    ACCOUNT_A,
          property_id:   propId,
          tenant_id:     tenId,
          market:        "pl",
          checklist_type:"najem_okazjonalny",
          item_key:      "tax_office_deadline",
          title:         "Termin zgłoszenia do US",
          status:        "pending",
          due_date:      "2020-01-01", // clearly overdue
        })
        .select()
        .single();
      if (!item) return;
      createdItemIds.add(item.id);

      const { client } = await signInAsFixtureUser("ownerA");
      const result = await client.rpc("pl_compliance_checklist_command_items", {
        p_account_id: ACCOUNT_A,
        p_limit:      40,
      });
      if (skipIfMissing(result)) return;

      const overdueItems = (result.data || []).filter(
        (r) => r.item_type === "pl_tax_office_deadline_overdue",
      );
      expect(overdueItems.length).toBeGreaterThan(0);
      expect(overdueItems[0].bucket).toBe("urgent");
      expect(overdueItems[0].severity).toBe("urgent");
    });
  });

  // ── Checklist item status transitions ─────────────────────────────────────

  describe("checklist item status update", () => {
    it("owner can transition pending → complete → pending", async () => {
      const propId = await getFixtureProperty(ACCOUNT_A);
      const tenId  = await getFixtureTenant(ACCOUNT_A, propId);
      if (!propId || !tenId) return;

      const { data: item } = await admin
        .from("compliance_checklist_items")
        .insert({
          account_id:    ACCOUNT_A,
          property_id:   propId,
          tenant_id:     tenId,
          market:        "pl",
          checklist_type:"najem_okazjonalny",
          item_key:      "status_transition_" + randomUUID().slice(0, 8),
          title:         "Status transition test",
        })
        .select()
        .single();
      if (!item) return;
      createdItemIds.add(item.id);

      const { client } = await signInAsFixtureUser("ownerA");

      // pending → complete
      const { error: e1 } = await client
        .from("compliance_checklist_items")
        .update({ status: "complete", completed_at: new Date().toISOString() })
        .eq("id", item.id).eq("account_id", ACCOUNT_A);
      expect(e1).toBeNull();

      // complete → pending (undo)
      const { error: e2 } = await client
        .from("compliance_checklist_items")
        .update({ status: "pending", completed_at: null })
        .eq("id", item.id).eq("account_id", ACCOUNT_A);
      expect(e2).toBeNull();

      const { data: final } = await admin
        .from("compliance_checklist_items")
        .select("status")
        .eq("id", item.id)
        .single();
      expect(final?.status).toBe("pending");
    });

    it("owner can mark item as not_applicable", async () => {
      const propId = await getFixtureProperty(ACCOUNT_A);
      const tenId  = await getFixtureTenant(ACCOUNT_A, propId);
      if (!propId || !tenId) return;

      const { data: item } = await admin
        .from("compliance_checklist_items")
        .insert({
          account_id:    ACCOUNT_A,
          property_id:   propId,
          tenant_id:     tenId,
          market:        "pl",
          checklist_type:"najem_okazjonalny",
          item_key:      "na_test_" + randomUUID().slice(0, 8),
          title:         "N/A test item",
        })
        .select()
        .single();
      if (!item) return;
      createdItemIds.add(item.id);

      const { client } = await signInAsFixtureUser("ownerA");
      const { error } = await client
        .from("compliance_checklist_items")
        .update({ status: "not_applicable" })
        .eq("id", item.id).eq("account_id", ACCOUNT_A);
      expect(error).toBeNull();
    });
  });

  // ── Notifications ─────────────────────────────────────────────────────────

  describe("notify_pl_compliance_deadlines", () => {
    it("runs without error for account A owner", async () => {
      const { client } = await signInAsFixtureUser("ownerA");
      const result = await client.rpc("notify_pl_compliance_deadlines", {
        p_account_id: ACCOUNT_A,
      });
      if (skipIfMissing(result)) return;
      expect(result.error).toBeNull();
      expect(typeof result.data?.notified).toBe("number");
    });

    it("does not re-notify on second call same day", async () => {
      const propId = await getFixtureProperty(ACCOUNT_A);
      const tenId  = await getFixtureTenant(ACCOUNT_A, propId);
      if (!propId || !tenId) return;

      // Insert item due yesterday (overdue)
      const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
      const { data: item } = await admin
        .from("compliance_checklist_items")
        .insert({
          account_id:    ACCOUNT_A,
          property_id:   propId,
          tenant_id:     tenId,
          market:        "pl",
          checklist_type:"najem_okazjonalny",
          item_key:      "tax_office_deadline",
          title:         "Termin zgłoszenia do US",
          status:        "pending",
          due_date:      yesterday,
        })
        .select()
        .single();
      if (!item) return;
      createdItemIds.add(item.id);

      const { client } = await signInAsFixtureUser("ownerA");

      const first = await client.rpc("notify_pl_compliance_deadlines", { p_account_id: ACCOUNT_A });
      if (skipIfMissing(first)) return;
      expect(first.error).toBeNull();

      // Second call same day — should not re-notify
      const second = await client.rpc("notify_pl_compliance_deadlines", { p_account_id: ACCOUNT_A });
      expect(second.error).toBeNull();
      expect(second.data?.notified).toBe(0);
    });

    it("denies tenant from calling notify RPC", async () => {
      const { client } = await signInAsFixtureUser("tenantA1");
      const result = await client.rpc("notify_pl_compliance_deadlines", { p_account_id: ACCOUNT_A });
      if (skipIfMissing(result)) return;
      expectManagementDenied(result);
    });
  });

  // ── Regression: existing modules unaffected ───────────────────────────────

  describe("regression — existing modules unaffected", () => {
    it("command_center_items still returns results for account A", async () => {
      const { client } = await signInAsFixtureUser("ownerA");
      const result = await client.rpc("command_center_items", {
        p_account_id: ACCOUNT_A,
        p_limit:      40,
      });
      expect(result.error).toBeNull();
      expect(Array.isArray(result.data)).toBe(true);
    });

    it("compliance_items (tax readiness) table is still accessible to account A owner", async () => {
      const { client } = await signInAsFixtureUser("ownerA");
      const { error } = await client
        .from("compliance_items")
        .select("id")
        .eq("account_id", ACCOUNT_A)
        .limit(1);
      expect(error).toBeNull();
    });

    it("leases table is still accessible and has lease_type column", async () => {
      const { data, error } = await admin
        .from("leases")
        .select("id, lease_type")
        .eq("account_id", ACCOUNT_A)
        .limit(1);
      expect(error).toBeNull();
      // lease_type column exists (nullable for existing rows)
      if (data && data.length > 0) {
        expect("lease_type" in data[0]).toBe(true);
      }
    });

    it("properties table has market column", async () => {
      const { data, error } = await admin
        .from("properties")
        .select("id, market")
        .eq("account_id", ACCOUNT_A)
        .limit(1);
      expect(error).toBeNull();
      if (data && data.length > 0) {
        expect("market" in data[0]).toBe(true);
      }
    });

    it("accounts table has default_market column", async () => {
      const { data, error } = await admin
        .from("accounts")
        .select("id, default_market")
        .eq("id", ACCOUNT_A)
        .single();
      expect(error).toBeNull();
      expect("default_market" in (data || {})).toBe(true);
    });

    it("Dashboard snapshot RPC still works", async () => {
      const { client } = await signInAsFixtureUser("ownerA");
      const result = await client.rpc("get_dashboard_snapshot", {
        p_account_id: ACCOUNT_A,
        p_horizon_days: 7,
      });
      // May return PGRST202 if not deployed — just verify it doesn't crash with a different error
      if (result.error && !skipIfMissing(result)) {
        throw new Error(`Dashboard snapshot failed: ${result.error.message}`);
      }
    });

    it("tax_records table is still accessible", async () => {
      const { client } = await signInAsFixtureUser("ownerA");
      const { error } = await client
        .from("tax_records")
        .select("id")
        .eq("account_id", ACCOUNT_A)
        .limit(1);
      expect(error).toBeNull();
    });

    it("list_rr_attention_items RPC still runs without error", async () => {
      const { client } = await signInAsFixtureUser("ownerA");
      const result = await client.rpc("list_rr_attention_items", {
        p_account_id: ACCOUNT_A,
        p_limit: 5,
      });
      if (skipIfMissing(result)) return;
      expect(result.error).toBeNull();
    });
  });
});
