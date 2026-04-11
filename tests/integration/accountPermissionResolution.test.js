import { describe, expect, it } from "vitest";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import {
  ensureIsolationHarnessSeed,
  getIntegrationAdminClient,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "./helpers/env.js";

describe.skipIf(!isIntegrationHarnessConfigured())("account permission resolution", () => {
  const admin = getIntegrationAdminClient();

  it("returns seeded permission keys for existing roles", async () => {
    await ensureIsolationHarnessSeed();
    const { client } = await signInAsFixtureUser("staffA");

    const result = await client.rpc("account_member_permission_keys", {
      p_account_id: isolationFixtures.accounts.accountA.id,
    });

    expect(result.error).toBeNull();
    expect(result.data).toEqual(
      expect.arrayContaining([
        "documents.read",
        "documents.upload",
        "documents.tag",
        "finance.read",
        "properties.read",
        "tenants.read",
      ]),
    );
    expect(result.data).not.toContain("documents.delete");
  });

  it("resolves non-member manager access to false rather than a nullable allow", async () => {
    await ensureIsolationHarnessSeed();

    const { client: ownerClient } = await signInAsFixtureUser("ownerA");
    const ownerCrossAccountResult = await ownerClient.rpc("user_can_manage_account", {
      p_account_id: isolationFixtures.accounts.accountB.id,
    });

    expect(ownerCrossAccountResult.error).toBeNull();
    expect(ownerCrossAccountResult.data).toBe(false);

    const { client: tenantClient } = await signInAsFixtureUser("tenantA1");
    const tenantManagerResult = await tenantClient.rpc("user_can_manage_account", {
      p_account_id: isolationFixtures.accounts.accountA.id,
    });

    expect(tenantManagerResult.error).toBeNull();
    expect(tenantManagerResult.data).toBe(false);

    const { client: rootClient } = await signInAsFixtureUser("rootOwner");
    const rootResult = await rootClient.rpc("user_can_manage_account", {
      p_account_id: isolationFixtures.accounts.accountB.id,
    });

    expect(rootResult.error).toBeNull();
    expect(rootResult.data).toBe(true);
  });

  it("follows role_id-backed permissions when legacy role and role_id drift", async () => {
    const users = await ensureIsolationHarnessSeed();
    const accountId = isolationFixtures.accounts.accountA.id;
    const customRoleName = `custom-staff-drift-${Date.now()}`;

    const customRoleResult = await admin
      .from("roles")
      .insert({
        account_id: accountId,
        name: customRoleName,
      })
      .select("id")
      .single();

    expect(customRoleResult.error).toBeNull();

    const permissionInsertResult = await admin
      .from("role_permissions")
      .insert([
        { role_id: customRoleResult.data.id, permission_key: "finance.create" },
        { role_id: customRoleResult.data.id, permission_key: "properties.create" },
        { role_id: customRoleResult.data.id, permission_key: "tenants.create" },
      ]);

    expect(permissionInsertResult.error).toBeNull();

    const updateResult = await admin
      .from("account_members")
      .update({
        role_id: customRoleResult.data.id,
      })
      .eq("account_id", accountId)
      .eq("user_id", users.staffA.id);

    expect(updateResult.error).toBeNull();

    const membershipResult = await admin
      .from("account_members")
      .select("role, role_id")
      .eq("account_id", accountId)
      .eq("user_id", users.staffA.id)
      .single();

    expect(membershipResult.error).toBeNull();
    expect(membershipResult.data).toMatchObject({
      role: "staff",
      role_id: customRoleResult.data.id,
    });

    const customPermissionResult = await admin
      .from("role_permissions")
      .select("permission_key")
      .eq("role_id", customRoleResult.data.id)
      .order("permission_key", { ascending: true });

    expect(customPermissionResult.error).toBeNull();
    expect(customPermissionResult.data).toEqual([
      { permission_key: "finance.create" },
      { permission_key: "properties.create" },
      { permission_key: "tenants.create" },
    ]);

    const permissionResult = await admin.rpc("account_member_permission_keys", {
      p_account_id: accountId,
      p_user_id: users.staffA.id,
    });

    expect(permissionResult.error).toBeNull();
    expect(permissionResult.data).toEqual(
      expect.arrayContaining([
        "finance.create",
        "properties.create",
        "tenants.create",
      ]),
    );
    expect(permissionResult.data).not.toContain("documents.delete");

    const restoreResult = await admin
      .from("account_members")
      .update({ role: "staff", role_id: null })
      .eq("account_id", accountId)
      .eq("user_id", users.staffA.id);

    expect(restoreResult.error).toBeNull();
  });
});
