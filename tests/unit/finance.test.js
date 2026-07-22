// tests/unit/finance.test.js
// Unit tests for calculatePropertyFinance — monthly rent obligation logic.
//
// Business rules (confirmed by product owner):
//   - Rent is due on the 1st of every month
//   - Tenants pay before moving in (first month upfront)
//   - Overpayment counts toward the next month(s)
//   - Every calendar month from the earliest payment date through today is a
//     billing obligation, regardless of whether a payment record exists for it

import { describe, it, expect } from "vitest";
import { calculatePropertyFinance } from "../../src/utils/finance.js";

const property = (rent) => ({
  id: "prop-1",
  address: "1 After Test Junction",
  city: "CommittoGit",
  rent,
});

const paidPayment = (amount, dueDateStr, paidAtStr = dueDateStr) => ({
  id: `pay-${Math.random()}`,
  propertyId: "prop-1",
  tenantId: "tenant-1",
  amount,
  status: "paid",
  dueDate: dueDateStr,
  paidAt: paidAtStr,
});

const overduePayment = (amount, dueDateStr) => ({
  id: `pay-${Math.random()}`,
  propertyId: "prop-1",
  tenantId: "tenant-1",
  amount,
  status: "overdue",
  dueDate: dueDateStr,
  paidAt: null,
});

const voidPayment = (amount, dueDateStr) => ({
  id: `pay-${Math.random()}`,
  propertyId: "prop-1",
  tenantId: "tenant-1",
  amount,
  status: "void",
  dueDate: dueDateStr,
  paidAt: null,
});

// Reference date: 12 May 2026 (what the user sees)
const MAY_12_2026 = new Date("2026-05-12");

// ── Core arrears scenario (the "Hoo dah" case) ───────────────────────────────

describe("calculatePropertyFinance — monthly arrears", () => {
  it("shows 5 months outstanding when only December was paid and it is May", () => {
    // Dec 2025 paid, Jan–May 2026 not recorded → 5 months arrears
    const result = calculatePropertyFinance({
      property: property(10_000),
      payments: [paidPayment(10_000, "2025-12-01", "2025-12-22")],
      date: MAY_12_2026,
    });

    // Collected: £10,000 (December)
    expect(result.paid).toBe(10_000);
    // Expected: Dec + Jan + Feb + Mar + Apr + May = 6 months × £10,000 = £60,000
    // Outstanding: £60,000 - £10,000 = £50,000
    expect(result.remaining).toBe(50_000);
    expect(result.paymentStatus).toBe("overdue");
  });

  it("shows 0 outstanding when all 6 months have been paid", () => {
    const payments = [
      paidPayment(10_000, "2025-12-01"),
      paidPayment(10_000, "2026-01-01"),
      paidPayment(10_000, "2026-02-01"),
      paidPayment(10_000, "2026-03-01"),
      paidPayment(10_000, "2026-04-01"),
      paidPayment(10_000, "2026-05-01"),
    ];
    const result = calculatePropertyFinance({
      property: property(10_000),
      payments,
      date: MAY_12_2026,
    });

    expect(result.paid).toBe(60_000);
    expect(result.remaining).toBe(0);
    expect(result.paymentStatus).toBe("paid");
  });

  it("shows 4 months outstanding when 2 of 6 months were paid", () => {
    const payments = [
      paidPayment(10_000, "2025-12-01"),
      paidPayment(10_000, "2026-01-01"),
    ];
    const result = calculatePropertyFinance({
      property: property(10_000),
      payments,
      date: MAY_12_2026,
    });

    // 6 months expected, 2 paid → 4 months = £40,000
    expect(result.remaining).toBe(40_000);
    expect(result.paymentStatus).toBe("overdue");
  });
});

// ── Overpayment rolls forward ─────────────────────────────────────────────────

