import { readFileSync } from "node:fs";

import {
  can,
  canDeleteDocument,
  canEditDocumentTags,
  canUploadDocument,
} from "../../src/utils/permissions.js";

function readSource(relativePath) {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

describe("tenant surface isolation contracts", () => {
  it("keeps tenant users on the dedicated tenant payments experience instead of landlord finance", () => {
    const financePageSource = readSource("src/pages/FinancePage.jsx");
    const sidebarSource = readSource("src/layout/Sidebar.jsx");
    const topbarSource = readSource("src/layout/Topbar.jsx");

    expect(can("tenant", "finance", "read")).toBe(false);
    expect(financePageSource).toContain('Navigate to="/tenant/payments"');
    expect(sidebarSource).toContain('to={isTenant ? "/tenant/payments" : "/finance"}');
    expect(topbarSource).toContain("!isTenant && !tenantsLoading && tenants.length > 0");
  });

  it("gates the property performance card behind manage-role access", () => {
    const propertyDetailsSource = readSource("src/pages/PropertyDetails.jsx");

    expect(propertyDetailsSource).toContain("{canManageLease ? (");
    expect(propertyDetailsSource).toContain("<PropertyPerformanceCard");
  });

  it("keeps switched root support sessions distinct while restoring active-account read access", () => {
    const accountContextSource = readSource("src/context/AccountContext.jsx");
    const propertiesSource = readSource("src/pages/Properties.jsx");
    const financeSource = readSource("src/pages/Finance.jsx");

    expect(accountContextSource).toContain('role: existing?.role || "root_support"');
    expect(accountContextSource).toContain("const rootRows = await rootListAccounts(rootMembership.id);");
    expect(accountContextSource).toContain("const activePermissionContext = useMemo(");
    expect(propertiesSource).toContain('const canRead = isRootOperator || can(activePermissionContext, "properties", "read");');
    expect(propertiesSource).toContain('const canCreate = can(activePermissionContext, "properties", "create");');
    expect(propertiesSource).toContain('const canUpdate = can(activePermissionContext, "properties", "update");');
    expect(propertiesSource).toContain('const canDelete = can(activePermissionContext, "properties", "delete");');
    expect(financeSource).toContain('const canRead = isRootOperator || can(activePermissionContext, "finance", "read");');
  });

  it("restores root support access for billing and active-account invitations without leaking stale rows", () => {
    const billingSource = readSource("src/pages/BillingPage.jsx");
    const invitationsSource = readSource("src/pages/InvitationsPage.jsx");
    const invitationServiceSource = readSource("src/services/invitationService.js");
    const billingSqlSource = readSource("supabase/20260315_billing.sql");
    const invitationSqlSource = readSource("supabase/account_invitations_saas.sql");
    const rootSupportSqlSource = readSource("supabase/root_support_account_access.sql");

    expect(billingSource).toContain("() => isRootOperator || isManageRole(activeRole)");
    expect(billingSqlSource).toContain("public.user_can_manage_account(billing_subscriptions.account_id)");

    expect(invitationsSource).toContain("const canManageInvitations = canManage || isRootOperator;");
    expect(invitationsSource).toContain("setRows([]);");
    expect(invitationServiceSource).toContain('root_support: ["admin", "staff", "tenant", "contractor"]');
    expect(invitationSqlSource).toContain("public.user_can_manage_account(account_invitations.account_id)");
    expect(invitationSqlSource).toContain("if public.user_is_root_operator() then");
    expect(rootSupportSqlSource).toContain("create policy payments_select_member");
    expect(rootSupportSqlSource).toContain("create policy properties_select_member");
  });

  it("keeps tenant details and tenant documents scoped to manager-only routes and tenant-linked docs", () => {
    const tenantDetailsSource = readSource("src/pages/TenantDetails.jsx");
    const tenantDocumentsSource = readSource("src/components/TenantDocumentsSection.jsx");
    const topbarSource = readSource("src/layout/Topbar.jsx");

    expect(tenantDetailsSource).toContain('if (!canManageLease)');
    expect(tenantDetailsSource).toContain('<Navigate to="/dashboard" replace />');
    expect(tenantDocumentsSource).toContain('String(doc?.tenant_id || "") === String(tenantId)');
    expect(topbarSource).toContain('navigate("/login", { replace: true })');
  });

  it("keeps switched root support sessions out of ordinary lease and maintenance management gates", () => {
    const propertyDetailsSource = readSource("src/pages/PropertyDetails.jsx");
    const tenantDetailsSource = readSource("src/pages/TenantDetails.jsx");
    const maintenanceRequestsSource = readSource("src/components/MaintenanceRequestsSection.jsx");
    const workOrdersSource = readSource("src/components/WorkOrdersSection.jsx");
    const workOrderDetailsSource = readSource("src/pages/WorkOrderDetails.jsx");
    const preventiveSource = readSource("src/components/PropertyPreventiveMaintenanceCard.jsx");

    expect(propertyDetailsSource).toContain("const canManageLease = isManageRole(activeRole);");
    expect(propertyDetailsSource).not.toContain("isManageRole(activeRole, { isRootOperator })");

    expect(tenantDetailsSource).toContain("const canManageLease = isManageRole(activeRole);");
    expect(tenantDetailsSource).not.toContain("isManageRole(activeRole, { isRootOperator })");

    expect(maintenanceRequestsSource).toContain("return isManageRole(activeRole);");
    expect(maintenanceRequestsSource).not.toContain("isManageRole(activeRole, { isRootOperator })");

    expect(workOrdersSource).toContain("const canManage = useMemo(() => isManageRole(role), [role]);");
    expect(workOrdersSource).not.toContain("isManageRole(role, { isRootOperator })");

    expect(workOrderDetailsSource).toContain("const canManage = useMemo(() => isManageRole(role), [role]);");
    expect(workOrderDetailsSource).not.toContain("isManageRole(role, { isRootOperator })");

    expect(preventiveSource).toContain("const canManage = isManageRole(role);");
    expect(preventiveSource).not.toContain("isManageRole(role, { isRootOperator })");
  });

  it("keeps staff upload and delete behavior unchanged while allowing tags", () => {
    expect(canEditDocumentTags("staff")).toBe(true);
    expect(canUploadDocument("staff")).toBe(true);
    expect(canDeleteDocument("staff")).toBe(false);
  });

  it("renders document tag controls through the shared edit helper in both document sections", () => {
    const propertyDocumentsSource = readSource("src/components/PropertyDocumentsSection.jsx");
    const tenantDocumentsSource = readSource("src/components/TenantDocumentsSection.jsx");

    expect(propertyDocumentsSource).toContain("canEditDocumentTags(activePermissionContext)");
    expect(propertyDocumentsSource).toContain("startEditTags(doc)");
    expect(propertyDocumentsSource).toContain("saveTags(doc)");

    expect(tenantDocumentsSource).toContain("canEditDocumentTags(activePermissionContext)");
    expect(tenantDocumentsSource).toContain("startEditTags(doc)");
    expect(tenantDocumentsSource).toContain("saveTags(doc)");
  });
});
