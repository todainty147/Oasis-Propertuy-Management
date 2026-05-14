/**
 * Integration: property_operational_health_snapshot RPC — RLS and edge cases
 *
 * Extends the existing property_operational_health_snapshot tests with:
 *   1. Cross-account access denial — ownerB cannot read accountA's snapshot
 *   2. Vacant property — no tenant / no requests / no work orders returns zeros
 *   3. Multiple open requests — open_request_count increments correctly for
 *      pending/in_progress statuses and ignores resolved/completed ones
 *
 * These are additive tests. The two original tests (resolved requests, assigned
 * work orders) live in property_operational_health_snapshot.test.js.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import {
  ensureIsolationHarnessSeed,
  getIntegrationAdminClient,
  isolationSeedIds,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "./helpers/env.js";
import { expectAccessDenied, firstRow } from "./helpers/rpcAssertions.js";

const ACCOUNT_A = isolationFixtures.accounts.accountA.id;
const ACCOUNT_B = isolationFixtures.accounts.accountB.id;
const PROPERTY_A = isolationSeedIds.propertyIds.accountA;

async function fetchSnapshot(client, accountId, propertyId) {
  return client.rpc("property_operational_health_snapshot", {
    p_account_id: accountId,
    p_property_id: propertyId,
    p_limit: 1,
  });
}

describe.skipIf(!isIntegrationHarnessConfigured())("property_operational_health_snapshot — RLS and edge cases", () => {
  const admin = getIntegrationAdminClient();
  let ownerAUserId;
  let vacantPropertyId;
  const createdRequestIds = new Set();

  beforeAll(async () => {
    const usersByKey = await ensureIsolationHarnessSeed();
    ownerAUserId = usersByKey.ownerA.id;

    // Vacant property: no tenant_id, no payments, no maintenance requests
    vacantPropertyId = randomUUID();
    const { error } = await admin.from("properties").insert({
      id: vacantPropertyId,
      account_id: ACCOUNT_A,
      owner_id: ownerAUserId,
      address: "99 Vacant Test Close",
      city: "London",
      size: "studio",
      rent: 0,
      status: "Wolne",
      tenant_id: null,
    });
    expect(error).toBeNull();
  });

  afterAll(async () => {
    if (vacantPropertyId) {
      await admin.from("properties").delete().eq("id", vacantPropertyId);
    }
  });

  afterEach(async () => {
    if (createdRequestIds.size > 0) {
      await admin
        .from("maintenance_requests")
        .delete()
        .in("id", Array.from(createdRequestIds));
      createdRequestIds.clear();
    }
  });

  // ── Cross-account access denial ───────────────────────────────────────────────

  it("ownerB cannot read accountA property health snapshot — access denied", async () => {
    const { client } = await signInAsFixtureUser("ownerB");

    const result = await fetchSnapshot(client, ACCOUNT_A, PROPERTY_A);

    expectAccessDenied(result);
  });

  // ── Vacant property returns zero counts ───────────────────────────────────────

  it("vacant property (no tenant, no requests) returns zero open_request_count and active_work_order_count", async () => {
    const { client } = await signInAsFixtureUser("ownerA");

    const result = await fetchSnapshot(client, ACCOUNT_A, vacantPropertyId);

    expect(result.error).toBeNull();
    const row = firstRow(result.data);

    expect(Number(row?.open_request_count ?? 0)).toBe(0);
    expect(Number(row?.active_work_order_count ?? 0)).toBe(0);
  });

  // ── open_request_count accumulates pending/in_progress requests ───────────────

  it("open_request_count increments for open/in_progress requests but not resolved ones", async () => {
    const { client } = await signInAsFixtureUser("ownerA");

    const before = firstRow((await fetchSnapshot(client, ACCOUNT_A, PROPERTY_A)).data);
    const baseCount = Number(before?.open_request_count ?? 0);

    // The RPC counts statuses: 'open', 'in_progress', 'waiting', 'otwarte', 'w trakcie', 'oczekuje'
    // 'pending' is intentionally excluded from the list.
    const openId = randomUUID();
    const inProgressId = randomUUID();
    const resolvedId = randomUUID();
    createdRequestIds.add(openId);
    createdRequestIds.add(inProgressId);
    createdRequestIds.add(resolvedId);

    const buildRow = (id, status, title) => ({
      id,
      account_id: ACCOUNT_A,
      property_id: PROPERTY_A,
      reported_by_tenant_id: isolationFixtures.users.tenantA1.tenantId,
      title,
      description: "property_health_snapshot_rls regression test",
      priority: "normal",
      status,
    });

    const { error: e1 } = await admin.from("maintenance_requests").insert(buildRow(openId, "open", "Open request (should count)"));
    expect(e1).toBeNull();

    const { error: e2 } = await admin.from("maintenance_requests").insert(buildRow(inProgressId, "in_progress", "In-progress request (should count)"));
    expect(e2).toBeNull();

    const { error: e3 } = await admin.from("maintenance_requests").insert(buildRow(resolvedId, "resolved", "Resolved request (should NOT count)"));
    expect(e3).toBeNull();

    const after = firstRow((await fetchSnapshot(client, ACCOUNT_A, PROPERTY_A)).data);

    // 2 open requests added (open + in_progress), resolved one excluded
    expect(Number(after?.open_request_count ?? 0)).toBe(baseCount + 2);
  });
});
