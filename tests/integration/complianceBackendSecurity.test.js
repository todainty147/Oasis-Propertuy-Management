// tests/integration/complianceBackendSecurity.test.js
//
// Verifies that compliance RPCs (Tax Readiness, Rent Shield, Lease Auditor)
// enforce account isolation and management-role access at the database level.
//
// These are integration tests that run against a real Supabase harness.
// They complement the contract/unit tests in tests/security/ which verify
// service-layer logic and SQL structure without executing against a live DB.
//
// Coverage:
//   - Owner/admin can query their own account's compliance data
//   - Tenant is denied by assert_manage_account_access
//   - Contractor is denied by assert_manage_account_access
//   - Cross-account access denied
//   - Direct table RLS denies non-manager reads on compliance tables

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

// Tax Readiness uses compliance_items with category='tax'. Rent Shield and
// Lease Auditor have dedicated tables. All RPCs call assert_manage_account_access
// so tenant/contractor calls always land the same denial path.

function expectManagementRpcDenied(result) {
  expect(result.data ?? null).toBeNull();
  const message = String(result.error?.message || "").toLowerCase();
  expect(result.error).toBeTruthy();
  expect(
    message.includes("access denied") ||
      message.includes("unauthorized account access") ||
      message.includes("not permitted") ||
      message.includes("permission denied") ||
      message.includes("not authenticated") ||
      message.includes("not a member"),
  ).toBe(true);
}

// Skip a test gracefully when the RPC doesn't exist yet in the local harness
// (PGRST202 = function not found). This avoids hard failures on environments
// that haven't applied the compliance SQL migrations.
function isRpcMissing(result) {
  return result.error?.code === "PGRST202" || result.error?.code === "42883";
}

const ACCOUNT_A = isolationFixtures.accounts.accountA.id;
const ACCOUNT_B = isolationFixtures.accounts.accountB.id;

