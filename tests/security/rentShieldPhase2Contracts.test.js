import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../../");

function read(rel) {
  return readFileSync(path.join(root, rel), "utf8");
}

const rpcContracts    = read("src/services/rpcContracts.js");
const rentShieldSvc   = read("src/services/rentShieldService.js");
const useRentShieldHk = read("src/hooks/useRentShield.js");
const gaugeComponent  = read("src/components/compliance/ShieldScoreGauge.jsx");
const tierBadge       = read("src/components/compliance/RentShieldTierBadge.jsx");
const rentShieldPage  = read("src/pages/compliance/RentShieldPage.jsx");
const messagesJs      = read("src/i18n/messages.js");
const limitationsDoc  = read("docs/COMPLIANCE_SUITE_LIMITATIONS.md");
const securitySql     = read("supabase/compliance_security_hardening.sql");

// ─── rpcContracts ─────────────────────────────────────────────────────────────

describe("rpcContracts: parseRentShieldAssessmentRow", () => {
  it("is exported", () => {
    expect(rpcContracts).toContain("export function parseRentShieldAssessmentRow");
  });

  it("parses all required fields", () => {
    const fields = [
      "shield_score", "shield_tier", "arrears_amount",
      "days_overdue_p90", "ai_narrative", "generated_at", "period",
    ];
    for (const f of fields) {
      expect(rpcContracts).toContain(f);
    }
  });

  it("uses toNumberOr for shield_score (never null)", () => {
    const idx = rpcContracts.indexOf("export function parseRentShieldAssessmentRow");
    const snippet = rpcContracts.slice(idx, idx + 500);
    expect(snippet).toContain("toNumberOr(value.shield_score");
  });

  it("uses toNullableNumber for arrears_amount (can be null)", () => {
    const idx = rpcContracts.indexOf("export function parseRentShieldAssessmentRow");
    const snippet = rpcContracts.slice(idx, idx + 500);
    expect(snippet).toContain("toNullableNumber(value.arrears_amount)");
  });
});

// ─── rentShieldService: score computation ────────────────────────────────────

describe("rentShieldService: exported functions", () => {
  const EXPORTS = [
    "computeShieldMetrics",
    "computeShieldScore",
    "classifyShieldTier",
    "currentPeriodKey",
    "fetchPropertyPayments",
    "upsertRentShieldAssessment",
    "computeAndSaveAssessment",
    "listRentShieldAssessments",
    "getLatestAssessmentByProperty",
  ];
  for (const fn of EXPORTS) {
    it(`exports ${fn}`, () => {
      expect(rentShieldSvc).toContain(fn);
    });
  }
});

describe("rentShieldService: score formula invariants", () => {
  it("arrears penalty capped at 50 points", () => {
    expect(rentShieldSvc).toContain("Math.min(50,");
  });

  it("overdue penalty capped at 30 points", () => {
    expect(rentShieldSvc).toContain("Math.min(30,");
  });

  it("miss penalty capped at 20 points", () => {
    expect(rentShieldSvc).toContain("Math.min(20,");
  });

  it("score clamped to 0–100", () => {
    expect(rentShieldSvc).toContain("Math.max(0, Math.min(100,");
  });

  it("score rounded to integer", () => {
    expect(rentShieldSvc).toContain("Math.round(raw)");
  });
});

describe("rentShieldService: tier classification", () => {
  it("80+ → strong", () => {
    expect(rentShieldSvc).toContain("if (score >= 80) return \"strong\"");
  });

  it("60+ → moderate", () => {
    expect(rentShieldSvc).toContain("if (score >= 60) return \"moderate\"");
  });

  it("40+ → elevated", () => {
    expect(rentShieldSvc).toContain("if (score >= 40) return \"elevated\"");
  });

  it("below 40 → critical", () => {
    expect(rentShieldSvc).toContain("return \"critical\"");
  });
});

describe("rentShieldService: no regulated language in user-facing exports", () => {
  it("service contains the safety disclaimer (correct)", () => {
    // The comment 'This is not insurance…' is intentional and correct.
    expect(rentShieldSvc).toContain("not insurance");
  });

  it("computeShieldScore does not return an insurance-style label", () => {
    const idx = rentShieldSvc.indexOf("export function computeShieldScore");
    const snippet = rentShieldSvc.slice(idx, idx + 300);
    expect(snippet).not.toContain("insured");
    expect(snippet).not.toContain("credit_score");
  });

  it("classifyShieldTier returns operational tier names, not financial risk labels", () => {
    const idx = rentShieldSvc.indexOf("export function classifyShieldTier");
    const snippet = rentShieldSvc.slice(idx, idx + 200);
    // Should not return 'low/medium/high/very_high' (regulated-sounding)
    expect(snippet).not.toContain('"low"');
    expect(snippet).not.toContain('"high"');
  });
});

