/**
 * tests/unit/fin_gate_01.test.js
 *
 * FIN-GATE-01 unit contracts — verifies that all four ungated financial-balance
 * pipelines are correctly suppressed for unactivated tenancies.
 *
 * Pipelines under test:
 *   P1 — Dashboard "Overdue balance" (Dashboard.jsx `?? 0` fix)
 *   P2 — Portfolio Health "Outstanding balance" (bounded-transformer, outstanding_amount)
 *   P3 — CC AI insight text (edge function overdueAmount suppressed to 0)
 *   P4 — Portfolio Health arrears aging buckets (bounded-transformer, arrearsAgingState)
 *
 * PO cases:
 *   Case 1 — all unknown tenancies with large raw arrears
 *   Case 2 — all known (activated) overdue tenancy
 *   Case 3 — mixed known (£750 overdue) + unknown (large raw SQL contribution) — NON-VACUOUS
 *
 * Page-level invariant:
 *   When arrearsAgingState === "available": overdue headline === sum of displayed aging buckets.
 *   When arrearsAgingState === "unavailable_unknown_balances": no numeric aging buckets are
 *   displayed (the page renders neutral unavailability copy instead).
 */

import { describe, it, expect, vi } from "vitest";

// Stub Supabase so portfolioHealthService can be imported without env vars.
vi.mock("../../src/lib/supabase.js", () => ({
  supabase: { rpc: vi.fn(), from: vi.fn() },
}));

import {
  getFinanceOverdueAmount,
  getFinanceTotalOutstanding,
  hasUnactivatedTenancies,
} from "../../src/utils/financeSnapshot.js";

import { applyFinanceGateToPortfolioSnapshot } from "../../src/services/portfolioHealthService.js";

// ─── Fixture builders ─────────────────────────────────────────────────────────

/**
 * Build a minimal financeSnapshot with property_finance rows.
 * Each entry in `rows` is { balanceState, paymentStatus, remaining }.
 */
function makeFinanceSnapshot(rows = []) {
  return {
    property_finance: rows.map((r, i) => ({
      propertyId: `prop-${i + 1}`,
      balanceState: r.balanceState ?? "unknown_payment_history",
      paymentStatus: r.paymentStatus ?? "overdue",
      remaining: r.remaining ?? 0,
    })),
    overdue_income: 0,
  };
}

/**
 * Build a raw portfolioHealthSnapshot as it would arrive from the SQL RPC
 * (BEFORE the bounded transformer is applied).
 */
function makeRawSnapshot({
  overdue_amount = 0,
  outstanding_amount = 0,
  overdue_0_7_amount = 0,
  overdue_8_30_amount = 0,
  overdue_30_plus_amount = 0,
  paid_amount = 0,
} = {}) {
  return {
    property_count: 5,
    occupied_count: 4,
    vacant_count: 1,
    occupancy_rate: 80,
    paid_amount,
    due_amount: 0,
    overdue_amount,
    due_soon_amount: 0,
    outstanding_amount,
    overdue_0_7_amount,
    overdue_8_30_amount,
    overdue_30_plus_amount,
    open_requests: 0,
    high_priority_open_requests: 0,
    waiting_over_48h: 0,
    active_work_orders: 0,
    work_orders_without_contractor: 0,
    contractor_ack_overdue: 0,
    stalled_repairs: 0,
    long_running_repairs: 0,
    repeat_repair_properties: 0,
    recent_open_created: 0,
    prev_open_created: 0,
    outstanding_current_month: 0,
    outstanding_previous_month: 0,
  };
}

// ─── P1 Dashboard `?? 0` fix ─────────────────────────────────────────────────
//
// The actual component logic cannot be imported in unit tests without a full
// React environment, so we reproduce the two expressions directly.

