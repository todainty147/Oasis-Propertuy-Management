import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readSource(relativePath) {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

describe("custom fields management page contracts", () => {
  it("registers the custom fields management route and sidebar entry", () => {
    const appSource = readSource("src/App.jsx");
    const sidebarSource = readSource("src/layout/Sidebar.jsx");

    expect(appSource).toContain('const CustomFieldsManagementPage = lazy(() => import("./pages/CustomFieldsManagementPage"));');
    expect(appSource).toContain('<Route path="settings/custom-fields" element={<CustomFieldsManagementPage />} />');
    expect(sidebarSource).toContain('to="/settings/custom-fields"');
    expect(sidebarSource).toContain('label="Custom fields"');
  });

  it("keeps the page behind manager or root access and supports create/list/delete flows", () => {
    const pageSource = readSource("src/pages/CustomFieldsManagementPage.jsx");
    const serviceSource = readSource("src/services/customFieldManagementService.js");

    expect(pageSource).toContain("const canManageCustomFields = isRootOperator || isManageRole(activeRole);");
    expect(pageSource).toContain('return <Navigate to="/dashboard" replace />;');
    expect(pageSource).toContain("Create field");
    expect(pageSource).toContain('{ value: "property", label: "Property" }');
    expect(pageSource).toContain('{ value: "tenant", label: "Tenant" }');
    expect(pageSource).toContain("handleCreateDefinition");
    expect(pageSource).toContain("handleDeleteDefinition");

    expect(serviceSource).toContain('.from("custom_field_definitions")');
    expect(serviceSource).toContain("listCustomFieldDefinitions");
    expect(serviceSource).toContain("createCustomFieldDefinition");
    expect(serviceSource).toContain("deleteCustomFieldDefinition");
  });
});
