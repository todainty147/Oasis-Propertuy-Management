// tests/unit/e170_balance_selector.test.js
// E-170 P0-C validation — typed authority contract tests.
//
// Four required cases per Prompt B:
//   (1) unknown-state: no £0, no outstandingMinor, shows reason copy
//   (2) known zero/paid: isClear=true, outstandingMinor=0, no overdue
//   (3) known overdue: isOverdue=true, outstandingMinor>0, "Rent at risk" eligible
//   (4) ambiguous attribution (R3): attributed=false, no balance object
//
// Structural contracts also verified (selector source, no calculatePropertyFinance
// import on routed surfaces).

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  selectPropertyBalance,
  findPropertyBalanceRow,
  selectTenantBalance,
} from "../../src/utils/balanceSelector.js";
import { BALANCE_REASON_COPY } from "../../src/types/finance.js";
import { getPropertyOverdueRemaining } from "../../src/utils/financeSnapshot.js";

// ── helpers ───────────────────────────────────────────────────────────────────

function knownRow({ outstandingMinor, paymentStatus, paid = 0, remaining = 0 }) {
  return {
    balanceState: "known",
    outstandingMinor,
    paymentStatus,
    paid,
    remaining,
    reasonCode: null,
  };
}

function unknownRow(reasonCode = "PAYMENT_HISTORY_NOT_IMPORTED", balanceState = "unknown_payment_history") {
  return { balanceState, outstandingMinor: null, paymentStatus: null, reasonCode };
}

// ── Case 1: unknown state — no £0, no monetary claim ─────────────────────────

describe("selectPropertyBalance — unknown state (Case 1)", () => {
  it("isKnown is false when balanceState is unknown_payment_history", () => {
    const result = selectPropertyBalance(unknownRow("PAYMENT_HISTORY_NOT_IMPORTED"));
    expect(result.isKnown).toBe(false);
  });

  it("outstandingMinor is null — never coerced to 0", () => {
    const result = selectPropertyBalance(unknownRow("PAYMENT_HISTORY_NOT_IMPORTED"));
    expect(result.outstandingMinor).toBeNull();
  });

  it("paid is null — no monetary claim when unknown", () => {
    const result = selectPropertyBalance(unknownRow("PAYMENT_HISTORY_NOT_IMPORTED"));
    expect(result.paid).toBeNull();
  });

  it("remaining is null — never shown as a number when unknown", () => {
    const result = selectPropertyBalance(unknownRow("PAYMENT_HISTORY_NOT_IMPORTED"));
    expect(result.remaining).toBeNull();
  });

  it("isOverdue is false — never shows overdue state when unknown", () => {
    const result = selectPropertyBalance(unknownRow());
    expect(result.isOverdue).toBe(false);
  });

  it("isClear is false — never shows paid/clear state when unknown", () => {
    const result = selectPropertyBalance(unknownRow());
    expect(result.isClear).toBe(false);
  });

  it("reasonPrimary is populated from BALANCE_REASON_COPY", () => {
    const result = selectPropertyBalance(unknownRow("PAYMENT_HISTORY_NOT_IMPORTED"));
    expect(result.reasonPrimary).toBe(BALANCE_REASON_COPY["PAYMENT_HISTORY_NOT_IMPORTED"]?.primary);
    expect(typeof result.reasonPrimary).toBe("string");
    expect(result.reasonPrimary.length).toBeGreaterThan(0);
  });

  it("reasonPrimary for PAYMENT_HISTORY_INCOMPLETE is populated", () => {
    const result = selectPropertyBalance(unknownRow("PAYMENT_HISTORY_INCOMPLETE", "unknown_payment_history"));
    expect(result.reasonPrimary).toBe(BALANCE_REASON_COPY["PAYMENT_HISTORY_INCOMPLETE"]?.primary);
  });

  it("null snapshotRow treats as unknown with fallback reasonCode", () => {
    const result = selectPropertyBalance(null);
    expect(result.isKnown).toBe(false);
    expect(result.outstandingMinor).toBeNull();
    expect(result.reasonCode).toBe("PAYMENT_HISTORY_NOT_IMPORTED");
  });

  it("balanceState not_started also produces unknown result", () => {
    const result = selectPropertyBalance({ balanceState: "not_started", outstandingMinor: null, reasonCode: "TENANCY_NOT_STARTED" });
    expect(result.isKnown).toBe(false);
    expect(result.reasonCode).toBe("TENANCY_NOT_STARTED");
  });
});