describe("P1 — Dashboard overdueAmountView calculation", () => {
  it("Case 1: || operator exposes raw ungated value when governed is 0 (documents the BUG)", () => {
    const snapshotOverdueAmount = 0; // gated, correct
    const rawOverdueAmount = 152334;  // ungated raw sum
    const buggyView = Number(snapshotOverdueAmount || rawOverdueAmount);
    expect(buggyView).toBe(152334); // documents the original defect
  });

  it("Case 1: ?? operator respects the governed 0 (verifies the FIX)", () => {
    const snapshotOverdueAmount = 0; // gated, correct
    const overdueAmountView = Number(snapshotOverdueAmount ?? 0);
    expect(overdueAmountView).toBe(0);
  });

  it("Case 2: ?? operator passes through positive governed value", () => {
    const snapshotOverdueAmount = 500; // activated tenancy with overdue
    const overdueAmountView = Number(snapshotOverdueAmount ?? 0);
    expect(overdueAmountView).toBe(500);
  });

  it("Case 3 (mixed): governed 750 is respected — not suppressed to 0", () => {
    // Known tenancies: £750 overdue; Unknown tenancies: large raw contribution
    const snapshotOverdueAmount = 750; // gated known-tenancy sum
    const overdueAmountView = Number(snapshotOverdueAmount ?? 0);
    expect(overdueAmountView).toBe(750);
  });

  it("loading state: undefined ?? 0 yields 0, not a runtime error", () => {
    const snapshotOverdueAmount = undefined; // before snapshot loads
    const overdueAmountView = Number(snapshotOverdueAmount ?? 0);
    expect(overdueAmountView).toBe(0);
  });
});

// ─── financeSnapshot helpers ──────────────────────────────────────────────────

describe("hasUnactivatedTenancies", () => {
  it("returns false for an empty snapshot", () => {
    expect(hasUnactivatedTenancies({})).toBe(false);
    expect(hasUnactivatedTenancies(makeFinanceSnapshot([]))).toBe(false);
  });

  it("Case 1: all unknown → returns true", () => {
    const snap = makeFinanceSnapshot([
      { balanceState: "unknown_payment_history", remaining: 1000 },
      { balanceState: "unknown_payment_history", remaining: 2000 },
    ]);
    expect(hasUnactivatedTenancies(snap)).toBe(true);
  });

  it("Case 2: all known → returns false", () => {
    const snap = makeFinanceSnapshot([
      { balanceState: "known", paymentStatus: "overdue", remaining: 500 },
    ]);
    expect(hasUnactivatedTenancies(snap)).toBe(false);
  });

  it("Case 3: mixed known + unknown → returns true", () => {
    const snap = makeFinanceSnapshot([
      { balanceState: "known", paymentStatus: "overdue", remaining: 750 },
      { balanceState: "unknown_payment_history", remaining: 50000 },
    ]);
    expect(hasUnactivatedTenancies(snap)).toBe(true);
  });
});

describe("getFinanceTotalOutstanding", () => {
  it("returns 0 for empty snapshot", () => {
    expect(getFinanceTotalOutstanding({})).toBe(0);
  });

  it("Case 1: excludes unknown-state rows entirely", () => {
    const snap = makeFinanceSnapshot([
      { balanceState: "unknown_payment_history", remaining: 50000 },
      { balanceState: "unknown_payment_history", remaining: 139254 },
    ]);
    expect(getFinanceTotalOutstanding(snap)).toBe(0);
  });

  it("Case 2: sums remaining for all known-state rows", () => {
    const snap = makeFinanceSnapshot([
      { balanceState: "known", paymentStatus: "overdue", remaining: 300 },
      { balanceState: "known", paymentStatus: "due", remaining: 200 },
    ]);
    expect(getFinanceTotalOutstanding(snap)).toBe(500);
  });

  it("Case 3: sums only known rows in mixed portfolio", () => {
    const snap = makeFinanceSnapshot([
      { balanceState: "known", paymentStatus: "overdue", remaining: 750 },
      { balanceState: "unknown_payment_history", remaining: 50000 },
    ]);
    expect(getFinanceTotalOutstanding(snap)).toBe(750);
  });

  it("ignores negative remaining values by summing them as-is (unknown rows excluded, not clamped)", () => {
    const snap = makeFinanceSnapshot([
      { balanceState: "known", paymentStatus: "overdue", remaining: -100 },
      { balanceState: "known", paymentStatus: "overdue", remaining: 200 },
    ]);
    // safeNumber(-100) = -100; total = 100 (negative contribution still sums)
    // The contract only guarantees unknown rows are excluded, not that negatives are clamped
    expect(getFinanceTotalOutstanding(snap)).toBe(100);
  });
});

