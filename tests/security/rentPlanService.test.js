import { beforeEach, describe, expect, it, vi } from "vitest";

const fromMock = vi.fn();

vi.mock("../../src/lib/supabase", () => ({
  supabase: {
    from: (...args) => fromMock(...args),
  },
}));

const { createRentPlan, updateRentPlan } = await import("../../src/services/rentPlanService.js");

function mockInsertChain(result = { data: { id: "plan-1" }, error: null }) {
  const single = vi.fn(() => Promise.resolve(result));
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select }));

  fromMock.mockReturnValueOnce({ insert });

  return { insert, select, single };
}

function mockDraftUpdateChain(result = { data: { id: "plan-1" }, error: null }) {
  const selectExisting = vi.fn(() => existingChain);
  const existingChain = {
    select: selectExisting,
    eq: vi.fn(() => existingChain),
    single: vi.fn(() => Promise.resolve({ data: { status: "draft" }, error: null })),
  };

  const updatedChain = {
    eq: vi.fn(() => updatedChain),
    select: vi.fn(() => updatedChain),
    single: vi.fn(() => Promise.resolve(result)),
  };
  const update = vi.fn(() => updatedChain);

  fromMock
    .mockReturnValueOnce(existingChain)
    .mockReturnValueOnce({ update });

  return { update };
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
        notes: "   ",
      },
    });

    expect(fromMock).toHaveBeenCalledWith("rent_plans");
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      property_id: null,
      tenant_id: null,
      end_date: null,
      deposit_amount: null,
      notes: null,
    }));
  });

  it("persists selected property and tenant IDs for tenant-scoped rent plans", async () => {
    const { insert } = mockInsertChain();

    await createRentPlan({
      accountId: "account-1",
      plan: {
        propertyId: "property-1",
        tenantId: "tenant-1",
        market: "uk",
        currency: "GBP",
        billingFrequency: "monthly",
        baseRentAmount: "1500",
        dueDay: "1",
        startDate: "2026-05-18",
      },
    });

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      property_id: "property-1",
      tenant_id: "tenant-1",
    }));
  });

  it("lets the database own updated_at when updating draft plans", async () => {
    const { update } = mockDraftUpdateChain();

    await updateRentPlan({
      accountId: "account-1",
      rentPlanId: "plan-1",
      updates: {
        endDate: "",
        depositAmount: "",
        notes: "   ",
      },
    });

    const payload = update.mock.calls[0][0];
    expect(payload).toMatchObject({
      end_date: null,
      deposit_amount: null,
      notes: null,
    });
    expect(payload).not.toHaveProperty("updated_at");
  });
});