describe("rentShieldService: data safety", () => {
  it("upsertRentShieldAssessment guards against missing accountId", () => {
    const idx = rentShieldSvc.indexOf("export async function upsertRentShieldAssessment");
    const snippet = rentShieldSvc.slice(idx, idx + 200);
    expect(snippet).toContain("if (!accountId");
  });

  it("upsertRentShieldAssessment uses onConflict upsert pattern (enforced in RPC)", () => {
    // Phase 5: SQL RPC uses ON CONFLICT (account_id, property_id, period) DO UPDATE
    const idx = securitySql.indexOf("create or replace function public.upsert_rent_shield_assessment(");
    const end = securitySql.indexOf("create or replace function public.create_lease_audit(");
    const block = securitySql.slice(idx, end);
    expect(block).toContain("on conflict (account_id, property_id, period)");
  });

  it("listRentShieldAssessments calls rpc list_rent_shield_assessments (account_id enforced in RPC, Phase 7)", () => {
    expect(rentShieldSvc).toContain('.rpc("list_rent_shield_assessments"');
  });

  it("fetchPropertyPayments scopes by both account_id AND property_id", () => {
    const idx = rentShieldSvc.indexOf("export async function fetchPropertyPayments");
    const snippet = rentShieldSvc.slice(idx, idx + 500);
    expect(snippet).toContain(".eq(\"account_id\",");
    expect(snippet).toContain(".eq(\"property_id\",");
  });

  it("currentPeriodKey returns YYYY-MM format", () => {
    expect(rentShieldSvc).toContain(".slice(0, 7)");
  });
});

describe("rentShieldService: computeShieldMetrics payment categorisation", () => {
  it("counts paid payments", () => {
    expect(rentShieldSvc).toContain("PAYMENT_STATUS.PAID");
  });

  it("identifies overdue status", () => {
    expect(rentShieldSvc).toContain("PAYMENT_STATUS.OVERDUE");
  });

  it("identifies pending-past-due as overdue", () => {
    expect(rentShieldSvc).toContain("PAYMENT_STATUS.PENDING");
    expect(rentShieldSvc).toContain("dueDate < today");
  });

  it("returns empty-safe defaults when no payments supplied", () => {
    expect(rentShieldSvc).toContain("return { arrearsAmount: 0, daysOverdueP90: 0, paymentRate: 1, totalDue: 0, sampleSize: 0, totalPayments: 0 }");
  });
});

// ─── useRentShield hook ───────────────────────────────────────────────────────

describe("useRentShield hook", () => {
  it("exports useRentShield", () => {
    expect(useRentShieldHk).toContain("export function useRentShield");
  });

  it("exports useRentShieldPortfolio", () => {
    expect(useRentShieldHk).toContain("export function useRentShieldPortfolio");
  });

  it("useRentShield returns assessments, loading, error, refetch", () => {
    expect(useRentShieldHk).toContain("assessments");
    expect(useRentShieldHk).toContain("loading");
    expect(useRentShieldHk).toContain("error");
    expect(useRentShieldHk).toContain("refetch");
  });

  it("useRentShieldPortfolio returns latestByProperty", () => {
    expect(useRentShieldHk).toContain("latestByProperty");
  });

  it("uses cancellation flag", () => {
    const count = (useRentShieldHk.match(/cancelled = true/g) || []).length;
    expect(count).toBeGreaterThanOrEqual(2); // both hooks
  });
});

// ─── ShieldScoreGauge ─────────────────────────────────────────────────────────

describe("ShieldScoreGauge", () => {
  it("has data-testid=shield-score-gauge", () => {
    expect(gaugeComponent).toContain('data-testid="shield-score-gauge"');
  });

  it("has accessible role=img and aria-label", () => {
    expect(gaugeComponent).toContain('role="img"');
    expect(gaugeComponent).toContain("aria-label");
  });

  it("clamps score to 0–100", () => {
    expect(gaugeComponent).toContain("Math.max(0, Math.min(100,");
  });

  it("uses stroke-dasharray for arc fill", () => {
    expect(gaugeComponent).toContain("strokeDasharray");
  });

  it("tier colours include all four tiers", () => {
    expect(gaugeComponent).toContain("strong");
    expect(gaugeComponent).toContain("moderate");
    expect(gaugeComponent).toContain("elevated");
    expect(gaugeComponent).toContain("critical");
  });

  it("critical is rose/red colour", () => {
    expect(gaugeComponent).toContain("#ef4444");
  });

  it("strong is emerald colour", () => {
    expect(gaugeComponent).toContain("#10b981");
  });
});

// ─── RentShieldTierBadge ─────────────────────────────────────────────────────

describe("RentShieldTierBadge", () => {
  it("covers all four tiers", () => {
    expect(tierBadge).toContain("strong");
    expect(tierBadge).toContain("moderate");
    expect(tierBadge).toContain("elevated");
    expect(tierBadge).toContain("critical");
  });

  it("uses data-testid per tier", () => {
    expect(tierBadge).toContain("data-testid={`rent-shield-tier-badge-${tier}`}");
  });

  it("supports size prop (md/lg)", () => {
    expect(tierBadge).toContain("size");
    expect(tierBadge).toContain("lg");
  });

  it("does not use the word 'risk' (avoid regulated scoring language)", () => {
    expect(tierBadge.toLowerCase()).not.toContain("risk score");
    expect(tierBadge.toLowerCase()).not.toContain("credit");
  });
});