// ── Case 2: known zero/paid ────────────────────────────────────────────────────

describe("selectPropertyBalance — known zero / paid state (Case 2)", () => {
  it("isClear is true when outstandingMinor is 0", () => {
    const result = selectPropertyBalance(knownRow({ outstandingMinor: 0, paymentStatus: "paid", paid: 1200, remaining: 0 }));
    expect(result.isKnown).toBe(true);
    expect(result.isClear).toBe(true);
  });

  it("isClear is true when paymentStatus is 'paid'", () => {
    const result = selectPropertyBalance(knownRow({ outstandingMinor: 0, paymentStatus: "paid" }));
    expect(result.isClear).toBe(true);
  });

  it("isOverdue is false when clear/paid", () => {
    const result = selectPropertyBalance(knownRow({ outstandingMinor: 0, paymentStatus: "paid" }));
    expect(result.isOverdue).toBe(false);
  });

  it("outstandingMinor is 0 (not null) when known and clear", () => {
    const result = selectPropertyBalance(knownRow({ outstandingMinor: 0, paymentStatus: "paid" }));
    expect(result.outstandingMinor).toBe(0);
  });

  it("reasonPrimary is null when known", () => {
    const result = selectPropertyBalance(knownRow({ outstandingMinor: 0, paymentStatus: "paid" }));
    expect(result.reasonPrimary).toBeNull();
  });

  it("paid field is surfaced when known", () => {
    const result = selectPropertyBalance(knownRow({ outstandingMinor: 0, paymentStatus: "paid", paid: 1400, remaining: 0 }));
    expect(result.paid).toBe(1400);
  });
});

// ── Case 3: known overdue ─────────────────────────────────────────────────────

describe("selectPropertyBalance — known overdue (Case 3)", () => {
  it("isOverdue is true when paymentStatus is 'overdue'", () => {
    const result = selectPropertyBalance(knownRow({ outstandingMinor: 120000, paymentStatus: "overdue", remaining: 1200 }));
    expect(result.isOverdue).toBe(true);
  });

  it("isClear is false when overdue", () => {
    const result = selectPropertyBalance(knownRow({ outstandingMinor: 120000, paymentStatus: "overdue", remaining: 1200 }));
    expect(result.isClear).toBe(false);
  });

  it("outstandingMinor is the minor-units value when overdue", () => {
    const result = selectPropertyBalance(knownRow({ outstandingMinor: 120000, paymentStatus: "overdue" }));
    expect(result.outstandingMinor).toBe(120000);
  });

  it("isKnown is true for overdue — allows 'Rent at risk' to fire", () => {
    const result = selectPropertyBalance(knownRow({ outstandingMinor: 120000, paymentStatus: "overdue" }));
    expect(result.isKnown).toBe(true);
  });

  it("remaining (major units display field) is surfaced when overdue", () => {
    const result = selectPropertyBalance(knownRow({ outstandingMinor: 120000, paymentStatus: "overdue", remaining: 1200 }));
    expect(result.remaining).toBe(1200);
  });

  it("reasonPrimary is null when overdue/known", () => {
    const result = selectPropertyBalance(knownRow({ outstandingMinor: 120000, paymentStatus: "overdue" }));
    expect(result.reasonPrimary).toBeNull();
  });
});

// ── Case 4: tenant balance — always unavailable under current authority ───────
//
// finance_snapshot is property-scoped: rent, activation, opening_balance_minor
// and lease_end_date are property-level values, not tenancy-level.
// Only payments.tenant_id is filtered to the requesting tenant.
// A property-level balance is not a tenancy balance — attribution denied
// regardless of scope validation. See ARCH-FIN-01.
//
// `scopeValidated` is diagnostic only. It must NEVER enable balance rendering.

