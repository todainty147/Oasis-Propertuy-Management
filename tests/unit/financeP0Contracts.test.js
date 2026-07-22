// tests/unit/financeP0Contracts.test.js
// P0 finance-epistemology unit contracts.
//
// Verifies:
//   - parseFinanceSnapshotRow surfaces unknown_tenancy_count
//   - parsePropertyFinanceRow maps all P0 typed fields including isTenancyEnded
//   - BALANCE_REASON_COPY covers all required reason codes
//   - Alice case: ended tenancy parsed correctly with isTenancyEnded = true

import { describe, it, expect } from "vitest";
import { parseFinanceSnapshotRow, EMPTY_FINANCE_SNAPSHOT } from "../../src/services/rpcContracts.js";
import { BALANCE_REASON_COPY } from "../../src/types/finance.js";

// Helper: wrap a property row in a minimal snapshot envelope
function snap(propertyRow) {
  return {
    total_income: 0,
    overdue_income: 0,
    due_soon_income: 0,
    outstanding_income: 0,
    unknown_tenancy_count: 0,
    property_finance: [propertyRow],
  };
}

// ── unknown_tenancy_count ─────────────────────────────────────────────────────

describe("parseFinanceSnapshotRow — unknown_tenancy_count (P0)", () => {
  it("parses unknown_tenancy_count from snapshot row", () => {
    const result = parseFinanceSnapshotRow({
      total_income: 5000,
      overdue_income: 0,
      due_soon_income: 0,
      outstanding_income: 5000,
      unknown_tenancy_count: 3,
      property_finance: [],
    });
    expect(result.unknown_tenancy_count).toBe(3);
  });

  it("defaults unknown_tenancy_count to 0 when field absent", () => {
    const result = parseFinanceSnapshotRow({ total_income: 0 });
    expect(result.unknown_tenancy_count).toBe(0);
  });

  it("EMPTY_FINANCE_SNAPSHOT includes unknown_tenancy_count: 0", () => {
    expect(EMPTY_FINANCE_SNAPSHOT.unknown_tenancy_count).toBe(0);
  });

  it("outstanding_income excludes unknowns (SQL value passed through verbatim)", () => {
    const result = parseFinanceSnapshotRow({
      outstanding_income: 4250,
      unknown_tenancy_count: 3,
      property_finance: [],
    });
    // outstanding_income is already correct from SQL (unknowns excluded);
    // the contract must not add or subtract anything.
    expect(result.outstanding_income).toBe(4250);
    expect(result.unknown_tenancy_count).toBe(3);
  });
});

// ── parsePropertyFinanceRow — typed balance fields ────────────────────────────

