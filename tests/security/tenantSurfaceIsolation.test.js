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

  it("self-heals stale tenant filters so landlord property and tenant lists do not get trapped empty", () => {
    const tenantContextSource = readSource("src/context/TenantContext.jsx");
    const useTenantsSource = readSource("src/hooks/useTenants.js");
    const usePropertiesSource = readSource("src/hooks/useProperties.js");

    expect(tenantContextSource).toContain("useCallback");
    expect(useTenantsSource).toContain("const { activeTenantId, clearTenant } = useTenant();");
    expect(useTenantsSource).toContain("if (scopedTenants.length === 0)");
    expect(useTenantsSource).toContain("clearTenant();");
    expect(useTenantsSource).toContain("setTenants(data);");
    expect(usePropertiesSource).toContain("const { activeTenantId, clearTenant } = useTenant();");
    expect(usePropertiesSource).toContain(".eq(\"account_id\", activeAccountId)");
    expect(usePropertiesSource).toContain("await loadAccountProperties();");
  });

  it("keeps property tenant assignment synchronized with the tenant list source of truth", () => {
    const propertyServiceSource = readSource("src/services/propertyService.js");
    const addPropertyModalSource = readSource("src/components/AddPropertyModal.jsx");
    const propertiesSource = readSource("src/pages/Properties.jsx");

    expect(propertyServiceSource).toContain("async function syncTenantAssignment");
    expect(propertyServiceSource).toContain(".from(\"tenants\")");
    expect(propertyServiceSource).toContain(".update({ property_id: propertyId })");
    expect(propertyServiceSource).toContain(".update({ property_id: null })");
    expect(addPropertyModalSource).toContain("tenantId: form.tenantId || null");
    expect(propertiesSource).toContain("const isOccupied = Boolean(tenant);");
  });

  it("keeps direct property and tenant table reads aligned with dynamic role permissions", () => {
    const policySource = readSource("supabase/property_tenant_dynamic_permission_policies.sql");
    const dbApplySource = readSource("scripts/dbApplyRepoSql.js");

    expect(policySource).toContain("public.account_member_has_permission(account_id, 'properties.read')");
    expect(policySource).toContain("public.account_member_has_permission(account_id, 'properties.create')");
    expect(policySource).toContain("public.account_member_has_permission(account_id, 'properties.update')");
    expect(policySource).toContain("public.account_member_has_permission(account_id, 'properties.delete')");
    expect(policySource).toContain("public.account_member_has_permission(account_id, 'tenants.read')");
    expect(policySource).toContain("public.account_member_has_permission(account_id, 'tenants.create')");
    expect(policySource).toContain("public.account_member_has_permission(account_id, 'tenants.update')");
    expect(policySource).toContain("public.account_member_has_permission(account_id, 'tenants.delete')");
    expect(policySource).toContain("public.user_can_manage_account(account_id)");
    expect(dbApplySource).toContain('"property_tenant_dynamic_permission_policies.sql"');
  });

  it("keeps the tenant invite CTA aligned with invitation access instead of only tenant-create permission", () => {
    const tenantsSource = readSource("src/pages/Tenants.jsx");

    expect(tenantsSource).toContain("const canInviteTenant = useMemo");
    expect(tenantsSource).toContain('isManageRole(activeRole, { isRootOperator })');
    expect(tenantsSource).toContain('can(activePermissionContext, "users", "invite")');
    expect(tenantsSource).toContain("canCreateTenant(activePermissionContext)");
    expect(tenantsSource).toContain("{canInviteTenant && (");
  });

  it("gates the property performance card behind manage-role access", () => {
    const propertyDetailsSource = readSource("src/pages/PropertyDetails.jsx");

    expect(propertyDetailsSource).toContain("{canManageLease ? (");
    expect(propertyDetailsSource).toContain("<PropertyPerformanceCard");
  });

  it("keeps switched root support sessions distinct while restoring active-account read access", () => {
    const accountContextSource = readSource("src/context/AccountContext.jsx");
    const sidebarSource = readSource("src/layout/Sidebar.jsx");
    const brandingSqlSource = readSource("supabase/account_branding.sql");
    const propertiesSource = readSource("src/pages/Properties.jsx");
    const financeSource = readSource("src/pages/Finance.jsx");

    expect(accountContextSource).toContain('role: existing?.role || "root_support"');
    expect(accountContextSource).toContain('a.is_root && String(a.role || "").toLowerCase() === "owner"');
    expect(accountContextSource).toContain("const rootRows = await rootListAccounts(rootMembership.id);");
    expect(accountContextSource).toContain("const activePermissionContext = useMemo(");
    expect(sidebarSource).toContain("if (accountLoading || !isRootOperator || accounts.length <= 1) return null;");
    expect(brandingSqlSource).toContain("and public.account_member_effective_role(am.account_id, am.user_id) = 'owner'");
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
    expect(invitationSqlSource).toContain("Only root owner can list accounts");
    expect(invitationSqlSource).toContain("Only root owner can update account status");
    expect(invitationSqlSource).toContain("Only root owner can delete accounts");
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