function rowWithScopeTenancyId(scopeTenancyId, opts = {}) {
  return {
    balanceState: opts.balanceState ?? "known",
    outstandingMinor: opts.outstandingMinor ?? 0,
    paymentStatus: opts.paymentStatus ?? "paid",
    paid: opts.paid ?? 1200,
    remaining: opts.remaining ?? 0,
    scopeTenancyId,
  };
}

const ACTIVE_TENANT = "tenant-uuid-a";

describe("selectTenantBalance — authority unavailable (Case 4)", () => {
  it("always returns attributed: false", () => {
    const result = selectTenantBalance([rowWithScopeTenancyId(ACTIVE_TENANT)], ACTIVE_TENANT);
    expect(result.attributed).toBe(false);
  });

  it("always returns attributionState: authority_unavailable", () => {
    const result = selectTenantBalance([rowWithScopeTenancyId(ACTIVE_TENANT)], ACTIVE_TENANT);
    expect(result.attributionState).toBe("authority_unavailable");
  });

  it("always returns balance: null", () => {
    const result = selectTenantBalance([rowWithScopeTenancyId(ACTIVE_TENANT)], ACTIVE_TENANT);
    expect(result.balance).toBeNull();
  });

  it("always returns reasonCode: TENANCY_BALANCE_AUTHORITY_UNAVAILABLE", () => {
    const result = selectTenantBalance([rowWithScopeTenancyId(ACTIVE_TENANT)], ACTIVE_TENANT);
    expect(result.reasonCode).toBe("TENANCY_BALANCE_AUTHORITY_UNAVAILABLE");
  });

  it("scopeValidated: false when activeTenantId is null", () => {
    const result = selectTenantBalance([rowWithScopeTenancyId(ACTIVE_TENANT)], null);
    expect(result.scopeValidated).toBe(false);
    expect(result.attributed).toBe(false);
  });

  it("scopeValidated: false when no rows", () => {
    const result = selectTenantBalance([], ACTIVE_TENANT);
    expect(result.scopeValidated).toBe(false);
  });

  it("scopeValidated: false when null rows", () => {
    const result = selectTenantBalance(null, ACTIVE_TENANT);
    expect(result.scopeValidated).toBe(false);
  });

  it("scopeValidated: false when more than 1 row", () => {
    const rows = [rowWithScopeTenancyId(ACTIVE_TENANT), rowWithScopeTenancyId(ACTIVE_TENANT)];
    const result = selectTenantBalance(rows, ACTIVE_TENANT);
    expect(result.scopeValidated).toBe(false);
  });

  it("scopeValidated: false when row.scopeTenancyId does not match activeTenantId", () => {
    const result = selectTenantBalance([rowWithScopeTenancyId("different-tenant")], ACTIVE_TENANT);
    expect(result.scopeValidated).toBe(false);
  });

  it("scopeValidated: false when row.scopeTenancyId is null", () => {
    const result = selectTenantBalance([rowWithScopeTenancyId(null)], ACTIVE_TENANT);
    expect(result.scopeValidated).toBe(false);
  });

  it("scopeValidated: true when 1 row and scopeTenancyId matches — balance still null (diagnostic only)", () => {
    const result = selectTenantBalance([rowWithScopeTenancyId(ACTIVE_TENANT)], ACTIVE_TENANT);
    expect(result.scopeValidated).toBe(true);
    expect(result.balance).toBeNull();
    expect(result.attributed).toBe(false);
  });
});

// ── findPropertyBalanceRow ─────────────────────────────────────────────────────

describe("findPropertyBalanceRow", () => {
  const rows = [
    { propertyId: "prop-1", balanceState: "known", outstandingMinor: 0 },
    { propertyId: "prop-2", balanceState: "unknown_payment_history" },
  ];

  it("returns matching row by propertyId", () => {
    expect(findPropertyBalanceRow(rows, "prop-1")?.propertyId).toBe("prop-1");
  });

  it("returns null when propertyId not found — treat as unknown, not as zero", () => {
    const result = findPropertyBalanceRow(rows, "prop-99");
    expect(result).toBeNull();
  });

  it("null result from findPropertyBalanceRow → selectPropertyBalance gives unknown state", () => {
    const missingRow = findPropertyBalanceRow(rows, "prop-99");
    const balance = selectPropertyBalance(missingRow);
    expect(balance.isKnown).toBe(false);
    expect(balance.outstandingMinor).toBeNull();
  });

  it("handles snake_case property_id as fallback", () => {
    const snakeRows = [{ property_id: "prop-snake", balanceState: "known", outstandingMinor: 50000 }];
    expect(findPropertyBalanceRow(snakeRows, "prop-snake")?.property_id).toBe("prop-snake");
  });
});

