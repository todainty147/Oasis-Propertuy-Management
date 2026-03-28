import { beforeEach, describe, expect, it, vi } from "vitest";

const fromMock = vi.fn();
const rpcMock = vi.fn();
const getUserMock = vi.fn();

vi.mock("../../src/lib/supabase.js", () => ({
  supabase: {
    from: (...args) => fromMock(...args),
    rpc: (...args) => rpcMock(...args),
    auth: {
      getUser: (...args) => getUserMock(...args),
    },
  },
}));

function createThenableQuery(result) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    maybeSingle: vi.fn(() => query),
    abortSignal: vi.fn(() => query),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
    catch: (reject) => Promise.resolve(result).catch(reject),
  };

  return query;
}

describe("workflow detail service contracts", () => {
  beforeEach(() => {
    fromMock.mockReset();
    rpcMock.mockReset();
    getUserMock.mockReset();
  });

  it("returns parsed work-order detail helpers from service boundaries", async () => {
    fromMock.mockImplementation((table) => {
      if (table === "work_order_audit_log") {
        return createThenableQuery({
          data: [
            {
              id: "audit-1",
              work_order_id: "wo-1",
              action: "STATUS_CHANGED",
              actor_user_id: "manager-1",
              old_value: "assigned",
              new_value: "in_progress",
              created_at: "2026-03-28T10:00:00Z",
            },
          ],
          error: null,
        });
      }

      if (table === "work_order_status_definitions") {
        return createThenableQuery({
          data: [
            { status: "ASSIGNED", label: "Assigned" },
            { status: "IN_PROGRESS", label: "In progress" },
          ],
          error: null,
        });
      }

      if (table === "work_orders_pending_cancellation") {
        return createThenableQuery({
          data: [
            {
              id: "wo-2",
              account_id: "account-1",
              property_id: "property-1",
              status: "ASSIGNED",
              contractor_name: "Contractor A1",
              contractor_phone: "+447700900101",
              scheduled_at: "2026-03-29T10:00:00Z",
              last_cancel_request_at: "2026-03-28T09:00:00Z",
              last_cancel_request_by: "tenant",
            },
          ],
          error: null,
        });
      }

      if (table === "work_order_financials") {
        return createThenableQuery({
          data: {
            id: "fin-1",
            account_id: "account-1",
            work_order_id: "wo-1",
            quote_amount: "150.50",
            quote_currency: "GBP",
            quote_notes: "Pipe replacement",
            quote_status: "SUBMITTED",
            invoice_amount: null,
            invoice_currency: "GBP",
            created_at: "2026-03-28T08:00:00Z",
            updated_at: "2026-03-28T08:30:00Z",
          },
          error: null,
        });
      }

      throw new Error(`Unexpected table ${table}`);
    });

    const {
      listPendingCancellationWorkOrders,
      listWorkOrderAuditLog,
      listWorkOrderStatusDefinitions,
    } = await import("../../src/services/workOrderService.js");
    const { getWorkOrderFinancials } = await import("../../src/services/workOrderFinancialsService.js");

    const auditRows = await listWorkOrderAuditLog("wo-1");
    const statusMap = await listWorkOrderStatusDefinitions();
    const pendingRows = await listPendingCancellationWorkOrders({ accountId: "account-1" });
    const financial = await getWorkOrderFinancials({ accountId: "account-1", workOrderId: "wo-1" });

    expect(auditRows[0]).toMatchObject({
      id: "audit-1",
      work_order_id: "wo-1",
      action: "status_changed",
    });
    expect(statusMap).toEqual({
      assigned: "Assigned",
      in_progress: "In progress",
    });
    expect(pendingRows[0]).toMatchObject({
      id: "wo-2",
      status: "assigned",
      contractor_name: "Contractor A1",
    });
    expect(financial).toMatchObject({
      id: "fin-1",
      work_order_id: "wo-1",
      quote_amount: 150.5,
      quote_status: "submitted",
    });
  });

  it("returns contractor portal rows filtered to the signed-in contractor and hydrated", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "contractor-user-1" } },
      error: null,
    });

    rpcMock.mockResolvedValue({
      data: [
        {
          work_order_id: "wo-1",
          property_label: "11 Starlight Avenue, London",
          issue_title: "Leaking tap",
          issue_description: "Kitchen tap leaking slowly",
          issue_priority: "high",
        },
      ],
      error: null,
    });

    fromMock.mockImplementation((table) => {
      if (table === "work_orders_with_flags") {
        return createThenableQuery({
          data: [
            {
              id: "wo-1",
              account_id: "account-1",
              property_id: "property-1",
              maintenance_request_id: "req-1",
              contractor_user_id: "contractor-user-1",
              contractor_name: "Contractor A1",
              contractor_phone: "+447700900101",
              status: "ASSIGNED",
              notes: "",
              created_at: "2026-03-28T10:00:00Z",
              updated_at: "2026-03-28T10:30:00Z",
            },
            {
              id: "wo-2",
              account_id: "account-1",
              property_id: "property-2",
              maintenance_request_id: "req-2",
              contractor_user_id: "contractor-user-2",
              contractor_name: "Contractor B1",
              contractor_phone: "+447700900102",
              status: "ASSIGNED",
              notes: "",
              created_at: "2026-03-28T11:00:00Z",
              updated_at: "2026-03-28T11:30:00Z",
            },
          ],
          error: null,
        });
      }

      if (table === "maintenance_requests") {
        return createThenableQuery({
          data: [
            {
              id: "req-1",
              account_id: "account-1",
              property_id: "property-1",
              reported_by_tenant_id: "tenant-1",
              title: "Leaking tap",
              description: "Kitchen tap leaking slowly",
              priority: "HIGH",
              status: "OPEN",
              created_at: "2026-03-28T09:00:00Z",
              updated_at: "2026-03-28T09:30:00Z",
            },
          ],
          error: null,
        });
      }

      if (table === "properties") {
        return createThenableQuery({
          data: [{ id: "property-1", address: "11 Starlight Avenue", city: "London" }],
          error: null,
        });
      }

      throw new Error(`Unexpected table ${table}`);
    });

    const { loadContractorPortalRows } = await import("../../src/services/contractorWorkOrderService.js");
    const rows = await loadContractorPortalRows({ source: "test" });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "wo-1",
      contractor_user_id: "contractor-user-1",
      issueTitle: "Leaking tap",
      propertyLabel: "11 Starlight Avenue, London",
    });
  });

  it("returns a parsed contractor job details bundle", async () => {
    rpcMock.mockResolvedValue({
      data: [
        {
          work_order_id: "wo-1",
          property_label: "11 Starlight Avenue, London",
          issue_title: "Leaking tap",
          issue_description: "Kitchen tap leaking slowly",
          issue_priority: "high",
        },
      ],
      error: null,
    });

    fromMock.mockImplementation((table) => {
      if (table === "work_orders") {
        return createThenableQuery({
          data: {
            id: "wo-1",
            account_id: "account-1",
            maintenance_request_id: "req-1",
            property_id: "property-1",
            status: "ASSIGNED",
            scheduled_at: "2026-03-29T10:00:00Z",
            notes: "Initial note",
            contractor_name: "Contractor A1",
            contractor_phone: "+447700900101",
            created_at: "2026-03-28T08:00:00Z",
            updated_at: "2026-03-28T08:30:00Z",
            assigned_at: "2026-03-28T08:10:00Z",
            acknowledged_at: null,
            acknowledgement_due_at: "2026-03-29T08:00:00Z",
            acknowledgement_status: "PENDING",
          },
          error: null,
        });
      }

      if (table === "work_order_financials") {
        return createThenableQuery({
          data: {
            id: "fin-1",
            account_id: "account-1",
            work_order_id: "wo-1",
            quote_amount: "200",
            quote_currency: "GBP",
            quote_status: "DRAFT",
            created_at: "2026-03-28T08:00:00Z",
            updated_at: "2026-03-28T08:30:00Z",
          },
          error: null,
        });
      }

      if (table === "maintenance_requests") {
        return createThenableQuery({
          data: {
            id: "req-1",
            account_id: "account-1",
            property_id: "property-1",
            reported_by_tenant_id: "tenant-1",
            title: "Leaking tap",
            description: "Kitchen tap leaking slowly",
            priority: "HIGH",
            status: "OPEN",
            created_at: "2026-03-28T07:00:00Z",
            updated_at: "2026-03-28T07:30:00Z",
          },
          error: null,
        });
      }

      if (table === "properties") {
        return createThenableQuery({
          data: {
            id: "property-1",
            address: "11 Starlight Avenue",
            city: "London",
          },
          error: null,
        });
      }

      throw new Error(`Unexpected table ${table}`);
    });

    const { getContractorJobDetailsBundle } = await import("../../src/services/contractorWorkOrderService.js");
    const bundle = await getContractorJobDetailsBundle("wo-1", { source: "test" });

    expect(bundle.row).toMatchObject({
      id: "wo-1",
      status: "assigned",
      acknowledgement_status: "pending",
    });
    expect(bundle.financials).toMatchObject({
      work_order_id: "wo-1",
      quote_amount: 200,
      quote_status: "draft",
    });
    expect(bundle.requestRow).toMatchObject({
      id: "req-1",
      title: "Leaking tap",
      priority: "high",
    });
    expect(bundle.propertyLabel).toBe("11 Starlight Avenue, London");
  });
});
