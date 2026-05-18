import { beforeEach, describe, expect, it, vi } from "vitest";

const fromMock = vi.fn();

vi.mock("../../src/lib/supabase", () => ({
  supabase: {
    from: (...args) => fromMock(...args),
  },
}));

const { createRentPlan } = await import("../../src/services/rentPlanService.js");

function mockInsertChain(result = { data: { id: "plan-1" }, error: null }) {
  const single = vi.fn(() => Promise.resolve(result));
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select }));

  fromMock.mockReturnValueOnce({ insert });

  return { insert, select, single };
}

describe("rentPlanService", () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it("normalizes blank optional rent plan form values before insert", async () => {
    const { insert } = mockInsertChain();

    await createRentPlan({
      accountId: "account-1",
      plan: {
        market: "uk",
        currency: "GBP",
        billingFrequency: "monthly",
        baseRentAmount: "1500",
        dueDay: "1",
        startDate: "2026-05-18",
        endDate: "",
        prorationPolicy: "actual_days_in_month",
        depositPolicy: "market_default",
        depositAmount: "",
        utilitiesPolicy: "rent_only",
        roundingPolicy: "nearest_penny",
        notes: "",
      },
    });

    expect(fromMock).toHaveBeenCalledWith("rent_plans");
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      end_date: null,
      deposit_amount: null,
      notes: null,
    }));
  });
});