// ── getPropertyOverdueRemaining — aggregate state-first gate ──────────────────
//
// Governed aggregate surfaces (CC, Dashboard, Portfolio Health) call this utility.
// The state-first gate must be explicit at the client layer so the aggregate cannot
// be inflated by an adversarial or unexpected row whose paymentStatus is "overdue"
// but whose balanceState is not "known".

describe("getPropertyOverdueRemaining — state-first aggregate gate", () => {
  it("excludes unknown row even when paymentStatus overdue (normal server behaviour)", () => {
    const snapshot = {
      property_finance: [
        { balanceState: "unknown_payment_history", paymentStatus: "overdue", remaining: 0 },
      ],
    };
    expect(getPropertyOverdueRemaining(snapshot)).toBe(0);
  });

  it("excludes adversarial row: unknown balanceState + paymentStatus overdue + positive remaining", () => {
    const snapshot = {
      property_finance: [
        { balanceState: "unknown_payment_history", paymentStatus: "overdue", remaining: 500 },
      ],
    };
    expect(getPropertyOverdueRemaining(snapshot)).toBe(0);
  });

  it("excludes known row with paymentStatus paid and remaining 0", () => {
    const snapshot = {
      property_finance: [
        { balanceState: "known", paymentStatus: "paid", remaining: 0 },
      ],
    };
    expect(getPropertyOverdueRemaining(snapshot)).toBe(0);
  });

  it("includes known overdue row with positive remaining", () => {
    const snapshot = {
      property_finance: [
        { balanceState: "known", paymentStatus: "overdue", remaining: 1200 },
      ],
    };
    expect(getPropertyOverdueRemaining(snapshot)).toBe(1200);
  });

  it("sums only known overdue rows when mixed with unknown rows", () => {
    const snapshot = {
      property_finance: [
        { balanceState: "known", paymentStatus: "overdue", remaining: 800 },
        { balanceState: "unknown_payment_history", paymentStatus: "overdue", remaining: 500 },
        { balanceState: "known", paymentStatus: "paid", remaining: 0 },
      ],
    };
    expect(getPropertyOverdueRemaining(snapshot)).toBe(800);
  });

  it("handles missing property_finance gracefully — returns 0", () => {
    expect(getPropertyOverdueRemaining({})).toBe(0);
    expect(getPropertyOverdueRemaining(null)).toBe(0);
  });
});

// ── Structural contracts ───────────────────────────────────────────────────────

