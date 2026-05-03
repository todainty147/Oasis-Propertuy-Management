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

function expectExportDenied(result) {
  expect(result.data ?? null).toBeNull();
  const message = String(result.error?.message || "").toLowerCase();
  expect(
    message.includes("access denied") ||
      message.includes("unauthorized account access") ||
      message.includes("violates row-level security") ||
      message.includes("unsupported export format"),
  ).toBe(true);
}

describe.skipIf(!isIntegrationHarnessConfigured())("security audit export requests", () => {
  const admin = getIntegrationAdminClient();
  const createdJobIds = new Set();
  let seededUsers;

  beforeAll(async () => {
    seededUsers = await ensureIsolationHarnessSeed();
  });

  afterEach(async () => {
    if (createdJobIds.size === 0) return;

    const ids = Array.from(createdJobIds);
    createdJobIds.clear();

    const { error } = await admin.from("security_audit_export_jobs").delete().in("id", ids);
    expect(error).toBeNull();
  });

  async function requestExport(actorKey, overrides = {}) {
    const { client, user } = await signInAsFixtureUser(actorKey);
    const result = await client.rpc("request_security_audit_export", {
      p_account_id: isolationFixtures.accounts.accountA.id,
      p_filter_criteria: {
        action: "role_changed",
        entityType: "account_member",
        actorUserId: seededUsers.ownerA.id,
      },
      p_format: "csv",
      p_retention_days: 90,
      p_requested_label: `Launch Audit ${randomUUID()} with intentionally long label text`,
      ...overrides,
    });

    if (!result.error && result.data?.id) {
      createdJobIds.add(result.data.id);
    }

    return { result, user, client };
  }

  it("allows account managers to queue normalized export jobs in their account scope", async () => {
    const { result, user } = await requestExport("staffA");

    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({
      account_id: isolationFixtures.accounts.accountA.id,
      requested_by_user_id: user.id,
      export_kind: "security_audit_csv",
      format: "csv",
      status: "queued",
    });
    expect(result.data.requested_label.length).toBeLessThanOrEqual(80);
    expect(result.data.filter_criteria).toMatchObject({
      action: "role_changed",
      entityType: "account_member",
      actorUserId: seededUsers.ownerA.id,
    });

    const createdAt = new Date(result.data.created_at).getTime();
    const expiresAt = new Date(result.data.expires_at).getTime();
    const retentionDays = Math.round((expiresAt - createdAt) / 86_400_000);
    expect(retentionDays).toBe(30);

    const persisted = await admin
      .from("security_audit_export_jobs")
      .select("id, account_id, requested_by_user_id, status, requested_label")
      .eq("id", result.data.id)
      .single();

    expect(persisted.error).toBeNull();
    expect(persisted.data).toMatchObject({
      id: result.data.id,
      account_id: isolationFixtures.accounts.accountA.id,
      requested_by_user_id: user.id,
      status: "queued",
    });
  });

  it("keeps export job reads account scoped under table RLS", async () => {
    const { result } = await requestExport("ownerA");
    expect(result.error).toBeNull();

    const { client: ownerAClient } = await signInAsFixtureUser("ownerA");
    const ownRead = await ownerAClient
      .from("security_audit_export_jobs")
      .select("id, account_id")
      .eq("id", result.data.id);

    expect(ownRead.error).toBeNull();
    expect(ownRead.data).toHaveLength(1);
    expect(ownRead.data[0]).toMatchObject({
      id: result.data.id,
      account_id: isolationFixtures.accounts.accountA.id,
    });

    const { client: ownerBClient } = await signInAsFixtureUser("ownerB");
    const foreignRead = await ownerBClient
      .from("security_audit_export_jobs")
      .select("id, account_id")
      .eq("id", result.data.id);

    expect(foreignRead.error).toBeNull();
    expect(foreignRead.data).toEqual([]);
  });

  it("denies cross-account and non-manager export requests", async () => {
    const { client: ownerAClient } = await signInAsFixtureUser("ownerA");
    const crossAccount = await ownerAClient.rpc("request_security_audit_export", {
      p_account_id: isolationFixtures.accounts.accountB.id,
      p_filter_criteria: {},
      p_format: "csv",
      p_retention_days: 14,
      p_requested_label: "cross account attempt",
    });

    expectAccessDenied(crossAccount);

    const { result: tenantResult } = await requestExport("tenantA1");
    expectAccessDenied(tenantResult);

    const { result: contractorResult } = await requestExport("contractorA1");
    expectAccessDenied(contractorResult);
  });

  it("denies unsupported formats before creating export jobs", async () => {
    const before = await admin
      .from("security_audit_export_jobs")
      .select("id", { count: "exact", head: true })
      .eq("account_id", isolationFixtures.accounts.accountA.id);
    expect(before.error).toBeNull();

    const { result } = await requestExport("ownerA", {
      p_format: "json",
      p_requested_label: "unsupported format",
    });

    expectExportDenied(result);

    const after = await admin
      .from("security_audit_export_jobs")
      .select("id", { count: "exact", head: true })
      .eq("account_id", isolationFixtures.accounts.accountA.id);
    expect(after.error).toBeNull();
    expect(after.count).toBe(before.count);
  });

  it("denies direct table inserts that spoof the requester", async () => {
    const { client } = await signInAsFixtureUser("ownerA");
    const spoofedId = randomUUID();

    const spoofedInsert = await client.from("security_audit_export_jobs").insert({
      id: spoofedId,
      account_id: isolationFixtures.accounts.accountA.id,
      requested_by_user_id: seededUsers.ownerB.id,
      export_kind: "security_audit_csv",
      format: "csv",
      status: "queued",
      filter_criteria: {},
    });

    expectExportDenied(spoofedInsert);

    const lookup = await admin
      .from("security_audit_export_jobs")
      .select("id")
      .eq("id", spoofedId);

    expect(lookup.error).toBeNull();
    expect(lookup.data).toEqual([]);
  });
});
