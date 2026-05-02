import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readSource(relativePath) {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

describe("custom fields edit contracts", () => {
  it("threads custom property fields through the shared property modal save flow", () => {
    // Property save logic lives in ManagerRoutes (routing shell); App.jsx is a thin wrapper
    const routesSource = readSource("src/routes/ManagerRoutes.jsx");
    const modalSource = readSource("src/components/AddPropertyModal.jsx");
    const serviceSource = readSource("src/services/customFieldService.js");

    expect(modalSource).toContain("<CustomFieldsFormSection");
    // Title is passed via i18n key — verify the key, not the hardcoded English string
    expect(modalSource).toContain('"customFields.propertyFieldsTitle"');
    expect(modalSource).toContain("customFieldValues");
    expect(modalSource).toContain("customFieldDefinitions");

    expect(routesSource).toContain("saveEntityCustomFieldValues");
    // Alignment whitespace may vary; check the key sub-expressions
    expect(routesSource).toContain("property.customFieldDefinitions");
    expect(routesSource).toContain("property.customFieldValues");

    expect(serviceSource).toContain("listEntityCustomFieldEditorState");
    expect(serviceSource).toContain("saveEntityCustomFieldValues");
    expect(serviceSource).toContain("validateCustomFieldEntries");
    expect(serviceSource).toContain('.from("custom_field_values")');
    expect(serviceSource).toContain(".upsert(payload");
    expect(modalSource).toContain("customFieldErrors");
    expect(modalSource).toContain("validateCustomFieldEntries");
  });

  it("adds a simple tenant edit form with custom field inputs on the tenant detail page", () => {
    const tenantDetailsSource = readSource("src/pages/TenantDetails.jsx");

    expect(tenantDetailsSource).toContain("<CustomFieldsFormSection");
    // Edit header rendered via i18n key
    expect(tenantDetailsSource).toContain('"tenantDetails.editTitle"');
    // Core save/validation calls must be present
    expect(tenantDetailsSource).toContain("saveEntityCustomFieldValues");
    expect(tenantDetailsSource).toContain("validateCustomFieldEntries");
    // Title is passed via i18n key
    expect(tenantDetailsSource).toContain('"customFields.tenantFieldsTitle"');
  });
});
