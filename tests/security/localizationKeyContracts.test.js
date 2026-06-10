// tests/security/localizationKeyContracts.test.js
//
// Verifies that the three supported locales (pl, en, de) stay in sync and that
// known critical UI keys are present and non-empty in every locale.
//
// Failures here mean a locale silently falls back to key-path strings at
// runtime, which ship as literal "some.key.name" text in the UI.

import { describe, expect, it } from "vitest";

import { messages } from "../../src/i18n/messages.js";

const LOCALES = ["pl", "en", "de"];

// Keys that are allowed to have different values across locales (e.g. locale
// names) — excluded from the "same key set in all locales" check only when they
// are intentionally absent from some locales.
// Currently empty: we require full parity.
const INTENTIONALLY_ABSENT = new Set();

// ── helpers ────────────────────────────────────────────────────────────────────

function keysOf(locale) {
  return Object.keys(messages[locale] ?? {});
}

function symmetricDiff(setA, setB) {
  const inAonly = [...setA].filter((k) => !setB.has(k));
  const inBonly = [...setB].filter((k) => !setA.has(k));
  return { inAonly, inBonly };
}

// ── core parity tests ──────────────────────────────────────────────────────────

describe("locale message parity", () => {
  it("all three locales are present in messages", () => {
    for (const locale of LOCALES) {
      expect(messages[locale], `messages.${locale} is undefined`).toBeTruthy();
      expect(
        typeof messages[locale],
        `messages.${locale} is not an object`,
      ).toBe("object");
    }
  });

  it("pl and en have the same key set", () => {
    const plKeys = new Set(keysOf("pl").filter((k) => !INTENTIONALLY_ABSENT.has(k)));
    const enKeys = new Set(keysOf("en").filter((k) => !INTENTIONALLY_ABSENT.has(k)));
    const { inAonly, inBonly } = symmetricDiff(plKeys, enKeys);

    expect(inAonly, `Keys in pl but NOT in en (${inAonly.length}): ${inAonly.slice(0, 20).join(", ")}`).toHaveLength(0);
    expect(inBonly, `Keys in en but NOT in pl (${inBonly.length}): ${inBonly.slice(0, 20).join(", ")}`).toHaveLength(0);
  });

  it("de has at least every key that en has", () => {
    const enKeys = new Set(keysOf("en"));
    const deKeys = new Set(keysOf("de"));
    const missing = [...enKeys].filter((k) => !deKeys.has(k) && !INTENTIONALLY_ABSENT.has(k));

    expect(
      missing,
      `Keys in en but NOT in de (${missing.length}): ${missing.slice(0, 20).join(", ")}`,
    ).toHaveLength(0);
  });

  it("de has no extra keys that are absent from en", () => {
    const enKeys = new Set(keysOf("en"));
    const deKeys = new Set(keysOf("de"));
    const extra = [...deKeys].filter((k) => !enKeys.has(k) && !INTENTIONALLY_ABSENT.has(k));

    expect(
      extra,
      `Keys in de but NOT in en (${extra.length}): ${extra.slice(0, 20).join(", ")}`,
    ).toHaveLength(0);
  });

  it("no locale has a key that maps to an empty string", () => {
    for (const locale of LOCALES) {
      const empty = Object.entries(messages[locale] ?? {})
        .filter(([, v]) => typeof v === "string" && v.trim() === "")
        .map(([k]) => k);

      expect(
        empty,
        `${locale} has ${empty.length} key(s) with empty values: ${empty.slice(0, 10).join(", ")}`,
      ).toHaveLength(0);
    }
  });
});

// ── critical key spot-checks ───────────────────────────────────────────────────
// These are keys that, if missing, would ship broken UI. The list is not
// exhaustive — it covers the highest-value groups added or changed recently.

const CRITICAL_KEYS = [
  // common
  "common.loading",
  "common.close",
  "common.cancel",
  "common.save",
  "common.all",
  "common.viewAll",
  "common.noData",
  "common.error",
  "common.back",
  // navigation
  "sidebar.dashboard",
  "sidebar.properties",
  "sidebar.tenants",
  "sidebar.finance",
  "sidebar.documents",
  "sidebar.maintenanceInbox",
  "sidebar.contractors",
  "sidebar.billing",
  // Finance tabs
  "finance.tab.overview",
  "finance.tab.payments",
  "finance.tab.settings",
  "finance.searchPayments",
  // Documents
  "documents.dragOrClick",
  "documents.chooseScope",
  "documents.noFileSelected",
  // Maintenance KPI
  "maintenance.kpi.section.overview",
  "maintenance.kpi.section.financial",
  "maintenance.kpi.section.activity",
  "maintenance.kpi.financial.editBudget",
  "maintenance.kpi.financial.budgetUsage",
  // Portfolio Health
  "portfolio.section.health",
  "portfolio.section.occupancy",
  "portfolio.section.finance",
  "portfolio.section.maintenance",
  // Command Center
  "commandCenter.ai.showInsight",
  "commandCenter.ai.hideInsight",
  // Auth / Login
  "login.email",
  "login.password",
  "topbar.logout",
  // Tenant details
  "tenantDetails.tab.overview",
  "tenantDetails.tab.payments",
  "tenantDetails.tab.documents",
  "tenantDetails.tab.timeline",
  // Compliance Suite
  "compliance.tax.title",
  "compliance.rentShield.title",
  "compliance.leases.title",
];

describe("critical key presence in all locales", () => {
  for (const key of CRITICAL_KEYS) {
    it(`"${key}" is defined and non-empty in all locales`, () => {
      for (const locale of LOCALES) {
        const value = messages[locale]?.[key];
        expect(
          value,
          `messages.${locale}["${key}"] is missing or falsy`,
        ).toBeTruthy();
        expect(
          typeof value,
          `messages.${locale}["${key}"] is not a string`,
        ).toBe("string");
        expect(
          value.trim().length,
          `messages.${locale}["${key}"] is an empty string`,
        ).toBeGreaterThan(0);
      }
    });
  }
});

// ── no key should literally contain its own key path ──────────────────────────
// Catches cases where a key was added as a placeholder and never translated.

describe("no key value is a copy of its own key", () => {
  it("pl values are not copies of their key paths", () => {
    const selfReferential = Object.entries(messages.pl ?? {})
      .filter(([k, v]) => v === k)
      .map(([k]) => k);

    expect(
      selfReferential,
      `pl has ${selfReferential.length} key(s) whose value equals the key itself: ${selfReferential.slice(0, 10).join(", ")}`,
    ).toHaveLength(0);
  });

  it("en values are not copies of their key paths", () => {
    const selfReferential = Object.entries(messages.en ?? {})
      .filter(([k, v]) => v === k)
      .map(([k]) => k);

    expect(
      selfReferential,
      `en has ${selfReferential.length} key(s) whose value equals the key itself: ${selfReferential.slice(0, 10).join(", ")}`,
    ).toHaveLength(0);
  });
});
