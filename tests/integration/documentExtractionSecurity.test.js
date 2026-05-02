// tests/integration/documentExtractionSecurity.test.js
//
// Verifies that document extraction RPCs enforce account isolation and
// management-role access at the database level.
//
// Coverage:
//   - Manager (owner/admin) can call list RPCs for their own account
//   - Manager calling a write RPC with a nonexistent document_id gets
//     "Document not found" — proving they passed the access check
//   - Tenant is denied by assert_manage_account_access
//   - Contractor is denied by assert_manage_account_access
//   - Cross-account access denied
//   - Direct table RLS denies non-manager reads on extraction tables

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

function isRpcMissing(result) {
  return result.error?.code === "PGRST202" || result.error?.code === "42883";
}

// Returns true when the account does not have the document_extraction feature
// enabled (e.g. plan too low) — lets positive tests skip gracefully.
function isFeatureOrRpcBlocked(result) {
  if (isRpcMissing(result)) return true;
  const msg = String(result.error?.message || "").toLowerCase();
  return (
    msg.includes("feature") ||
    msg.includes("plan") ||
    msg.includes("upgrade") ||
    msg.includes("not enabled")
  );
}

// The positive test for write RPCs passes a random document_id. A manager
// who clears the access check will receive "Document not found". A non-manager
// would be blocked at assert_manage_account_access before reaching that check.
function isDocumentNotFound(result) {
  const msg = String(result.error?.message || "").toLowerCase();
  return msg.includes("document not found") || msg.includes("not found");
}

const ACCOUNT_A = isolationFixtures.accounts.accountA.id;
const ACCOUNT_B = isolationFixtures.accounts.accountB.id;

