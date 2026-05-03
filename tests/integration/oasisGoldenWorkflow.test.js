// tests/integration/oasisGoldenWorkflow.test.js
//
// End-to-end happy-path test: tenant maintenance request → manager creates work
// order → assigns contractor → contractor quotes → manager approves → contractor
// invoices → manager completes work order.
//
// Each step verifies the role-permission model is correct AND that the state
// machine progresses as designed. A failure pinpoints exactly where the workflow
// broke.
//
// These tests create a fresh work order per run (not the seeded fixture row) so
// they can run repeatedly without colliding with other tests.

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import { isIntegrationHarnessConfigured } from "./helpers/env.js";
import {
  ensureIsolationHarnessSeed,
  getIntegrationAdminClient,
  isolationSeedIds,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";

const ACCOUNT_A = isolationFixtures.accounts.accountA.id;
const PROPERTY_A = isolationSeedIds.propertyIds.accountA;
const REQUEST_A  = isolationSeedIds.requestIds.accountA;

describe.skipIf(!isIntegrationHarnessConfigured())(
  "Oasis golden workflow — maintenance → work order → quote → invoice → complete",
  () => {
    const admin = getIntegrationAdminClient();

    // Shared state across steps. Populated in beforeAll / earlier steps.
    let workOrderId = null;
    let contractorUserId = null;

    beforeAll(async () => {
      const usersByKey = await ensureIsolationHarnessSeed();
      contractorUserId = usersByKey.contractorA1.id;

      // Create a fresh work order for this run so we don't disturb the seeded
      // fixture row (which other tests may depend on being in "assigned" state).
      const { data, error } = await admin
        .from("work_orders")
        .insert({
          account_id:         ACCOUNT_A,
          property_id:        PROPERTY_A,
          maintenance_request_id: REQUEST_A,
          contractor_user_id: contractorUserId,
          contractor_name:    "Contractor A1",
          contractor_phone:   "+447700900101",
          status:             "assigned",
          created_by:         usersByKey.ownerA.id,
        })
        .select("id")
        .single();

      if (error) throw new Error(`beforeAll: failed to create test work order: ${error.message}`);
      workOrderId = data.id;
    });

    afterAll(async () => {
      if (!workOrderId) return;
      await admin.from("work_order_financials").delete().eq("work_order_id", workOrderId);
      await admin.from("work_order_audit_log").delete().eq("work_order_id", workOrderId);
      await admin.from("work_orders").delete().eq("id", workOrderId);
    });

    // ── Step 1: contractor saves a quote draft ─────────────────────────────────

    it("step 1 — contractor A1 upserts a quote draft", async () => {
      expect(workOrderId).toBeTruthy();

      const { client } = await signInAsFixtureUser("contractorA1");
      const { data, error } = await client.rpc("wo_fin_upsert_quote_draft", {
        p_work_order_id:  workOrderId,
        p_quote_amount:   450,
        p_quote_currency: "GBP",
        p_quote_notes:    "Labour and parts for tap replacement",
      });

      expect(error).toBeNull();
      expect(data).toBeTruthy();
      expect(data.quote_amount).toBe(450);
      expect(data.quote_status).toBe("draft");
      expect(data.work_order_id).toBe(workOrderId);
    });

    // ── Step 2: contractor submits the quote ───────────────────────────────────

    it("step 2 — contractor A1 submits the quote", async () => {
      expect(workOrderId).toBeTruthy();

      const { client } = await signInAsFixtureUser("contractorA1");
      const { data, error } = await client.rpc("wo_fin_submit_quote", {
        p_work_order_id: workOrderId,
      });

      expect(error).toBeNull();
      expect(data).toBeTruthy();
      expect(data.quote_status).toBe("submitted");
      expect(data.quote_submitted_at).toBeTruthy();
    });

    // ── Step 3: non-assigned party cannot approve (negative guard) ─────────────

    it("step 3a — tenant A1 cannot approve the quote", async () => {
      expect(workOrderId).toBeTruthy();

      const { client } = await signInAsFixtureUser("tenantA1");
      const { error } = await client.rpc("wo_fin_approve_quote", {
        p_work_order_id: workOrderId,
      });

      expect(error).toBeTruthy();
      const msg = String(error.message || "").toLowerCase();
      expect(
        msg.includes("not allowed") ||
          msg.includes("manager only") ||
          msg.includes("not authenticated") ||
          msg.includes("access denied"),
      ).toBe(true);
    });

    // ── Step 3b: manager approves the quote ───────────────────────────────────

    it("step 3b — owner A approves the quote", async () => {
      expect(workOrderId).toBeTruthy();

      const { client } = await signInAsFixtureUser("ownerA");
      const { data, error } = await client.rpc("wo_fin_approve_quote", {
        p_work_order_id: workOrderId,
      });

      expect(error).toBeNull();
      expect(data).toBeTruthy();
      expect(data.quote_status).toBe("approved");
      expect(data.approved_at).toBeTruthy();
    });

    // ── Step 4: contractor cannot re-edit quote after approval ─────────────────

    it("step 4a — contractor cannot re-edit quote after approval", async () => {
      expect(workOrderId).toBeTruthy();

      const { client } = await signInAsFixtureUser("contractorA1");
      const { error } = await client.rpc("wo_fin_upsert_quote_draft", {
        p_work_order_id:  workOrderId,
        p_quote_amount:   999,
        p_quote_currency: "GBP",
        p_quote_notes:    "Attempt to revise after approval",
      });

      expect(error).toBeTruthy();
      const msg = String(error.message || "").toLowerCase();
      expect(msg.includes("submitted") || msg.includes("approved")).toBe(true);
    });

    // ── Step 4b: contractor submits invoice ────────────────────────────────────

    it("step 4b — contractor A1 submits invoice", async () => {
      expect(workOrderId).toBeTruthy();

      const now = new Date().toISOString();
      const due = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

      const { client } = await signInAsFixtureUser("contractorA1");
      const { data, error } = await client.rpc("wo_fin_upsert_invoice", {
        p_work_order_id:     workOrderId,
        p_invoice_amount:    450,
        p_invoice_currency:  "GBP",
        p_invoice_issued_at: now,
        p_invoice_due_at:    due,
      });

      expect(error).toBeNull();
      expect(data).toBeTruthy();
      expect(data.invoice_amount).toBe(450);
      expect(data.invoice_issued_at).toBeTruthy();
    });

    // ── Step 5: manager advances status to in_progress ────────────────────────

    it("step 5 — owner A moves work order to in_progress", async () => {
      expect(workOrderId).toBeTruthy();

      const { client } = await signInAsFixtureUser("ownerA");
      const { error } = await client.rpc("work_order_set_status", {
        p_work_order_id:          workOrderId,
        p_new_status:             "in_progress",
        p_apply_if_tenant_allowed: false,
      });

      expect(error).toBeNull();

      // Verify the status was persisted via admin read.
      const { data } = await admin
        .from("work_orders")
        .select("status")
        .eq("id", workOrderId)
        .single();
      expect(data.status).toBe("in_progress");
    });

    // ── Step 6: manager completes the work order ───────────────────────────────

    it("step 6 — owner A completes the work order", async () => {
      expect(workOrderId).toBeTruthy();

      const { client } = await signInAsFixtureUser("ownerA");
      const { error } = await client.rpc("work_order_set_status", {
        p_work_order_id:          workOrderId,
        p_new_status:             "completed",
        p_apply_if_tenant_allowed: false,
      });

      expect(error).toBeNull();

      const { data } = await admin
        .from("work_orders")
        .select("status")
        .eq("id", workOrderId)
        .single();
      expect(data.status).toBe("completed");
    });

    // ── Step 7: completed work order cannot transition further ─────────────────

    it("step 7 — completed work order rejects further status changes", async () => {
      expect(workOrderId).toBeTruthy();

      const { client } = await signInAsFixtureUser("ownerA");
      const { error } = await client.rpc("work_order_set_status", {
        p_work_order_id:          workOrderId,
        p_new_status:             "in_progress",
        p_apply_if_tenant_allowed: false,
      });

      expect(error).toBeTruthy();
      const msg = String(error.message || "").toLowerCase();
      expect(
        msg.includes("invalid status transition") ||
          msg.includes("not allowed") ||
          msg.includes("cannot"),
      ).toBe(true);
    });

    // ── Cross-account isolation: account B cannot touch account A work order ───

    it("account B owner cannot approve account A work order quote", async () => {
      // The quote is already approved, so this test exercises the access-check
      // path: ownerB is rejected at is_account_manager(v_account_id, v_uid).
      const { client } = await signInAsFixtureUser("ownerB");
      const { error } = await client.rpc("wo_fin_approve_quote", {
        p_work_order_id: workOrderId,
      });

      expect(error).toBeTruthy();
      const msg = String(error.message || "").toLowerCase();
      expect(
        msg.includes("not allowed") ||
          msg.includes("access denied") ||
          msg.includes("not found"),
      ).toBe(true);
    });

    it("account B contractor cannot upsert quote on account A work order", async () => {
      const { client } = await signInAsFixtureUser("contractorB1");
      const { error } = await client.rpc("wo_fin_upsert_quote_draft", {
        p_work_order_id:  workOrderId,
        p_quote_amount:   100,
        p_quote_currency: "GBP",
        p_quote_notes:    "Cross-account attempt",
      });

      expect(error).toBeTruthy();
      const msg = String(error.message || "").toLowerCase();
      expect(
        msg.includes("not allowed") ||
          msg.includes("contractor only") ||
          msg.includes("access denied") ||
          msg.includes("not found"),
      ).toBe(true);
    });
  },
);
