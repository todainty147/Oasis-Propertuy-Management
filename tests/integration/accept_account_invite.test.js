import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import {
  ensureIsolationHarnessSeed,
  getIntegrationAdminClient,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "./helpers/env.js";

describe.skipIf(!isIntegrationHarnessConfigured())("accept_account_invite membership security", () => {
  const admin = getIntegrationAdminClient();
  const createdInviteIds = new Set();
  let seededUsers;

  async function insertInvite({
    accountId = isolationFixtures.accounts.accountA.id,
    email,
    role = "staff",
    token = `integration-invite-${randomUUID()}`,
    invitedBy = null,
    acceptedAt = null,
    acceptedBy = null,
    revokedAt = null,
    expiresAt = null,
  } = {}) {
    const row = {
      id: randomUUID(),
      account_id: accountId,
      email,
      role,
      token,
      invited_by: invitedBy,
      accepted_at: acceptedAt,
      accepted_by: acceptedBy,
      revoked_at: revokedAt,
    };

    if (expiresAt) row.expires_at = expiresAt;

    const { data, error } = await admin
      .from("account_invitations")
      .insert(row)
      .select("id, account_id, email, role, token, accepted_at, accepted_by, revoked_at")
      .single();

    if (error) throw error;
    createdInviteIds.add(data.id);
    return data;
  }

  async function getMembership(accountId, userId) {
    const { data, error } = await admin
      .from("account_members")
      .select("account_id, user_id, role")
      .eq("account_id", accountId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  async function countMemberships(accountId, userId) {
    const { count, error } = await admin
      .from("account_members")
      .select("account_id", { count: "exact", head: true })
      .eq("account_id", accountId)
      .eq("user_id", userId);

    if (error) throw error;
    return count ?? 0;
  }

  async function getTenantByUser(accountId, userId) {
    const { data, error } = await admin
      .from("tenants")
      .select("id, account_id, email, user_id, status, property_id")
      .eq("account_id", accountId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  async function getInvite(inviteId) {
    const { data, error } = await admin
      .from("account_invitations")
      .select("id, account_id, email, role, accepted_at, accepted_by, revoked_at")
      .eq("id", inviteId)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  beforeAll(async () => {
    seededUsers = await ensureIsolationHarnessSeed();
  });

  afterEach(async () => {
    if (createdInviteIds.size > 0) {
      const ids = Array.from(createdInviteIds);
      createdInviteIds.clear();

      const { error } = await admin.from("account_invitations").delete().in("id", ids);
      if (error) throw error;
    }

    const cleanupUserIds = [seededUsers.ownerB.id, seededUsers.staffB.id];
    const { error: tenantError } = await admin
      .from("tenants")
      .delete()
      .eq("account_id", isolationFixtures.accounts.accountA.id)
      .in("user_id", cleanupUserIds);

    if (tenantError) throw tenantError;

    const { error: membershipError } = await admin
      .from("account_members")
      .delete()
      .eq("account_id", isolationFixtures.accounts.accountA.id)
      .in("user_id", cleanupUserIds);

    if (membershipError) throw membershipError;
  });

  it("accepts a valid invite and creates only the intended account-scoped membership", async () => {
    const invite = await insertInvite({
      email: isolationFixtures.users.ownerB.email,
      role: "staff",
      invitedBy: seededUsers.ownerA.id,
    });

    const { client, user } = await signInAsFixtureUser("ownerB");
    const result = await client.rpc("accept_account_invite", {
      invite_token: invite.token,
    });

    expect(result.error).toBeNull();
    expect(result.data.ok).toBe(true);
    expect(result.data.account_id).toBe(isolationFixtures.accounts.accountA.id);
    expect(result.data.role).toBe("staff");

    const acceptedMembership = await getMembership(isolationFixtures.accounts.accountA.id, user.id);
    expect(acceptedMembership).toMatchObject({
      account_id: isolationFixtures.accounts.accountA.id,
      user_id: user.id,
      role: "staff",
    });

    const existingAccountBMembership = await getMembership(isolationFixtures.accounts.accountB.id, user.id);
    expect(existingAccountBMembership).toMatchObject({
      account_id: isolationFixtures.accounts.accountB.id,
      user_id: user.id,
      role: "owner",
    });

    const inviteRow = await getInvite(invite.id);
    expect(inviteRow.accepted_by).toBe(user.id);
    expect(inviteRow.accepted_at).toBeTruthy();

    const { data: ledgerRows, error: ledgerError } = await admin
      .from("security_audit_ledger")
      .select("action, account_id, entity_type, entity_id")
      .eq("action", "invite_accepted")
      .eq("entity_type", "account_invitation")
      .eq("entity_id", invite.id);

    expect(ledgerError).toBeNull();
    expect(ledgerRows).toHaveLength(1);
    expect(ledgerRows[0].account_id).toBe(isolationFixtures.accounts.accountA.id);
  });

  it("accepting a tenant invite creates a tenant directory record for the accepted user", async () => {
    const invite = await insertInvite({
      email: isolationFixtures.users.staffB.email,
      role: "tenant",
      invitedBy: seededUsers.ownerA.id,
    });

    const { client, user } = await signInAsFixtureUser("staffB");
    const result = await client.rpc("accept_account_invite", {
      invite_token: invite.token,
    });

    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({
      ok: true,
      account_id: isolationFixtures.accounts.accountA.id,
      role: "tenant",
    });

    const acceptedMembership = await getMembership(isolationFixtures.accounts.accountA.id, user.id);
    expect(acceptedMembership).toMatchObject({
      account_id: isolationFixtures.accounts.accountA.id,
      user_id: user.id,
      role: "tenant",
    });

    const tenant = await getTenantByUser(isolationFixtures.accounts.accountA.id, user.id);
    expect(tenant).toMatchObject({
      account_id: isolationFixtures.accounts.accountA.id,
      email: isolationFixtures.users.staffB.email,
      user_id: user.id,
      status: "active",
      property_id: null,
    });
  });

  it("rejects an invalid invite token and does not create a membership", async () => {
    const { client, user } = await signInAsFixtureUser("ownerB");

    const result = await client.rpc("accept_account_invite", {
      invite_token: `missing-${randomUUID()}`,
    });

    expect(result.data ?? null).toBeNull();
    expect(String(result.error?.message || "").toLowerCase()).toContain("invitation not found");
    expect(await getMembership(isolationFixtures.accounts.accountA.id, user.id)).toBeNull();
  });

  it("rejects invite acceptance when the signed-in email does not match the invited email", async () => {
    const invite = await insertInvite({
      email: isolationFixtures.users.ownerB.email,
      role: "staff",
      invitedBy: seededUsers.ownerA.id,
    });

    const { client } = await signInAsFixtureUser("staffB");
    const result = await client.rpc("accept_account_invite", {
      invite_token: invite.token,
    });

    expect(result.data ?? null).toBeNull();
    expect(String(result.error?.message || "").toLowerCase()).toContain("email mismatch");
    expect(await getMembership(isolationFixtures.accounts.accountA.id, seededUsers.staffB.id)).toBeNull();

    const inviteRow = await getInvite(invite.id);
    expect(inviteRow.accepted_at).toBeNull();
    expect(inviteRow.accepted_by).toBeNull();
  });

  it("rejects a revoked invite and does not create a membership", async () => {
    const invite = await insertInvite({
      email: isolationFixtures.users.staffB.email,
      role: "staff",
      invitedBy: seededUsers.ownerA.id,
      revokedAt: new Date().toISOString(),
    });

    const { client } = await signInAsFixtureUser("staffB");
    const result = await client.rpc("accept_account_invite", {
      invite_token: invite.token,
    });

    expect(result.data ?? null).toBeNull();
    expect(String(result.error?.message || "").toLowerCase()).toContain("revoked");
    expect(await getMembership(isolationFixtures.accounts.accountA.id, seededUsers.staffB.id)).toBeNull();
  });

  it("returns already_accepted on replay and keeps a single target membership row", async () => {
    const invite = await insertInvite({
      email: isolationFixtures.users.staffB.email,
      role: "staff",
      invitedBy: seededUsers.ownerA.id,
    });

    const { client, user } = await signInAsFixtureUser("staffB");

    const firstResult = await client.rpc("accept_account_invite", {
      invite_token: invite.token,
    });

    expect(firstResult.error).toBeNull();
    expect(firstResult.data.ok).toBe(true);

    const replayResult = await client.rpc("accept_account_invite", {
      invite_token: invite.token,
    });

    expect(replayResult.error).toBeNull();
    expect(replayResult.data).toMatchObject({
      ok: true,
      already_accepted: true,
      account_id: isolationFixtures.accounts.accountA.id,
    });
    expect(await countMemberships(isolationFixtures.accounts.accountA.id, user.id)).toBe(1);
  });

  it("rejects expired invites before granting membership", async () => {
    const invite = await insertInvite({
      email: isolationFixtures.users.staffB.email,
      role: "staff",
      invitedBy: seededUsers.ownerA.id,
      expiresAt: "2000-01-01T00:00:00.000Z",
    });

    const { client, user } = await signInAsFixtureUser("staffB");
    const result = await client.rpc("accept_account_invite", {
      invite_token: invite.token,
    });

    expect(result.data ?? null).toBeNull();
    expect(String(result.error?.message || "").toLowerCase()).toContain("expired");
    expect(await getMembership(isolationFixtures.accounts.accountA.id, user.id)).toBeNull();
  });
});
