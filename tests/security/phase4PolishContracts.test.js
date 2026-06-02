import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../../");

function read(rel) {
  return readFileSync(path.join(root, rel), "utf8");
}

const billingPage     = read("src/pages/BillingPage.jsx");
const aiUsageCard     = read("src/components/AiUsageSummaryCard.jsx");
const sidebarJsx      = read("src/layout/Sidebar.jsx");
const messagesJs      = read("src/i18n/messages.js");
const entitlementsJs  = read("src/lib/entitlements.js");
const limitationsDoc  = read("docs/COMPLIANCE_SUITE_LIMITATIONS.md");

// ─── BillingPage: compliance feature matrix ───────────────────────────────────

describe("BillingPage: compliance feature matrix", () => {
  it("has data-testid=compliance-feature-matrix", () => {
    expect(billingPage).toContain('data-testid="compliance-feature-matrix"');
  });

  it("renders the compliance and risk feature rows", () => {
    expect(billingPage).toContain("billing.feature.taxReadiness");
    expect(billingPage).toContain("billing.feature.rentShield");
    expect(billingPage).toContain("billing.feature.aiRentShield");
    expect(billingPage).toContain("billing.feature.depositVault");
    expect(billingPage).toContain("billing.feature.ecoUpgrade");
    expect(billingPage).toContain("billing.feature.aiLeaseAuditor");
  });

  it("uses PLAN_RANKS constant to determine inclusion", () => {
    expect(billingPage).toContain("PLAN_RANKS");
  });

  it("ai_lease_auditor has minRank 3 (pro+)", () => {
    const idx = billingPage.indexOf("aiLeaseAuditor");
    const snippet = billingPage.slice(idx - 50, idx + 50);
    expect(snippet).toContain("3");
  });

  it("growth-tier compliance and risk rows have minRank 2 (growth+)", () => {
    const rows = billingPage.match(/\{.*?labelKey.*?minRank.*?\}/gs) || [];
    const growthRows = rows.filter((r) => r.includes("minRank: 2"));
    expect(growthRows.length).toBeGreaterThanOrEqual(5);
  });

  it("uses Check icon for included features", () => {
    expect(billingPage).toContain("Check");
    expect(billingPage).toContain("Minus");
  });

  it("renders disclaimer text via i18n key", () => {
    expect(billingPage).toContain("billing.complianceSuite.disclaimer");
  });

  it("imports Check and Minus icons", () => {
    expect(billingPage).toContain("Check,");
    expect(billingPage).toContain("Minus,");
  });
});

// ─── AiUsageSummaryCard: compliance AI feature labels ────────────────────────

describe("AiUsageSummaryCard: compliance feature labels", () => {
  // Feature labels moved from hardcoded FEATURE_LABELS in the component to
  // i18n keys (billing.aiUsage.feature.*) in messages.js. The component now
  // uses a dynamic t(`billing.aiUsage.feature.${f.featureKey}`) lookup.

  it("includes ai_rent_shield_explainer i18n key in messages.js", () => {
    expect(messagesJs).toContain("billing.aiUsage.feature.ai_rent_shield_explainer");
    expect(messagesJs).toContain("Rent Shield Explainer");
  });

  it("includes ai_lease_auditor i18n key in messages.js", () => {
    expect(messagesJs).toContain("billing.aiUsage.feature.ai_lease_auditor");
    expect(messagesJs).toContain("Lease Auditor");
  });

  it("has 7 billing.aiUsage.feature.* entries in messages.js", () => {
    const matches = messagesJs.match(/"billing\.aiUsage\.feature\.[^"]+"/g) || [];
    // EN + PL + DE = 3 locales × 7 features = 21 total occurrences
    const uniqueKeys = new Set(matches);
    expect(uniqueKeys.size).toBeGreaterThanOrEqual(7);
  });

  it("component uses dynamic i18n lookup for feature labels", () => {
    expect(aiUsageCard).toContain("billing.aiUsage.feature.");
  });
});

// ─── Sidebar: compliance section entitlement gating ──────────────────────────

describe("Sidebar: compliance section gated on TAX_READINESS_DASHBOARD", () => {
  it("uses hasEntitlement for compliance section visibility", () => {
    expect(sidebarJsx).toContain("hasEntitlement(ENTITLEMENT_FEATURES.TAX_READINESS_DASHBOARD)");
  });

  it("gates AI Lease Auditor nav item on AI_LEASE_AUDITOR entitlement", () => {
    expect(sidebarJsx).toContain("hasEntitlement(ENTITLEMENT_FEATURES.AI_LEASE_AUDITOR)");
  });

  it("Tax Readiness and Rent Shield items are visible to all growth+ without extra gate", () => {
    // Section gate is TAX_READINESS_DASHBOARD; Rent Shield item has no extra individual gate
    expect(sidebarJsx).toContain("/compliance/rent-shield");
    expect(sidebarJsx).toContain("/compliance/tax");
  });
});

