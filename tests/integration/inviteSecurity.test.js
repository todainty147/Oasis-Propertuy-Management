import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

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

describe.skipIf(!isIntegrationHarnessConfigured())("invite lifecycle security", () => {
  const admin = getIntegrationAdminClient();
  const createdInviteIds = new Set();
  let seededUsers;

  async function insertInviteAsActor(
    fixtureKey,
    {
      accountId = isolationFixtures.accounts.accountA.id,
      email = `invite-${randomUUID()}@oasis.test`,
      role = "staff",
      token = `invite-token-${randomUUID()}`,
    } = {},
  ) {
    const { client } = await signInAsFixtureUser(fixtureKey);
    const result = await client
      .from("account_invitations")
      .insert({
        account_id: accountId,
        email,
        role,
        token,
      })
      .select("id, account_id, email, role, token, invited_by, accepted_at, revoked_at")
      .single();

    if (!result.error && result.data?.id) createdInviteIds.add(result.data.id);
    return result;
  }

  async function insertInviteAsAdmin({
    accountId = isolationFixtures.accounts.accountA.id,
    email = `invite-${randomUUID()}@oasis.test`,
    role = "staff",
    token = `invite-token-${randomUUID()}`,
    invitedBy = null,
    revokedAt = null,
  } = {}) {
    const { data, error } = await admin
      .from("account_invitations")
      .insert({
        id: randomUUID(),
        account_id: accountId,
        email,
        role,
        token,
        invited_by: invitedBy,
        revoked_at: revokedAt,
      })
      .select("id, account_id, email, role, token, invited_by, accepted_at, revoked_at")
      .single();

    if (error) throw error;
    createdInviteIds.add(data.id);
    return data;
  }

  async function getInvite(inviteId) {
    const { data, error } = await admin
      .from("account_invitations")
      .select("id, account_id, email, role, invited_by, accepted_at, revoked_at")
      .eq("id", inviteId)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  beforeAll(async () => {
    seededUsers = await ensureIsolationHarnessSeed();
  });

  afterEach(async () => {
    if (createdInviteIds.size === 0) return;
    const ids = Array.from(createdInviteIds);
    createdInviteIds.clear();

    const { error } = await admin.from("account_invitations").delete().in("id", ids);
    if (error) throw error;
  });

  it("allows in-account authorized invite creation and pending invite listing", async () => {
    const email = `owner-create-${randomUUID()}@oasis.test`;
    const result = await insertInviteAsActor("ownerA", {
      email,
      role: "staff",
    });

    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({
      account_id: isolationFixtures.accounts.accountA.id,
      email,
      role: "staff",
      accepted_at: null,
      revoked_at: null,
      invited_by: seededUsers.ownerA.id,
    });

    const { client } = await signInAsFixtureUser("ownerA");
    const { data: visibleRows, error: listError } = await client
      .from("account_invitations")
      .select("id, account_id, email, role, revoked_at, accepted_at")
      .eq("account_id", isolationFixtures.accounts.accountA.id);

    expect(listError).toBeNull();
    expect((visibleRows || []).some((row) => row.id === result.data.id)).toBe(true);
  });

  it("denies cross-account invite creation", async () => {
    const result = await insertInviteAsActor("ownerA", {
      accountId: isolationFixtures.accounts.accountB.id,
      email: `cross-account-${randomUUID()}@oasis.test`,
      role: "staff",
    });

    expectDeniedOrNoRows(result);
  });

  it("denies unauthorized role invite creation", async () => {
    const tenantResult = await insertInviteAsActor("tenantA1", {
      email: `tenant-attempt-${randomUUID()}@oasis.test`,
      role: "staff",
    });
    expectDeniedOrNoRows(tenantResult);

    const contractorResult = await insertInviteAsActor("contractorA1", {
      email: `contractor-attempt-${randomUUID()}@oasis.test`,
      role: "staff",
    });
    expectDeniedOrNoRows(contractorResult);
  });

  it("allows in-account authorized revoke and denies cross-account revoke", async () => {
    const invite = await insertInviteAsAdmin({
      accountId: isolationFixtures.accounts.accountA.id,
      email: `revoke-allowed-${randomUUID()}@oasis.test`,
      role: "staff",
      invitedBy: seededUsers.ownerA.id,
    });

    const { client: adminClient } = await signInAsFixtureUser("adminA");
    const allowedRevoke = await adminClient
      .from("account_invitations")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", invite.id)
      .eq("account_id", isolationFixtures.accounts.accountA.id)
      .select("id, revoked_at")
      .single();

    expect(allowedRevoke.error).toBeNull();
    expect(allowedRevoke.data.id).toBe(invite.id);
    expect(allowedRevoke.data.revoked_at).toBeTruthy();

    const foreignInvite = await insertInviteAsAdmin({
      accountId: isolationFixtures.accounts.accountB.id,
      email: `revoke-denied-${randomUUID()}@oasis.test`,
      role: "staff",
      invitedBy: seededUsers.ownerB.id,
    });

    const deniedRevoke = await adminClient
      .from("account_invitations")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", foreignInvite.id)
      .eq("account_id", isolationFixtures.accounts.accountB.id)
      .select("id, revoked_at");

    expectDeniedOrNoRows(deniedRevoke);

    const unchanged = await getInvite(foreignInvite.id);
    expect(unchanged.revoked_at).toBeNull();
  });

  it("uses effective role resolution for invite authorization when legacy role and role_id drift", async () => {
    const accountId = isolationFixtures.accounts.accountA.id;
    const adminRoleLookup = await admin
      .from("roles")
      .select("id, name")
      .eq("account_id", accountId)
      .eq("name", "admin")
      .single();

    if (adminRoleLookup.error) throw adminRoleLookup.error;

    const targetUserId = seededUsers.adminA.id;
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
      .update({ role: "staff" })
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
      const result = await insertInviteAsActor("adminA", {
        accountId,
        email: `effective-role-${randomUUID()}@oasis.test`,
        role: "admin",
      });

      expect(result.error).toBeNull();
      expect(result.data).toMatchObject({
        account_id: accountId,
        role: "admin",
        invited_by: targetUserId,
      });
    } finally {
      await restoreMembership();
    }
  });

  it("enforces eligibility rules for duplicate, already-member, and revoked-then-eligible cases", async () => {
    const duplicateEmail = `duplicate-${randomUUID()}@oasis.test`;
    await insertInviteAsAdmin({
      accountId: isolationFixtures.accounts.accountA.id,
      email: duplicateEmail,
      role: "staff",
      invitedBy: seededUsers.ownerA.id,
    });

    const { client } = await signInAsFixtureUser("ownerA");
    const duplicateEligibility = await client.rpc("check_account_invitation_eligibility", {
      p_account_id: isolationFixtures.accounts.accountA.id,
      p_email: duplicateEmail,
      p_role: "staff",
    });

    expect(duplicateEligibility.error).toBeNull();
    expect(duplicateEligibility.data).toMatchObject({
      ok: false,
      code: "active_invite_exists",
    });

    const memberEligibility = await client.rpc("check_account_invitation_eligibility", {
      p_account_id: isolationFixtures.accounts.accountA.id,
      p_email: isolationFixtures.users.staffA.email,
      p_role: "staff",
    });

    expect(memberEligibility.error).toBeNull();
    expect(memberEligibility.data).toMatchObject({
      ok: false,
      code: "already_member",
    });

    const revokedEmail = `revoked-eligible-${randomUUID()}@oasis.test`;
    await insertInviteAsAdmin({
      accountId: isolationFixtures.accounts.accountA.id,
      email: revokedEmail,
      role: "staff",
      invitedBy: seededUsers.ownerA.id,
      revokedAt: new Date().toISOString(),
    });

    const revokedEligibility = await client.rpc("check_account_invitation_eligibility", {
      p_account_id: isolationFixtures.accounts.accountA.id,
      p_email: revokedEmail,
      p_role: "staff",
    });

    expect(revokedEligibility.error).toBeNull();
    expect(revokedEligibility.data).toMatchObject({
      ok: true,
      code: "ok",
      normalized_email: revokedEmail,
      normalized_role: "staff",
    });
  });

  it("uses effective role resolution for invite eligibility when legacy role and role_id drift", async () => {
    const accountId = isolationFixtures.accounts.accountA.id;
    const adminRoleLookup = await admin
      .from("roles")
      .select("id, name")
      .eq("account_id", accountId)
      .eq("name", "admin")
      .single();

    if (adminRoleLookup.error) throw adminRoleLookup.error;

    const targetUserId = seededUsers.adminA.id;
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
      .update({ role: "staff" })
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
      const eligibility = await client.rpc("check_account_invitation_eligibility", {
        p_account_id: accountId,
        p_email: `eligibility-effective-${randomUUID()}@oasis.test`,
        p_role: "admin",
      });

      expect(eligibility.error).toBeNull();
      expect(eligibility.data).toMatchObject({
        ok: true,
        code: "ok",
        normalized_role: "admin",
      });
    } finally {
      await restoreMembership();
    }
  });

  it("uses effective role resolution for invitation reads when legacy role and role_id drift", async () => {
    const accountId = isolationFixtures.accounts.accountA.id;
    const adminRoleLookup = await admin
      .from("roles")
      .select("id, name")
      .eq("account_id", accountId)
      .eq("name", "admin")
      .single();

    if (adminRoleLookup.error) throw adminRoleLookup.error;

    const invite = await insertInviteAsAdmin({
      accountId,
      email: `read-effective-${randomUUID()}@oasis.test`,
      role: "staff",
      invitedBy: seededUsers.ownerA.id,
    });

    const targetUserId = seededUsers.adminA.id;
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
      const listResult = await client
        .from("account_invitations")
        .select("id, account_id")
        .eq("account_id", accountId);

      expect(listResult.error).toBeNull();
      expect((listResult.data || []).some((row) => row.id === invite.id)).toBe(true);
    } finally {
      await restoreMembership();
    }
  });

  it("keeps pending invite visibility account-scoped", async () => {
    const inviteA = await insertInviteAsAdmin({
      accountId: isolationFixtures.accounts.accountA.id,
      email: `account-a-${randomUUID()}@oasis.test`,
      role: "staff",
      invitedBy: seededUsers.ownerA.id,
    });
    const inviteB = await insertInviteAsAdmin({
      accountId: isolationFixtures.accounts.accountB.id,
      email: `account-b-${randomUUID()}@oasis.test`,
      role: "staff",
      invitedBy: seededUsers.ownerB.id,
    });

    const { client: ownerAClient } = await signInAsFixtureUser("ownerA");
    const ownerAList = await ownerAClient
      .from("account_invitations")
      .select("id, account_id")
      .eq("account_id", isolationFixtures.accounts.accountA.id);

    expect(ownerAList.error).toBeNull();
    expect((ownerAList.data || []).some((row) => row.id === inviteA.id)).toBe(true);
    expect((ownerAList.data || []).some((row) => row.id === inviteB.id)).toBe(false);

    const ownerAForeignList = await ownerAClient
      .from("account_invitations")
      .select("id, account_id")
      .eq("account_id", isolationFixtures.accounts.accountB.id);

    expect(ownerAForeignList.error).toBeNull();
    expect(ownerAForeignList.data || []).toEqual([]);

    const { client: tenantClient } = await signInAsFixtureUser("tenantA1");
    const tenantList = await tenantClient
      .from("account_invitations")
      .select("id, account_id")
      .eq("account_id", isolationFixtures.accounts.accountA.id);

    expect(tenantList.error).toBeNull();
    expect(tenantList.data || []).toEqual([]);
  });
});
