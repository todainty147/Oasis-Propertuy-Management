import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// CustomFieldsFormSection uses useI18n() internally — provide a minimal mock
// so the component can render outside a real I18nProvider.
vi.mock("../../src/context/I18nContext", () => ({
  useI18n: () => ({
    t: (key) => {
      const map = {
        "customFields.title":       "Custom fields",
        "customFields.fieldFallback": "Custom field",
        "common.saving":            "Saving…",
      };
      return map[key] ?? key;
    },
  }),
}));

import CustomFieldsFormSection, {
  getCustomFieldInputType,
} from "../../src/components/CustomFieldsFormSection.jsx";
import {
  validateCustomFieldEntries,
  validateCustomFieldInput,
} from "../../src/services/customFieldService.js";

describe("custom fields form section", () => {
  it("maps supported field types to simple HTML input types", () => {
    expect(getCustomFieldInputType("text")).toBe("text");
    expect(getCustomFieldInputType("number")).toBe("number");
    expect(getCustomFieldInputType("date")).toBe("date");
    expect(getCustomFieldInputType("unknown")).toBe("text");
  });

  it("renders text, number, and date inputs from field definitions", () => {
    const html = renderToStaticMarkup(
      React.createElement(CustomFieldsFormSection, {
        title: "Custom details",
        definitions: [
          { id: "field-text", name: "Gate code", fieldType: "text" },
          { id: "field-number", name: "Parking spaces", fieldType: "number" },
          { id: "field-date", name: "Inspection date", fieldType: "date" },
        ],
        values: {
          "field-text": "A-14",
          "field-number": 3,
          "field-date": "2026-04-06",
        },
        onChange: vi.fn(),
      }),
    );

    expect(html).toContain("Custom details");
    expect(html).toContain('type="text"');
    expect(html).toContain('type="number"');
    expect(html).toContain('type="date"');
    expect(html).toContain('value="A-14"');
    expect(html).toContain('value="3"');
    expect(html).toContain('value="2026-04-06"');
  });

  it("renders a simple empty state when no definitions are supplied", () => {
    const html = renderToStaticMarkup(
      React.createElement(CustomFieldsFormSection, {
        definitions: [],
        emptyMessage: "Nothing configured yet.",
      }),
    );

    expect(html).toContain("Custom fields");
    expect(html).toContain("Nothing configured yet.");
  });

  it("renders inline errors and exposes shared validation for text, number, and date values", () => {
    const html = renderToStaticMarkup(
      React.createElement(CustomFieldsFormSection, {
        definitions: [{ id: "field-date", name: "Inspection date", fieldType: "date" }],
        values: { "field-date": "2026-13-99" },
        errors: { "field-date": "Enter a valid date in YYYY-MM-DD format." },
        onChange: vi.fn(),
      }),
    );

    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain("Enter a valid date in YYYY-MM-DD format.");

    expect(validateCustomFieldInput({ fieldType: "number" }, "abc")).toMatchObject({
      isValid: false,
      error: "Enter a valid number.",
    });
    expect(validateCustomFieldInput({ fieldType: "date" }, "2026-13-99")).toMatchObject({
      isValid: false,
      error: "Enter a valid date in YYYY-MM-DD format.",
    });
    expect(validateCustomFieldInput({ fieldType: "text" }, "x".repeat(501))).toMatchObject({
      isValid: false,
      error: "Text custom fields must be 500 characters or fewer.",
    });
    expect(
      validateCustomFieldEntries(
        [{ id: "field-date", fieldType: "date" }],
        { "field-date": "2026-04-06" },
      ),
    ).toMatchObject({
      isValid: true,
      errors: {},
      normalizedValues: { "field-date": "2026-04-06" },
    });
  });
});
