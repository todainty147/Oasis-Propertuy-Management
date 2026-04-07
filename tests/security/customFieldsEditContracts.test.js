import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readSource(relativePath) {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

describe("custom fields edit contracts", () => {
  it("threads custom property fields through the shared property modal save flow", () => {
    const appSource = readSource("src/App.jsx");
    const modalSource = readSource("src/components/AddPropertyModal.jsx");
    const serviceSource = readSource("src/services/customFieldService.js");

    expect(modalSource).toContain("<CustomFieldsFormSection");
    expect(modalSource).toContain('title="Custom property fields"');
    expect(modalSource).toContain("customFieldValues");
    expect(modalSource).toContain("customFieldDefinitions");

    expect(appSource).toContain("saveEntityCustomFieldValues");
    expect(appSource).toContain("definitions: property.customFieldDefinitions");
    expect(appSource).toContain("values: property.customFieldValues");

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
    expect(tenantDetailsSource).toContain("Edit tenant details");
    expect(tenantDetailsSource).toContain("handleSaveTenantDetails");
    expect(tenantDetailsSource).toContain("saveEntityCustomFieldValues");
    expect(tenantDetailsSource).toContain("editCustomFieldErrors");
    expect(tenantDetailsSource).toContain("validateCustomFieldEntries");
    expect(tenantDetailsSource).toContain('title="Custom tenant fields"');
  });
});