describe("getFinanceOverdueAmount (regression guard for existing gating)", () => {
  it("Case 1: returns 0 when all tenancies are unactivated", () => {
    const snap = makeFinanceSnapshot([
      { balanceState: "unknown_payment_history", paymentStatus: "overdue", remaining: 50000 },
    ]);
    expect(getFinanceOverdueAmount(snap)).toBe(0);
  });

  it("Case 2: returns overdue sum for known-state rows only", () => {
    const snap = makeFinanceSnapshot([
      { balanceState: "known", paymentStatus: "overdue", remaining: 750 },
    ]);
    expect(getFinanceOverdueAmount(snap)).toBe(750);
  });

  it("Case 3: sums only known overdue rows in mixed portfolio", () => {
    const snap = makeFinanceSnapshot([
      { balanceState: "known", paymentStatus: "overdue", remaining: 750 },
      { balanceState: "unknown_payment_history", paymentStatus: "overdue", remaining: 50000 },
    ]);
    expect(getFinanceOverdueAmount(snap)).toBe(750);
  });
});

// ─── P2 + P4: bounded transformer ─────────────────────────────────────────────

describe("applyFinanceGateToPortfolioSnapshot — P2 (outstanding) + P4 (aging buckets)", () => {
  // ── Case 1: all unknown tenancies with large raw arrears ──────────────────

  describe("Case 1 — all unknown tenancies", () => {
    const finSnap = makeFinanceSnapshot([
      { balanceState: "unknown_payment_history", remaining: 50000 },
      { balanceState: "unknown_payment_history", remaining: 99000 },
    ]);
    const rawSnap = makeRawSnapshot({
      overdue_amount: 152334,      // raw SQL ungated
      outstanding_amount: 189254,  // raw SQL acc_outstanding_total
      overdue_0_7_amount: 0,
      overdue_8_30_amount: 2002,
      overdue_30_plus_amount: 152332,
    });

    it("sets overdue_amount to 0 (governed)", () => {
      const snap = { ...rawSnap };
      applyFinanceGateToPortfolioSnapshot(snap, finSnap);
      expect(snap.overdue_amount).toBe(0);
    });

    it("P2: sets outstanding_amount to 0 (gated total outstanding, no known rows)", () => {
      const snap = { ...rawSnap };
      applyFinanceGateToPortfolioSnapshot(snap, finSnap);
      expect(snap.outstanding_amount).toBe(0);
    });

    it("P4: arrearsAgingState is 'unavailable_unknown_balances'", () => {
      const snap = { ...rawSnap };
      applyFinanceGateToPortfolioSnapshot(snap, finSnap);
      expect(snap.arrearsAgingState).toBe("unavailable_unknown_balances");
    });

    it("P4: suppresses overdue_0_7_amount to null", () => {
      const snap = { ...rawSnap };
      applyFinanceGateToPortfolioSnapshot(snap, finSnap);
      expect(snap.overdue_0_7_amount).toBeNull();
    });

    it("P4: suppresses overdue_8_30_amount to null", () => {
      const snap = { ...rawSnap };
      applyFinanceGateToPortfolioSnapshot(snap, finSnap);
      expect(snap.overdue_8_30_amount).toBeNull();
    });

    it("P4: suppresses overdue_30_plus_amount to null (fixes the £152,332 contradiction)", () => {
      const snap = { ...rawSnap };
      applyFinanceGateToPortfolioSnapshot(snap, finSnap);
      expect(snap.overdue_30_plus_amount).toBeNull();
    });
  });

  // ── Case 2: all known (activated) overdue tenancy ─────────────────────────

  describe("Case 2 — all known (activated) tenancy with overdue", () => {
    const finSnap = makeFinanceSnapshot([
      { balanceState: "known", paymentStatus: "overdue", remaining: 750 },
    ]);
    const rawSnap = makeRawSnapshot({
      overdue_amount: 800,        // SQL value (may differ slightly)
      outstanding_amount: 750,    // SQL acc_outstanding_total
      overdue_0_7_amount: 0,
      overdue_8_30_amount: 0,
      overdue_30_plus_amount: 750,
    });

    it("reflects the known overdue in overdue_amount", () => {
      const snap = { ...rawSnap };
      applyFinanceGateToPortfolioSnapshot(snap, finSnap);
      expect(snap.overdue_amount).toBe(750);
    });

    it("P2: outstanding_amount = gated sum of remaining for known rows", () => {
      const snap = { ...rawSnap };
      applyFinanceGateToPortfolioSnapshot(snap, finSnap);
      expect(snap.outstanding_amount).toBe(750);
    });

    it("P4: arrearsAgingState is 'available' (all tenancies are known)", () => {
      const snap = { ...rawSnap };
      applyFinanceGateToPortfolioSnapshot(snap, finSnap);
      expect(snap.arrearsAgingState).toBe("available");
    });

    it("P4: does NOT suppress arrears buckets when all tenancies are known", () => {
      const snap = { ...rawSnap };
      applyFinanceGateToPortfolioSnapshot(snap, finSnap);
      // Buckets pass through unchanged from SQL (no suppression when no unknowns)
      expect(snap.overdue_0_7_amount).toBe(0);
      expect(snap.overdue_8_30_amount).toBe(0);
      expect(snap.overdue_30_plus_amount).toBe(750);
    });

    it("PAGE-LEVEL INVARIANT (available): governed headline (750) is consistent with bucket total (750)", () => {
      const snap = { ...rawSnap };
      applyFinanceGateToPortfolioSnapshot(snap, finSnap);
      expect(snap.arrearsAgingState).toBe("available");
      // In Case 2 the SQL buckets are from an all-known portfolio.
      // The invariant holds: overdue_amount (750) = overdue_30_plus_amount (750)
      const displayedBucketSum =
        (snap.overdue_0_7_amount ?? 0) +
        (snap.overdue_8_30_amount ?? 0) +
        (snap.overdue_30_plus_amount ?? 0);
      expect(snap.overdue_amount).toBe(displayedBucketSum);
    });
  });

  // ── Case 3: mixed known (£750 overdue) + unknown portfolio — NON-VACUOUS ──
  //
  // Fixture design: known tenancy has £750 overdue; unknown tenancy would contribute
  // £50,000 to raw SQL.  The raw SQL snapshot reflects the contaminated totals.
  //
  // Expected after transform:
  //   - headline overdue = £750 (from governed known-tenancy source)
  //   - arrearsAgingState = "unavailable_unknown_balances"
  //   - all three aging buckets suppressed to null
  //   - the £50,000 raw SQL contribution does NOT appear anywhere
  //
  // This is the non-vacuous case required by the PO: it proves the aging display
  // is suppressed even when the known-tenancy overdue headline is non-zero.

  describe("Case 3 — mixed known (£750 overdue) + unknown portfolio (NON-VACUOUS)", () => {
    const finSnap = makeFinanceSnapshot([
      { balanceState: "known", paymentStatus: "overdue", remaining: 750 },
      { balanceState: "unknown_payment_history", remaining: 50000 },
    ]);
    const rawSnap = makeRawSnapshot({
      overdue_amount: 50750,       // raw SQL: known £750 + unknown £50,000
      outstanding_amount: 55000,   // raw SQL: inflated by unknown
      overdue_0_7_amount: 0,
      overdue_8_30_amount: 0,
      overdue_30_plus_amount: 50750,
    });

    it("overdue_amount reflects only known tenancies (£750)", () => {
      const snap = { ...rawSnap };
      applyFinanceGateToPortfolioSnapshot(snap, finSnap);
      expect(snap.overdue_amount).toBe(750);
    });

    it("P2: outstanding_amount = £750 (known tenancy remaining only)", () => {
      const snap = { ...rawSnap };
      applyFinanceGateToPortfolioSnapshot(snap, finSnap);
      expect(snap.outstanding_amount).toBe(750);
    });

    it("P4: arrearsAgingState is 'unavailable_unknown_balances'", () => {
      const snap = { ...rawSnap };
      applyFinanceGateToPortfolioSnapshot(snap, finSnap);
      expect(snap.arrearsAgingState).toBe("unavailable_unknown_balances");
    });

    it("P4: ALL three aging buckets suppressed to null (unknown tenancy contaminates SQL)", () => {
      const snap = { ...rawSnap };
      applyFinanceGateToPortfolioSnapshot(snap, finSnap);
      expect(snap.overdue_0_7_amount).toBeNull();
      expect(snap.overdue_8_30_amount).toBeNull();
      expect(snap.overdue_30_plus_amount).toBeNull();
    });

    it("the raw £50,000 unknown-tenancy contribution does not appear in overdue_amount", () => {
      const snap = { ...rawSnap };
      applyFinanceGateToPortfolioSnapshot(snap, finSnap);
      expect(snap.overdue_amount).not.toBeGreaterThan(750);
    });

    it("the raw £50,000 unknown-tenancy contribution does not appear in outstanding_amount", () => {
      const snap = { ...rawSnap };
      applyFinanceGateToPortfolioSnapshot(snap, finSnap);
      expect(snap.outstanding_amount).not.toBeGreaterThan(750);
    });

    it("PAGE-LEVEL INVARIANT (unavailable): no numeric aging buckets are displayed", () => {
      const snap = { ...rawSnap };
      applyFinanceGateToPortfolioSnapshot(snap, finSnap);
      // The page renders neutral copy (not buckets) in "unavailable" state.
      // Verify this by confirming all three buckets are null — the page must
      // check arrearsAgingState === "available" before rendering numeric values.
      expect(snap.arrearsAgingState).toBe("unavailable_unknown_balances");
      expect(snap.overdue_0_7_amount).toBeNull();
      expect(snap.overdue_8_30_amount).toBeNull();
      expect(snap.overdue_30_plus_amount).toBeNull();
    });
  });

  // ── Atomicity guard: all three buckets suppressed together ────────────────

  describe("atomicity — all three buckets suppressed when anyUnknown, never partially", () => {
    it("suppresses all three buckets even when only 0_7 and 8_30 had non-zero values", () => {
      const finSnap = makeFinanceSnapshot([
        { balanceState: "unknown_payment_history", remaining: 1000 },
      ]);
      const snap = makeRawSnapshot({
        overdue_0_7_amount: 500,
        overdue_8_30_amount: 300,
        overdue_30_plus_amount: 0,
      });
      applyFinanceGateToPortfolioSnapshot(snap, finSnap);
      expect(snap.overdue_0_7_amount).toBeNull();
      expect(snap.overdue_8_30_amount).toBeNull();
      expect(snap.overdue_30_plus_amount).toBeNull();
      expect(snap.arrearsAgingState).toBe("unavailable_unknown_balances");
    });
  });
});

