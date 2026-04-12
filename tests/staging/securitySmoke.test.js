import { describe, expect, it } from "vitest";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import { isStagingSmokeConfigured } from "./helpers/env.js";
import { signInAsStagingFixtureUser } from "./helpers/stagingHarness.js";

describe.skipIf(!isStagingSmokeConfigured())("staging security smoke", () => {
  it("allows in-account staff to read only their own account command center items", async () => {
    const { client } = await signInAsStagingFixtureUser("staffA");

    const result = await client.rpc("command_center_items", {
      p_account_id: isolationFixtures.accounts.accountA.id,
      p_limit: 10,
    });

    expect(result.error).toBeNull();
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeGreaterThan(0);
    expect(result.data.every((row) => row.property_label !== "22 Harbor View Road")).toBe(true);
  });

  it("allows tenant A to read only their own tenant-scoped dashboard", async () => {
    const { client } = await signInAsStagingFixtureUser("tenantA1");

    const result = await client.rpc("dashboard_snapshot", {
      p_account_id: isolationFixtures.accounts.accountA.id,
      p_tenant_id: isolationFixtures.users.tenantA1.tenantId,
      p_horizon_days: 7,
    });

    expect(result.error).toBeNull();
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(Number(result.data[0].property_count)).toBe(1);
  });

  it("allows the assigned contractor to access only their contractor work order card", async () => {
    const { client } = await signInAsStagingFixtureUser("contractorA1");

    const result = await client.rpc("contractor_work_order_cards", {
      p_work_order_ids: null,
    });

    expect(result.error).toBeNull();
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].work_order_id).toBe("88888888-8888-8888-8888-888888888881");
  });

  it("allows in-account owner document reads without leaking cross-account rows", async () => {
    const { client } = await signInAsStagingFixtureUser("ownerA");

    const result = await client
      .from("documents")
      .select("id, account_id, visibility, scope")
      .eq("account_id", isolationFixtures.accounts.accountA.id)
      .limit(10);

    expect(result.error).toBeNull();
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.every((row) => row.account_id === isolationFixtures.accounts.accountA.id)).toBe(true);
  });

  it("denies tenant A from using account-level notification writes", async () => {
    const { client } = await signInAsStagingFixtureUser("tenantA1");

    const result = await client.rpc("create_notifications", {
      p_account_id: isolationFixtures.accounts.accountA.id,
      p_recipient_user_ids: ["a5a1a382-3940-4f1c-834a-1785f3106a88"],
      p_type: "staging_smoke",
      p_title: "staging smoke",
      p_body: "staging smoke",
      p_metadata: { source: "staging-smoke" },
    });

    expect(result.data ?? null).toBeNull();
    const message = String(result.error?.message || "").toLowerCase();
    expect(
      message.includes("access denied") ||
        message.includes("recipients are not part of this account"),
    ).toBe(true);
  });

  it("rejects an invalid invite token without granting membership", async () => {
    const { client } = await signInAsStagingFixtureUser("ownerB");

    const result = await client.rpc("accept_account_invite", {
      invite_token: "staging-smoke-invalid-token",
    });

    expect(result.data ?? null).toBeNull();
    expect(String(result.error?.message || "").toLowerCase()).toContain("invitation not found");
  });
});
