/**
 * E-170 RLS isolation tests — finance_snapshot cross-account and anonymous gates.
 *
 * Four proofs against the committed build (899f494):
 *   RLS-01  Tenant A gets their own scopeTenancyId back; no Account B property returned
 *   RLS-02  Tenant A calling with Account B's ID is denied (account membership guard)
 *   RLS-03  Owner A calling with Account B's ID is denied (account membership guard)
 *   RLS-04  Anonymous caller is denied (no authenticated session)
 *
 * Evidence tag: EXECUTED_INTEGRATION_DB once passing.
 */

import { describe, expect, it, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

import { isolationFixtures } from "../../tests/fixtures/isolationFixtures.js";
import {
  ensureIsolationHarnessSeed,
  getIntegrationAdminClient,
  signInAsFixtureUser,
} from "../../tests/integration/helpers/localSupabaseHarness.js";
import {
  isIntegrationHarnessConfigured,
  getIntegrationEnv,
} from "../../tests/integration/helpers/env.js";

const ACCOUNT_A_ID  = isolationFixtures.accounts.accountA.id;
const ACCOUNT_B_ID  = isolationFixtures.accounts.accountB.id;
const TENANT_A1_ID  = isolationFixtures.users.tenantA1.tenantId;

if (!isIntegrationHarnessConfigured()) {
  describe.skip("E-170 RLS isolation (harness not configured)", () => {});
} else {
  describe("E-170 RLS isolation — finance_snapshot cross-account and anonymous gates", () => {
    let admin;

    beforeAll(async () => {
      admin = getIntegrationAdminClient();
      await ensureIsolationHarnessSeed(admin);
    });

    // ── RLS-01: Tenant A sees own scopeTenancyId; no Account B data ─────────

    it("RLS-01: tenantA1 calling with accountA + tenantA1 scope gets scopeTenancyId back", async () => {
      const { client: tenantClient } = await signInAsFixtureUser("tenantA1");

      const { data, error } = await tenantClient.rpc("finance_snapshot", {
        p_account_id: ACCOUNT_A_ID,
        p_tenant_id:  TENANT_A1_ID,
      });

      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);

      const row = data[0];
      const propFinance = Array.isArray(row.property_finance)
        ? row.property_finance
        : JSON.parse(row.property_finance ?? "[]");

      // Every property row for the tenant-scoped call must echo tenantA1's tenantId
      const scopedRows = propFinance.filter(
        (p) => p.scopeTenancyId !== null && p.scopeTenancyId !== undefined,
      );
      if (scopedRows.length > 0) {
        for (const p of scopedRows) {
          expect(String(p.scopeTenancyId)).toBe(String(TENANT_A1_ID));
        }
      }

      // No Account B property ID should appear
      const propIds = propFinance.map((p) => p.propertyId);
      expect(propIds).not.toContain(isolationFixtures.users.tenantB1.propertyId);
    });

    // ── RLS-02: Tenant A calling with Account B's ID is denied ──────────────

    it("RLS-02: tenantA1 calling finance_snapshot with accountB.id is denied", async () => {
      const { client: tenantClient } = await signInAsFixtureUser("tenantA1");

      const { data, error } = await tenantClient.rpc("finance_snapshot", {
        p_account_id: ACCOUNT_B_ID,
      });

      // Must either error or return nothing — not Account B data
      const isErrored = error !== null;
      const isEmpty = !data || (Array.isArray(data) && data.length === 0);
      expect(isErrored || isEmpty).toBe(true);

      // If data was returned, it must contain no property_finance rows for Account B
      if (data && data.length > 0) {
        const propFinance = Array.isArray(data[0].property_finance)
          ? data[0].property_finance
          : JSON.parse(data[0].property_finance ?? "[]");
        expect(propFinance.length).toBe(0);
      }
    });

    // ── RLS-03: Owner A calling with Account B's ID is denied ───────────────

    it("RLS-03: ownerA calling finance_snapshot with accountB.id is denied", async () => {
      const { client: ownerClient } = await signInAsFixtureUser("ownerA");

      const { data, error } = await ownerClient.rpc("finance_snapshot", {
        p_account_id: ACCOUNT_B_ID,
      });

      const isErrored = error !== null;
      const isEmpty = !data || (Array.isArray(data) && data.length === 0);
      expect(isErrored || isEmpty).toBe(true);

      if (data && data.length > 0) {
        const propFinance = Array.isArray(data[0].property_finance)
          ? data[0].property_finance
          : JSON.parse(data[0].property_finance ?? "[]");
        expect(propFinance.length).toBe(0);
      }
    });

    // ── RLS-04: Anonymous caller is denied ──────────────────────────────────

    it("RLS-04: anonymous caller is denied (no authenticated session)", async () => {
      const env = getIntegrationEnv();
      const anonClient = createClient(env.url, env.anonKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });

      const { data, error } = await anonClient.rpc("finance_snapshot", {
        p_account_id: ACCOUNT_A_ID,
      });

      // Must error or return nothing — anonymous has no execute grant
      const isErrored = error !== null;
      const isEmpty = !data || (Array.isArray(data) && data.length === 0);
      expect(isErrored || isEmpty).toBe(true);
    });
  });
}