describe("E-170 structural contracts", () => {
  const src = (file) => readFileSync(join(process.cwd(), file), "utf8");

  it("PropertyDetails does NOT import calculatePropertyFinance", () => {
    const content = src("src/pages/PropertyDetails.jsx");
    expect(content).not.toMatch(/calculatePropertyFinance/);
  });

  it("PropertyDetails imports useFinance and findPropertyBalanceRow", () => {
    const content = src("src/pages/PropertyDetails.jsx");
    expect(content).toMatch(/useFinance/);
    expect(content).toMatch(/findPropertyBalanceRow/);
  });

  it("PropertyPerformanceCard does NOT import calculatePropertyFinance", () => {
    const content = src("src/components/PropertyPerformanceCard.jsx");
    expect(content).not.toMatch(/calculatePropertyFinance/);
  });

  it("PropertyPerformanceCard imports selectPropertyBalance from balanceSelector", () => {
    const content = src("src/components/PropertyPerformanceCard.jsx");
    expect(content).toMatch(/selectPropertyBalance.*balanceSelector/);
  });

  it("TenantHomePage imports useFinance and selectTenantBalance", () => {
    const content = src("src/pages/TenantHomePage.jsx");
    expect(content).toMatch(/useFinance/);
    expect(content).toMatch(/selectTenantBalance/);
  });

  it("TenantHomePage does NOT import buildTenantPaymentSummaryFromPayments", () => {
    const content = src("src/pages/TenantHomePage.jsx");
    expect(content).not.toMatch(/buildTenantPaymentSummaryFromPayments/);
  });

  it("TenantPayments imports useFinance and selectTenantBalance", () => {
    const content = src("src/pages/TenantPayments.jsx");
    expect(content).toMatch(/useFinance/);
    expect(content).toMatch(/selectTenantBalance/);
  });

  it("balanceSelector exports selectPropertyBalance, findPropertyBalanceRow, selectTenantBalance", () => {
    const content = src("src/utils/balanceSelector.js");
    expect(content).toMatch(/export function selectPropertyBalance/);
    expect(content).toMatch(/export function findPropertyBalanceRow/);
    expect(content).toMatch(/export function selectTenantBalance/);
  });

  it("balanceSelector imports BALANCE_REASON_COPY — no self-contained copy map", () => {
    const content = src("src/utils/balanceSelector.js");
    expect(content).toMatch(/BALANCE_REASON_COPY.*types\/finance/);
  });

  it("PropertyPerformanceCard has state-first guard on Overdue tile", () => {
    const content = src("src/components/PropertyPerformanceCard.jsx");
    expect(content).toMatch(/perf-overdue-unavailable/);
  });

  it("PropertyPerformanceCard has state-first guard on Outstanding tile", () => {
    const content = src("src/components/PropertyPerformanceCard.jsx");
    expect(content).toMatch(/perf-outstanding-unavailable/);
  });

  it("TenantHomePage has unavailable guard on balance card", () => {
    const content = src("src/pages/TenantHomePage.jsx");
    expect(content).toMatch(/tenant-home-balance-unavailable/);
  });

  it("TenantPayments has unavailable guard on outstanding card", () => {
    const content = src("src/pages/TenantPayments.jsx");
    expect(content).toMatch(/tenant-payments-balance-unavailable/);
  });

  it("i18n EN locale includes performanceBalanceUnknown key", () => {
    const content = src("src/i18n/messages.js");
    expect(content).toMatch(/"propertyDetails\.performanceBalanceUnknown":\s*"Balance not assessed"/);
  });

  it("i18n PL locale includes performanceBalanceUnknown key", () => {
    const content = src("src/i18n/messages.js");
    expect(content).toMatch(/"propertyDetails\.performanceBalanceUnknown":\s*"Brak danych o saldzie"/);
  });

  it("TenantHomePage passes activeTenantId to selectTenantBalance", () => {
    const content = src("src/pages/TenantHomePage.jsx");
    expect(content).toMatch(/selectTenantBalance\(propertyFinance,\s*activeTenantId\)/);
  });

  it("TenantPayments passes activeTenantId to selectTenantBalance", () => {
    const content = src("src/pages/TenantPayments.jsx");
    expect(content).toMatch(/selectTenantBalance\(propertyFinance,\s*activeTenantId\)/);
  });

  it("selectTenantBalance signature accepts activeTenantId parameter", () => {
    const content = src("src/utils/balanceSelector.js");
    expect(content).toMatch(/selectTenantBalance\s*\(.*activeTenantId/);
  });

  it("finance_snapshot SQL includes scopeTenancyId scope field", () => {
    const content = src("supabase/finance_snapshot.sql");
    expect(content).toMatch(/'scopeTenancyId',\s*v_tenant_id/);
  });

  it("getPropertyOverdueRemaining has explicit balanceState gate", () => {
    const content = src("src/utils/financeSnapshot.js");
    expect(content).toMatch(/balanceState.*!==.*["']known["']/);
  });

  it("selectTenantBalance never returns attributed: true (authority_unavailable mode)", () => {
    const content = src("src/utils/balanceSelector.js");
    expect(content).not.toMatch(/attributed:\s*true/);
  });

  it("outstanding cards have card-scoped testids for E2E boundary assertions", () => {
    expect(src("src/pages/TenantHomePage.jsx")).toMatch(/tenant-home-outstanding-card/);
    expect(src("src/pages/TenantPayments.jsx")).toMatch(/tenant-payments-outstanding-card/);
  });
});
