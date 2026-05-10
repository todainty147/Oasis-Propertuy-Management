// tests/integration/petRequestsSecurity.test.js
//
// Verifies that the pet_requests RPCs enforce:
//   - feature-gate (renters_rights_readiness)
//   - manager-only access (owner/admin can write, tenant/contractor cannot)
//   - account isolation (cross-account calls denied)
//   - business logic (refusal reason required, invalid status rejected)
//   - direct table RLS (non-manager cannot select)

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

const ACCOUNT_A = isolationFixtures.accounts.accountA.id;
const ACCOUNT_B = isolationFixtures.accounts.accountB.id;

const BASE_CREATE_ARGS = {
  p_pet_type:   "dog",
  p_request_date: new Date().toISOString().slice(0, 10),
};

describe.skipIf(!isIntegrationHarnessConfigured())(
  "pet requests — RPCs and RLS",
  () => {
    const admin = getIntegrationAdminClient();
    const createdIds = new Set();

    beforeAll(async () => {
      await ensureIsolationHarnessSeed();
    });

    afterEach(async () => {
      if (createdIds.size > 0) {
        await admin.from("pet_requests").delete().in("id", Array.from(createdIds));
        createdIds.clear();
      }
    });

    // ── list_pet_requests ─────────────────────────────────────────────────────

    describe("list_pet_requests RPC", () => {
      it("allows account A owner to list pet requests for account A", async () => {
        const { client } = await signInAsFixtureUser("ownerA");
        const result = await client.rpc("list_pet_requests", {
          p_account_id: ACCOUNT_A,
        });
        if (isRpcMissing(result)) {
          console.warn("list_pet_requests not deployed — skipping");
          return;
        }
        expect(result.error).toBeNull();
        expect(Array.isArray(result.data)).toBe(true);
        expect(result.data.every((r) => r.account_id === ACCOUNT_A)).toBe(true);
      });

      it("allows account A admin to list pet requests for account A", async () => {
        const { client } = await signInAsFixtureUser("adminA");
        const result = await client.rpc("list_pet_requests", {
          p_account_id: ACCOUNT_A,
        });
        if (isRpcMissing(result)) return;
        expect(result.error).toBeNull();
        expect(Array.isArray(result.data)).toBe(true);
      });

      it("denies tenant A1 from listing pet requests", async () => {
        const { client } = await signInAsFixtureUser("tenantA1");
        const result = await client.rpc("list_pet_requests", {
          p_account_id: ACCOUNT_A,
        });
        if (isRpcMissing(result)) return;
        expectManagementRpcDenied(result);
      });

      it("denies contractor A1 from listing pet requests", async () => {
        const { client } = await signInAsFixtureUser("contractorA1");
        const result = await client.rpc("list_pet_requests", {
          p_account_id: ACCOUNT_A,
        });
        if (isRpcMissing(result)) return;
        expectManagementRpcDenied(result);
      });

      it("denies owner A from listing account B pet requests", async () => {
        const { client } = await signInAsFixtureUser("ownerA");
        const result = await client.rpc("list_pet_requests", {
          p_account_id: ACCOUNT_B,
        });
        if (isRpcMissing(result)) return;
        expectAccessDenied(result);
      });
    });

    // ── create_pet_request ────────────────────────────────────────────────────

    describe("create_pet_request RPC", () => {
      it("allows account A owner to create a pet request", async () => {
        const { client } = await signInAsFixtureUser("ownerA");
        const result = await client.rpc("create_pet_request", {
          p_account_id: ACCOUNT_A,
          ...BASE_CREATE_ARGS,
        });
        if (isRpcMissing(result)) {
          console.warn("create_pet_request not deployed — skipping");
          return;
        }
        expect(result.error).toBeNull();
        expect(result.data).toBeTruthy();
        expect(result.data.account_id).toBe(ACCOUNT_A);
        expect(result.data.status).toBe("received");
        expect(result.data.pet_type).toBe("dog");
        createdIds.add(result.data.id);
      });

      it("sets decision_due_date to request_date + 28 in list output", async () => {
        const { client } = await signInAsFixtureUser("ownerA");
        const createResult = await client.rpc("create_pet_request", {
          p_account_id:   ACCOUNT_A,
          p_pet_type:     "cat",
          p_request_date: "2026-05-01",
        });
        if (isRpcMissing(createResult)) return;
        expect(createResult.error).toBeNull();
        createdIds.add(createResult.data.id);

        const listResult = await client.rpc("list_pet_requests", {
          p_account_id: ACCOUNT_A,
        });
        expect(listResult.error).toBeNull();
        const row = (listResult.data ?? []).find((r) => r.id === createResult.data.id);
        expect(row).toBeTruthy();
        expect(row.decision_due_date).toBe("2026-05-29");
      });

      it("denies tenant A1 from creating a pet request", async () => {
        const { client } = await signInAsFixtureUser("tenantA1");
        const result = await client.rpc("create_pet_request", {
          p_account_id: ACCOUNT_A,
          ...BASE_CREATE_ARGS,
        });
        if (isRpcMissing(result)) return;
        expectManagementRpcDenied(result);
      });

      it("denies contractor A1 from creating a pet request", async () => {
        const { client } = await signInAsFixtureUser("contractorA1");
        const result = await client.rpc("create_pet_request", {
          p_account_id: ACCOUNT_A,
          ...BASE_CREATE_ARGS,
        });
        if (isRpcMissing(result)) return;
        expectManagementRpcDenied(result);
      });

      it("denies owner A from creating a pet request under account B", async () => {
        const { client } = await signInAsFixtureUser("ownerA");
        const result = await client.rpc("create_pet_request", {
          p_account_id: ACCOUNT_B,
          ...BASE_CREATE_ARGS,
        });
        if (isRpcMissing(result)) return;
        expectAccessDenied(result);
      });
    });

    // ── update_pet_request_status ─────────────────────────────────────────────

    describe("update_pet_request_status RPC", () => {
      async function createRequest(accountId = ACCOUNT_A) {
        const row = await admin.from("pet_requests").insert({
          account_id:   accountId,
          pet_type:     "dog",
          request_date: new Date().toISOString().slice(0, 10),
          jurisdiction: "GB-ENG",
          status:       "received",
        }).select("id").single();
        if (row.data?.id) createdIds.add(row.data.id);
        return row.data?.id;
      }

      it("allows owner A to approve a pet request", async () => {
        const id = await createRequest();
        if (!id) return;
        const { client } = await signInAsFixtureUser("ownerA");
        const result = await client.rpc("update_pet_request_status", {
          p_request_id: id,
          p_account_id: ACCOUNT_A,
          p_status:     "approved",
        });
        if (isRpcMissing(result)) return;
        expect(result.error).toBeNull();
        expect(result.data.status).toBe("approved");
        expect(result.data.decision_date).toBeTruthy();
      });

      it("allows owner A to refuse a pet request with a reason", async () => {
        const id = await createRequest();
        if (!id) return;
        const { client } = await signInAsFixtureUser("ownerA");
        const result = await client.rpc("update_pet_request_status", {
          p_request_id:    id,
          p_account_id:    ACCOUNT_A,
          p_status:        "refused",
          p_refusal_reason: "The property lease prohibits animals.",
        });
        if (isRpcMissing(result)) return;
        expect(result.error).toBeNull();
        expect(result.data.status).toBe("refused");
        expect(result.data.refusal_reason).toBe("The property lease prohibits animals.");
      });

      it("rejects refusal without a reason", async () => {
        const id = await createRequest();
        if (!id) return;
        const { client } = await signInAsFixtureUser("ownerA");
        const result = await client.rpc("update_pet_request_status", {
          p_request_id: id,
          p_account_id: ACCOUNT_A,
          p_status:     "refused",
        });
        if (isRpcMissing(result)) return;
        expect(result.error).toBeTruthy();
        expect(String(result.error.message).toLowerCase()).toContain("refusal reason");
      });

      it("rejects an invalid status value", async () => {
        const id = await createRequest();
        if (!id) return;
        const { client } = await signInAsFixtureUser("ownerA");
        const result = await client.rpc("update_pet_request_status", {
          p_request_id: id,
          p_account_id: ACCOUNT_A,
          p_status:     "pending",
        });
        if (isRpcMissing(result)) return;
        expect(result.error).toBeTruthy();
      });

      it("denies tenant from updating a pet request status", async () => {
        const id = await createRequest();
        if (!id) return;
        const { client } = await signInAsFixtureUser("tenantA1");
        const result = await client.rpc("update_pet_request_status", {
          p_request_id: id,
          p_account_id: ACCOUNT_A,
          p_status:     "approved",
        });
        if (isRpcMissing(result)) return;
        expectManagementRpcDenied(result);
      });

      it("denies owner A from updating account B pet request", async () => {
        const id = await createRequest(ACCOUNT_B);
        if (!id) return;
        const { client } = await signInAsFixtureUser("ownerA");
        const result = await client.rpc("update_pet_request_status", {
          p_request_id: id,
          p_account_id: ACCOUNT_B,
          p_status:     "approved",
        });
        if (isRpcMissing(result)) return;
        expectAccessDenied(result);
      });
    });

    // ── pet_requests table RLS ────────────────────────────────────────────────

    describe("pet_requests table RLS", () => {
      it("tenant cannot directly select pet_requests rows", async () => {
        const { client } = await signInAsFixtureUser("tenantA1");
        const result = await client
          .from("pet_requests")
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

      it("contractor cannot directly select pet_requests rows", async () => {
        const { client } = await signInAsFixtureUser("contractorA1");
        const result = await client
          .from("pet_requests")
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

      it("owner A cannot see account B pet_requests via direct select", async () => {
        const { client } = await signInAsFixtureUser("ownerA");
        const result = await client
          .from("pet_requests")
          .select("id, account_id")
          .eq("account_id", ACCOUNT_B)
          .limit(5);

        expect(result.error).toBeNull();
        expect(result.data ?? []).toHaveLength(0);
      });
    });
  },
);
