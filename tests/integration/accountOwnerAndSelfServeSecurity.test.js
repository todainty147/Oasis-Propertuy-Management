import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import {
  ensureIsolationHarnessSeed,
  getIntegrationAdminClient,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";
import { getIntegrationEnv, isIntegrationHarnessConfigured } from "./helpers/env.js";

describe.skipIf(!isIntegrationHarnessConfigured())("account owner contact and self-serve landlord security", () => {
  const admin = getIntegrationAdminClient();
  const tempAccountIds = new Set();
  const tempUserIds = new Set();
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

  afterAll(async () => {
    if (tempAccountIds.size > 0) {
      const { error } = await admin.from("accounts").delete().in("id", Array.from(tempAccountIds));
      if (error) throw error;
    }

    for (const userId of tempUserIds) {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) throw error;
    }
  });

  it("returns the owner contact even when the owner membership drifts to a stale legacy role", async () => {
    const accountId = isolationFixtures.accounts.accountA.id;
    const ownerUserId = seededUsers.ownerA.id;

    const ownerRoleLookup = await admin
      .from("roles")
      .select("id")
      .eq("account_id", accountId)
      .eq("name", "owner")
      .single();
    if (ownerRoleLookup.error) throw ownerRoleLookup.error;

    const { client } = await signInAsFixtureUser("adminA");

    const restoreMembership = async () => {
      const { error } = await admin
        .from("account_members")
        .update({ role: "owner", role_id: ownerRoleLookup.data.id })
        .eq("account_id", accountId)
        .eq("user_id", ownerUserId);
      if (error) throw error;
    };

    try {
      const { error: driftError } = await admin
        .from("account_members")
        .update({ role: "staff", role_id: ownerRoleLookup.data.id })
        .eq("account_id", accountId)
        .eq("user_id", ownerUserId);
      if (driftError) throw driftError;

      const result = await client.rpc("get_account_owner_contact", {
        p_account_id: accountId,
      });

      expect(result.error).toBeNull();
      const row = Array.isArray(result.data) ? result.data[0] : result.data;
      expect(row).toBeTruthy();
      expect(row.owner_user_id).toBe(ownerUserId);
      expect(row.owner_email).toBe(isolationFixtures.users.ownerA.email);
    } finally {
      await restoreMembership();
    }
  });

  it("treats users with an owner role_id as effective owners for self-serve idempotence", async () => {
    const accountId = isolationFixtures.accounts.accountA.id;
    const memberUserId = seededUsers.adminA.id;

    const ownerRoleLookup = await admin
      .from("roles")
      .select("id")
      .eq("account_id", accountId)
      .eq("name", "owner")
      .single();
    if (ownerRoleLookup.error) throw ownerRoleLookup.error;

    const adminRoleLookup = await admin
      .from("roles")
      .select("id")
      .eq("account_id", accountId)
      .eq("name", "admin")
      .single();
    if (adminRoleLookup.error) throw adminRoleLookup.error;

    const { client } = await signInAsFixtureUser("adminA");

    const restoreMembership = async () => {
      const { error } = await admin
        .from("account_members")
        .update({ role_id: adminRoleLookup.data.id })
        .eq("account_id", accountId)
        .eq("user_id", memberUserId);
      if (error) throw error;
    };

    try {
      const { error: driftError } = await admin
        .from("account_members")
        .update({ role_id: ownerRoleLookup.data.id })
        .eq("account_id", accountId)
        .eq("user_id", memberUserId);
      if (driftError) throw driftError;

      const result = await client.rpc("create_self_serve_landlord_account", {
        p_account_name: "Should Not Create",
      });

      expect(result.error).toBeNull();
      const row = Array.isArray(result.data) ? result.data[0] : result.data;
      expect(row).toMatchObject({
        ok: true,
        created: false,
        account_id: accountId,
        account_name: isolationFixtures.accounts.accountA.name,
        role: "owner",
      });
    } finally {
      await restoreMembership();
    }
  });

  it("creates a new owner account for a clean user and blocks invited non-owner self-escalation", async () => {
    const password = getIntegrationEnv().userPassword;
    const anon = createAnonClient();
    const email = `selfserve.${randomUUID()}@oasis.test`;

    const signUp = await anon.auth.signUp({
      email,
      password,
      options: {
        data: {
          fixture_key: "self_serve_temp",
          oasis_role: "owner",
        },
      },
    });
    if (signUp.error) throw signUp.error;

    const tempUserId = signUp.data.user?.id;
    expect(tempUserId).toBeTruthy();
    tempUserIds.add(tempUserId);

    const signIn = await anon.auth.signInWithPassword({ email, password });
    if (signIn.error) throw signIn.error;

    const createResult = await anon.rpc("create_self_serve_landlord_account", {
      p_account_name: "Temp Self Serve Account",
    });

    expect(createResult.error).toBeNull();
    const createdRow = Array.isArray(createResult.data) ? createResult.data[0] : createResult.data;
    expect(createdRow).toMatchObject({
      ok: true,
      created: true,
      account_name: "Temp Self Serve Account",
      role: "owner",
    });
    expect(createdRow.account_id).toBeTruthy();
    tempAccountIds.add(createdRow.account_id);

    const secondResult = await anon.rpc("create_self_serve_landlord_account", {
      p_account_name: "Temp Self Serve Account Again",
    });

    expect(secondResult.error).toBeNull();
    const secondRow = Array.isArray(secondResult.data) ? secondResult.data[0] : secondResult.data;
    expect(secondRow).toMatchObject({
      ok: true,
      created: false,
      account_id: createdRow.account_id,
      role: "owner",
    });

    const { client: staffClient } = await signInAsFixtureUser("staffA");
    const deniedResult = await staffClient.rpc("create_self_serve_landlord_account", {
      p_account_name: "Staff Escalation Attempt",
    });

    expect(deniedResult.data ?? null).toBeNull();
    expect(String(deniedResult.error?.message || "").toLowerCase()).toContain("self-signup is not allowed");
  });

  it("creates exactly one non-root owner membership for self-serve landlords", async () => {
    const password = getIntegrationEnv().userPassword;
    const anon = createAnonClient();
    const email = `selfserve-owner-shape.${randomUUID()}@oasis.test`;

    const signUp = await anon.auth.signUp({
      email,
      password,
      options: {
        data: {
          fixture_key: "self_serve_owner_shape",
          oasis_role: "owner",
        },
      },
    });
    if (signUp.error) throw signUp.error;

    const tempUserId = signUp.data.user?.id;
    expect(tempUserId).toBeTruthy();
    tempUserIds.add(tempUserId);

    const signIn = await anon.auth.signInWithPassword({ email, password });
    if (signIn.error) throw signIn.error;

    const createResult = await anon.rpc("create_self_serve_landlord_account", {
      p_account_name: "Shape Checked Self Serve Account",
    });

    expect(createResult.error).toBeNull();
    const createdRow = Array.isArray(createResult.data) ? createResult.data[0] : createResult.data;
    expect(createdRow).toMatchObject({
      ok: true,
      created: true,
      account_name: "Shape Checked Self Serve Account",
      role: "owner",
    });

    tempAccountIds.add(createdRow.account_id);

    const accountLookup = await admin
      .from("accounts")
      .select("id, name, is_root, is_disabled, created_by")
      .eq("id", createdRow.account_id)
      .single();

    expect(accountLookup.error).toBeNull();
    expect(accountLookup.data).toMatchObject({
      id: createdRow.account_id,
      name: "Shape Checked Self Serve Account",
      is_root: false,
      is_disabled: false,
      created_by: tempUserId,
    });

    const memberships = await admin
      .from("account_members")
      .select("account_id, user_id, role, role_id, roles(name)")
      .eq("user_id", tempUserId);

    expect(memberships.error).toBeNull();
    expect(memberships.data).toHaveLength(1);
    expect(memberships.data[0]).toMatchObject({
      account_id: createdRow.account_id,
      user_id: tempUserId,
      role: "owner",
      roles: {
        name: "owner",
      },
    });
    expect(memberships.data[0].role_id).toBeTruthy();

    const rootMembership = await admin
      .from("account_members")
      .select("account_id, user_id")
      .eq("account_id", isolationFixtures.accounts.root.id)
      .eq("user_id", tempUserId);

    expect(rootMembership.error).toBeNull();
    expect(rootMembership.data).toHaveLength(0);
  });

  it("denies anonymous self-serve account creation", async () => {
    const anon = createAnonClient();

    const result = await anon.rpc("create_self_serve_landlord_account", {
      p_account_name: "Anonymous Attempt",
    });

    expect(result.data ?? null).toBeNull();
    expect(String(result.error?.message || "").toLowerCase()).toContain("not authenticated");
  });
});
