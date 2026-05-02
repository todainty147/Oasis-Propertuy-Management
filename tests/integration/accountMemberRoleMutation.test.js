import { describe, expect, it } from "vitest";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import {
  ensureIsolationHarnessSeed,
  getIntegrationAdminClient,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "./helpers/env.js";

describe.skipIf(!isIntegrationHarnessConfigured())("account member role mutation", () => {
  const admin = getIntegrationAdminClient();

  async function readMembership(accountId, userId) {
    const membershipResult = await admin
      .from("account_members")
      .select("account_id, user_id, role, role_id")
      .eq("account_id", accountId)
      .eq("user_id", userId)
      .single();

    expect(membershipResult.error).toBeNull();

    const membership = membershipResult.data;
    let roleRecord = null;

    if (membership.role_id) {
      const roleResult = await admin
        .from("roles")
        .select("name")
        .eq("id", membership.role_id)
        .single();

      expect(roleResult.error).toBeNull();
      roleRecord = roleResult.data;
    }

    return {
      ...membership,
      role_record: roleRecord,
    };
  }

  it("keeps account_members.role and role_id synchronized when an owner changes a member role", async () => {
    const users = await ensureIsolationHarnessSeed();
    const { client } = await signInAsFixtureUser("ownerA");
    const accountId = isolationFixtures.accounts.accountA.id;
    const targetUserId = users.staffA.id;

    const initialMembership = await readMembership(accountId, targetUserId);
    expect(initialMembership.role).toBe("staff");
    expect(initialMembership.role_id).toBeTruthy();

    const promoteResult = await client.rpc("account_member_set_role", {
      p_account_id: accountId,
      p_target_user_id: targetUserId,
      p_new_role: "admin",
    });

    expect(promoteResult.error).toBeNull();
    expect(promoteResult.data).toMatchObject({
      ok: true,
      account_id: accountId,
      user_id: targetUserId,
      old_role: "staff",
      role: "admin",
      changed: true,
    });

    const promotedMembership = await readMembership(accountId, targetUserId);
    expect(promotedMembership.role).toBe("admin");
    expect(promotedMembership.role_id).toBeTruthy();
    expect(promotedMembership.role_record).toMatchObject({
      name: "admin",
    });

    const demoteResult = await client.rpc("account_member_set_role", {
      p_account_id: accountId,
      p_target_user_id: targetUserId,
      p_new_role: "staff",
    });

    expect(demoteResult.error).toBeNull();
    expect(demoteResult.data).toMatchObject({
      ok: true,
      account_id: accountId,
      user_id: targetUserId,
      old_role: "admin",
      role: "staff",
      changed: true,
    });

    const restoredMembership = await readMembership(accountId, targetUserId);
    expect(restoredMembership.role).toBe("staff");
    expect(restoredMembership.role_id).toBeTruthy();
    expect(restoredMembership.role_record).toMatchObject({
      name: "staff",
    });
  });

  it("preserves existing permission checks when a staff user attempts a forbidden role escalation", async () => {
    const users = await ensureIsolationHarnessSeed();
    const { client } = await signInAsFixtureUser("staffA");
    const result = await client.rpc("account_member_set_role", {
      p_account_id: isolationFixtures.accounts.accountA.id,
      p_target_user_id: users.adminA.id,
      p_new_role: "owner",
    });

    expect(result.error).toBeTruthy();
    const deniedMessage = String(result.error?.message || "").toLowerCase();
    expect(
      deniedMessage.includes("access denied") ||
        deniedMessage.includes("insufficient permission") ||
        deniedMessage.includes("permission") ||
        deniedMessage.includes("not a manager") ||
        deniedMessage.includes("unauthorized account access") ||
        deniedMessage.includes("unauthorized"),
    ).toBe(true);
  });
});
