import { describe, expect, it } from "vitest";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import {
  ensureIsolationHarnessSeed,
  getIntegrationAdminClient,
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

describe.skipIf(!isIntegrationHarnessConfigured())("account report settings security", () => {
  const admin = getIntegrationAdminClient();

  it("allows managers to upsert and read account report settings", async () => {
    await ensureIsolationHarnessSeed();
    const accountId = isolationFixtures.accounts.accountA.id;
    const { client } = await signInAsFixtureUser("adminA");

    const upsertResult = await client
      .from("account_report_settings")
      .upsert({
        account_id: accountId,
        weekly_summary_enabled: true,
        weekly_summary_day: 2,
        weekly_summary_hour: 9,
        timezone: "Europe/London",
      }, { onConflict: "account_id" })
      .select("account_id, weekly_summary_enabled, weekly_summary_day, weekly_summary_hour, timezone")
      .single();

    expect(upsertResult.error).toBeNull();
    expect(upsertResult.data).toMatchObject({
      account_id: accountId,
      weekly_summary_enabled: true,
      weekly_summary_day: 2,
      weekly_summary_hour: 9,
      timezone: "Europe/London",
    });

    const readResult = await client
      .from("account_report_settings")
      .select("account_id, weekly_summary_enabled, weekly_summary_day, weekly_summary_hour, timezone")
      .eq("account_id", accountId)
      .maybeSingle();

    expect(readResult.error).toBeNull();
    expect(readResult.data).toMatchObject({
      account_id: accountId,
      weekly_summary_enabled: true,
      weekly_summary_day: 2,
      weekly_summary_hour: 9,
      timezone: "Europe/London",
    });
  });

  it("denies tenants from upserting account report settings", async () => {
    await ensureIsolationHarnessSeed();
    const accountId = isolationFixtures.accounts.accountA.id;
    const { client } = await signInAsFixtureUser("tenantA1");

    const result = await client
      .from("account_report_settings")
      .upsert({
        account_id: accountId,
        weekly_summary_enabled: true,
        weekly_summary_day: 3,
        weekly_summary_hour: 10,
        timezone: "Europe/London",
      }, { onConflict: "account_id" })
      .select("account_id");

    expectDeniedOrNoRows(result);
  });

  it("uses effective role resolution for report settings writes when legacy role and role_id drift", async () => {
    const users = await ensureIsolationHarnessSeed();
    const accountId = isolationFixtures.accounts.accountA.id;
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
      const upsertResult = await client
        .from("account_report_settings")
        .upsert({
          account_id: accountId,
          weekly_summary_enabled: false,
          weekly_summary_day: 4,
          weekly_summary_hour: 11,
          timezone: "UTC",
        }, { onConflict: "account_id" })
        .select("account_id, weekly_summary_enabled, weekly_summary_day, weekly_summary_hour, timezone")
        .single();

      expect(upsertResult.error).toBeNull();
      expect(upsertResult.data).toMatchObject({
        account_id: accountId,
        weekly_summary_enabled: false,
        weekly_summary_day: 4,
        weekly_summary_hour: 11,
        timezone: "UTC",
      });
    } finally {
      await restoreMembership();
    }
  });
});
