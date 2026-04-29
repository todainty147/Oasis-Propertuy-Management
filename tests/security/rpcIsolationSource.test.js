import { readFileSync } from "node:fs";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";

function readSql(relativePath) {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

describe("RPC isolation SQL contracts", () => {
  it("keeps tenant-capable dashboard and finance RPCs behind tenant scope guards", () => {
    const dashboardSnapshotSql = readSql("supabase/dashboard_snapshot.sql");
    const financeSnapshotSql = readSql("supabase/finance_snapshot.sql");
    const tenantActivityFeedSql = readSql("supabase/tenant_activity_feed.sql");

    expect(dashboardSnapshotSql).toContain("public.assert_tenant_scope_access(p_account_id, p_tenant_id)");
    expect(financeSnapshotSql).toContain("v_tenant_id := public.assert_tenant_scope_access(p_account_id, p_tenant_id);");
    expect(tenantActivityFeedSql).toContain("public.assert_tenant_scope_access(p_account_id, p_tenant_id)");
  });

  it("keeps command center items behind manager/root account guards", () => {
    const commandCenterSql = readSql("supabase/command_center_items.sql");

    expect(commandCenterSql).toContain("public.assert_manage_account_access(p_account_id)");
    expect(commandCenterSql).not.toContain("assert_tenant_scope_access");
  });

  it("surfaces financial approval work orders through account-scoped command center items", () => {
    const commandCenterSql = readSql("supabase/command_center_items.sql");

    expect(commandCenterSql).toContain("'pending_quote_approval'::text as item_type");
    expect(commandCenterSql).toContain("lower(coalesce(fin.quote_status, '')) = 'submitted'");
    expect(commandCenterSql).toContain("'invoice_awaiting_approval'::text as item_type");
    expect(commandCenterSql).toContain("fin.invoice_amount is not null");
    expect(commandCenterSql).toContain("fin.account_id = p_account_id");
    expect(commandCenterSql).toContain("'work_order'::text as entity_type");
    expect(commandCenterSql).toContain("'action'::text as severity");
  });

  it("uses deterministic denied-path fixtures for cross-account, tenant, and contractor cases", () => {
    const { accountA, accountB } = isolationFixtures.accounts;
    const { tenantA1, tenantB1, contractorA1 } = isolationFixtures.users;
    const { crossAccountDashboard, tenantCrossRead, contractorCrossWorkOrder } =
      isolationFixtures.negativeCases;

    expect(crossAccountDashboard.actorAccountId).toBe(accountA.id);
    expect(crossAccountDashboard.targetAccountId).toBe(accountB.id);
    expect(crossAccountDashboard.actorAccountId).not.toBe(crossAccountDashboard.targetAccountId);

    expect(tenantCrossRead.actorTenantId).toBe(tenantA1.tenantId);
    expect(tenantCrossRead.targetTenantId).toBe(tenantB1.tenantId);
    expect(tenantCrossRead.actorTenantId).not.toBe(tenantCrossRead.targetTenantId);

    expect(contractorCrossWorkOrder.actorUserId).toBe(contractorA1.id);
    expect(contractorCrossWorkOrder.targetAccountId).toBe(accountB.id);
  });
});
