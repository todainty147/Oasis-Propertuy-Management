import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import { isIntegrationHarnessConfigured } from "./helpers/env.js";
import {
  ensureIsolationHarnessSeed,
  getIntegrationAdminClient,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";

describe.skipIf(!isIntegrationHarnessConfigured())("data retention privacy RLS and request RPCs", () => {
  const admin = getIntegrationAdminClient();
  let usersByKey;
  let privacyMigrationInstalled = false;
  const createdRequestIds = [];

  beforeAll(async () => {
    usersByKey = await ensureIsolationHarnessSeed();
    const probe = await admin
      .from("data_deletion_requests")
      .select("id")
      .limit(1);
    privacyMigrationInstalled = !probe.error;
  });

  afterEach(async () => {
    if (createdRequestIds.length === 0) return;
    const ids = createdRequestIds.splice(0, createdRequestIds.length);
    await admin.from("data_deletion_requests").delete().in("id", ids);
  });

  async function submitAs(fixtureKey, payload) {
    const { client } = await signInAsFixtureUser(fixtureKey);
    const result = await client.rpc("submit_data_deletion_request", {
      p_account_id: payload.accountId ?? null,
      p_request_type: payload.requestType,
      p_scope: payload.scope,
      p_target_user_id: payload.targetUserId ?? null,
      p_target_tenant_id: payload.targetTenantId ?? null,
      p_target_contractor_id: payload.targetContractorId ?? null,
      p_reason: payload.reason ?? null,
      p_requester_notes: payload.requesterNotes ?? null,
    });
    if (result.data?.id) createdRequestIds.push(result.data.id);
    return result;
  }

  function skipWhenPrivacyMigrationMissing() {
    if (privacyMigrationInstalled) return false;
    expect(privacyMigrationInstalled, "privacy migration not applied in this local harness").toBe(false);
    return true;
  }

  it("lets a user submit and view their own account deletion request", async () => {
    if (skipWhenPrivacyMigrationMissing()) return;
    const { user } = await signInAsFixtureUser("ownerA");
    const result = await submitAs("ownerA", {
      accountId: isolationFixtures.accounts.accountA.id,
      requestType: "user_account_deletion",
      scope: "user",
      targetUserId: user.id,
    });

    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({
      account_id: isolationFixtures.accounts.accountA.id,
      requester_user_id: user.id,
      request_type: "user_account_deletion",
      scope: "user",
      status: "submitted",
    });
  });

  it("lets owners request workspace closure but denies staff workspace closure", async () => {
    if (skipWhenPrivacyMigrationMissing()) return;
    const ownerResult = await submitAs("ownerA", {
      accountId: isolationFixtures.accounts.accountA.id,
      requestType: "workspace_closure",
      scope: "account",
    });
    expect(ownerResult.error).toBeNull();
    expect(ownerResult.data.status).toBe("pending_admin_review");

    const staffResult = await submitAs("staffA", {
      accountId: isolationFixtures.accounts.accountA.id,
      requestType: "workspace_closure",
      scope: "account",
    });
    expect(staffResult.data ?? null).toBeNull();
    expect(String(staffResult.error?.message || "").toLowerCase()).toContain("access denied");
  });

  it("lets tenant and contractor users request erasure only for their own profiles", async () => {
    if (skipWhenPrivacyMigrationMissing()) return;
    const tenantSelf = await submitAs("tenantA1", {
      accountId: isolationFixtures.accounts.accountA.id,
      requestType: "tenant_data_erasure",
      scope: "tenant",
      targetTenantId: isolationFixtures.users.tenantA1.tenantId,
    });
    expect(tenantSelf.error).toBeNull();
    expect(tenantSelf.data.target_tenant_id).toBe(isolationFixtures.users.tenantA1.tenantId);

    const tenantForeign = await submitAs("tenantA1", {
      accountId: isolationFixtures.accounts.accountB.id,
      requestType: "tenant_data_erasure",
      scope: "tenant",
      targetTenantId: isolationFixtures.users.tenantB1.tenantId,
    });
    expect(tenantForeign.data ?? null).toBeNull();
    expect(String(tenantForeign.error?.message || "").toLowerCase()).toContain("access denied");

    const contractorSelf = await submitAs("contractorA1", {
      accountId: isolationFixtures.accounts.accountA.id,
      requestType: "contractor_data_erasure",
      scope: "contractor",
      targetContractorId: isolationFixtures.users.contractorA1.contractorId,
    });
    expect(contractorSelf.error).toBeNull();
    expect(contractorSelf.data.target_contractor_id).toBe(isolationFixtures.users.contractorA1.contractorId);

    const contractorForeign = await submitAs("contractorA1", {
      accountId: isolationFixtures.accounts.accountB.id,
      requestType: "contractor_data_erasure",
      scope: "contractor",
      targetContractorId: isolationFixtures.users.contractorB1.contractorId,
    });
    expect(contractorForeign.data ?? null).toBeNull();
    expect(String(contractorForeign.error?.message || "").toLowerCase()).toContain("access denied");
  });

  it("keeps processing logs hidden from staff while admin/root can review", async () => {
    if (skipWhenPrivacyMigrationMissing()) return;
    const request = await submitAs("ownerA", {
      accountId: isolationFixtures.accounts.accountA.id,
      requestType: "membership_removal",
      scope: "user",
      targetUserId: usersByKey.staffA.id,
    });
    expect(request.error).toBeNull();

    const { error: logError } = await admin.from("data_deletion_processing_log").insert({
      request_id: request.data.id,
      account_id: isolationFixtures.accounts.accountA.id,
      action: "retain_with_reason",
      entity_type: "finance_ledger",
      status: "completed",
      retention_reason: "Accounting retention test row",
    });
    expect(logError).toBeNull();

    const { client: staffClient } = await signInAsFixtureUser("staffA");
    const staffLog = await staffClient
      .from("data_deletion_processing_log")
      .select("id, request_id")
      .eq("request_id", request.data.id);
    expect(staffLog.error).toBeNull();
    expect(staffLog.data).toHaveLength(0);

    const { client: adminClient } = await signInAsFixtureUser("adminA");
    const adminLog = await adminClient
      .from("data_deletion_processing_log")
      .select("id, request_id")
      .eq("request_id", request.data.id);
    expect(adminLog.error).toBeNull();
    expect(adminLog.data).toHaveLength(1);
  });
});
