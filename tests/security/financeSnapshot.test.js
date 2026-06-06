import { describe, expect, it } from "vitest";

import {
  financeAmountForProperty,
  getFinanceOverdueAmount,
  getFinancePropertyBalanceMap,
  getPropertyOverdueRemaining,
} from "../../src/utils/financeSnapshot";

describe("finance snapshot helpers", () => {
  it("treats a missing finance snapshot as zero overdue", () => {
    expect(getFinanceOverdueAmount(null)).toBe(0);
  });

  it("uses overdue property balances when the aggregate under-reports current arrears", () => {
    const snapshot = {
      overdue_income: 0,
      property_finance: [
        { propertyId: "property-1", remaining: 1500, paymentStatus: "overdue" },
        { propertyId: "property-2", remaining: 1000, paymentStatus: "pending" },
      ],
    };

    expect(getFinanceOverdueAmount(snapshot)).toBe(1500);
  });

  it("uses property remaining balances instead of a stale larger aggregate", () => {
    const snapshot = {
      overdue_income: 2000,
      property_finance: [
        { property_id: "property-1", remaining: 1500, payment_status: "overdue" },
      ],
    };

    expect(getFinanceOverdueAmount(snapshot)).toBe(1500);
  });

  it("keeps the aggregate as a fallback when a legacy snapshot has no property rows", () => {
    expect(getFinanceOverdueAmount({
      overdue_income: 2000,
      property_finance: [],
    })).toBe(2000);
  });

  it("matches the reported 35/36 Ashton running-balance regression", () => {
    const snapshot = {
      overdue_income: 2000,
      property_finance: [
        {
          propertyId: "35-ashton",
          address: "35 Ashton Rd",
          rent: 1000,
          paid: 2000,
          remaining: 0,
          paymentStatus: "paid",
        },
        {
          propertyId: "36-ashton",
          address: "36 Ashton Rd",
          rent: 2000,
          paid: 2500,
          remaining: 1500,
          paymentStatus: "overdue",
        },
      ],
    };

    expect(getPropertyOverdueRemaining(snapshot)).toBe(1500);
    expect(getFinanceOverdueAmount(snapshot)).toBe(1500);
  });

  it("returns finance remaining amount for overdue property items only", () => {
    const snapshot = {
      property_finance: [
        { property_id: "property-1", remaining: 1500, payment_status: "overdue" },
        { property_id: "property-2", remaining: 800, payment_status: "pending" },
      ],
    };

    expect(getFinancePropertyBalanceMap(snapshot).get("property-1").remaining).toBe(1500);
    expect(financeAmountForProperty(snapshot, "property-1", 2000)).toBe(1500);
    expect(financeAmountForProperty(snapshot, "property-2", 2000)).toBe(2000);
  });

  it("sums duplicate property finance rows before enriching operational items", () => {
    const snapshot = {
      property_finance: [
        { property_id: "property-1", remaining: 500, payment_status: "overdue" },
        { property_id: "property-1", remaining: 1000, payment_status: "pending" },
      ],
    };

    expect(getFinancePropertyBalanceMap(snapshot).get("property-1")).toEqual({
      remaining: 1500,
      status: "overdue",
    });
    expect(financeAmountForProperty(snapshot, "property-1", 2000)).toBe(1500);
  });

  it("falls back when a property balance cannot safely override the operational amount", () => {
    const snapshot = {
      property_finance: [
        { property_id: "property-1", remaining: 0, payment_status: "overdue" },
      ],
    };

    expect(financeAmountForProperty(snapshot, null, 2000)).toBe(2000);
    expect(financeAmountForProperty(snapshot, "property-1", 2000)).toBe(2000);
    expect(financeAmountForProperty(snapshot, "missing-property", 2000)).toBe(2000);
  });
});
