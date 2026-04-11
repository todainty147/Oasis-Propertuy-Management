import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import {
  ensureIsolationHarnessSeed,
  getIntegrationAdminClient,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";
import { getIntegrationEnv, isIntegrationHarnessConfigured } from "./helpers/env.js";

function expectLandlordInviteDenied(result) {
  expect(result.data ?? null).toBeNull();
  const message = String(result.error?.message || "").toLowerCase();
  expect(
    message.includes("not authenticated") ||
      message.includes("not a member of root account") ||
      message.includes("only root account") ||
      message.includes("insufficient role") ||
      message.includes("already has an active landlord invitation") ||
      message.includes("already used by an existing landlord account"),
  ).toBe(true);
}

describe.skipIf(!isIntegrationHarnessConfigured())("root landlord invitation provisioning", () => {
  const admin = getIntegrationAdminClient();
  let seededUsers;

  function createAnonClient() {
    const env = getIntegrationEnv();
    return createClient(env.url, env.anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }

  beforeAll(async () => {
    seededUsers = await ensureIsolationHarnessSeed();
  });

  it("allows root owner to create a landlord account, support membership, and owner invite", async () => {
    const { client } = await signInAsFixtureUser("rootOwner");
    const accountName = `Root Landlord ${randomUUID()}`;
    const email = `landlord-root-${randomUUID()}@oasis.test`;

    const result = await client.rpc("create_landlord_invitation", {
      p_root_account_id: isolationFixtures.accounts.root.id,
      p_email: email,
      p_account_name: accountName,
    });

    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({
      account_name: accountName,
      email,
      role: "owner",
    });
    expect(result.data.account_id).toBeTruthy();
    expect(result.data.token).toBeTruthy();

    const accountLookup = await admin
      .from("accounts")
      .select("id, name, is_root, is_disabled, created_by")
      .eq("id", result.data.account_id)
      .single();

    expect(accountLookup.error).toBeNull();
    expect(accountLookup.data).toMatchObject({
      id: result.data.account_id,
      name: accountName,
      is_root: false,
      is_disabled: false,
      created_by: seededUsers.rootOwner.id,
    });

    const supportMembership = await admin
      .from("account_members")
      .select("account_id, user_id, role, role_id, roles(name)")
      .eq("account_id", result.data.account_id)
      .eq("user_id", seededUsers.rootOwner.id)
      .single();

    expect(supportMembership.error).toBeNull();
    expect(supportMembership.data.account_id).toBe(result.data.account_id);
    expect(supportMembership.data.user_id).toBe(seededUsers.rootOwner.id);
    expect(["admin", "staff", "owner"]).toContain(supportMembership.data.role);
    expect(supportMembership.data.role_id).toBeTruthy();
    expect(["admin", "staff", "owner"]).toContain(supportMembership.data.roles?.name);

    const inviteLookup = await admin
      .from("account_invitations")
      .select("id, account_id, email, role, token, invited_by, accepted_at, revoked_at")
      .eq("account_id", result.data.account_id)
      .eq("email", email)
      .single();

    expect(inviteLookup.error).toBeNull();
    expect(inviteLookup.data).toMatchObject({
      account_id: result.data.account_id,
      email,
      role: "owner",
      token: result.data.token,
      invited_by: seededUsers.rootOwner.id,
      accepted_at: null,
      revoked_at: null,
    });

    const rootAccountMembership = await admin
      .from("account_members")
      .select("account_id, user_id")
      .eq("account_id", isolationFixtures.accounts.root.id)
      .eq("user_id", seededUsers.rootOwner.id);

    expect(rootAccountMembership.error).toBeNull();
    expect(rootAccountMembership.data).toHaveLength(1);
  });

  it("denies anonymous users, ordinary owners, and non-root account contexts", async () => {
    const anon = createAnonClient();
    const anonymousResult = await anon.rpc("create_landlord_invitation", {
      p_root_account_id: isolationFixtures.accounts.root.id,
      p_email: `anonymous-landlord-${randomUUID()}@oasis.test`,
      p_account_name: "Anonymous Landlord Attempt",
    });
    expectLandlordInviteDenied(anonymousResult);

    const { client: ownerClient } = await signInAsFixtureUser("ownerA");
    const ordinaryOwnerResult = await ownerClient.rpc("create_landlord_invitation", {
      p_root_account_id: isolationFixtures.accounts.root.id,
      p_email: `ordinary-owner-landlord-${randomUUID()}@oasis.test`,
      p_account_name: "Ordinary Owner Landlord Attempt",
    });
    expectLandlordInviteDenied(ordinaryOwnerResult);

    const { client: rootClient } = await signInAsFixtureUser("rootOwner");
    const nonRootContextResult = await rootClient.rpc("create_landlord_invitation", {
      p_root_account_id: isolationFixtures.accounts.accountA.id,
      p_email: `non-root-context-landlord-${randomUUID()}@oasis.test`,
      p_account_name: "Non Root Context Landlord Attempt",
    });
    expectLandlordInviteDenied(nonRootContextResult);
  });

  it("prevents duplicate active landlord invitations for the same email", async () => {
    const { client } = await signInAsFixtureUser("rootOwner");
    const email = `duplicate-landlord-${randomUUID()}@oasis.test`;

    const firstResult = await client.rpc("create_landlord_invitation", {
      p_root_account_id: isolationFixtures.accounts.root.id,
      p_email: email,
      p_account_name: "First Duplicate Landlord",
    });

    expect(firstResult.error).toBeNull();
    expect(firstResult.data).toMatchObject({
      email,
      role: "owner",
    });

    const duplicateResult = await client.rpc("create_landlord_invitation", {
      p_root_account_id: isolationFixtures.accounts.root.id,
      p_email: email,
      p_account_name: "Second Duplicate Landlord",
    });

    expectLandlordInviteDenied(duplicateResult);

    const invites = await admin
      .from("account_invitations")
      .select("id, account_id, email, role, revoked_at")
      .eq("email", email)
      .eq("role", "owner")
      .is("revoked_at", null);

    expect(invites.error).toBeNull();
    expect(invites.data).toHaveLength(1);
    expect(invites.data[0].account_id).toBe(firstResult.data.account_id);
  });

  it("prevents landlord invitations for users who already own an account", async () => {
    const { client } = await signInAsFixtureUser("rootOwner");

    const result = await client.rpc("create_landlord_invitation", {
      p_root_account_id: isolationFixtures.accounts.root.id,
      p_email: isolationFixtures.users.ownerA.email.toUpperCase(),
      p_account_name: "Existing Owner Attempt",
    });

    expectLandlordInviteDenied(result);
  });
});
