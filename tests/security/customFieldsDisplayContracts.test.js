import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  formatCustomFieldDisplayValue,
} from "../../src/services/customFieldService.js";

function readSource(relativePath) {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

describe("custom fields display contracts", () => {
  it("formats text, number, and date values for read-only display", () => {
    expect(formatCustomFieldDisplayValue("text", { text_value: "Blue gate" })).toBe("Blue gate");
    expect(formatCustomFieldDisplayValue("number", { number_value: 12.5 })).toBe("12.5");
    expect(formatCustomFieldDisplayValue("date", { date_value: "2026-04-06" })).toBe("2026-04-06");
    expect(formatCustomFieldDisplayValue("text", {})).toBe("—");
  });

  it("injects the read-only custom fields section into property and tenant detail pages", () => {
    const propertyDetailsSource = readSource("src/pages/PropertyDetails.jsx");
    const tenantDetailsSource = readSource("src/pages/TenantDetails.jsx");
    const sectionSource = readSource("src/components/CustomFieldsReadOnlySection.jsx");

    expect(propertyDetailsSource).toContain('entityType: "property"');
    expect(propertyDetailsSource).toContain("<CustomFieldsReadOnlySection");
    // Title is passed through the i18n function — verify the key, not the hardcoded English string
    expect(propertyDetailsSource).toContain('"customFields.propertyFieldsTitle"');

    expect(tenantDetailsSource).toContain('entityType: "tenant"');
    expect(tenantDetailsSource).toContain("<CustomFieldsReadOnlySection");
    expect(tenantDetailsSource).toContain('"customFields.tenantFieldsTitle"');

    expect(sectionSource).toContain("No custom fields configured yet.");
    expect(sectionSource).toContain("!loading && !hasRows");
  });
});