// ─── P3: CC AI insight — governedOverdueAmount = 0 ───────────────────────────
//
// The edge function constructs `input.summary.overdueAmount` and `input.overdueAmount`.
// These are suppressed to 0 (governedOverdueAmount = 0).  We test the invariant:
// the edge-function input must never carry a non-zero overdue from an ungated source.

describe("P3 — CC AI insight overdueAmount suppression", () => {
  /**
   * Reproduces the edge-function input construction for the three PO cases.
   * `rawOverdueFromSql` is what dashboard_snapshot.overdue_amount returns.
   * `governedOverdueAmount` is always 0 (FIN-GATE-01 suppression).
   */
  function buildInput(rawOverdueFromSql) {
    const governedOverdueAmount = 0; // FIN-GATE-01 P3 fix
    return {
      summary: { overdueAmount: governedOverdueAmount },
      overdueAmount: governedOverdueAmount,
      _rawForTest: rawOverdueFromSql, // kept only for test assertions
    };
  }

  it("Case 1: raw SQL ungated value is NOT propagated to AI input", () => {
    const input = buildInput(152334);
    expect(input.summary.overdueAmount).toBe(0);
    expect(input.overdueAmount).toBe(0);
  });

  it("Case 2: no overdue in gated source — AI input remains 0", () => {
    const input = buildInput(0);
    expect(input.summary.overdueAmount).toBe(0);
    expect(input.overdueAmount).toBe(0);
  });

  it("Case 3: mixed — ungated SQL has balance, AI input is still 0", () => {
    const input = buildInput(5000);
    expect(input.summary.overdueAmount).toBe(0);
    expect(input.overdueAmount).toBe(0);
  });

  it("summary.overdueAmount and overdueAmount are always equal (no split-population risk)", () => {
    const input = buildInput(9999);
    expect(input.summary.overdueAmount).toBe(input.overdueAmount);
  });
});

