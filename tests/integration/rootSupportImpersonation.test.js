import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import {
  ensureIsolationHarnessSeed,
  getIntegrationAdminClient,
  isolationSeedIds,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "./helpers/env.js";
import { firstRow } from "./helpers/rpcAssertions.js";

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

describe.skipIf(!isIntegrationHarnessConfigured())("root support impersonation", () => {
  const admin = getIntegrationAdminClient();
  const createdInviteIds = new Set();

  beforeAll(async () => {
    const users = await ensureIsolationHarnessSeed();

    const { error: billingCustomerError } = await admin.from("billing_customers").upsert({
      account_id: isolationFixtures.accounts.accountA.id,
      stripe_customer_id: "cus_root_support_account_a",
      email: "billing-account-a@oasis.test",
    }, {
      onConflict: "account_id",
    });

    if (billingCustomerError) throw billingCustomerError;

    const { error: billingError } = await admin.from("billing_subscriptions").upsert({
      account_id: isolationFixtures.accounts.accountA.id,
      stripe_customer_id: "cus_root_support_account_a",
      stripe_subscription_id: "sub_root_support_account_a",
      stripe_price_id: "price_growth",
      stripe_product_id: "prod_growth",
      status: "active",
      metadata: { source: "root-support-test" },
    }, {
      onConflict: "account_id",
    });

    if (billingError) throw billingError;

    const rootInviteId = "99999999-9999-9999-9999-999999999991";
    const accountAInviteId = "99999999-9999-9999-9999-999999999992";
    const seededInviteEmails = [
      "root-scope-invite@oasis.test",
      "account-a-scope-invite@oasis.test",
    ];

    const { error: deleteSeedInvitesError } = await admin
      .from("account_invitations")
      .delete()
      .in("email", seededInviteEmails);

    if (deleteSeedInvitesError) throw deleteSeedInvitesError;

    const { error: inviteSeedError } = await admin.from("account_invitations").upsert([
      {
        id: rootInviteId,
        account_id: isolationFixtures.accounts.root.id,
        email: "root-scope-invite@oasis.test",
        role: "staff",
        token: "root-scope-token",
        invited_by: users.rootOwner.id,
      },
      {
        id: accountAInviteId,
        account_id: isolationFixtures.accounts.accountA.id,
        email: "account-a-scope-invite@oasis.test",
        role: "staff",
        token: "account-a-scope-token",
        invited_by: users.ownerA.id,
      },
    ], {
      onConflict: "id",
    });

    if (inviteSeedError) throw inviteSeedError;
  });

  afterEach(async () => {
    if (createdInviteIds.size === 0) return;
    const ids = Array.from(createdInviteIds);
    createdInviteIds.clear();

    const { error } = await admin.from("account_invitations").delete().in("id", ids);
    if (error) throw error;
  });

  it("allows the root operator to read target-account properties, finance snapshot, payments, and billing", async () => {
    const { client } = await signInAsFixtureUser("rootOwner");

    const propertiesResult = await client
      .from("properties")
      .select("id, account_id, address")
      .eq("account_id", isolationFixtures.accounts.accountA.id);

    expect(propertiesResult.error).toBeNull();
    expect(propertiesResult.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: isolationSeedIds.propertyIds.accountA,
          account_id: isolationFixtures.accounts.accountA.id,
        }),
      ]),
    );

    const paymentsResult = await client
      .from("payments")
      .select("id, account_id, property_id, amount, status")
      .eq("account_id", isolationFixtures.accounts.accountA.id);

    expect(paymentsResult.error).toBeNull();
    expect(paymentsResult.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: isolationSeedIds.paymentIds.accountA,
          account_id: isolationFixtures.accounts.accountA.id,
        }),
      ]),
    );

    const financeResult = await client.rpc("finance_snapshot", {
      p_account_id: isolationFixtures.accounts.accountA.id,
      p_tenant_id: null,
    });

    expect(financeResult.error).toBeNull();
    const financeRow = firstRow(financeResult.data);
    expect(financeRow).toBeTruthy();
    expect(Array.isArray(financeRow.property_finance)).toBe(true);
    expect(financeRow.property_finance).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          propertyId: isolationSeedIds.propertyIds.accountA,
        }),
      ]),
    );
    expect(Number(financeRow.outstanding_income)).toBeGreaterThan(0);

    const billingResult = await client
      .from("billing_subscriptions")
      .select("account_id, stripe_customer_id, status")
      .eq("account_id", isolationFixtures.accounts.accountA.id)
      .maybeSingle();

    expect(billingResult.error).toBeNull();
    expect(billingResult.data).toMatchObject({
      account_id: isolationFixtures.accounts.accountA.id,
      stripe_customer_id: "cus_root_support_account_a",
      status: "active",
    });

    const billingCustomerResult = await client
      .from("billing_customers")
      .select("account_id, stripe_customer_id, email")
      .eq("account_id", isolationFixtures.accounts.accountA.id)
      .maybeSingle();

    expect(billingCustomerResult.error).toBeNull();
    expect(billingCustomerResult.data).toMatchObject({
      account_id: isolationFixtures.accounts.accountA.id,
      stripe_customer_id: "cus_root_support_account_a",
      email: "billing-account-a@oasis.test",
    });
  });

  it("keeps invitation reads scoped to the selected account for root support", async () => {
    const { client } = await signInAsFixtureUser("rootOwner");

    const result = await client
      .from("account_invitations")
      .select("id, account_id, email")
      .eq("account_id", isolationFixtures.accounts.accountA.id)
      .order("created_at", { ascending: true });

    expect(result.error).toBeNull();
    expect((result.data || []).some((row) => row.email === "account-a-scope-invite@oasis.test")).toBe(true);
    expect((result.data || []).some((row) => row.email === "root-scope-invite@oasis.test")).toBe(false);
    expect((result.data || []).every((row) => row.account_id === isolationFixtures.accounts.accountA.id)).toBe(true);
  });

  it("allows root support to create and revoke non-owner invites in the target account", async () => {
    const { client, user } = await signInAsFixtureUser("rootOwner");
    const inviteId = randomUUID();
    const email = `root-support-${randomUUID()}@oasis.test`;
    const token = `root-support-token-${randomUUID()}`;

    const insertResult = await client
      .from("account_invitations")
      .insert({
        id: inviteId,
        account_id: isolationFixtures.accounts.accountA.id,
        email,
        role: "staff",
        token,
      })
      .select("id, account_id, email, role, invited_by, revoked_at")
      .single();

    expect(insertResult.error).toBeNull();
    expect(insertResult.data).toMatchObject({
      id: inviteId,
      account_id: isolationFixtures.accounts.accountA.id,
      email,
      role: "staff",
      invited_by: user.id,
      revoked_at: null,
    });
    createdInviteIds.add(inviteId);

    const revokeResult = await client
      .from("account_invitations")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", inviteId)
      .eq("account_id", isolationFixtures.accounts.accountA.id)
      .select("id, revoked_at")
      .single();

    expect(revokeResult.error).toBeNull();
    expect(revokeResult.data.id).toBe(inviteId);
    expect(revokeResult.data.revoked_at).toBeTruthy();
  });

  it("does not let root support create owner invites through the ordinary account invite path", async () => {
    const { client } = await signInAsFixtureUser("rootOwner");
    const result = await client
      .from("account_invitations")
      .insert({
        id: randomUUID(),
        account_id: isolationFixtures.accounts.accountA.id,
        email: `owner-attempt-${randomUUID()}@oasis.test`,
        role: "owner",
        token: `owner-token-${randomUUID()}`,
      })
      .select("id");

    expectDeniedOrNoRows(result);
  });

  it("does not give root support ordinary property or payment create rights in the target account", async () => {
    const { client, user } = await signInAsFixtureUser("rootOwner");

    const propertyInsert = await client
      .from("properties")
      .insert({
        id: randomUUID(),
        owner_id: user.id,
        account_id: isolationFixtures.accounts.accountA.id,
        address: "99 Root Support Lane",
        city: "London",
        size: "1 bed",
        rent: 1000,
        status: "Wolne",
      })
      .select("id");

    expectDeniedOrNoRows(propertyInsert);

    const paymentInsert = await client
      .from("payments")
      .insert({
        id: randomUUID(),
        owner_id: user.id,
        account_id: isolationFixtures.accounts.accountA.id,
        property_id: isolationSeedIds.propertyIds.accountA,
        tenant_id: isolationFixtures.users.tenantA1.tenantId,
        amount: 100,
        status: "due",
        due_date: new Date().toISOString().slice(0, 10),
      })
      .select("id");

    expectDeniedOrNoRows(paymentInsert);
  });

  it("uses effective role resolution for billing reads when legacy role and role_id drift", async () => {
    const users = await ensureIsolationHarnessSeed();
    const accountId = isolationFixtures.accounts.accountA.id;
    const adminRoleLookup = await admin
      .from("roles")
      .select("id, name")
      .eq("account_id", accountId)
      .eq("name", "admin")
      .single();

    if (adminRoleLookup.error) throw adminRoleLookup.error;

    const targetUserId = users.adminA.id;
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

      const billingCustomerResult = await client
        .from("billing_customers")
        .select("account_id, stripe_customer_id")
        .eq("account_id", accountId)
        .maybeSingle();

      expect(billingCustomerResult.error).toBeNull();
      expect(billingCustomerResult.data).toMatchObject({
        account_id: accountId,
        stripe_customer_id: "cus_root_support_account_a",
      });

      const billingSubscriptionResult = await client
        .from("billing_subscriptions")
        .select("account_id, stripe_subscription_id, status")
        .eq("account_id", accountId)
        .maybeSingle();

      expect(billingSubscriptionResult.error).toBeNull();
      expect(billingSubscriptionResult.data).toMatchObject({
        account_id: accountId,
        stripe_subscription_id: "sub_root_support_account_a",
        status: "active",
      });
    } finally {
      await restoreMembership();
    }
  });

  it("allows root-only account lifecycle rpc access while denying ordinary owners", async () => {
    const { client: rootClient } = await signInAsFixtureUser("rootOwner");
    const rootList = await rootClient.rpc("root_list_accounts", {
      p_root_account_id: isolationFixtures.accounts.root.id,
    });

    expect(rootList.error).toBeNull();
    expect((rootList.data || []).some((row) => row.id === isolationFixtures.accounts.accountA.id)).toBe(true);
    expect((rootList.data || []).some((row) => row.id === isolationFixtures.accounts.root.id)).toBe(true);

    const disableResult = await rootClient.rpc("root_set_account_disabled", {
      p_root_account_id: isolationFixtures.accounts.root.id,
      p_target_account_id: isolationFixtures.accounts.accountB.id,
      p_disabled: true,
    });

    expect(disableResult.error).toBeNull();
    expect(disableResult.data).toMatchObject({
      ok: true,
      account_id: isolationFixtures.accounts.accountB.id,
      is_disabled: true,
    });

    const restoreResult = await rootClient.rpc("root_set_account_disabled", {
      p_root_account_id: isolationFixtures.accounts.root.id,
      p_target_account_id: isolationFixtures.accounts.accountB.id,
      p_disabled: false,
    });

    expect(restoreResult.error).toBeNull();
    expect(restoreResult.data).toMatchObject({
      ok: true,
      account_id: isolationFixtures.accounts.accountB.id,
      is_disabled: false,
    });

    const { client: ownerClient } = await signInAsFixtureUser("ownerA");
    const deniedRootList = await ownerClient.rpc("root_list_accounts", {
      p_root_account_id: isolationFixtures.accounts.root.id,
    });

    expect(deniedRootList.data ?? null).toBeNull();
    const deniedMessage = String(deniedRootList.error?.message || "").toLowerCase();
    expect(
      deniedMessage.includes("not a member of root account") ||
        deniedMessage.includes("account is not root") ||
        deniedMessage.includes("access denied") ||
        deniedMessage.includes("unauthorized account access"),
    ).toBe(true);
  });
});
