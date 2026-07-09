/**
 * P-003b: create_rr_tasks_for_active_tenants — lease_id population tests.
 *
 * Verifies that after the fix, auto-created information-sheet tasks now
 * carry a lease_id populated from the most recently created lease for that
 * tenant (mirroring the JS fallback in resolveLeaseIdForTask).
 *
 * Cases:
 *  A) tenant with one lease         → lease_id = that lease
 *  B) tenant with no lease          → lease_id = null (bridge returns 'no_lease', unchanged)
 *  C) tenant with multiple leases   → lease_id = the one with MAX(created_at), same as JS fallback
 *
 * Selection logic parity proof:
 *   JS:  .eq("account_id", accountId).eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(1)
 *   SQL: WHERE account_id = p_account_id AND tenant_id = t.id ORDER BY created_at DESC LIMIT 1
 *   → identical predicate, identical ordering, identical result set.
 *
 * Regression suite: rraBridgeObligation (15 tests) and rpeProofPackAssembly (9 tests)
 * are run separately after this file.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import {
  ensureIsolationHarnessSeed,
  getIntegrationAdminClient,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "./helpers/env.js";

// ── Fixture IDs — unique prefix to avoid collision ────────────────────────────

const accountAId  = isolationFixtures.accounts.accountA.id;
const propertyId  = isolationFixtures.users.tenantA1.propertyId;

// Tenant A: has a lease (normal case)
const TENANT_WITH_LEASE_ID     = "cc000001-0000-4000-0000-000000000001";
const LEASE_SINGLE_ID          = "cc000001-0000-4000-0000-000000000002";

// Tenant B: has NO lease (no-lease case)
const TENANT_NO_LEASE_ID       = "cc000001-0000-4000-0000-000000000003";

// Tenant C: has two leases (multi-lease selection parity case)
const TENANT_MULTI_LEASE_ID    = "cc000001-0000-4000-0000-000000000004";
const LEASE_OLDER_ID           = "cc000001-0000-4000-0000-000000000005";
const LEASE_NEWER_ID           = "cc000001-0000-4000-0000-000000000006";

const RR_TYPE = "renters_rights_information_sheet";

describe.skipIf(!isIntegrationHarnessConfigured())(
  "create_rr_tasks_for_active_tenants — lease_id population",
  () => {
    let admin;
    let clientA;
    let seededUsers;

    async function seedFixtures() {
      const ownerUserId = seededUsers.ownerA.id;

      // Tenant with one lease
      // property_id: null — avoids the one_tenant_per_property unique index
      // (the lease still carries the property_id for the correlated subquery)
      const { error: t1err } = await admin.from("tenants").upsert({
        id:          TENANT_WITH_LEASE_ID,
        owner_id:    ownerUserId,
        account_id:  accountAId,
        property_id: null,
        user_id:     null,
        name:        "P003b Test Tenant Single Lease",
        email:       "p003b-single@oasis.test",
        phone:       "+447700900001",
      }, { onConflict: "id" });
      if (t1err) throw new Error(`seed tenant-single: ${t1err.message}`);

      const { error: l1err } = await admin.from("leases").upsert({
        id:               LEASE_SINGLE_ID,
        account_id:       accountAId,
        property_id:      propertyId,
        tenant_id:        TENANT_WITH_LEASE_ID,
        lease_start_date: "2026-01-01",
        renewal_status:   "active",
        created_at:       "2026-01-01T10:00:00Z",
      }, { onConflict: "id" });
      if (l1err) throw new Error(`seed lease-single: ${l1err.message}`);

      // Tenant with NO lease
      const { error: t2err } = await admin.from("tenants").upsert({
        id:          TENANT_NO_LEASE_ID,
        owner_id:    ownerUserId,
        account_id:  accountAId,
        property_id: null,
        user_id:     null,
        name:        "P003b Test Tenant No Lease",
        email:       "p003b-nolease@oasis.test",
        phone:       "+447700900002",
      }, { onConflict: "id" });
      if (t2err) throw new Error(`seed tenant-nolease: ${t2err.message}`);

      // Tenant with two leases (different created_at to distinguish them)
      const { error: t3err } = await admin.from("tenants").upsert({
        id:          TENANT_MULTI_LEASE_ID,
        owner_id:    ownerUserId,
        account_id:  accountAId,
        property_id: null,
        user_id:     null,
        name:        "P003b Test Tenant Multi Lease",
        email:       "p003b-multi@oasis.test",
        phone:       "+447700900003",
      }, { onConflict: "id" });
      if (t3err) throw new Error(`seed tenant-multi: ${t3err.message}`);

      const { error: l2err } = await admin.from("leases").upsert({
        id:               LEASE_OLDER_ID,
        account_id:       accountAId,
        property_id:      propertyId,
        tenant_id:        TENANT_MULTI_LEASE_ID,
        lease_start_date: "2025-01-01",
        renewal_status:   "active",
        created_at:       "2025-03-01T09:00:00Z",
      }, { onConflict: "id" });
      if (l2err) throw new Error(`seed lease-older: ${l2err.message}`);

      const { error: l3err } = await admin.from("leases").upsert({
        id:               LEASE_NEWER_ID,
        account_id:       accountAId,
        property_id:      propertyId,
        tenant_id:        TENANT_MULTI_LEASE_ID,
        lease_start_date: "2026-01-01",
        renewal_status:   "active",
        created_at:       "2026-04-01T09:00:00Z",
      }, { onConflict: "id" });
      if (l3err) throw new Error(`seed lease-newer: ${l3err.message}`);
    }

    async function cleanupFixtures() {
      await admin.from("renters_rights_tasks").delete()
        .in("tenant_id", [TENANT_WITH_LEASE_ID, TENANT_NO_LEASE_ID, TENANT_MULTI_LEASE_ID]);
      await admin.from("leases").delete()
        .in("id", [LEASE_SINGLE_ID, LEASE_OLDER_ID, LEASE_NEWER_ID]);
      await admin.from("tenants").delete()
        .in("id", [TENANT_WITH_LEASE_ID, TENANT_NO_LEASE_ID, TENANT_MULTI_LEASE_ID]);
    }

    async function deleteAnyExistingTasks() {
      await admin.from("renters_rights_tasks").delete()
        .in("tenant_id", [TENANT_WITH_LEASE_ID, TENANT_NO_LEASE_ID, TENANT_MULTI_LEASE_ID]);
    }

    beforeAll(async () => {
      seededUsers = await ensureIsolationHarnessSeed();
      admin   = getIntegrationAdminClient();
      ({ client: clientA } = await signInAsFixtureUser("ownerA"));
      await cleanupFixtures();
      await seedFixtures();
    });

    afterAll(async () => {
      await cleanupFixtures();
    });

    // ── Case A: single lease ──────────────────────────────────────────────────

    it("auto-created task has lease_id populated for a tenant with one lease", async () => {
      await deleteAnyExistingTasks();

      const { data: count, error } = await clientA.rpc("create_rr_tasks_for_active_tenants", {
        p_account_id:       accountAId,
        p_requirement_type: RR_TYPE,
        p_due_date:         "2026-05-31",
      });
      expect(error).toBeNull();
      expect(count).toBeGreaterThanOrEqual(1);

      const { data: task } = await admin
        .from("renters_rights_tasks")
        .select("lease_id, tenant_id")
        .eq("tenant_id", TENANT_WITH_LEASE_ID)
        .eq("requirement_type", RR_TYPE)
        .single();

      expect(task).not.toBeNull();
      expect(task.lease_id).toBe(LEASE_SINGLE_ID);
    });

    // ── Case B: no lease ──────────────────────────────────────────────────────

    it("auto-created task has lease_id = null for a tenant with no lease", async () => {
      await deleteAnyExistingTasks();

      await clientA.rpc("create_rr_tasks_for_active_tenants", {
        p_account_id:       accountAId,
        p_requirement_type: RR_TYPE,
        p_due_date:         "2026-05-31",
      });

      const { data: task } = await admin
        .from("renters_rights_tasks")
        .select("lease_id, tenant_id")
        .eq("tenant_id", TENANT_NO_LEASE_ID)
        .eq("requirement_type", RR_TYPE)
        .single();

      expect(task).not.toBeNull();
      expect(task.lease_id).toBeNull();
    });

    // ── Case C: multiple leases — selection parity with JS fallback ───────────

    it("auto-created task selects the most recently created lease (matches JS fallback)", async () => {
      await deleteAnyExistingTasks();

      // Confirm the newer lease has a later created_at than the older one
      const { data: leases } = await admin
        .from("leases")
        .select("id, created_at")
        .in("id", [LEASE_OLDER_ID, LEASE_NEWER_ID])
        .order("created_at", { ascending: false });

      expect(leases[0].id).toBe(LEASE_NEWER_ID);   // newer is first when DESC
      expect(leases[1].id).toBe(LEASE_OLDER_ID);

      await clientA.rpc("create_rr_tasks_for_active_tenants", {
        p_account_id:       accountAId,
        p_requirement_type: RR_TYPE,
        p_due_date:         "2026-05-31",
      });

      const { data: task } = await admin
        .from("renters_rights_tasks")
        .select("lease_id, tenant_id")
        .eq("tenant_id", TENANT_MULTI_LEASE_ID)
        .eq("requirement_type", RR_TYPE)
        .single();

      expect(task).not.toBeNull();
      // Must select the newer lease — same as JS fallback (.order("created_at", { ascending: false }).limit(1))
      expect(task.lease_id).toBe(LEASE_NEWER_ID);
      expect(task.lease_id).not.toBe(LEASE_OLDER_ID);
    });

    it("JS fallback and SQL agree: both select LEASE_NEWER_ID for the multi-lease tenant", async () => {
      // JS fallback: SELECT id FROM leases WHERE account_id=A AND tenant_id=T ORDER BY created_at DESC LIMIT 1
      const { data: jsResult } = await admin
        .from("leases")
        .select("id")
        .eq("account_id", accountAId)
        .eq("tenant_id", TENANT_MULTI_LEASE_ID)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      expect(jsResult?.id).toBe(LEASE_NEWER_ID);

      // SQL-created task must match
      const { data: task } = await admin
        .from("renters_rights_tasks")
        .select("lease_id")
        .eq("tenant_id", TENANT_MULTI_LEASE_ID)
        .eq("requirement_type", RR_TYPE)
        .single();

      expect(task?.lease_id).toBe(jsResult?.id);
    });

    // ── Idempotency: second call does not create duplicates or overwrite ───────

    it("second call to create_rr_tasks_for_active_tenants returns 0 new tasks (idempotent)", async () => {
      // Tasks already exist from prior tests — calling again must create 0 rows
      const { data: count, error } = await clientA.rpc("create_rr_tasks_for_active_tenants", {
        p_account_id:       accountAId,
        p_requirement_type: RR_TYPE,
        p_due_date:         "2026-05-31",
      });
      expect(error).toBeNull();
      // The 3 test tenants already have tasks; count may include other tenants
      // but must NOT include our fixture tenants again.
      const { data: tasks } = await admin
        .from("renters_rights_tasks")
        .select("id")
        .in("tenant_id", [TENANT_WITH_LEASE_ID, TENANT_NO_LEASE_ID, TENANT_MULTI_LEASE_ID])
        .eq("requirement_type", RR_TYPE);
      // Still exactly 3 tasks — no duplicates
      expect(tasks).toHaveLength(3);
    });
  },
);
