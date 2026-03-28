import { beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.fn();
const fromMock = vi.fn();

vi.mock("../../src/lib/supabase.js", () => ({
  supabase: {
    rpc: (...args) => rpcMock(...args),
    from: (...args) => fromMock(...args),
    auth: {
      signInWithOtp: vi.fn(),
    },
  },
}));

function createThenableQuery(result) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    order: vi.fn(() => query),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
    catch: (reject) => Promise.resolve(result).catch(reject),
  };

  return query;
}

describe("maintenance inbox and invite service contracts", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    fromMock.mockReset();
  });

  it("returns parsed maintenance inbox shapes from the service boundary", async () => {
    fromMock
      .mockImplementationOnce(() =>
        createThenableQuery({
          data: [
            {
              id: "req-1",
              account_id: "account-1",
              property_id: "property-1",
              reported_by_tenant_id: "tenant-1",
              title: "Leaking tap",
              description: "Kitchen tap",
              priority: "HIGH",
              status: "OPEN",
              waiting_reason: null,
              created_at: "2026-03-28T10:00:00Z",
              updated_at: "2026-03-28T11:00:00Z",
            },
          ],
          error: null,
        }),
      )
      .mockImplementationOnce(() =>
        createThenableQuery({
          data: [{ id: "property-1", address: "11 Starlight Avenue", city: "London" }],
          error: null,
        }),
      )
      .mockImplementationOnce(() =>
        createThenableQuery({
          data: [{ id: "contractor-1", name: "Contractor A1", phone: "+447700900101", active: true }],
          error: null,
        }),
      )
      .mockImplementationOnce(() =>
        createThenableQuery({
          data: [
            {
              id: "wo-1",
              account_id: "account-1",
              property_id: "property-1",
              maintenance_request_id: "req-1",
              contractor_user_id: "user-1",
              contractor_name: "Contractor A1",
              contractor_phone: "+447700900101",
              status: "ASSIGNED",
              created_at: "2026-03-28T12:00:00Z",
            },
          ],
          error: null,
        }),
      );

    const { loadMaintenanceInboxData } = await import("../../src/services/maintenanceInboxService.js");
    const result = await loadMaintenanceInboxData("account-1", "Property");

    expect(result.requests[0]).toMatchObject({
      id: "req-1",
      priority: "high",
      status: "open",
    });
    expect(result.propertyLabelById["property-1"]).toBe("11 Starlight Avenue, London");
    expect(result.contractors[0]).toMatchObject({
      id: "contractor-1",
      name: "Contractor A1",
    });
    expect(result.workOrdersByRequestId["req-1"][0]).toMatchObject({
      id: "wo-1",
      status: "assigned",
    });
  });

  it("returns a parsed invitation acceptance result", async () => {
    rpcMock.mockResolvedValueOnce({
      data: {
        account_id: "account-1",
        role: "TENANT",
        membership_created: true,
      },
      error: null,
    });

    const { acceptAccountInvite } = await import("../../src/services/invitationService.js");
    const result = await acceptAccountInvite("token-1");

    expect(result).toEqual({
      account_id: "account-1",
      role: "tenant",
      membership_created: true,
    });
  });
});