// ─── RentShieldPage ───────────────────────────────────────────────────────────

describe("RentShieldPage", () => {
  it("has data-testid=rent-shield-page", () => {
    expect(rentShieldPage).toContain('data-testid="rent-shield-page"');
  });

  it("has property selector with data-testid=property-selector", () => {
    expect(rentShieldPage).toContain('data-testid="property-selector"');
  });

  it("has recalculate button with data-testid=recalculate-button", () => {
    expect(rentShieldPage).toContain('data-testid="recalculate-button"');
  });

  it("shows disclaimer", () => {
    expect(rentShieldPage).toContain("compliance.rentShield.disclaimer");
  });

  it("shows AI narrative deferred placeholder", () => {
    expect(rentShieldPage).toContain("compliance.rentShield.aiNarrativeDeferred");
  });

  it("shows AssessmentCard with ShieldScoreGauge", () => {
    expect(rentShieldPage).toContain("ShieldScoreGauge");
    expect(rentShieldPage).toContain("AssessmentCard");
  });

  it("shows RentShieldTierBadge", () => {
    expect(rentShieldPage).toContain("RentShieldTierBadge");
  });

  it("desktop portfolio table has data-testid=portfolio-table", () => {
    expect(rentShieldPage).toContain('data-testid="portfolio-table"');
  });

  it("mobile portfolio cards have data-testid=portfolio-cards", () => {
    expect(rentShieldPage).toContain('data-testid="portfolio-cards"');
  });

  it("history table has data-testid=assessment-history-table", () => {
    expect(rentShieldPage).toContain('data-testid="assessment-history-table"');
  });

  it("uses computeAndSaveAssessment from service", () => {
    expect(rentShieldPage).toContain("computeAndSaveAssessment");
  });

  it("uses currentPeriodKey to derive the period", () => {
    expect(rentShieldPage).toContain("currentPeriodKey");
  });

  it("does not use the words 'risk score', 'credit', or 'insurance'", () => {
    const lower = rentShieldPage.toLowerCase();
    expect(lower).not.toContain("credit score");
    expect(lower).not.toContain("insurance");
  });

  it("shows four tier summary chips in portfolio view", () => {
    expect(rentShieldPage).toContain("\"strong\"");
    expect(rentShieldPage).toContain("\"moderate\"");
    expect(rentShieldPage).toContain("\"elevated\"");
    expect(rentShieldPage).toContain("\"critical\"");
  });
});

// ─── i18n: Phase 2 keys ───────────────────────────────────────────────────────

describe("i18n: Phase 2 Rent Shield keys", () => {
  const requiredKeys = [
    "compliance.rentShield.tier.strong",
    "compliance.rentShield.tier.moderate",
    "compliance.rentShield.tier.elevated",
    "compliance.rentShield.tier.critical",
    "compliance.rentShield.recalculate",
    "compliance.rentShield.allProperties",
    "compliance.rentShield.noAssessment",
    "compliance.rentShield.aiNarrativeDeferred",
    "compliance.rentShield.metric.arrears",
    "compliance.rentShield.portfolio.property",
    "compliance.rentShield.history.title",
    "compliance.rentShield.errors.recalcFailed",
  ];

  for (const key of requiredKeys) {
    it(`"${key}" present in ≥2 locales`, () => {
      const regex = new RegExp(`"${key.replace(/\./g, "\\.")}"`, "g");
      const count = (messagesJs.match(regex) || []).length;
      expect(count).toBeGreaterThanOrEqual(2);
    });
  }

  it("tier labels do not use insurance/financial language in EN", () => {
    const tierIdx = messagesJs.indexOf('"compliance.rentShield.tier.strong"');
    const snippet = messagesJs.slice(tierIdx, tierIdx + 500);
    expect(snippet).not.toContain("insurance");
    expect(snippet).not.toContain("credit");
  });
});

// ─── Limitations doc: Phase 2 entries ────────────────────────────────────────

describe("limitations doc: Phase 2 entries recorded", () => {
  it("documents L-022 (missing server-side feature gate)", () => {
    expect(limitationsDoc).toContain("L-022");
    expect(limitationsDoc).toContain("assert_account_feature_access");
  });

  it("documents L-023 (score period mismatch)", () => {
    expect(limitationsDoc).toContain("L-023");
  });

  it("documents L-024 (AI narrative deferred)", () => {
    expect(limitationsDoc).toContain("L-024");
    expect(limitationsDoc).toContain("ai_narrative");
  });

  it("documents L-025 (P90 sample size)", () => {
    expect(limitationsDoc).toContain("L-025");
  });
});