describe("parsePropertyFinanceRow via parseFinanceSnapshotRow — P0 typed fields", () => {
  it("parses 'known' state with all typed fields", () => {
    const result = parseFinanceSnapshotRow(snap({
      propertyId: "p1", address: "1 Test St", city: "London",
      rent: 1200, paid: 2400, remaining: 0, paymentStatus: "paid",
      balanceState: "known",
      reasonCode: null,
      outstandingMinor: 0,
      paidMinor: 240000,
      expectedMinor: 240000,
      accrualThrough: "2026-05-31",
      coverageStart: "2026-01-01",
      balanceBasis: "attested_opening_position_plus_tracked_events",
      isTenancyEnded: false,
    }));

    const p = result.property_finance[0];
    expect(p.balanceState).toBe("known");
    expect(p.outstandingMinor).toBe(0);
    expect(p.paidMinor).toBe(240000);
    expect(p.expectedMinor).toBe(240000);
    expect(p.coverageStart).toBe("2026-01-01");
    expect(p.balanceBasis).toBe("attested_opening_position_plus_tracked_events");
    expect(p.isTenancyEnded).toBe(false);
  });

  it("parses 'unknown_payment_history' with null typed amounts", () => {
    const result = parseFinanceSnapshotRow(snap({
      propertyId: "p2", address: "2 Test Rd", city: "Leeds",
      rent: 800, paid: 0, remaining: 0, paymentStatus: "unknown",
      balanceState: "unknown_payment_history",
      reasonCode: "PAYMENT_HISTORY_NOT_IMPORTED",
      outstandingMinor: null,
      paidMinor: null,
      expectedMinor: null,
      accrualThrough: null,
      coverageStart: null,
      balanceBasis: null,
      isTenancyEnded: false,
    }));

    const p = result.property_finance[0];
    expect(p.balanceState).toBe("unknown_payment_history");
    expect(p.reasonCode).toBe("PAYMENT_HISTORY_NOT_IMPORTED");
    expect(p.outstandingMinor).toBeNull();
    expect(p.paidMinor).toBeNull();
    expect(p.isTenancyEnded).toBe(false);
  });

  it("Alice case: ended tenancy with no history — isTenancyEnded = true, no balance", () => {
    const result = parseFinanceSnapshotRow(snap({
      propertyId: "p-alice", address: "3 Alice Rd", city: "Manchester",
      rent: 1500, paid: 0, remaining: 0, paymentStatus: "unknown",
      balanceState: "unknown_payment_history",
      reasonCode: "PAYMENT_HISTORY_NOT_IMPORTED",
      outstandingMinor: null,
      paidMinor: null,
      expectedMinor: null,
      accrualThrough: null,
      coverageStart: null,
      balanceBasis: null,
      isTenancyEnded: true,
    }));

    const p = result.property_finance[0];
    // Alice: balance cannot be shown
    expect(p.balanceState).toBe("unknown_payment_history");
    expect(p.reasonCode).toBe("PAYMENT_HISTORY_NOT_IMPORTED");
    expect(p.outstandingMinor).toBeNull();
    // Alice: ended tenancy — no activation prompt should be shown
    expect(p.isTenancyEnded).toBe(true);
    // Alice: excluded from totals (outstanding_income in snapshot is not incremented)
    expect(result.outstanding_income).toBe(0);
  });

  it("transactions on ended tenancy do not upgrade balance confidence", () => {
    // Even with paid > 0 (transactions exist), isTenancyEnded=true + no activation
    // means balanceState remains unknown_payment_history (not 'known').
    // This contract verifies the parser never infers confidence from payment amounts.
    const result = parseFinanceSnapshotRow(snap({
      propertyId: "p3", address: "4 Ended St", city: "Bristol",
      rent: 900, paid: 450, remaining: 0, paymentStatus: "unknown",
      balanceState: "unknown_payment_history",
      reasonCode: "FINANCE_COVERAGE_START_UNKNOWN",
      outstandingMinor: null,
      paidMinor: null,
      expectedMinor: null,
      accrualThrough: null,
      coverageStart: null,
      balanceBasis: null,
      isTenancyEnded: true,
    }));

    const p = result.property_finance[0];
    expect(p.balanceState).toBe("unknown_payment_history");
    // paid > 0 in legacy field but typed balance is still null
    expect(p.paid).toBe(450);
    expect(p.outstandingMinor).toBeNull();
  });

  it("parses isTenancyEnded from snake_case SQL alias", () => {
    // SQL emits 'isTenancyEnded' (camelCase in JSONB_BUILD_OBJECT)
    const result = parseFinanceSnapshotRow(snap({
      propertyId: "p4", address: "5 Test Ave", city: "Birmingham",
      rent: 700, paid: 0, remaining: 0, paymentStatus: "unknown",
      balanceState: "unknown_payment_history",
      reasonCode: "PAYMENT_HISTORY_NOT_IMPORTED",
      outstandingMinor: null,
      paidMinor: null,
      expectedMinor: null,
      accrualThrough: null,
      coverageStart: null,
      balanceBasis: null,
      isTenancyEnded: true,     // camelCase (matches SQL JSONB key)
    }));

    expect(result.property_finance[0].isTenancyEnded).toBe(true);
  });
});

// ── BALANCE_REASON_COPY constants ─────────────────────────────────────────────

describe("BALANCE_REASON_COPY — reason code copy contract", () => {
  const REQUIRED_CODES = [
    "PAYMENT_HISTORY_NOT_IMPORTED",
    "PAYMENT_HISTORY_INCOMPLETE",
    "FINANCE_COVERAGE_START_UNKNOWN",
    "TENANCY_NOT_STARTED",
  ];

  for (const code of REQUIRED_CODES) {
    it(`${code} has non-empty primary and supporting copy`, () => {
      const entry = BALANCE_REASON_COPY[code];
      expect(entry).toBeDefined();
      expect(typeof entry.primary).toBe("string");
      expect(entry.primary.length).toBeGreaterThan(0);
      expect(typeof entry.supporting).toBe("string");
      expect(entry.supporting.length).toBeGreaterThan(0);
    });
  }

  it("PAYMENT_HISTORY_NOT_IMPORTED primary matches Alice case expected copy", () => {
    expect(BALANCE_REASON_COPY.PAYMENT_HISTORY_NOT_IMPORTED.primary).toBe(
      "Payment history not imported"
    );
  });
});
