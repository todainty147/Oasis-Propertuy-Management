import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import {
  ensureIsolationHarnessSeed,
  getIntegrationAdminClient,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "./helpers/env.js";

function expectRootDenied(result) {
  expect(result.data ?? null).toBeNull();
  const message = String(result.error?.message || "").toLowerCase();
  expect(
    message.includes("not a member of root account") ||
      message.includes("only root owner") ||
      message.includes("account is not root") ||
      message.includes("access denied") ||
      message.includes("unauthorized account access") ||
      message.includes("not authenticated"),
  ).toBe(true);
}

describe.skipIf(!isIntegrationHarnessConfigured())("root account lifecycle security", () => {
  const admin = getIntegrationAdminClient();
  const tempAccountIds = new Set();
  let seededUsers;
  let tempAccountId;

  async function createTempAccount() {
    const { data, error } = await admin
      .from("accounts")
      .insert({
        name: `Root lifecycle temp ${randomUUID()}`,
        created_by: seededUsers.rootOwner.id,
        is_root: false,
        is_disabled: false,
      })
      .select("id")
      .single();

    if (error) throw error;
    tempAccountIds.add(data.id);
    return data.id;
  }

  beforeAll(async () => {
    seededUsers = await ensureIsolationHarnessSeed();
    tempAccountId = await createTempAccount();
  });

  afterAll(async () => {
    if (tempAccountIds.size === 0) return;
    const { error } = await admin.from("accounts").delete().in("id", Array.from(tempAccountIds));
    if (error) throw error;
  });

  it("allows root owner to list all accounts including disabled and temporary accounts", async () => {
    const { client } = await signInAsFixtureUser("rootOwner");

    const result = await client.rpc("root_list_accounts", {
      p_root_account_id: isolationFixtures.accounts.root.id,
    });

    expect(result.error).toBeNull();
    const ids = new Set((result.data || []).map((row) => row.id));
    expect(ids.has(isolationFixtures.accounts.root.id)).toBe(true);
    expect(ids.has(isolationFixtures.accounts.accountA.id)).toBe(true);
    expect(ids.has(isolationFixtures.accounts.accountB.id)).toBe(true);
    expect(ids.has(tempAccountId)).toBe(true);
  });

  it("denies ordinary users from root list, disable, and delete RPCs", async () => {
    for (const fixtureKey of ["ownerA", "adminA", "staffA", "tenantA1", "contractorA1"]) {
      const { client } = await signInAsFixtureUser(fixtureKey);

      expectRootDenied(await client.rpc("root_list_accounts", {
        p_root_account_id: isolationFixtures.accounts.root.id,
      }));

      expectRootDenied(await client.rpc("root_set_account_disabled", {
        p_root_account_id: isolationFixtures.accounts.root.id,
        p_target_account_id: tempAccountId,
        p_disabled: true,
      }));

      expectRootDenied(await client.rpc("root_delete_account", {
        p_root_account_id: isolationFixtures.accounts.root.id,
        p_target_account_id: tempAccountId,
      }));
    }
  });

  it("prevents root owner from disabling or deleting the root account itself", async () => {
    const { client } = await signInAsFixtureUser("rootOwner");

    const disableRoot = await client.rpc("root_set_account_disabled", {
      p_root_account_id: isolationFixtures.accounts.root.id,
      p_target_account_id: isolationFixtures.accounts.root.id,
      p_disabled: true,
    });

    expect(disableRoot.data ?? null).toBeNull();
    expect(String(disableRoot.error?.message || "").toLowerCase()).toContain("cannot disable root account");

    const deleteRoot = await client.rpc("root_delete_account", {
      p_root_account_id: isolationFixtures.accounts.root.id,
      p_target_account_id: isolationFixtures.accounts.root.id,
    });

    expect(deleteRoot.data ?? null).toBeNull();
    expect(String(deleteRoot.error?.message || "").toLowerCase()).toContain("cannot delete root account");
  });

  it("lets root owner disable, restore, and audit a target account", async () => {
    const { client } = await signInAsFixtureUser("rootOwner");
    const targetAccountId = isolationFixtures.accounts.accountB.id;

    const disableResult = await client.rpc("root_set_account_disabled", {
      p_root_account_id: isolationFixtures.accounts.root.id,
      p_target_account_id: targetAccountId,
      p_disabled: true,
    });

    expect(disableResult.error).toBeNull();
    expect(disableResult.data).toMatchObject({
      ok: true,
      account_id: targetAccountId,
      is_disabled: true,
    });

    const disabledAccount = await admin
      .from("accounts")
      .select("id, is_disabled, disabled_at")
      .eq("id", targetAccountId)
      .single();

    expect(disabledAccount.error).toBeNull();
    expect(disabledAccount.data).toMatchObject({
      id: targetAccountId,
      is_disabled: true,
    });
    expect(disabledAccount.data.disabled_at).toBeTruthy();

    const restoreResult = await client.rpc("root_set_account_disabled", {
      p_root_account_id: isolationFixtures.accounts.root.id,
      p_target_account_id: targetAccountId,
      p_disabled: false,
    });

    expect(restoreResult.error).toBeNull();
    expect(restoreResult.data).toMatchObject({
      ok: true,
      account_id: targetAccountId,
      is_disabled: false,
    });

    const auditResult = await admin
      .from("security_audit_ledger")
      .select("action, account_id, entity_type, entity_id, metadata")
      .eq("account_id", targetAccountId)
      .eq("entity_id", targetAccountId)
      .in("action", ["account_disabled", "account_enabled"])
      .order("created_at", { ascending: false });

    expect(auditResult.error).toBeNull();
    expect((auditResult.data || []).map((row) => row.action)).toEqual(
      expect.arrayContaining(["account_disabled", "account_enabled"]),
    );
    expect((auditResult.data || []).every((row) => row.entity_type === "account")).toBe(true);
  });

  it("deletes an empty target account but refuses accounts with related data", async () => {
    const { client } = await signInAsFixtureUser("rootOwner");
    const deleteOnlyAccountId = await createTempAccount();

    const relatedDelete = await client.rpc("root_delete_account", {
      p_root_account_id: isolationFixtures.accounts.root.id,
      p_target_account_id: isolationFixtures.accounts.accountA.id,
    });

    expect(relatedDelete.data ?? null).toBeNull();
    expect(relatedDelete.error).toBeTruthy();

    const deleteResult = await client.rpc("root_delete_account", {
      p_root_account_id: isolationFixtures.accounts.root.id,
      p_target_account_id: deleteOnlyAccountId,
    });

    expect(deleteResult.error).toBeNull();
    expect(deleteResult.data).toMatchObject({
      ok: true,
      account_id: deleteOnlyAccountId,
    });

    tempAccountIds.delete(deleteOnlyAccountId);

    const lookup = await admin.from("accounts").select("id").eq("id", deleteOnlyAccountId);
    expect(lookup.error).toBeNull();
    expect(lookup.data).toHaveLength(0);

    const auditResult = await admin
      .from("security_audit_ledger")
      .select("action, account_id, entity_type, entity_id, metadata")
      .eq("account_id", isolationFixtures.accounts.root.id)
      .eq("entity_id", deleteOnlyAccountId)
      .eq("action", "account_deleted")
      .maybeSingle();

    expect(auditResult.error).toBeNull();
    expect(auditResult.data).toMatchObject({
      action: "account_deleted",
      account_id: isolationFixtures.accounts.root.id,
      entity_type: "account",
      entity_id: deleteOnlyAccountId,
    });
  });
});
