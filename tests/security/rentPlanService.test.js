import { beforeEach, describe, expect, it, vi } from "vitest";

const fromMock = vi.fn();
const rpcMock = vi.fn();

vi.mock("../../src/lib/supabase", () => ({
  supabase: {
    from: (...args) => fromMock(...args),
    rpc: (...args) => rpcMock(...args),
  },
}));

const {
  createRentPlan,
  endRentPlan,
  listRentPlans,
  updateRentPlan,
  upsertChargeRules,
} = await import("../../src/services/rentPlanService.js");

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

function mockExistingPlanChain(existing) {
  const existingChain = {
    select: vi.fn(() => existingChain),
    eq: vi.fn(() => existingChain),
    single: vi.fn(() => Promise.resolve({ data: existing, error: null })),
  };

  fromMock.mockReturnValueOnce(existingChain);
  return existingChain;
}

describe("rentPlanService", () => {
  beforeEach(() => {
    fromMock.mockReset();
    rpcMock.mockReset();
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

  it("reports missing draft plans as not found before status validation", async () => {
    mockExistingPlanChain(null);

    await expect(updateRentPlan({
      accountId: "account-1",
      rentPlanId: "missing-plan",
      updates: {},
    })).rejects.toThrow("Rent plan not found");
  });

  it("does not query rent plans without an account id", async () => {
    await expect(listRentPlans()).resolves.toEqual([]);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("ends plans through the server-side RPC instead of direct table updates", async () => {
    rpcMock.mockResolvedValueOnce({ data: { id: "plan-1", status: "ended" }, error: null });

    await endRentPlan({ accountId: "account-1", rentPlanId: "plan-1" });

    expect(rpcMock).toHaveBeenCalledWith("end_rent_plan", {
      p_account_id: "account-1",
      p_rent_plan_id: "plan-1",
    });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("replaces charge rules through the server-side RPC for transactional safety", async () => {
    rpcMock.mockResolvedValueOnce({ data: [{ id: "rule-1" }], error: null });

    await upsertChargeRules({
      accountId: "account-1",
      rentPlanId: "plan-1",
      rules: [{ chargeType: "rent", label: "Rent", amount: 1500 }],
    });

    expect(rpcMock).toHaveBeenCalledWith("upsert_rent_charge_rules", {
      p_account_id: "account-1",
      p_rent_plan_id: "plan-1",
      p_rules: [expect.objectContaining({
        charge_type: "rent",
        label: "Rent",
        amount: 1500,
      })],
    });
    expect(fromMock).not.toHaveBeenCalled();
  });
});
