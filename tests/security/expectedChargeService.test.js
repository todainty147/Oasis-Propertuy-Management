import { beforeEach, describe, expect, it, vi } from "vitest";

const fromMock = vi.fn();

vi.mock("../../src/lib/supabase", () => ({
  supabase: {
    from: (...args) => fromMock(...args),
  },
}));

const { listExpectedCharges } = await import("../../src/services/expectedChargeService.js");

function mockListChain(result = { data: [], error: null }) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
    catch: (reject) => Promise.resolve(result).catch(reject),
  };

  fromMock.mockReturnValueOnce(chain);
  return chain;
}

describe("expectedChargeService", () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it("filters expected charges by rent plan when reviewing a plan", async () => {
    const chain = mockListChain();

    await listExpectedCharges({
      accountId: "account-1",
      rentPlanId: "plan-1",
    });

    expect(fromMock).toHaveBeenCalledWith("expected_charges");
    expect(chain.eq).toHaveBeenCalledWith("account_id", "account-1");
    expect(chain.eq).toHaveBeenCalledWith("rent_plan_id", "plan-1");
  });
});