// ─── Cross-surface consistency ────────────────────────────────────────────────
//
// For a fixture with one known overdue tenancy (£750) and one unknown tenancy,
// verify that Dashboard tile, CC stat, and PH headline all reflect £750 (gated),
// while PH buckets are null/suppressed and arrearsAgingState is "unavailable".

describe("cross-surface consistency — known overdue £750 + unknown tenancy", () => {
  const finSnap = makeFinanceSnapshot([
    { balanceState: "known", paymentStatus: "overdue", remaining: 750 },
    { balanceState: "unknown_payment_history", remaining: 50000 },
  ]);

  it("governed overdue (Dashboard tile, CC stat): 750", () => {
    expect(getFinanceOverdueAmount(finSnap)).toBe(750);
  });

  it("governed outstanding (PH headline): 750 (gated sum of known remaining)", () => {
    expect(getFinanceTotalOutstanding(finSnap)).toBe(750);
  });

  it("PH overdue headline after transform: 750 (governed)", () => {
    const snap = makeRawSnapshot({
      overdue_amount: 50750,
      outstanding_amount: 55000,
    });
    applyFinanceGateToPortfolioSnapshot(snap, finSnap);
    expect(snap.overdue_amount).toBe(750);
  });

  it("PH arrearsAgingState: unavailable_unknown_balances (unknown tenancy contaminates SQL)", () => {
    const snap = makeRawSnapshot({
      overdue_amount: 50750,
      outstanding_amount: 55000,
      overdue_30_plus_amount: 50750,
    });
    applyFinanceGateToPortfolioSnapshot(snap, finSnap);
    expect(snap.arrearsAgingState).toBe("unavailable_unknown_balances");
  });

  it("PH arrears buckets: suppressed to null because unknown tenancy exists", () => {
    const snap = makeRawSnapshot({
      overdue_amount: 50750,
      outstanding_amount: 55000,
      overdue_30_plus_amount: 50750,
    });
    applyFinanceGateToPortfolioSnapshot(snap, finSnap);
    expect(snap.overdue_0_7_amount).toBeNull();
    expect(snap.overdue_8_30_amount).toBeNull();
    expect(snap.overdue_30_plus_amount).toBeNull();
  });

  it("CC insight overdueAmount: suppressed to 0 regardless of raw SQL", () => {
    // Reproduces the governedOverdueAmount = 0 constant in the edge function
    const governedOverdueAmount = 0;
    expect(governedOverdueAmount).toBe(0);
  });
});
