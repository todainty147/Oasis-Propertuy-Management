import { beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.fn();
const fromMock = vi.fn();

vi.mock("../../src/lib/supabase.js", () => ({
  supabase: {
    rpc: (...args) => rpcMock(...args),
    from: (...args) => fromMock(...args),
  },
}));

function createThenableQuery(result) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(() => query),
    order: vi.fn(() => query),
    abortSignal: vi.fn(() => query),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
    catch: (reject) => Promise.resolve(result).catch(reject),
  };

  return query;
}

describe("work order manager service contracts", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    fromMock.mockReset();
  });

  it("returns parsed allowed actions and bulk maps", async () => {
    rpcMock
      .mockResolvedValueOnce({
        data: ["IN_PROGRESS", "completed", null],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          { work_order_id: "wo-1", actions: ["BLOCKED", "completed"] },
          { work_order_id: "wo-2", actions: ["cancelled"] },
        ],
        error: null,
      });

    const {
      getWorkOrderAllowedActions,
      getWorkOrderAllowedActionsBulk,
    } = await import("../../src/services/workOrderService.js");

    const single = await getWorkOrderAllowedActions("wo-1");
    const bulk = await getWorkOrderAllowedActionsBulk(["wo-1", "wo-2"]);

    expect(single).toEqual(["in_progress", "completed"]);
    expect(bulk).toEqual({
      "wo-1": ["blocked", "completed"],
      "wo-2": ["cancelled"],
    });
  });

  it("returns parsed manager work order acknowledgements for write RPCs", async () => {
    rpcMock
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: null });
    fromMock.mockReturnValue(
      createThenableQuery({
        data: {
          account_id: "account-1",
          contractor_id: "contractor-1",
          contractor_user_id: "contractor-user-1",
        },
        error: null,
      }),
    );

    const {
      approveWorkOrderTenantCancellation,
      assignWorkOrderContractor,
      denyWorkOrderTenantCancellation,
      setWorkOrderStatus,
    } = await import("../../src/services/workOrderService.js");

    const statusAck = await setWorkOrderStatus({
      workOrderId: "wo-1",
      newStatus: "in_progress",
    });
    const assignAck = await assignWorkOrderContractor({
      workOrderId: "wo-1",
      contractorId: "contractor-1",
    });
    const approveAck = await approveWorkOrderTenantCancellation("wo-1");
    const denyAck = await denyWorkOrderTenantCancellation({
      workOrderId: "wo-1",
      reason: "Need access",
    });

    expect(statusAck).toEqual({
      ok: true,
      work_order_id: "wo-1",
      status: "in_progress",
      contractor_id: null,
      reason: null,
    });
    expect(assignAck).toEqual({
      ok: true,
      work_order_id: "wo-1",
      status: null,
      contractor_id: "contractor-1",
      reason: null,
    });
    expect(approveAck.status).toBe("cancelled");
    expect(denyAck.reason).toBe("Need access");
  });

  it("returns parsed single work order rows from the service boundary", async () => {
    fromMock.mockImplementationOnce(() =>
      createThenableQuery({
        data: {
          id: "wo-1",
          account_id: "account-1",
          property_id: "property-1",
          maintenance_request_id: "req-1",
          contractor_id: "contractor-row-1",
          contractor_user_id: "contractor-user-1",
          contractor_name: "Contractor A1",
          contractor_phone: "+447700900101",
          status: "ASSIGNED",
          scheduled_at: "2026-03-28T10:00:00Z",
          notes: "Initial note",
          pending_cancel_request: false,
          acknowledgement_status: "PENDING",
          maintenance_requests: { id: "req-1", title: "Tap", status: "open", priority: "high" },
        },
        error: null,
      }),
    );

    const { fetchWorkOrderById } = await import("../../src/services/workOrderService.js");
    const row = await fetchWorkOrderById("wo-1");

    expect(row).toMatchObject({
      id: "wo-1",
      status: "assigned",
      contractor_id: "contractor-row-1",
      contractor_user_id: "contractor-user-1",
      acknowledgement_status: "pending",
      maintenance_requests: { id: "req-1", title: "Tap" },
    });
  });
});