describe("calculatePropertyFinance — overpayment", () => {
  it("overpayment in one month reduces future obligation to 0, never negative", () => {
    // Tenant paid 3 months upfront in December via one large payment
    const result = calculatePropertyFinance({
      property: property(10_000),
      payments: [paidPayment(30_000, "2025-12-01")],
      date: new Date("2026-02-01"), // Feb 1 = 3 months (Dec, Jan, Feb)
    });

    // 3 months expected, 3 months paid → £0 outstanding
    expect(result.remaining).toBe(0);
    expect(result.paymentStatus).toBe("paid");
  });

  it("partial overpayment reduces next month's obligation correctly", () => {
    // Tenant paid £15,000 in December (1.5 months of £10,000 rent)
    const result = calculatePropertyFinance({
      property: property(10_000),
      payments: [paidPayment(15_000, "2025-12-01")],
      date: new Date("2026-01-15"), // Jan 15 = 2 months (Dec + Jan)
    });

    // 2 months expected = £20,000; collected £15,000 → £5,000 remaining
    expect(result.remaining).toBe(5_000);
    expect(result.paymentStatus).toBe("overdue");
  });

  it("excludes a voided duplicate from the 36 Ashton running balance", () => {
    const result = calculatePropertyFinance({
      property: property(2000),
      payments: [
        paidPayment(500, "2026-05-03", "2026-05-02"),
        paidPayment(2000, "2026-06-03", "2026-06-03"),
        voidPayment(2000, "2026-06-03"),
      ],
      date: new Date("2026-06-03"),
    });

    expect(result.paid).toBe(2500);
    expect(result.remaining).toBe(1500);
    expect(result.paymentStatus).toBe("overdue");
  });
});

// ── Single month (brand new tenant) ──────────────────────────────────────────

describe("calculatePropertyFinance — new tenant", () => {
  it("new tenant who just paid first month upfront in May shows 0 outstanding", () => {
    const result = calculatePropertyFinance({
      property: property(10_000),
      payments: [paidPayment(10_000, "2026-05-01")],
      date: MAY_12_2026,
    });

    // 1 month expected, 1 month paid → £0
    expect(result.remaining).toBe(0);
    expect(result.paymentStatus).toBe("paid");
  });

  it("new tenant who hasn't paid yet in May shows full month as overdue", () => {
    const result = calculatePropertyFinance({
      property: property(10_000),
      payments: [overduePayment(10_000, "2026-05-01")],
      date: MAY_12_2026,
    });

    expect(result.remaining).toBe(10_000);
    expect(result.paymentStatus).toBe("overdue");
  });
});

// ── No payment history / no rent ─────────────────────────────────────────────

describe("calculatePropertyFinance — fallbacks", () => {
  it("returns pending with 0 remaining when no payments and no rent", () => {
    const result = calculatePropertyFinance({
      property: property(0),
      payments: [],
      date: MAY_12_2026,
    });

    expect(result.paid).toBe(0);
    expect(result.remaining).toBe(0);
    expect(result.paymentStatus).toBe("pending");
  });

  it("returns pending when no payment records exist even with rent configured", () => {
    const result = calculatePropertyFinance({
      property: property(10_000),
      payments: [],
      date: MAY_12_2026,
    });

    // No reference dates → can't compute obligation start
    expect(result.remaining).toBe(0);
    expect(result.paymentStatus).toBe("pending");
  });
});

// ── Fix 1 (P0-A): lease-end accrual cap ──────────────────────────────────────

describe("calculatePropertyFinance — Fix 1: leaseEndDate accrual cap", () => {
  it("stops accrual at lease_end when ended before today", () => {
    // Lease ended 2026-02-28; today is May 12 2026.
    // Months billed: Dec 2025, Jan 2026, Feb 2026 = 3 months.
    // Dec paid → 2 months outstanding (Jan + Feb), not 5.
    const result = calculatePropertyFinance({
      property: property(10_000),
      payments: [paidPayment(10_000, "2025-12-01", "2025-12-22")],
      date: MAY_12_2026,
      leaseEndDate: "2026-02-28",
    });

    expect(result.remaining).toBe(20_000); // 3 months exp - 1 paid = 2 × £10k
  });

  it("uses today as accrual end when no leaseEndDate (open-ended lease)", () => {
    const result = calculatePropertyFinance({
      property: property(10_000),
      payments: [paidPayment(10_000, "2025-12-01", "2025-12-22")],
      date: MAY_12_2026,
    });

    expect(result.remaining).toBe(50_000); // Dec–May = 6 months; 1 paid = 5 × £10k
  });

  it("ignores leaseEndDate that is after today (future lease end = no cap yet)", () => {
    const result = calculatePropertyFinance({
      property: property(10_000),
      payments: [paidPayment(10_000, "2025-12-01", "2025-12-22")],
      date: MAY_12_2026,
      leaseEndDate: "2026-12-31",
    });

    expect(result.remaining).toBe(50_000); // same as open-ended
  });

  it("caps at a single month when lease ended same month as first payment", () => {
    // Lease ended 2026-01-31; first (and only) payment in Jan
    const result = calculatePropertyFinance({
      property: property(1_000),
      payments: [paidPayment(1_000, "2026-01-01", "2026-01-01")],
      date: MAY_12_2026,
      leaseEndDate: "2026-01-31",
    });

    expect(result.remaining).toBe(0);
    expect(result.paymentStatus).toBe("paid");
  });
});
