// tests/integration/workOrderAuditAndNotifications.test.js
//
// Verifies two cross-cutting concerns that the golden workflow test does not cover:
//
// 1. AUDIT LOG — work_order_audit_log is populated after status changes, carries
//    the correct actor/action/account_id, and is isolated by account.
//
// 2. NOTIFICATIONS — create_notifications RPC creates rows readable by the
//    recipient via RLS, while cross-account and non-manager callers are denied.
//    Tenant RLS ensures users only see their own notification rows.

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
const ACCOUNT_B = isolationFixtures.accounts.accountB.id;
const PROPERTY_A = isolationSeedIds.propertyIds.accountA;
const REQUEST_A  = isolationSeedIds.requestIds.accountA;

describe.skipIf(!isIntegrationHarnessConfigured())(
  "work order audit log and notifications — lifecycle and isolation",
  () => {
    const admin = getIntegrationAdminClient();

    let usersByKey = null;
    let workOrderId = null;
    let createdNotificationIds = [];

    beforeAll(async () => {
      usersByKey = await ensureIsolationHarnessSeed();

      // Fresh work order so this suite doesn't collide with oasisGoldenWorkflow.
      const { data, error } = await admin
        .from("work_orders")
        .insert({
          account_id:            ACCOUNT_A,
          property_id:           PROPERTY_A,
          maintenance_request_id: REQUEST_A,
          contractor_user_id:    usersByKey.contractorA1.id,
          contractor_name:       "Contractor A1",
          contractor_phone:      "+447700900101",
          status:                "assigned",
          created_by:            usersByKey.ownerA.id,
        })
        .select("id")
        .single();

      if (error) throw new Error(`beforeAll: failed to create test work order: ${error.message}`);
      workOrderId = data.id;
    });

    afterAll(async () => {
      if (createdNotificationIds.length > 0) {
        await admin.from("notifications").delete().in("id", createdNotificationIds);
        createdNotificationIds = [];
      }
      if (workOrderId) {
        await admin.from("work_order_audit_log").delete().eq("work_order_id", workOrderId);
        await admin.from("work_order_financials").delete().eq("work_order_id", workOrderId);
        await admin.from("work_orders").delete().eq("id", workOrderId);
      }
    });

    // ── AUDIT LOG ─────────────────────────────────────────────────────────────

    describe("work_order_audit_log", () => {
      it("work_order_set_status writes an audit log entry with correct metadata", async () => {
        expect(workOrderId).toBeTruthy();

        const { client } = await signInAsFixtureUser("ownerA");
        const { error } = await client.rpc("work_order_set_status", {
          p_work_order_id:           workOrderId,
          p_new_status:              "in_progress",
          p_apply_if_tenant_allowed: false,
        });
        expect(error).toBeNull();

        // Manager can read the audit log for their own account.
        const { data: logRows, error: logErr } = await client
          .from("work_order_audit_log")
          .select("work_order_id, actor_user_id, action, old_value, new_value, account_id")
          .eq("work_order_id", workOrderId)
          .eq("action", "status_changed");

        expect(logErr).toBeNull();
        expect(logRows).toHaveLength(1);

        const entry = logRows[0];
        expect(entry.work_order_id).toBe(workOrderId);
        expect(entry.actor_user_id).toBe(usersByKey.ownerA.id);
        expect(entry.action).toBe("status_changed");
        expect(entry.account_id).toBe(ACCOUNT_A);
        expect(entry.old_value?.status).toBe("assigned");
        expect(entry.new_value?.status).toBe("in_progress");
      });

      it("assigned contractor can read audit log entries for their work order", async () => {
        expect(workOrderId).toBeTruthy();

        const { client } = await signInAsFixtureUser("contractorA1");
        const { data, error } = await client
          .from("work_order_audit_log")
          .select("id, action")
          .eq("work_order_id", workOrderId);

        expect(error).toBeNull();
        // At least the status_changed entry written above should be visible.
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBeGreaterThan(0);
      });

      it("account B owner cannot read account A work order audit log (RLS isolation)", async () => {
        expect(workOrderId).toBeTruthy();

        const { client } = await signInAsFixtureUser("ownerB");
        const { data, error } = await client
          .from("work_order_audit_log")
          .select("id")
          .eq("work_order_id", workOrderId);

        // RLS silently filters — no error, zero rows returned.
        expect(error).toBeNull();
        expect(data ?? []).toHaveLength(0);
      });

      it("tenant A1 cannot read audit log for a work order they're not party to", async () => {
        // tenantA1 is on property A, but the audit_log RLS grants only
        // members/contractors — not all tenants. Expect zero rows.
        const { client } = await signInAsFixtureUser("tenantA1");
        const { data, error } = await client
          .from("work_order_audit_log")
          .select("id")
          .eq("work_order_id", workOrderId);

        expect(error).toBeNull();
        expect(data ?? []).toHaveLength(0);
      });

      it("audit log cannot be directly inserted by authenticated users", async () => {
        const { client } = await signInAsFixtureUser("ownerA");
        const { error } = await client.from("work_order_audit_log").insert({
          work_order_id:  workOrderId,
          actor_user_id:  usersByKey.ownerA.id,
          action:         "forged_action",
          account_id:     ACCOUNT_A,
        });

        // Must be denied — only SECURITY DEFINER RPCs may write to this table.
        expect(error).toBeTruthy();
        const msg = String(error.message || "").toLowerCase();
        expect(
          msg.includes("permission denied") ||
            msg.includes("policy") ||
            msg.includes("not permitted") ||
            msg.includes("violates") ||
            msg.includes("check constraint"),
        ).toBe(true);
      });
    });

    // ── NOTIFICATIONS — creation ───────────────────────────────────────────────

    describe("create_notifications RPC", () => {
      it("account A manager can create a notification for tenant A1", async () => {
        expect(usersByKey).toBeTruthy();

        const { client } = await signInAsFixtureUser("ownerA");
        const { error } = await client.rpc("create_notifications", {
          p_account_id:          ACCOUNT_A,
          p_recipient_user_ids:  [usersByKey.tenantA1.id],
          p_type:                "work_order_status_changed",
          p_title:               "Your repair is in progress",
          p_body:                "The work order has been started.",
          p_entity_type:         "work_order",
          p_entity_id:           workOrderId,
          p_link_path:           "/maintenance",
          p_metadata:            { test_run: true },
        });

        expect(error).toBeNull();
      });

      it("account A manager can create a notification for contractor A1", async () => {
        const { client } = await signInAsFixtureUser("ownerA");
        const { error } = await client.rpc("create_notifications", {
          p_account_id:          ACCOUNT_A,
          p_recipient_user_ids:  [usersByKey.contractorA1.id],
          p_type:                "work_order_quote_approved",
          p_title:               "Your quote was approved",
          p_body:                null,
          p_entity_type:         "work_order",
          p_entity_id:           workOrderId,
          p_link_path:           null,
          p_metadata:            {},
        });

        expect(error).toBeNull();
      });

      it("tenant cannot call create_notifications", async () => {
        const { client } = await signInAsFixtureUser("tenantA1");
        const { error } = await client.rpc("create_notifications", {
          p_account_id:          ACCOUNT_A,
          p_recipient_user_ids:  [usersByKey.ownerA.id],
          p_type:                "forged_notification",
          p_title:               "Forged",
          p_body:                null,
          p_entity_type:         null,
          p_entity_id:           null,
          p_link_path:           null,
          p_metadata:            {},
        });

        expect(error).toBeTruthy();
        const msg = String(error.message || "").toLowerCase();
        expect(
          msg.includes("access denied") ||
            msg.includes("not permitted") ||
            msg.includes("permission denied") ||
            msg.includes("manage_account"),
        ).toBe(true);
      });

      it("contractor cannot call create_notifications", async () => {
        const { client } = await signInAsFixtureUser("contractorA1");
        const { error } = await client.rpc("create_notifications", {
          p_account_id:          ACCOUNT_A,
          p_recipient_user_ids:  [usersByKey.tenantA1.id],
          p_type:                "forged_notification",
          p_title:               "Forged",
          p_body:                null,
          p_entity_type:         null,
          p_entity_id:           null,
          p_link_path:           null,
          p_metadata:            {},
        });

        expect(error).toBeTruthy();
      });

      it("account A manager cannot create notifications for account B recipients", async () => {
        const { client } = await signInAsFixtureUser("ownerA");
        const { error } = await client.rpc("create_notifications", {
          p_account_id:          ACCOUNT_B,
          p_recipient_user_ids:  [usersByKey.tenantB1.id],
          p_type:                "cross_account_attempt",
          p_title:               "Cross-account",
          p_body:                null,
          p_entity_type:         null,
          p_entity_id:           null,
          p_link_path:           null,
          p_metadata:            {},
        });

        expect(error).toBeTruthy();
        const msg = String(error.message || "").toLowerCase();
        expect(
          msg.includes("access denied") ||
            msg.includes("not permitted") ||
            msg.includes("permission denied"),
        ).toBe(true);
      });

      it("manager cannot include a foreign user as recipient", async () => {
        const FOREIGN_USER_ID = "ffffffff-ffff-ffff-ffff-ffffffffffff";
        const { client } = await signInAsFixtureUser("ownerA");
        const { error } = await client.rpc("create_notifications", {
          p_account_id:          ACCOUNT_A,
          p_recipient_user_ids:  [FOREIGN_USER_ID],
          p_type:                "foreign_recipient_test",
          p_title:               "Should fail",
          p_body:                null,
          p_entity_type:         null,
          p_entity_id:           null,
          p_link_path:           null,
          p_metadata:            {},
        });

        expect(error).toBeTruthy();
        const msg = String(error.message || "").toLowerCase();
        expect(
          msg.includes("not part of this account") ||
            msg.includes("recipient") ||
            msg.includes("foreign"),
        ).toBe(true);
      });
    });

    // ── NOTIFICATIONS — RLS reads ─────────────────────────────────────────────

    describe("notifications table RLS", () => {
      let tenantNotifId = null;
      let contractorNotifId = null;

      beforeAll(async () => {
        // Seed one notification for tenantA1 and one for contractorA1 using admin
        // (service_role bypasses RLS so we can insert directly for read isolation tests).
        const { data: tenantRow } = await admin
          .from("notifications")
          .insert({
            account_id:         ACCOUNT_A,
            recipient_user_id:  usersByKey.tenantA1.id,
            type:               "test_tenant_notif",
            title:              "Notification for tenant A1",
          })
          .select("id")
          .single();
        if (tenantRow) tenantNotifId = tenantRow.id;

        const { data: contractorRow } = await admin
          .from("notifications")
          .insert({
            account_id:         ACCOUNT_A,
            recipient_user_id:  usersByKey.contractorA1.id,
            type:               "test_contractor_notif",
            title:              "Notification for contractor A1",
          })
          .select("id")
          .single();
        if (contractorRow) contractorNotifId = contractorRow.id;

        if (tenantNotifId) createdNotificationIds.push(tenantNotifId);
        if (contractorNotifId) createdNotificationIds.push(contractorNotifId);
      });

      it("tenant A1 can read their own notification", async () => {
        if (!tenantNotifId) return;

        const { client } = await signInAsFixtureUser("tenantA1");
        const { data, error } = await client
          .from("notifications")
          .select("id, type, title, recipient_user_id")
          .eq("id", tenantNotifId);

        expect(error).toBeNull();
        expect(data).toHaveLength(1);
        expect(data[0].recipient_user_id).toBe(usersByKey.tenantA1.id);
      });

      it("tenant A1 cannot read contractor A1's notification (RLS: recipient_user_id = auth.uid())", async () => {
        if (!contractorNotifId) return;

        const { client } = await signInAsFixtureUser("tenantA1");
        const { data, error } = await client
          .from("notifications")
          .select("id")
          .eq("id", contractorNotifId);

        // RLS silently filters — no error, zero rows.
        expect(error).toBeNull();
        expect(data ?? []).toHaveLength(0);
      });

      it("contractor A1 can read their own notification", async () => {
        if (!contractorNotifId) return;

        const { client } = await signInAsFixtureUser("contractorA1");
        const { data, error } = await client
          .from("notifications")
          .select("id, type, recipient_user_id")
          .eq("id", contractorNotifId);

        expect(error).toBeNull();
        expect(data).toHaveLength(1);
        expect(data[0].recipient_user_id).toBe(usersByKey.contractorA1.id);
      });

      it("account B owner cannot read account A notifications by querying the table", async () => {
        if (!tenantNotifId && !contractorNotifId) return;

        const { client } = await signInAsFixtureUser("ownerB");
        const ids = [tenantNotifId, contractorNotifId].filter(Boolean);
        const { data, error } = await client
          .from("notifications")
          .select("id")
          .in("id", ids);

        expect(error).toBeNull();
        expect(data ?? []).toHaveLength(0);
      });

      it("tenant cannot directly insert a notification (RLS: no direct inserts)", async () => {
        const { client } = await signInAsFixtureUser("tenantA1");
        const { error } = await client.from("notifications").insert({
          account_id:         ACCOUNT_A,
          recipient_user_id:  usersByKey.tenantA1.id,
          type:               "self_forged",
          title:              "Forged notification",
        });

        expect(error).toBeTruthy();
      });
    });
  },
);
