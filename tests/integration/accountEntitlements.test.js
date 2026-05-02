import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";

import {
  ensureIsolationHarnessSeed,
  getIntegrationAdminClient,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "./helpers/env.js";

describe.skipIf(!isIntegrationHarnessConfigured())("account entitlement feature gates", () => {
  const admin = getIntegrationAdminClient();
  let seededUsers;

  beforeAll(async () => {
    seededUsers = await ensureIsolationHarnessSeed();
  });

  it("lets root operators bypass account plan feature gates while ordinary owners remain plan-gated", async () => {
    const starterAccountId = randomUUID();

    try {
      const { error: accountError } = await admin.from("accounts").insert({
        id: starterAccountId,
        name: "Starter entitlement gate fixture",
        created_by: seededUsers.ownerA.id,
        is_root: false,
        is_disabled: false,
        subscription_status: "active",
        subscription_plan: "starter",
      });
      expect(accountError).toBeNull();

      const { error: membershipError } = await admin.from("account_members").insert({
        account_id: starterAccountId,
        user_id: seededUsers.ownerA.id,
        role: "owner",
      });
      expect(membershipError).toBeNull();

      const { client: rootClient } = await signInAsFixtureUser("rootOwner");
      const rootResult = await rootClient.rpc("assert_account_feature_access", {
        p_account_id: starterAccountId,
        p_feature: "portfolio_health",
      });

      expect(rootResult.error).toBeNull();
      expect(rootResult.data).toBe(starterAccountId);

      const { client: ownerClient } = await signInAsFixtureUser("ownerA");
      const ownerResult = await ownerClient.rpc("assert_account_feature_access", {
        p_account_id: starterAccountId,
        p_feature: "portfolio_health",
      });

      expect(ownerResult.error).toBeTruthy();
      expect(String(ownerResult.error?.message || "").toLowerCase()).toContain("requires growth plan");
    } finally {
      await admin.from("account_members").delete().eq("account_id", starterAccountId);
      await admin.from("accounts").delete().eq("id", starterAccountId);
    }
  });
});
