import { describe, expect, it } from "vitest";

import { buildFinancePaymentDisplayRows, isAdjustedFinancePayment } from "../../src/utils/financePayments";

describe("finance payment display rows", () => {
  it("caps open expected-charge rows to the property running remaining balance", () => {
    const rows = [
      {
        id: "june-receipt",
        propertyId: "property-36",
        tenantId: "tenant-36",
        amount: 2000,
        status: "paid",
        dueDate: "2026-06-03",
        paidAt: "2026-06-03",
      },
      {
        id: "may-expected",
        propertyId: "property-36",
        tenantId: "tenant-36",
        amount: 2000,
        status: "pending",
        dueDate: "2026-05-12",
      },
      {
        id: "may-receipt",
        propertyId: "property-36",
        tenantId: "tenant-36",
        amount: 500,
        status: "paid",
        dueDate: "2026-05-03",
        paidAt: "2026-05-02",
      },
    ];

    const displayRows = buildFinancePaymentDisplayRows(
      rows,
      [{ propertyId: "property-36", remaining: 1500 }],
      { today: new Date("2026-06-03T12:00:00Z") },
    );
    const expectedCharge = displayRows.find((row) => row.id === "may-expected");

    expect(expectedCharge.amount).toBe(1500);
    expect(expectedCharge.originalAmount).toBe(2000);
    expect(expectedCharge.paidAgainstRunningBalance).toBe(500);
    expect(expectedCharge.status).toBe("overdue");
    expect(isAdjustedFinancePayment(expectedCharge)).toBe(true);
  });

  it("hides open rows when the property running balance is already fully covered", () => {
    const displayRows = buildFinancePaymentDisplayRows(
      [
        {
          id: "covered-expected",
          propertyId: "property-35",
          amount: 1000,
          status: "pending",
          dueDate: "2026-06-03",
        },
        {
          id: "receipt",
          propertyId: "property-35",
          amount: 2000,
          status: "paid",
          dueDate: "2026-06-03",
          paidAt: "2026-06-03",
        },
      ],
      [{ propertyId: "property-35", remaining: 0 }],
      { today: new Date("2026-06-03T12:00:00Z") },
    );

    expect(displayRows.map((row) => row.id)).toEqual(["receipt"]);
  });

  it("allocates oldest-first across multiple open rows for the same property", () => {
    const displayRows = buildFinancePaymentDisplayRows(
      [
        {
          id: "june",
          propertyId: "property-36",
          amount: 1000,
          status: "pending",
          dueDate: "2026-06-01",
        },
        {
          id: "may",
          propertyId: "property-36",
          amount: 1000,
          status: "pending",
          dueDate: "2026-05-01",
        },
      ],
      [{ propertyId: "property-36", remaining: 1200 }],
      { today: new Date("2026-06-03T12:00:00Z") },
    );

    expect(displayRows.find((row) => row.id === "may").amount).toBe(1000);
    expect(displayRows.find((row) => row.id === "june").amount).toBe(200);
  });

  it("does not treat pass-through rows as adjusted", () => {
    expect(isAdjustedFinancePayment({ amount: 1000, originalAmount: 1000 })).toBe(false);
    expect(isAdjustedFinancePayment({ amount: 1000 })).toBe(false);
    expect(isAdjustedFinancePayment({ amount: 1000, originalAmount: null })).toBe(false);
  });
});
