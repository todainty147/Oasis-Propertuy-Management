import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../../");

function read(rel) {
  return readFileSync(path.join(root, rel), "utf8");
}

// ─── Source files under test ──────────────────────────────────────────────────

const phase0Sql        = read("supabase/compliance_suite_phase0.sql");
const entitlementsSql  = read("supabase/account_entitlements.sql");
const entitlementsJs   = read("src/lib/entitlements.js");
const appJsx           = read("src/App.jsx");
const sidebarJsx       = read("src/layout/Sidebar.jsx");
const taxPage          = read("src/pages/compliance/TaxReadinessPage.jsx");
const rentShieldPage   = read("src/pages/compliance/RentShieldPage.jsx");
const leaseAuditorPage = read("src/pages/compliance/LeaseAuditorPage.jsx");
const messagesJs       = read("src/i18n/messages.js");

// ─── SQL — RLS safety ────────────────────────────────────────────────────────

describe("RLS — safe account-access pattern", () => {
  const tables = [
    "tax_records_account_member",
    "tax_exports_account_member",
    "rent_shield_account_member",
    "lease_audits_account_member",
    "lease_audit_findings_account_member",
  ];

  for (const policy of tables) {
    it(`${policy} uses user_can_manage_account`, () => {
      expect(phase0Sql).toContain(policy);
      const idx = phase0Sql.indexOf(policy);
      const snippet = phase0Sql.slice(idx, idx + 300);
      expect(snippet).toContain("user_can_manage_account(account_id)");
    });
  }

  it("never uses the unsafe subquery pattern", () => {
    expect(phase0Sql).not.toContain(
      "select account_id from account_members where user_id = auth.uid() limit 1"
    );
    expect(entitlementsSql).not.toContain(
      "select account_id from account_members where user_id = auth.uid() limit 1"
    );
  });

  it("all five new tables have RLS enabled", () => {
    const tables = [
      "tax_records",
      "tax_exports",
      "rent_shield_assessments",
      "lease_audits",
      "lease_audit_findings",
    ];
    for (const t of tables) {
      expect(phase0Sql).toContain(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY`);
    }
  });

  it("RLS policies use USING and WITH CHECK (write protection)", () => {
    const policies = [
      "tax_records_account_member",
      "tax_exports_account_member",
      "rent_shield_account_member",
      "lease_audits_account_member",
      "lease_audit_findings_account_member",
    ];
    for (const p of policies) {
      const idx = phase0Sql.indexOf(p);
      const snippet = phase0Sql.slice(idx, idx + 400);
      expect(snippet).toContain("USING");
      expect(snippet).toContain("WITH CHECK");
    }
  });
});

// ─── SQL — Table structure ────────────────────────────────────────────────────

describe("tax_records table", () => {
  it("has required columns", () => {
    const idx = phase0Sql.indexOf("CREATE TABLE IF NOT EXISTS public.tax_records");
    const snippet = phase0Sql.slice(idx, idx + 1500);
    expect(snippet).toContain("account_id");
    expect(snippet).toContain("record_type");
    expect(snippet).toContain("tax_treatment");
    expect(snippet).toContain("evidence_status");
    expect(snippet).toContain("review_status");
    expect(snippet).toContain("country_code");
    expect(snippet).toContain("record_date");
  });

  it("record_type CHECK only allows allowed values", () => {
    expect(phase0Sql).toContain("'income', 'expense', 'adjustment', 'evidence'");
  });

  it("tax_treatment CHECK includes all five values", () => {
    const values = [
      "likely_allowable",
      "likely_disallowable",
      "review_required",
      "capital_candidate",
      "evidence_only",
    ];
    for (const v of values) {
      expect(phase0Sql).toContain(v);
    }
  });

  it("evidence_status and review_status have correct CHECK constraints", () => {
    expect(phase0Sql).toContain("'missing', 'partial', 'complete'");
    expect(phase0Sql).toContain("'unreviewed', 'reviewed', 'excluded'");
  });

  it("has index on (account_id, country_code)", () => {
    expect(phase0Sql).toContain("idx_tax_records_country_code");
  });
});

describe("rent_shield_assessments table", () => {
  it("uses shield_score not risk_score", () => {
    expect(phase0Sql).toContain("shield_score");
    expect(phase0Sql).not.toContain("risk_score");
  });

  it("shield_tier uses non-financial tier labels", () => {
    expect(phase0Sql).toContain("'strong', 'moderate', 'elevated', 'critical'");
    // Confirm the rent_shield_assessments table specifically avoids insurance/credit language
    const tableStart = phase0Sql.indexOf("CREATE TABLE IF NOT EXISTS public.rent_shield_assessments");
    const tableEnd = phase0Sql.indexOf("COMMENT ON TABLE public.rent_shield_assessments");
    const tableBlock = phase0Sql.slice(tableStart, tableEnd);
    expect(tableBlock).not.toContain("risk_score");
    expect(tableBlock).not.toContain("'low', 'medium', 'high'");
  });

  it("has UNIQUE constraint on (account_id, property_id, period)", () => {
    expect(phase0Sql).toContain("UNIQUE (account_id, property_id, period)");
  });

  it("disclaimer in COMMENT makes clear this is not insurance or financial advice", () => {
    expect(phase0Sql).toContain("Not insurance");
    expect(phase0Sql).toContain("not credit scoring");
    expect(phase0Sql).toContain("not financial advice");
  });
});

describe("lease_audits table", () => {
  it("has status CHECK with lifecycle values", () => {
    expect(phase0Sql).toContain("'pending', 'processing', 'complete', 'failed', 'stale'");
  });

  it("has overall_risk CHECK", () => {
    expect(phase0Sql).toContain("'low', 'medium', 'high', 'critical'");
  });

  it("COMMENT notes text extraction is deferred", () => {
    expect(phase0Sql).toContain("text extraction deferred");
  });
});

describe("lease_audit_findings table", () => {
  it("has dismissed, dismissed_by, dismissed_at columns", () => {
    const idx = phase0Sql.indexOf("CREATE TABLE IF NOT EXISTS public.lease_audit_findings");
    const snippet = phase0Sql.slice(idx, idx + 800);
    expect(snippet).toContain("dismissed");
    expect(snippet).toContain("dismissed_by");
    expect(snippet).toContain("dismissed_at");
  });

  it("risk_level CHECK is consistent with lease_audits overall_risk values", () => {
    const idx = phase0Sql.indexOf("CREATE TABLE IF NOT EXISTS public.lease_audit_findings");
    const snippet = phase0Sql.slice(idx, idx + 600);
    expect(snippet).toContain("'low', 'medium', 'high', 'critical'");
  });
});

describe("compliance_items: tax columns", () => {
  it("adds jurisdiction, tax_filing_type, deadline_date, filed_at, filing_reference", () => {
    const cols = ["jurisdiction", "tax_filing_type", "deadline_date", "filed_at", "filing_reference"];
    for (const col of cols) {
      expect(phase0Sql).toContain(col);
    }
  });
});

describe("ai_insights: expanded insight_type constraint", () => {
  it("drops old constraint and adds new one", () => {
    expect(phase0Sql).toContain("DROP CONSTRAINT IF EXISTS ai_insights_type_check");
    expect(phase0Sql).toContain("ADD CONSTRAINT ai_insights_type_check");
  });

  it("includes all five values already inserted by existing edge functions", () => {
    const edgeFunctionTypes = [
      "attention_briefing",
      "contractor_recommendation",
      "maintenance_triage_suggestion",
      "property_health_explainer",
      "weekly_portfolio_summary_ai",
    ];
    for (const t of edgeFunctionTypes) {
      expect(phase0Sql).toContain(`'${t}'`);
    }
  });

  it("adds lease_clause_audit for future Lease Auditor phase", () => {
    expect(phase0Sql).toContain("'lease_clause_audit'");
  });

  it("adds rent_shield_explainer (not rent_risk_score)", () => {
    expect(phase0Sql).toContain("'rent_shield_explainer'");
    expect(phase0Sql).not.toContain("'rent_risk_score'");
  });
});

// ─── SQL — Feature entitlement mapping ───────────────────────────────────────

// L-001: compliance keys consolidated into account_entitlements.sql (canonical).
// Tests now verify the canonical file (entitlementsSql) rather than phase0Sql.
describe("account_feature_required_plan: compliance keys (canonical: account_entitlements.sql)", () => {
  const growthKeys = [
    "tax_readiness_dashboard",
    "rent_shield",
    "ai_rent_shield_explainer",
  ];
  const proKeys = ["ai_lease_auditor"];

  for (const key of growthKeys) {
    it(`maps ${key} → growth`, () => {
      expect(entitlementsSql).toContain(`when '${key}'`);
      const idx = entitlementsSql.indexOf(`when '${key}'`);
      const snippet = entitlementsSql.slice(idx, idx + 60);
      expect(snippet).toContain("growth");
    });
  }

  for (const key of proKeys) {
    it(`maps ${key} → pro`, () => {
      expect(entitlementsSql).toContain(`when '${key}'`);
      const idx = entitlementsSql.indexOf(`when '${key}'`);
      const snippet = entitlementsSql.slice(idx, idx + 60);
      expect(snippet).toContain("pro");
    });
  }

  it("preserves all pre-existing feature keys", () => {
    const existing = [
      "command_center",
      "portfolio_health",
      "maintenance_kpi",
      "playbooks",
      "advanced_automation",
      "security_audit",
      "ai_maintenance_triage",
      "ai_contractor_recommendation",
      "ai_security_copilot",
    ];
    for (const key of existing) {
      expect(entitlementsSql).toContain(`'${key}'`);
    }
  });
});

describe("account_entitlements.sql: operator_agency plan rank", () => {
  it("account_plan_rank returns 4 for operator_agency", () => {
    expect(entitlementsSql).toContain("when 'operator_agency' then 4");
  });

  it("account_subscription_plan returns operator_agency for root accounts", () => {
    expect(entitlementsSql).toContain("when a.is_root then 'operator_agency'");
  });

  it("pro still maps to 3", () => {
    expect(entitlementsSql).toContain("when 'pro'");
    const idx = entitlementsSql.indexOf("when 'pro'");
    const snippet = entitlementsSql.slice(idx, idx + 50);
    expect(snippet).toContain("3");
  });
});

// ─── Frontend — entitlements.js ──────────────────────────────────────────────

describe("entitlements.js: compliance feature constants", () => {
  it("exports TAX_READINESS_DASHBOARD constant", () => {
    expect(entitlementsJs).toContain('TAX_READINESS_DASHBOARD: "tax_readiness_dashboard"');
  });

  it("exports RENT_SHIELD constant", () => {
    expect(entitlementsJs).toContain('RENT_SHIELD: "rent_shield"');
  });

  it("exports AI_RENT_SHIELD_EXPLAINER constant", () => {
    expect(entitlementsJs).toContain('AI_RENT_SHIELD_EXPLAINER: "ai_rent_shield_explainer"');
  });

  it("exports AI_LEASE_AUDITOR constant", () => {
    expect(entitlementsJs).toContain('AI_LEASE_AUDITOR: "ai_lease_auditor"');
  });

  it("GROWTH_FEATURES includes all three growth-tier compliance features", () => {
    const growthIdx = entitlementsJs.indexOf("const GROWTH_FEATURES");
    const proIdx = entitlementsJs.indexOf("const PRO_FEATURES");
    const growthBlock = entitlementsJs.slice(growthIdx, proIdx);
    expect(growthBlock).toContain("TAX_READINESS_DASHBOARD");
    expect(growthBlock).toContain("RENT_SHIELD");
    expect(growthBlock).toContain("AI_RENT_SHIELD_EXPLAINER");
  });

  it("PRO_FEATURES includes AI_LEASE_AUDITOR", () => {
    const proIdx = entitlementsJs.indexOf("const PRO_FEATURES");
    const operatorIdx = entitlementsJs.indexOf("const OPERATOR_AGENCY_FEATURES");
    const proBlock = entitlementsJs.slice(proIdx, operatorIdx);
    expect(proBlock).toContain("AI_LEASE_AUDITOR");
  });

  it("AI_LEASE_AUDITOR is not in GROWTH_FEATURES (pro+ only)", () => {
    const growthIdx = entitlementsJs.indexOf("const GROWTH_FEATURES");
    const proIdx = entitlementsJs.indexOf("const PRO_FEATURES");
    const growthBlock = entitlementsJs.slice(growthIdx, proIdx);
    expect(growthBlock).not.toContain("AI_LEASE_AUDITOR");
  });

  it("PLAN_RANKS includes operator_agency at 4", () => {
    expect(entitlementsJs).toContain("operator_agency: 4");
  });
});

// ─── Frontend — routes ────────────────────────────────────────────────────────

// Compliance routes moved from App.jsx to src/routes/ManagerRoutes.jsx
const managerRoutes = read("src/routes/ManagerRoutes.jsx");

describe("ManagerRoutes.jsx: compliance routes", () => {
  it("imports TaxReadinessPage", () => {
    expect(managerRoutes).toContain("TaxReadinessPage");
    expect(managerRoutes).toContain("pages/compliance/TaxReadinessPage");
  });

  it("imports RentShieldPage", () => {
    expect(managerRoutes).toContain("RentShieldPage");
    expect(managerRoutes).toContain("pages/compliance/RentShieldPage");
  });

  it("imports LeaseAuditorPage", () => {
    expect(managerRoutes).toContain("LeaseAuditorPage");
    expect(managerRoutes).toContain("pages/compliance/LeaseAuditorPage");
  });

  it("tax route is guarded by TAX_READINESS_DASHBOARD entitlement", () => {
    expect(managerRoutes).toContain("compliance/tax");
    expect(managerRoutes).toContain("TAX_READINESS_DASHBOARD");
  });

  it("rent-shield route is guarded by RENT_SHIELD entitlement", () => {
    expect(managerRoutes).toContain("compliance/rent-shield");
    expect(managerRoutes).toContain("RENT_SHIELD");
  });

  it("leases route is guarded by AI_LEASE_AUDITOR entitlement", () => {
    expect(managerRoutes).toContain("compliance/leases");
    expect(managerRoutes).toContain("AI_LEASE_AUDITOR");
  });
});

// ─── Frontend — sidebar ────────────────────────────────────────────────────────

describe("Sidebar.jsx: compliance nav section", () => {
  it("imports Scale, Receipt, Umbrella, FileSearch icons", () => {
    expect(sidebarJsx).toContain("Scale");
    expect(sidebarJsx).toContain("Receipt");
    expect(sidebarJsx).toContain("Umbrella");
    expect(sidebarJsx).toContain("FileSearch");
  });

  it("has compliance section state", () => {
    expect(sidebarJsx).toContain("complianceOpen");
    expect(sidebarJsx).toContain("setComplianceOpen");
  });

  it("links to all three compliance routes", () => {
    expect(sidebarJsx).toContain("/compliance/tax");
    expect(sidebarJsx).toContain("/compliance/rent-shield");
    expect(sidebarJsx).toContain("/compliance/leases");
  });
});

// ─── Frontend — stub pages: disclaimer present ───────────────────────────────

describe("TaxReadinessPage: disclaimer", () => {
  it("has data-testid", () => {
    expect(taxPage).toContain('data-testid="tax-readiness-page"');
  });

  it("renders disclaimer via i18n key", () => {
    expect(taxPage).toContain("compliance.tax.disclaimer");
  });

  it("does not claim to file taxes or give advice", () => {
    expect(taxPage).not.toContain("file your taxes");
    expect(taxPage).not.toContain("tax advice");
  });
});

describe("RentShieldPage: disclaimer", () => {
  it("has data-testid", () => {
    expect(rentShieldPage).toContain('data-testid="rent-shield-page"');
  });

  it("renders disclaimer via i18n key", () => {
    expect(rentShieldPage).toContain("compliance.rentShield.disclaimer");
  });

  it("does not use risk_score terminology", () => {
    expect(rentShieldPage).not.toContain("risk_score");
    expect(rentShieldPage).not.toContain("riskScore");
  });
});

describe("LeaseAuditorPage: disclaimer", () => {
  it("has data-testid", () => {
    expect(leaseAuditorPage).toContain('data-testid="lease-auditor-page"');
  });

  it("renders disclaimer via i18n key", () => {
    expect(leaseAuditorPage).toContain("compliance.leases.disclaimer");
  });

  it("notes text extraction is deferred", () => {
    expect(leaseAuditorPage).toContain("compliance.leases.aiExtractionDeferred");
  });
});

// ─── i18n: all three locales have compliance keys ────────────────────────────

describe("i18n: compliance keys present in all locales", () => {
  const enDisclaimerStart = messagesJs.indexOf('"compliance.tax.disclaimer"');
  const plDisclaimerStart = messagesJs.lastIndexOf('"compliance.tax.disclaimer"');

  it("EN has compliance.tax.title", () => {
    expect(messagesJs).toContain('"compliance.tax.title"');
  });

  it("EN has compliance.rentShield.disclaimer", () => {
    expect(messagesJs).toContain('"compliance.rentShield.disclaimer"');
  });

  it("EN has compliance.leases.aiExtractionDeferred", () => {
    expect(messagesJs).toContain('"compliance.leases.aiExtractionDeferred"');
  });

  it("PL has compliance.tax.title (separate occurrence from EN)", () => {
    expect(enDisclaimerStart).not.toBe(plDisclaimerStart);
  });

  it("DE has compliance.tax.title", () => {
    const last = messagesJs.lastIndexOf('"compliance.tax.title"');
    const first = messagesJs.indexOf('"compliance.tax.title"');
    expect(last).toBeGreaterThan(first);
  });

  it("EN has sidebar.section.compliance", () => {
    expect(messagesJs).toContain('"sidebar.section.compliance"');
  });

  it("all locales have entitlements.feature.ai_lease_auditor", () => {
    const occurrences = (messagesJs.match(/"entitlements\.feature\.ai_lease_auditor"/g) || []).length;
    expect(occurrences).toBeGreaterThanOrEqual(3);
  });

  it("disclaimer text does not claim tax advice in EN", () => {
    const enIdx = messagesJs.indexOf('"compliance.tax.disclaimer"');
    const enSnippet = messagesJs.slice(enIdx, enIdx + 300);
    expect(enSnippet).toContain("does not constitute tax advice");
  });

  it("RentShield disclaimer text does not claim insurance or financial advice in EN", () => {
    const enIdx = messagesJs.indexOf('"compliance.rentShield.disclaimer"');
    const enSnippet = messagesJs.slice(enIdx, enIdx + 400);
    expect(enSnippet).toContain("not insurance");
    expect(enSnippet).toContain("not credit scoring");
    expect(enSnippet).toContain("financial advice");
  });
});
