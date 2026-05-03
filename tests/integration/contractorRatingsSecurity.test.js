import { afterEach, describe, expect, it } from "vitest";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import {
  ensureIsolationHarnessSeed,
  getIntegrationAdminClient,
  isolationSeedIds,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "./helpers/env.js";

function expectDeniedOrNoRows(result) {
  const rows = Array.isArray(result.data) ? result.data : result.data ? [result.data] : [];
  if (result.error) {
    const message = String(result.error.message || "").toLowerCase();
    expect(
      message.includes("not allowed") ||
        message.includes("not permitted") ||
        message.includes("permission") ||
        message.includes("row-level security") ||
        message.includes("violates row-level security") ||
        message.includes("forbidden"),
    ).toBe(true);
    return;
  }

  expect(rows).toHaveLength(0);
}

describe.skipIf(!isIntegrationHarnessConfigured())("contractor ratings security", () => {
  const admin = getIntegrationAdminClient();
  const createdOrTouchedWorkOrderIds = new Set();

  afterEach(async () => {
    if (createdOrTouchedWorkOrderIds.size === 0) return;
    const ids = Array.from(createdOrTouchedWorkOrderIds);
    createdOrTouchedWorkOrderIds.clear();

    const { error } = await admin.from("contractor_ratings").delete().in("work_order_id", ids);
    if (error) throw error;
  });

  it("allows managers to upsert and read contractor ratings", async () => {
    await ensureIsolationHarnessSeed();
    const { client } = await signInAsFixtureUser("adminA");
    const workOrderId = isolationSeedIds.workOrderIds.accountA;
    createdOrTouchedWorkOrderIds.add(workOrderId);

    const upsertResult = await client
      .from("contractor_ratings")
      .upsert({
        account_id: isolationFixtures.accounts.accountA.id,
        work_order_id: workOrderId,
        contractor_user_id: (await ensureIsolationHarnessSeed()).contractorA1.id,
        rating: 5,
        comment: "Excellent turnaround",
      }, { onConflict: "work_order_id" })
      .select("account_id, work_order_id, contractor_user_id, rating, comment")
      .single();

    expect(upsertResult.error).toBeNull();
    expect(upsertResult.data).toMatchObject({
      account_id: isolationFixtures.accounts.accountA.id,
      work_order_id: workOrderId,
      contractor_user_id: (await ensureIsolationHarnessSeed()).contractorA1.id,
      rating: 5,
      comment: "Excellent turnaround",
    });

    const readResult = await client
      .from("contractor_ratings")
      .select("account_id, work_order_id, contractor_user_id, rating, comment")
      .eq("work_order_id", workOrderId)
      .single();

    expect(readResult.error).toBeNull();
    expect(readResult.data).toMatchObject({
      account_id: isolationFixtures.accounts.accountA.id,
      work_order_id: workOrderId,
      rating: 5,
    });
  });

  it("denies tenants from upserting contractor ratings", async () => {
    await ensureIsolationHarnessSeed();
    const { client } = await signInAsFixtureUser("tenantA1");
    const workOrderId = isolationSeedIds.workOrderIds.accountA;

    const result = await client
      .from("contractor_ratings")
      .upsert({
        account_id: isolationFixtures.accounts.accountA.id,
        work_order_id: workOrderId,
        contractor_user_id: (await ensureIsolationHarnessSeed()).contractorA1.id,
        rating: 2,
        comment: "Should not be allowed",
      }, { onConflict: "work_order_id" })
      .select("id");

    expectDeniedOrNoRows(result);
  });

  it("uses effective role resolution for contractor rating writes when legacy role and role_id drift", async () => {
    const users = await ensureIsolationHarnessSeed();
    const accountId = isolationFixtures.accounts.accountA.id;
    const workOrderId = isolationSeedIds.workOrderIds.accountA;
    const adminRoleLookup = await admin
      .from("roles")
      .select("id, name")
      .eq("account_id", accountId)
      .eq("name", "admin")
      .single();

    if (adminRoleLookup.error) throw adminRoleLookup.error;

    const targetUserId = users.adminA.id;
    const restoreMembership = async () => {
      const { error } = await admin
        .from("account_members")
        .update({ role: "admin" })
        .eq("account_id", accountId)
        .eq("user_id", targetUserId);

      if (error) throw error;
    };

    const { error: demoteError } = await admin
      .from("account_members")
      .update({ role: "tenant" })
      .eq("account_id", accountId)
      .eq("user_id", targetUserId);

    if (demoteError) throw demoteError;

    const { error: driftError } = await admin
      .from("account_members")
      .update({ role_id: adminRoleLookup.data.id })
      .eq("account_id", accountId)
      .eq("user_id", targetUserId);

    if (driftError) throw driftError;

    try {
      const { client } = await signInAsFixtureUser("adminA");
      createdOrTouchedWorkOrderIds.add(workOrderId);

      const upsertResult = await client
        .from("contractor_ratings")
        .upsert({
          account_id: accountId,
          work_order_id: workOrderId,
          contractor_user_id: users.contractorA1.id,
          rating: 4,
          comment: "Effective role write",
        }, { onConflict: "work_order_id" })
        .select("account_id, work_order_id, contractor_user_id, rating, comment")
        .single();

      expect(upsertResult.error).toBeNull();
      expect(upsertResult.data).toMatchObject({
        account_id: accountId,
        work_order_id: workOrderId,
        contractor_user_id: users.contractorA1.id,
        rating: 4,
        comment: "Effective role write",
      });
    } finally {
      await restoreMembership();
    }
  });
});
