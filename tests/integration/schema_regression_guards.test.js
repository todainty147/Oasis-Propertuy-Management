import { beforeAll, describe, expect, it } from "vitest";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import {
  ensureIsolationHarnessSeed,
  getIntegrationAdminClient,
  isolationSeedIds,
} from "./helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "./helpers/env.js";

describe.skipIf(!isIntegrationHarnessConfigured())("schema regression guards", () => {
  const admin = getIntegrationAdminClient();
  let seededUsers;

  async function expectSelectableColumns(table, columns) {
    const { error } = await admin.from(table).select(columns.join(",")).limit(1);
    if (error) {
      throw new Error(
        `Critical schema contract changed for ${table}. Expected selectable columns: ${columns.join(", ")}. Cause: ${error.message}`,
      );
    }
  }

  beforeAll(async () => {
    seededUsers = await ensureIsolationHarnessSeed();
  });

  it("protects account membership, tenant, and contractor linkage columns used by scoped access checks", async () => {
    await expectSelectableColumns("account_members", ["account_id", "user_id", "role"]);
    await expectSelectableColumns("tenants", ["id", "account_id", "user_id", "property_id", "status"]);
    await expectSelectableColumns("contractors", ["id", "account_id", "user_id", "name", "active"]);
  });

  it("protects payments and work order financial columns required by finance and contractor workflow tests", async () => {
    await expectSelectableColumns("payments", ["id", "account_id", "property_id", "tenant_id", "amount", "status", "due_date"]);
    await expectSelectableColumns("work_order_financials", [
      "account_id",
      "work_order_id",
      "quote_status",
      "quote_amount",
      "quote_submitted_by",
      "invoice_amount",
    ]);
  });

  it("protects work order and maintenance request columns required by transition and contractor assignment flows", async () => {
    await expectSelectableColumns("maintenance_requests", ["id", "account_id", "property_id", "reported_by_tenant_id", "title", "status"]);
    await expectSelectableColumns("work_orders", [
      "id",
      "account_id",
      "property_id",
      "maintenance_request_id",
      "contractor_user_id",
      "status",
      "created_by",
      "acknowledgement_status",
    ]);
  });

  it("protects notifications, invites, and document columns required by security-sensitive workflows", async () => {
    await expectSelectableColumns("notifications", ["account_id", "recipient_user_id", "type", "title", "link_path"]);
    await expectSelectableColumns("account_invitations", ["account_id", "email", "role", "token", "accepted_at", "revoked_at", "expires_at"]);
    await expectSelectableColumns("documents", ["account_id", "uploaded_by", "upload_status", "storage_path", "scope", "visibility"]);
  });

  it("protects seeded payment linkage assumptions for account, tenant, and property scope", async () => {
    const { data, error } = await admin
      .from("payments")
      .select("id, account_id, property_id, tenant_id, amount, status")
      .eq("id", isolationSeedIds.paymentIds.accountA)
      .single();

    if (error) throw error;

    expect(data).toMatchObject({
      id: isolationSeedIds.paymentIds.accountA,
      account_id: isolationFixtures.accounts.accountA.id,
      property_id: isolationSeedIds.propertyIds.accountA,
      tenant_id: isolationFixtures.users.tenantA1.tenantId,
    });
    expect(Number(data.amount)).toBe(1200);
  });

  it("protects seeded work order linkage assumptions for contractor, maintenance request, and account scope", async () => {
    const { data, error } = await admin
      .from("work_orders")
      .select("id, account_id, property_id, maintenance_request_id, contractor_user_id, created_by")
      .eq("id", isolationSeedIds.workOrderIds.accountA)
      .single();

    if (error) throw error;

    expect(data).toMatchObject({
      id: isolationSeedIds.workOrderIds.accountA,
      account_id: isolationFixtures.accounts.accountA.id,
      property_id: isolationSeedIds.propertyIds.accountA,
      maintenance_request_id: isolationSeedIds.requestIds.accountA,
      contractor_user_id: seededUsers.contractorA1.id,
      created_by: seededUsers.ownerA.id,
    });
  });

  it("protects seeded maintenance request linkage assumptions for tenant-scoped flows", async () => {
    const { data, error } = await admin
      .from("maintenance_requests")
      .select("id, account_id, property_id, reported_by_tenant_id, title")
      .eq("id", isolationSeedIds.requestIds.accountA)
      .single();

    if (error) throw error;

    expect(data).toMatchObject({
      id: isolationSeedIds.requestIds.accountA,
      account_id: isolationFixtures.accounts.accountA.id,
      property_id: isolationSeedIds.propertyIds.accountA,
      reported_by_tenant_id: isolationFixtures.users.tenantA1.tenantId,
      title: "Leaking tap",
    });
  });
});