describe.skipIf(!isIntegrationHarnessConfigured())(
  "compliance backend security — Tax Readiness, Rent Shield, Lease Auditor",
  () => {
    const admin = getIntegrationAdminClient();
    const createdTaxRecordIds = new Set();
    const createdAssessmentIds = new Set();
    const createdLeaseAuditIds = new Set();

    beforeAll(async () => {
      await ensureIsolationHarnessSeed();
    });

    afterEach(async () => {
      if (createdTaxRecordIds.size > 0) {
        await admin.from("tax_records").delete().in("id", Array.from(createdTaxRecordIds));
        createdTaxRecordIds.clear();
      }
      if (createdAssessmentIds.size > 0) {
        await admin.from("rent_shield_assessments").delete().in("id", Array.from(createdAssessmentIds));
        createdAssessmentIds.clear();
      }
      if (createdLeaseAuditIds.size > 0) {
        await admin.from("lease_audit_findings").delete().in("lease_audit_id", Array.from(createdLeaseAuditIds));
        await admin.from("lease_audits").delete().in("id", Array.from(createdLeaseAuditIds));
        createdLeaseAuditIds.clear();
      }
    });

    // ── Tax Readiness — list_tax_items RPC ─────────────────────────────────

    describe("list_tax_items RPC", () => {
      it("allows account A owner to call list_tax_items for account A", async () => {
        const { client } = await signInAsFixtureUser("ownerA");
        const result = await client.rpc("list_tax_items", {
          p_account_id:  ACCOUNT_A,
          p_jurisdiction: null,
        });
        if (isRpcMissing(result)) {
          console.warn("list_tax_items RPC not deployed — skipping positive assertion");
          return;
        }
        expect(result.error).toBeNull();
        expect(Array.isArray(result.data)).toBe(true);
        expect(result.data.every((row) => row.account_id === ACCOUNT_A)).toBe(true);
      });

      it("allows account A admin to call list_tax_items for account A", async () => {
        const { client } = await signInAsFixtureUser("adminA");
        const result = await client.rpc("list_tax_items", {
          p_account_id:  ACCOUNT_A,
          p_jurisdiction: null,
        });
        if (isRpcMissing(result)) return;
        expect(result.error).toBeNull();
        expect(Array.isArray(result.data)).toBe(true);
      });

      it("denies tenant A1 from calling list_tax_items", async () => {
        const { client } = await signInAsFixtureUser("tenantA1");
        const result = await client.rpc("list_tax_items", {
          p_account_id:  ACCOUNT_A,
          p_jurisdiction: null,
        });
        if (isRpcMissing(result)) return;
        expectManagementRpcDenied(result);
      });

      it("denies contractor A1 from calling list_tax_items", async () => {
        const { client } = await signInAsFixtureUser("contractorA1");
        const result = await client.rpc("list_tax_items", {
          p_account_id:  ACCOUNT_A,
          p_jurisdiction: null,
        });
        if (isRpcMissing(result)) return;
        expectManagementRpcDenied(result);
      });

      it("denies owner A from calling list_tax_items for account B", async () => {
        const { client } = await signInAsFixtureUser("ownerA");
        const result = await client.rpc("list_tax_items", {
          p_account_id:  ACCOUNT_B,
          p_jurisdiction: null,
        });
        if (isRpcMissing(result)) return;
        expectAccessDenied(result);
      });
    });

    // ── Tax Readiness — tax_records table RLS ──────────────────────────────

    describe("tax_records table RLS", () => {
      it("tenant cannot directly select tax_records rows for their account", async () => {
        const { client } = await signInAsFixtureUser("tenantA1");
        const result = await client
          .from("tax_records")
          .select("id, account_id")
          .eq("account_id", ACCOUNT_A)
          .limit(5);

        // Either denied or returns zero rows — never returns cross-role data.
        if (result.error) {
          const msg = String(result.error.message || "").toLowerCase();
          expect(
            msg.includes("permission denied") ||
              msg.includes("row-level security") ||
              msg.includes("not permitted"),
          ).toBe(true);
        } else {
          expect(result.data ?? []).toHaveLength(0);
        }
      });

      it("contractor cannot directly select tax_records rows", async () => {
        const { client } = await signInAsFixtureUser("contractorA1");
        const result = await client
          .from("tax_records")
          .select("id")
          .eq("account_id", ACCOUNT_A)
          .limit(5);

        if (result.error) {
          const msg = String(result.error.message || "").toLowerCase();
          expect(msg.includes("permission denied") || msg.includes("row-level security")).toBe(true);
        } else {
          expect(result.data ?? []).toHaveLength(0);
        }
      });

      it("manager from account A cannot read tax_records from account B", async () => {
        const { client } = await signInAsFixtureUser("ownerA");
        const result = await client
          .from("tax_records")
          .select("id, account_id")
          .eq("account_id", ACCOUNT_B)
          .limit(5);

        expect(result.error).toBeNull();
        expect(result.data ?? []).toHaveLength(0);
      });
    });

    // ── Rent Shield — list_rent_shield_assessments RPC ─────────────────────

    describe("list_rent_shield_assessments RPC", () => {
      it("allows account A owner to call list_rent_shield_assessments for account A", async () => {
        const { client } = await signInAsFixtureUser("ownerA");
        const result = await client.rpc("list_rent_shield_assessments", {
          p_account_id:  ACCOUNT_A,
          p_property_id: null,
          p_limit:       10,
        });
        if (isRpcMissing(result)) {
          console.warn("list_rent_shield_assessments RPC not deployed — skipping");
          return;
        }
        expect(result.error).toBeNull();
        expect(Array.isArray(result.data)).toBe(true);
      });

      it("denies tenant A1 from calling list_rent_shield_assessments", async () => {
        const { client } = await signInAsFixtureUser("tenantA1");
        const result = await client.rpc("list_rent_shield_assessments", {
          p_account_id:  ACCOUNT_A,
          p_property_id: null,
          p_limit:       10,
        });
        if (isRpcMissing(result)) return;
        expectManagementRpcDenied(result);
      });

      it("denies contractor A1 from calling list_rent_shield_assessments", async () => {
        const { client } = await signInAsFixtureUser("contractorA1");
        const result = await client.rpc("list_rent_shield_assessments", {
          p_account_id:  ACCOUNT_A,
          p_property_id: null,
          p_limit:       10,
        });
        if (isRpcMissing(result)) return;
        expectManagementRpcDenied(result);
      });

      it("denies owner A from calling list_rent_shield_assessments for account B", async () => {
        const { client } = await signInAsFixtureUser("ownerA");
        const result = await client.rpc("list_rent_shield_assessments", {
          p_account_id:  ACCOUNT_B,
          p_property_id: null,
          p_limit:       10,
        });
        if (isRpcMissing(result)) return;
        expectAccessDenied(result);
      });
    });

    // ── Rent Shield — rent_shield_assessments table RLS ────────────────────

    describe("rent_shield_assessments table RLS", () => {
      it("tenant cannot directly select rent_shield_assessments rows", async () => {
        const { client } = await signInAsFixtureUser("tenantA1");
        const result = await client
          .from("rent_shield_assessments")
          .select("id")
          .eq("account_id", ACCOUNT_A)
          .limit(5);

        if (result.error) {
          const msg = String(result.error.message || "").toLowerCase();
          expect(msg.includes("permission denied") || msg.includes("row-level security")).toBe(true);
        } else {
          expect(result.data ?? []).toHaveLength(0);
        }
      });

      it("account A owner cannot read account B rent_shield_assessments", async () => {
        const { client } = await signInAsFixtureUser("ownerA");
        const result = await client
          .from("rent_shield_assessments")
          .select("id, account_id")
          .eq("account_id", ACCOUNT_B)
          .limit(5);

        expect(result.error).toBeNull();
        expect(result.data ?? []).toHaveLength(0);
      });
    });

    // ── Lease Auditor — list_lease_audits RPC ──────────────────────────────

    describe("list_lease_audits RPC", () => {
      it("allows account A owner to call list_lease_audits for account A", async () => {
        const { client } = await signInAsFixtureUser("ownerA");
        const result = await client.rpc("list_lease_audits", {
          p_account_id: ACCOUNT_A,
          p_lease_id:   null,
        });
        if (isRpcMissing(result)) {
          console.warn("list_lease_audits RPC not deployed — skipping");
          return;
        }
        expect(result.error).toBeNull();
        expect(Array.isArray(result.data)).toBe(true);
      });

      it("denies tenant A1 from calling list_lease_audits", async () => {
        const { client } = await signInAsFixtureUser("tenantA1");
        const result = await client.rpc("list_lease_audits", {
          p_account_id: ACCOUNT_A,
          p_lease_id:   null,
        });
        if (isRpcMissing(result)) return;
        expectManagementRpcDenied(result);
      });

      it("denies contractor A1 from calling list_lease_audits", async () => {
        const { client } = await signInAsFixtureUser("contractorA1");
        const result = await client.rpc("list_lease_audits", {
          p_account_id: ACCOUNT_A,
          p_lease_id:   null,
        });
        if (isRpcMissing(result)) return;
        expectManagementRpcDenied(result);
      });

      it("denies owner A from calling list_lease_audits for account B", async () => {
        const { client } = await signInAsFixtureUser("ownerA");
        const result = await client.rpc("list_lease_audits", {
          p_account_id: ACCOUNT_B,
          p_lease_id:   null,
        });
        if (isRpcMissing(result)) return;
        expectAccessDenied(result);
      });
    });

    // ── Lease Auditor — list_lease_audit_findings RPC ──────────────────────

    describe("list_lease_audit_findings RPC", () => {
      it("denies tenant from calling list_lease_audit_findings", async () => {
        const { client } = await signInAsFixtureUser("tenantA1");
        const result = await client.rpc("list_lease_audit_findings", {
          p_account_id:    ACCOUNT_A,
          p_lease_audit_id: randomUUID(),
        });
        if (isRpcMissing(result)) return;
        expectManagementRpcDenied(result);
      });

      it("denies contractor from calling list_lease_audit_findings", async () => {
        const { client } = await signInAsFixtureUser("contractorA1");
        const result = await client.rpc("list_lease_audit_findings", {
          p_account_id:    ACCOUNT_A,
          p_lease_audit_id: randomUUID(),
        });
        if (isRpcMissing(result)) return;
        expectManagementRpcDenied(result);
      });

      it("denies cross-account access to list_lease_audit_findings", async () => {
        const { client } = await signInAsFixtureUser("ownerA");
        const result = await client.rpc("list_lease_audit_findings", {
          p_account_id:    ACCOUNT_B,
          p_lease_audit_id: randomUUID(),
        });
        if (isRpcMissing(result)) return;
        expectAccessDenied(result);
      });
    });

    // ── Lease Auditor — lease_audits table RLS ─────────────────────────────

    describe("lease_audits and lease_audit_findings table RLS", () => {
      it("tenant cannot directly select lease_audits rows", async () => {
        const { client } = await signInAsFixtureUser("tenantA1");
        const result = await client
          .from("lease_audits")
          .select("id")
          .eq("account_id", ACCOUNT_A)
          .limit(5);

        if (result.error) {
          const msg = String(result.error.message || "").toLowerCase();
          expect(msg.includes("permission denied") || msg.includes("row-level security")).toBe(true);
        } else {
          expect(result.data ?? []).toHaveLength(0);
        }
      });

      it("tenant cannot directly select lease_audit_findings rows", async () => {
        const { client } = await signInAsFixtureUser("tenantA1");
        const result = await client
          .from("lease_audit_findings")
          .select("id")
          .limit(5);

        if (result.error) {
          const msg = String(result.error.message || "").toLowerCase();
          expect(msg.includes("permission denied") || msg.includes("row-level security")).toBe(true);
        } else {
          expect(result.data ?? []).toHaveLength(0);
        }
      });

      it("account A owner cannot read account B lease_audits", async () => {
        const { client } = await signInAsFixtureUser("ownerA");
        const result = await client
          .from("lease_audits")
          .select("id, account_id")
          .eq("account_id", ACCOUNT_B)
          .limit(5);

        expect(result.error).toBeNull();
        expect(result.data ?? []).toHaveLength(0);
      });
    });
  },
);