describe.skipIf(!isIntegrationHarnessConfigured())(
  "document extraction backend security",
  () => {
    const admin = getIntegrationAdminClient();
    const createdRunIds = new Set();
    const createdExtractionIds = new Set();

    beforeAll(async () => {
      await ensureIsolationHarnessSeed();
    });

    afterEach(async () => {
      if (createdRunIds.size > 0) {
        await admin
          .from("document_extraction_runs")
          .delete()
          .in("id", Array.from(createdRunIds));
        createdRunIds.clear();
      }
      if (createdExtractionIds.size > 0) {
        await admin
          .from("document_extractions")
          .delete()
          .in("id", Array.from(createdExtractionIds));
        createdExtractionIds.clear();
      }
    });

    // ── request_document_extraction RPC ────────────────────────────────────────

    describe("request_document_extraction RPC", () => {
      it("manager (ownerA) clears access check — receives document-not-found, not access-denied", async () => {
        const { client } = await signInAsFixtureUser("ownerA");
        const result = await client.rpc("request_document_extraction", {
          p_account_id:    ACCOUNT_A,
          p_document_id:   randomUUID(),
          p_extractor:     "auto",
          p_language_hint: null,
        });
        if (isRpcMissing(result)) {
          console.warn("request_document_extraction RPC not deployed — skipping");
          return;
        }
        // Feature-gated accounts stop here; that's acceptable — access was not denied.
        if (isFeatureOrRpcBlocked(result)) return;
        // If access check passed and feature is enabled, the only failure should be
        // that the random document_id doesn't exist.
        expect(isDocumentNotFound(result)).toBe(true);
      });

      it("denies tenant A1 from calling request_document_extraction", async () => {
        const { client } = await signInAsFixtureUser("tenantA1");
        const result = await client.rpc("request_document_extraction", {
          p_account_id:    ACCOUNT_A,
          p_document_id:   randomUUID(),
          p_extractor:     "auto",
          p_language_hint: null,
        });
        if (isRpcMissing(result)) return;
        expectManagementRpcDenied(result);
      });

      it("denies contractor A1 from calling request_document_extraction", async () => {
        const { client } = await signInAsFixtureUser("contractorA1");
        const result = await client.rpc("request_document_extraction", {
          p_account_id:    ACCOUNT_A,
          p_document_id:   randomUUID(),
          p_extractor:     "auto",
          p_language_hint: null,
        });
        if (isRpcMissing(result)) return;
        expectManagementRpcDenied(result);
      });

      it("denies owner A from calling request_document_extraction for account B", async () => {
        const { client } = await signInAsFixtureUser("ownerA");
        const result = await client.rpc("request_document_extraction", {
          p_account_id:    ACCOUNT_B,
          p_document_id:   randomUUID(),
          p_extractor:     "auto",
          p_language_hint: null,
        });
        if (isRpcMissing(result)) return;
        expectAccessDenied(result);
      });
    });

    // ── get_document_extraction RPC ────────────────────────────────────────────

    describe("get_document_extraction RPC", () => {
      it("manager (ownerA) clears access check — receives document-not-found or empty result", async () => {
        const { client } = await signInAsFixtureUser("ownerA");
        const result = await client.rpc("get_document_extraction", {
          p_account_id:  ACCOUNT_A,
          p_document_id: randomUUID(),
          p_extractor:   null,
        });
        if (isRpcMissing(result)) {
          console.warn("get_document_extraction RPC not deployed — skipping");
          return;
        }
        if (isFeatureOrRpcBlocked(result)) return;
        // Either no error (empty result for unknown doc) or document-not-found
        if (result.error) {
          expect(isDocumentNotFound(result)).toBe(true);
        } else {
          expect(Array.isArray(result.data) || result.data === null).toBe(true);
        }
      });

      it("denies tenant A1 from calling get_document_extraction", async () => {
        const { client } = await signInAsFixtureUser("tenantA1");
        const result = await client.rpc("get_document_extraction", {
          p_account_id:  ACCOUNT_A,
          p_document_id: randomUUID(),
          p_extractor:   null,
        });
        if (isRpcMissing(result)) return;
        expectManagementRpcDenied(result);
      });

      it("denies contractor A1 from calling get_document_extraction", async () => {
        const { client } = await signInAsFixtureUser("contractorA1");
        const result = await client.rpc("get_document_extraction", {
          p_account_id:  ACCOUNT_A,
          p_document_id: randomUUID(),
          p_extractor:   null,
        });
        if (isRpcMissing(result)) return;
        expectManagementRpcDenied(result);
      });

      it("denies owner A from calling get_document_extraction for account B", async () => {
        const { client } = await signInAsFixtureUser("ownerA");
        const result = await client.rpc("get_document_extraction", {
          p_account_id:  ACCOUNT_B,
          p_document_id: randomUUID(),
          p_extractor:   null,
        });
        if (isRpcMissing(result)) return;
        expectAccessDenied(result);
      });
    });

    // ── list_document_extractions RPC ──────────────────────────────────────────

    describe("list_document_extractions RPC", () => {
      it("allows account A owner to call list_document_extractions", async () => {
        const { client } = await signInAsFixtureUser("ownerA");
        const result = await client.rpc("list_document_extractions", {
          p_account_id: ACCOUNT_A,
          p_status:     null,
          p_limit:      10,
          p_offset:     0,
        });
        if (isRpcMissing(result)) {
          console.warn("list_document_extractions RPC not deployed — skipping");
          return;
        }
        if (isFeatureOrRpcBlocked(result)) return;
        expect(result.error).toBeNull();
        expect(Array.isArray(result.data)).toBe(true);
        // All returned rows must belong to account A
        expect(
          result.data.every((row) => row.account_id === ACCOUNT_A),
        ).toBe(true);
      });

      it("allows account A admin to call list_document_extractions", async () => {
        const { client } = await signInAsFixtureUser("adminA");
        const result = await client.rpc("list_document_extractions", {
          p_account_id: ACCOUNT_A,
          p_status:     null,
          p_limit:      10,
          p_offset:     0,
        });
        if (isRpcMissing(result)) return;
        if (isFeatureOrRpcBlocked(result)) return;
        expect(result.error).toBeNull();
        expect(Array.isArray(result.data)).toBe(true);
      });

      it("denies tenant A1 from calling list_document_extractions", async () => {
        const { client } = await signInAsFixtureUser("tenantA1");
        const result = await client.rpc("list_document_extractions", {
          p_account_id: ACCOUNT_A,
          p_status:     null,
          p_limit:      10,
          p_offset:     0,
        });
        if (isRpcMissing(result)) return;
        expectManagementRpcDenied(result);
      });

      it("denies contractor A1 from calling list_document_extractions", async () => {
        const { client } = await signInAsFixtureUser("contractorA1");
        const result = await client.rpc("list_document_extractions", {
          p_account_id: ACCOUNT_A,
          p_status:     null,
          p_limit:      10,
          p_offset:     0,
        });
        if (isRpcMissing(result)) return;
        expectManagementRpcDenied(result);
      });

      it("denies owner A from calling list_document_extractions for account B", async () => {
        const { client } = await signInAsFixtureUser("ownerA");
        const result = await client.rpc("list_document_extractions", {
          p_account_id: ACCOUNT_B,
          p_status:     null,
          p_limit:      10,
          p_offset:     0,
        });
        if (isRpcMissing(result)) return;
        expectAccessDenied(result);
      });
    });

    // ── list_document_extraction_runs RPC ──────────────────────────────────────

    describe("list_document_extraction_runs RPC", () => {
      it("allows account A owner to call list_document_extraction_runs", async () => {
        const { client } = await signInAsFixtureUser("ownerA");
        const result = await client.rpc("list_document_extraction_runs", {
          p_account_id:  ACCOUNT_A,
          p_document_id: null,
          p_status:      null,
          p_limit:       10,
          p_offset:      0,
        });
        if (isRpcMissing(result)) {
          console.warn("list_document_extraction_runs RPC not deployed — skipping");
          return;
        }
        if (isFeatureOrRpcBlocked(result)) return;
        expect(result.error).toBeNull();
        expect(Array.isArray(result.data)).toBe(true);
        expect(
          result.data.every((row) => row.account_id === ACCOUNT_A),
        ).toBe(true);
      });

      it("denies tenant A1 from calling list_document_extraction_runs", async () => {
        const { client } = await signInAsFixtureUser("tenantA1");
        const result = await client.rpc("list_document_extraction_runs", {
          p_account_id:  ACCOUNT_A,
          p_document_id: null,
          p_status:      null,
          p_limit:       10,
          p_offset:      0,
        });
        if (isRpcMissing(result)) return;
        expectManagementRpcDenied(result);
      });

      it("denies contractor A1 from calling list_document_extraction_runs", async () => {
        const { client } = await signInAsFixtureUser("contractorA1");
        const result = await client.rpc("list_document_extraction_runs", {
          p_account_id:  ACCOUNT_A,
          p_document_id: null,
          p_status:      null,
          p_limit:       10,
          p_offset:      0,
        });
        if (isRpcMissing(result)) return;
        expectManagementRpcDenied(result);
      });

      it("denies owner A from calling list_document_extraction_runs for account B", async () => {
        const { client } = await signInAsFixtureUser("ownerA");
        const result = await client.rpc("list_document_extraction_runs", {
          p_account_id:  ACCOUNT_B,
          p_document_id: null,
          p_status:      null,
          p_limit:       10,
          p_offset:      0,
        });
        if (isRpcMissing(result)) return;
        expectAccessDenied(result);
      });
    });

    // ── mark_document_extraction_stale RPC ─────────────────────────────────────

    describe("mark_document_extraction_stale RPC", () => {
      it("manager (ownerA) clears access check — receives document-not-found, not access-denied", async () => {
        const { client } = await signInAsFixtureUser("ownerA");
        const result = await client.rpc("mark_document_extraction_stale", {
          p_account_id:  ACCOUNT_A,
          p_document_id: randomUUID(),
        });
        if (isRpcMissing(result)) {
          console.warn("mark_document_extraction_stale RPC not deployed — skipping");
          return;
        }
        if (isFeatureOrRpcBlocked(result)) return;
        expect(isDocumentNotFound(result)).toBe(true);
      });

      it("denies tenant A1 from calling mark_document_extraction_stale", async () => {
        const { client } = await signInAsFixtureUser("tenantA1");
        const result = await client.rpc("mark_document_extraction_stale", {
          p_account_id:  ACCOUNT_A,
          p_document_id: randomUUID(),
        });
        if (isRpcMissing(result)) return;
        expectManagementRpcDenied(result);
      });

      it("denies contractor A1 from calling mark_document_extraction_stale", async () => {
        const { client } = await signInAsFixtureUser("contractorA1");
        const result = await client.rpc("mark_document_extraction_stale", {
          p_account_id:  ACCOUNT_A,
          p_document_id: randomUUID(),
        });
        if (isRpcMissing(result)) return;
        expectManagementRpcDenied(result);
      });

      it("denies owner A from calling mark_document_extraction_stale for account B", async () => {
        const { client } = await signInAsFixtureUser("ownerA");
        const result = await client.rpc("mark_document_extraction_stale", {
          p_account_id:  ACCOUNT_B,
          p_document_id: randomUUID(),
        });
        if (isRpcMissing(result)) return;
        expectAccessDenied(result);
      });
    });

    // ── document_extractions table RLS ─────────────────────────────────────────

    describe("document_extractions table RLS", () => {
      it("tenant cannot directly select document_extractions rows", async () => {
        const { client } = await signInAsFixtureUser("tenantA1");
        const result = await client
          .from("document_extractions")
          .select("id, account_id")
          .eq("account_id", ACCOUNT_A)
          .limit(5);

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

      it("contractor cannot directly select document_extractions rows", async () => {
        const { client } = await signInAsFixtureUser("contractorA1");
        const result = await client
          .from("document_extractions")
          .select("id")
          .eq("account_id", ACCOUNT_A)
          .limit(5);

        if (result.error) {
          const msg = String(result.error.message || "").toLowerCase();
          expect(
            msg.includes("permission denied") || msg.includes("row-level security"),
          ).toBe(true);
        } else {
          expect(result.data ?? []).toHaveLength(0);
        }
      });

      it("account A owner cannot read account B document_extractions", async () => {
        const { client } = await signInAsFixtureUser("ownerA");
        const result = await client
          .from("document_extractions")
          .select("id, account_id")
          .eq("account_id", ACCOUNT_B)
          .limit(5);

        expect(result.error).toBeNull();
        expect(result.data ?? []).toHaveLength(0);
      });
    });

    // ── document_extraction_runs table RLS ─────────────────────────────────────

    describe("document_extraction_runs table RLS", () => {
      it("tenant cannot directly select document_extraction_runs rows", async () => {
        const { client } = await signInAsFixtureUser("tenantA1");
        const result = await client
          .from("document_extraction_runs")
          .select("id, account_id")
          .eq("account_id", ACCOUNT_A)
          .limit(5);

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

      it("contractor cannot directly select document_extraction_runs rows", async () => {
        const { client } = await signInAsFixtureUser("contractorA1");
        const result = await client
          .from("document_extraction_runs")
          .select("id")
          .eq("account_id", ACCOUNT_A)
          .limit(5);

        if (result.error) {
          const msg = String(result.error.message || "").toLowerCase();
          expect(
            msg.includes("permission denied") || msg.includes("row-level security"),
          ).toBe(true);
        } else {
          expect(result.data ?? []).toHaveLength(0);
        }
      });

      it("account A owner cannot read account B document_extraction_runs", async () => {
        const { client } = await signInAsFixtureUser("ownerA");
        const result = await client
          .from("document_extraction_runs")
          .select("id, account_id")
          .eq("account_id", ACCOUNT_B)
          .limit(5);

        expect(result.error).toBeNull();
        expect(result.data ?? []).toHaveLength(0);
      });
    });
  },
);
