/**
 * E-172 Fix A — Import write-path renewal_status fidelity.
 *
 * Tests that process_import_batch (tenancies tab) correctly writes renewal_status
 * instead of always falling through to the DB default 'active'.
 *
 * Cases:
 *   A-01  status='ended' + past end_date  → renewal_status='ended'
 *   A-02  status absent  + past end_date  → renewal_status='ended' (date-derived)
 *   A-03  status absent  + future end_date → renewal_status='active' (open-ended safe)
 *   A-04  status absent  + no end_date    → renewal_status='active' (open-ended)
 *   A-05  status='active' explicit        → renewal_status='active'
 *   A-06  unrecognised status             → row → needs_review; no lease created
 *
 *   RED evidence: before Fix A, A-01 and A-02 both produced renewal_status='active'.
 *   GREEN evidence: after Fix A, A-01 produces 'ended', A-02 derives 'ended' from date.
 *
 * Evidence tag: EXECUTED_INTEGRATION_DB
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  ensureIsolationHarnessSeed,
  getIntegrationAdminClient,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured, isLocalSupabase } from "./helpers/env.js";

const ACCOUNT_A = "11111111-1111-1111-1111-111111111111";
const PROP_A_ID = "44444444-4444-4444-4444-444444444441"; // 11 Starlight Avenue

const RUN_ID = Math.random().toString(36).slice(2, 8);

// Past and future dates for deterministic assertions
const PAST_DATE   = "2023-06-30"; // well in the past
const FUTURE_DATE = new Date(Date.now() + 365 * 86400 * 1000).toISOString().slice(0, 10);

function uniqueEmail(suffix) {
  return `e172a.${RUN_ID}.${suffix}@test.invalid`;
}

const isEligible = isIntegrationHarnessConfigured() && isLocalSupabase();

describe.skipIf(!isEligible)(
  "E-172 Fix A — import renewal_status write-path fidelity",
  () => {
    let admin;
    let ownerClient;
    const batchIds = [];
    const createdLeaseIds = [];
    const createdTenantIds = [];

    beforeAll(async () => {
      await ensureIsolationHarnessSeed();
      admin      = getIntegrationAdminClient();
      ownerClient = (await signInAsFixtureUser("ownerA")).client;
    });

    afterAll(async () => {
      if (createdLeaseIds.length > 0) {
        await admin.from("leases").delete().in("id", createdLeaseIds);
      }
      if (createdTenantIds.length > 0) {
        await admin.from("tenants").delete().in("id", createdTenantIds);
      }
      if (batchIds.length > 0) {
        await admin.from("import_batch_rows").delete().in("batch_id", batchIds);
        await admin.from("import_batches").delete().in("id", batchIds);
      }
    });

    async function importTenancyRow(row) {
      const { data, error } = await ownerClient.rpc("process_import_batch", {
        p_account_id:      ACCOUNT_A,
        p_tab:             "tenancies",
        p_rows:            [row],
        p_source_filename: `e172-fix-a-${RUN_ID}.csv`,
      });
      if (error) throw new Error(`import RPC failed: ${JSON.stringify(error)}`);
      if (data?.batch_id) batchIds.push(data.batch_id);
      return data;
    }

    async function findImportedLease(tenantEmail) {
      // find tenant by email (lower-cased by importer)
      const { data: tenants } = await admin
        .from("tenants")
        .select("id")
        .eq("account_id", ACCOUNT_A)
        .eq("email", tenantEmail.toLowerCase())
        .limit(1);
      if (!tenants || tenants.length === 0) return null;
      const tenantId = tenants[0].id;
      createdTenantIds.push(tenantId);

      const { data: leases } = await admin
        .from("leases")
        .select("id, renewal_status")
        .eq("account_id", ACCOUNT_A)
        .eq("property_id", PROP_A_ID)
        .eq("tenant_id", tenantId)
        .limit(1);
      if (!leases || leases.length === 0) return null;
      createdLeaseIds.push(leases[0].id);
      return leases[0];
    }

    // ── A-01: RED→GREEN — explicit status='ended' writes renewal_status='ended' ─

    it("A-01: status=ended + past end_date → renewal_status=ended (not active DB default)", async () => {
      const email = uniqueEmail("a01");
      const result = await importTenancyRow({
        address:    "11 Starlight Avenue",
        tenant_email: email,
        start_date:  "2023-01-01",
        end_date:    PAST_DATE,
        status:      "ended",
        rent_amount: "1200",
      });

      const row = result.rows[0];
      expect(row.status).toBe("imported");

      const lease = await findImportedLease(email);
      expect(lease).not.toBeNull();
      // GREEN: renewal_status must be 'ended', not the old DB default 'active'
      expect(lease.renewal_status).toBe("ended");
    });

    // ── A-02: RED→GREEN — absent status + past end_date derives 'ended' ─────────

    it("A-02: status absent + past end_date → renewal_status=ended (date-derived, not active)", async () => {
      const email = uniqueEmail("a02");
      const result = await importTenancyRow({
        address:      "11 Starlight Avenue",
        tenant_email: email,
        start_date:   "2023-01-01",
        end_date:     PAST_DATE,
        // status intentionally omitted
        rent_amount:  "1200",
      });

      const row = result.rows[0];
      expect(row.status).toBe("imported");

      const lease = await findImportedLease(email);
      expect(lease).not.toBeNull();
      // GREEN: date derivation kicks in; lease_end_date past → 'ended'
      expect(lease.renewal_status).toBe("ended");
    });

    // ── A-03: status absent + future end_date → 'active' ─────────────────────

    it("A-03: status absent + future end_date → renewal_status=active", async () => {
      const email = uniqueEmail("a03");
      const result = await importTenancyRow({
        address:      "11 Starlight Avenue",
        tenant_email: email,
        start_date:   "2024-01-01",
        end_date:     FUTURE_DATE,
        // status intentionally omitted
        rent_amount:  "1200",
      });

      const row = result.rows[0];
      expect(row.status).toBe("imported");

      const lease = await findImportedLease(email);
      expect(lease).not.toBeNull();
      expect(lease.renewal_status).toBe("active");
    });

    // ── A-04: status absent + no end_date → open-ended → 'active' ────────────

    it("A-04: status absent + no end_date → renewal_status=active (open-ended positive state)", async () => {
      const email = uniqueEmail("a04");
      const result = await importTenancyRow({
        address:      "11 Starlight Avenue",
        tenant_email: email,
        start_date:   "2024-06-01",
        // end_date intentionally omitted (open-ended)
        // status intentionally omitted
        rent_amount:  "1200",
      });

      const row = result.rows[0];
      expect(row.status).toBe("imported");

      const lease = await findImportedLease(email);
      expect(lease).not.toBeNull();
      expect(lease.renewal_status).toBe("active");
    });

    // ── A-05: explicit status='active' → 'active' ─────────────────────────────

    it("A-05: status=active explicit → renewal_status=active", async () => {
      const email = uniqueEmail("a05");
      const result = await importTenancyRow({
        address:      "11 Starlight Avenue",
        tenant_email: email,
        start_date:   "2024-06-01",
        end_date:     FUTURE_DATE,
        status:       "active",
        rent_amount:  "1200",
      });

      const row = result.rows[0];
      expect(row.status).toBe("imported");

      const lease = await findImportedLease(email);
      expect(lease).not.toBeNull();
      expect(lease.renewal_status).toBe("active");
    });

    // ── A-06: unrecognised status → needs_review; no lease created ────────────

    it("A-06: unrecognised status → row=needs_review; no lease imported (never coerced to active)", async () => {
      const email = uniqueEmail("a06");
      const result = await importTenancyRow({
        address:      "11 Starlight Avenue",
        tenant_email: email,
        start_date:   "2024-01-01",
        end_date:     PAST_DATE,
        status:       "INVALID_VALUE_XYZ",
        rent_amount:  "1200",
      });

      const row = result.rows[0];
      // Row must land in needs_review, never imported
      expect(row.status).toBe("needs_review");
      expect(row.review_reason).toMatch(/unrecognised|accepted/i);

      // Verify no lease was actually created
      const lease = await findImportedLease(email);
      expect(lease).toBeNull();
    });
  }
);