// ─── i18n: Phase 4 billing keys ──────────────────────────────────────────────

describe("i18n: Phase 4 billing keys in all locales", () => {
  const requiredKeys = [
    "billing.complianceSuite.title",
    "billing.complianceSuite.subtitle",
    "billing.complianceSuite.disclaimer",
    "billing.feature.taxReadiness",
    "billing.feature.rentShield",
    "billing.feature.aiRentShield",
    "billing.feature.depositVault",
    "billing.feature.ecoUpgrade",
    "billing.feature.aiLeaseAuditor",
  ];

  for (const key of requiredKeys) {
    it(`"${key}" present in ≥2 locales`, () => {
      const regex = new RegExp(`"${key.replace(/\./g, "\\.")}"`, "g");
      const count = (messagesJs.match(regex) || []).length;
      expect(count).toBeGreaterThanOrEqual(2);
    });
  }

  it("compliance suite disclaimer warns about not being legal/tax advice", () => {
    const idx = messagesJs.indexOf('"billing.complianceSuite.disclaimer"');
    const snippet = messagesJs.slice(idx, idx + 300);
    expect(snippet.toLowerCase()).toMatch(/not.*advice|keine.*beratung|nie.*porady/);
  });
});

// ─── Cross-module: entitlements coherence ────────────────────────────────────

describe("entitlements: compliance feature coherence", () => {
  it("TAX_READINESS_DASHBOARD constant maps to correct key string", () => {
    expect(entitlementsJs).toContain('TAX_READINESS_DASHBOARD: "tax_readiness_dashboard"');
  });

  it("RENT_SHIELD constant maps to correct key string", () => {
    expect(entitlementsJs).toContain('RENT_SHIELD: "rent_shield"');
  });

  it("AI_RENT_SHIELD_EXPLAINER constant maps to correct key string", () => {
    expect(entitlementsJs).toContain('AI_RENT_SHIELD_EXPLAINER: "ai_rent_shield_explainer"');
  });

  it("AI_LEASE_AUDITOR constant maps to correct key string", () => {
    expect(entitlementsJs).toContain('AI_LEASE_AUDITOR: "ai_lease_auditor"');
  });

  it("TAX_READINESS_DASHBOARD is in GROWTH_FEATURES (matches minRank 2)", () => {
    const growthIdx = entitlementsJs.indexOf("const GROWTH_FEATURES");
    const proIdx    = entitlementsJs.indexOf("const PRO_FEATURES");
    const block     = entitlementsJs.slice(growthIdx, proIdx);
    expect(block).toContain("TAX_READINESS_DASHBOARD");
    expect(block).toContain("RENT_SHIELD");
    expect(block).toContain("AI_RENT_SHIELD_EXPLAINER");
  });

  it("AI_LEASE_AUDITOR is in PRO_FEATURES (matches minRank 3)", () => {
    const proIdx      = entitlementsJs.indexOf("const PRO_FEATURES");
    const operatorIdx = entitlementsJs.indexOf("const OPERATOR_AGENCY_FEATURES");
    const block       = entitlementsJs.slice(proIdx, operatorIdx);
    expect(block).toContain("AI_LEASE_AUDITOR");
  });

  it("growth plan rank is 2 (matches feature matrix minRank 2)", () => {
    expect(entitlementsJs).toContain("growth: 2");
  });

  it("pro plan rank is 3 (matches feature matrix minRank 3)", () => {
    expect(entitlementsJs).toContain("pro: 3");
  });
});

// ─── Limitations doc: Phase 4 entries ────────────────────────────────────────

describe("limitations doc: Phase 4 entries recorded", () => {
  it("documents L-034 (no current-plan highlight in matrix)", () => {
    expect(limitationsDoc).toContain("L-034");
  });

  it("documents L-035 (Starter discoverability gap)", () => {
    expect(limitationsDoc).toContain("L-035");
    expect(limitationsDoc).toContain("Starter");
  });

  it("documents L-036 (security hardening deferred to Phase 5)", () => {
    expect(limitationsDoc).toContain("L-036");
    expect(limitationsDoc).toContain("Phase 5");
  });
});
