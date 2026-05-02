import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import {
  ensureIsolationHarnessSeed,
  getIntegrationAdminClient,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "./helpers/env.js";
import { expectAccessDenied } from "./helpers/rpcAssertions.js";

const notificationType = "integration_write_test";
const notificationTitle = "Integration write notification";

describe.skipIf(!isIntegrationHarnessConfigured())("create_notifications writes", () => {
  const admin = getIntegrationAdminClient();
  let seededUsers;

  async function deleteTestNotifications() {
    const { error } = await admin
      .from("notifications")
      .delete()
      .eq("account_id", isolationFixtures.accounts.accountA.id)
      .eq("type", notificationType)
      .eq("title", notificationTitle);

    if (error) throw error;
  }

  beforeAll(async () => {
    seededUsers = await ensureIsolationHarnessSeed();
  });

  afterEach(async () => {
    await deleteTestNotifications();
  });

  it("allows account A owner to create notifications only for seeded account A recipients", async () => {
    const { client } = await signInAsFixtureUser("ownerA");

    const result = await client.rpc("create_notifications", {
      p_account_id: isolationFixtures.accounts.accountA.id,
      p_recipient_user_ids: [
        seededUsers.staffA.id,
        seededUsers.tenantA1.id,
      ],
      p_type: notificationType,
      p_title: notificationTitle,
      p_body: "integration notification body",
      p_entity_type: "work_order",
      p_entity_id: null,
      p_link_path: "/integration-test",
      p_metadata: { source: "integration-test" },
    });

    expect(result.error).toBeNull();

    const { data, error } = await admin
      .from("notifications")
      .select("recipient_user_id, account_id, type, title, link_path")
      .eq("account_id", isolationFixtures.accounts.accountA.id)
      .eq("type", notificationType)
      .eq("title", notificationTitle)
      .order("recipient_user_id", { ascending: true });

    expect(error).toBeNull();
    expect(data).toHaveLength(2);
    expect(data.map((row) => row.recipient_user_id).sort()).toEqual([
      seededUsers.staffA.id,
      seededUsers.tenantA1.id,
    ].sort());
    expect(data.every((row) => row.account_id === isolationFixtures.accounts.accountA.id)).toBe(true);
    expect(data.every((row) => row.link_path === "/integration-test")).toBe(true);
  });

  it("denies owner A from creating notifications in account B", async () => {
    const { client } = await signInAsFixtureUser("ownerA");

    const result = await client.rpc("create_notifications", {
      p_account_id: isolationFixtures.accounts.accountB.id,
      p_recipient_user_ids: [seededUsers.ownerB.id],
      p_type: notificationType,
      p_title: notificationTitle,
      p_body: "integration notification body",
      p_metadata: { source: "integration-test" },
    });

    expectAccessDenied(result);
  });

  it("denies tenant A from creating account notifications", async () => {
    const { client } = await signInAsFixtureUser("tenantA1");

    const result = await client.rpc("create_notifications", {
      p_account_id: isolationFixtures.accounts.accountA.id,
      p_recipient_user_ids: [seededUsers.staffA.id],
      p_type: notificationType,
      p_title: notificationTitle,
      p_body: "integration notification body",
      p_metadata: { source: "integration-test" },
    });

    expectAccessDenied(result);
  });

  it("rejects foreign recipients and does not persist partial notification rows", async () => {
    const { client } = await signInAsFixtureUser("ownerA");

    const result = await client.rpc("create_notifications", {
      p_account_id: isolationFixtures.accounts.accountA.id,
      p_recipient_user_ids: [
        seededUsers.staffA.id,
        seededUsers.ownerB.id,
      ],
      p_type: notificationType,
      p_title: notificationTitle,
      p_body: "integration notification body",
      p_metadata: { source: "integration-test" },
    });

    expect(result.data ?? null).toBeNull();
    expect(String(result.error?.message || "").toLowerCase()).toContain("not part of this account");

    const { data, error } = await admin
      .from("notifications")
      .select("id")
      .eq("account_id", isolationFixtures.accounts.accountA.id)
      .eq("type", notificationType)
      .eq("title", notificationTitle);

    expect(error).toBeNull();
    expect(data || []).toEqual([]);
  });
});
