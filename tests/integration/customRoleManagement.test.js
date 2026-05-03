import { describe, expect, it } from "vitest";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import {
  ensureIsolationHarnessSeed,
  getIntegrationAdminClient,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "./helpers/env.js";

function firstRow(data) {
  return Array.isArray(data) ? data[0] ?? null : data ?? null;
}

describe.skipIf(!isIntegrationHarnessConfigured())("custom role management", () => {
  const admin = getIntegrationAdminClient();

  it("lets an owner create a custom role, update permissions, assign it to a user, and resolve dynamic permissions", async () => {
    const users = await ensureIsolationHarnessSeed();
    const { client } = await signInAsFixtureUser("ownerA");
    const accountId = isolationFixtures.accounts.accountA.id;
    const roleName = `leasing-coordinator-${Date.now()}`;

    const createResult = await client.rpc("create_account_role", {
      p_account_id: accountId,
      p_name: roleName,
      p_permission_keys: ["documents.read", "documents.tag", "users.invite"],
    });

    expect(createResult.error).toBeNull();
    const createdRole = firstRow(createResult.data);
    expect(createdRole).toMatchObject({
      name: roleName,
      is_system: false,
    });
    expect(createdRole.permission_keys).toEqual(
      expect.arrayContaining(["documents.read", "documents.tag", "users.invite"]),
    );

    const updateResult = await client.rpc("update_account_role_permissions", {
      p_account_id: accountId,
      p_role_id: createdRole.role_id,
      p_permission_keys: ["documents.read", "documents.tag", "finance.read", "users.invite"],
    });

    expect(updateResult.error).toBeNull();
    const updatedRole = firstRow(updateResult.data);
    expect(updatedRole.permission_keys).toEqual(
      expect.arrayContaining(["documents.read", "documents.tag", "finance.read", "users.invite"]),
    );
    expect(updatedRole.permission_keys).not.toContain("documents.delete");

    const assignResult = await client.rpc("assign_account_member_role_id", {
      p_account_id: accountId,
      p_target_user_id: users.staffA.id,
      p_role_id: createdRole.role_id,
    });

    expect(assignResult.error).toBeNull();
    const assignedMembership = firstRow(assignResult.data);
    expect(assignedMembership).toMatchObject({
      ok: true,
      account_id: accountId,
      user_id: users.staffA.id,
      legacy_role: "staff",
      role_id: createdRole.role_id,
      role_name: roleName,
    });

    const rolesResult = await client.rpc("list_account_roles", {
      p_account_id: accountId,
    });

    expect(rolesResult.error).toBeNull();
    expect(rolesResult.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: roleName,
          is_system: false,
        }),
      ]),
    );

    const membersResult = await client.rpc("list_account_members_for_role_assignment", {
      p_account_id: accountId,
    });

    expect(membersResult.error).toBeNull();
    expect(membersResult.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          user_id: users.staffA.id,
          legacy_role: "staff",
          role_id: createdRole.role_id,
          role_name: roleName,
        }),
      ]),
    );

    const permissionKeysResult = await admin.rpc("account_member_permission_keys", {
      p_account_id: accountId,
      p_user_id: users.staffA.id,
    });

    expect(permissionKeysResult.error).toBeNull();
    expect(permissionKeysResult.data).toEqual(
      expect.arrayContaining(["documents.read", "documents.tag", "finance.read", "users.invite"]),
    );
    expect(permissionKeysResult.data).not.toContain("properties.delete");

    const effectiveRoleResult = await admin.rpc("account_member_effective_role", {
      p_account_id: accountId,
      p_user_id: users.staffA.id,
    });

    expect(effectiveRoleResult.error).toBeNull();
    expect(effectiveRoleResult.data).toBe("staff");

    const restoreResult = await admin
      .from("account_members")
      .update({ role_id: null })
      .eq("account_id", accountId)
      .eq("user_id", users.staffA.id);

    expect(restoreResult.error).toBeNull();
  });

  it("lets root manage custom roles inside a selected tenant account", async () => {
    await ensureIsolationHarnessSeed();
    const { client } = await signInAsFixtureUser("rootOwner");
    const accountId = isolationFixtures.accounts.accountB.id;
    const roleName = `root-managed-${Date.now()}`;

    const createResult = await client.rpc("create_account_role", {
      p_account_id: accountId,
      p_name: roleName,
      p_permission_keys: ["properties.read", "tenants.read"],
    });

    expect(createResult.error).toBeNull();

    const listResult = await client.rpc("list_account_roles", {
      p_account_id: accountId,
    });

    expect(listResult.error).toBeNull();
    expect(listResult.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: roleName,
          is_system: false,
        }),
      ]),
    );
  });
});
