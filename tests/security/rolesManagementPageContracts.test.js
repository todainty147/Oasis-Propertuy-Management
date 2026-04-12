import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readSource(relativePath) {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

describe("roles management page contracts", () => {
  it("registers the roles management route and sidebar entry", () => {
    const appSource = readSource("src/App.jsx");
    const sidebarSource = readSource("src/layout/Sidebar.jsx");

    expect(appSource).toContain('const RolesManagementPage = lazy(() => import("./pages/RolesManagementPage"));');
    expect(appSource).toContain('<Route path="settings/roles" element={<RolesManagementPage />} />');
    expect(sidebarSource).toContain('to="/settings/roles"');
    expect(sidebarSource).toContain('label="Roles"');
  });

  it("keeps the roles page behind manager or root access and supports create/update/assign flows", () => {
    const pageSource = readSource("src/pages/RolesManagementPage.jsx");
    const serviceSource = readSource("src/services/roleManagementService.js");

    expect(pageSource).toContain("const canManageRoles = isRootOperator || isManageRole(activeRole);");
    expect(pageSource).toContain('return <Navigate to="/dashboard" replace />;');
    expect(pageSource).toContain("Create role");
    expect(pageSource).toContain("Custom roles");
    expect(pageSource).toContain("Assign roles");
    expect(pageSource).toContain("handleCreateRole");
    expect(pageSource).toContain("handleSavePermissions");
    expect(pageSource).toContain("handleAssignRole");

    expect(serviceSource).toContain('supabase.rpc("list_account_roles"');
    expect(serviceSource).toContain('supabase.rpc("create_account_role"');
    expect(serviceSource).toContain('supabase.rpc("update_account_role_permissions"');
    expect(serviceSource).toContain('supabase.rpc("assign_account_member_role_id"');
    expect(serviceSource).toContain('supabase.rpc("list_account_members_for_role_assignment"');
    expect(serviceSource).toContain("parseAccountRoleRow");
    expect(serviceSource).toContain("parseAccountRoleAssignmentMemberRow");
    expect(serviceSource).toContain("parseAccountMemberRoleAssignmentResult");
  });
});
