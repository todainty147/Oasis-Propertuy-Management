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
    in: vi.fn(() => query),
    order: vi.fn(() => query),
    range: vi.fn(() => query),
    maybeSingle: vi.fn(() => query),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
    catch: (reject) => Promise.resolve(result).catch(reject),
  };

  return query;
}

describe("table-backed UI adapter contracts", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    fromMock.mockReset();
  });

  it("returns parsed account payment list rows", async () => {
    fromMock.mockImplementationOnce(() =>
      createThenableQuery({
        data: [
          {
            id: "payment-1",
            account_id: "account-1",
            property_id: "property-1",
            tenant_id: "tenant-1",
            amount: "1200",
            due_date: "2026-03-30",
            paid_at: null,
            created_at: "2026-03-28T10:00:00Z",
            status: "OVERDUE",
            tenants: { name: "Tenant A1" },
            properties: { address: "11 Starlight Avenue", rent: 1200 },
          },
        ],
        error: null,
      }),
    );

    const { listAccountPayments } = await import("../../src/services/paymentService.js");
    const rows = await listAccountPayments("account-1");

    expect(rows).toEqual([
      {
        id: "payment-1",
        amount: 1200,
        status: "overdue",
        dueDate: "2026-03-30",
        paidAt: null,
        tenantId: "tenant-1",
        propertyId: "property-1",
        tenantName: "Tenant A1",
        propertyAddress: "11 Starlight Avenue",
        propertyRent: 1200,
      },
    ]);
  });

  it("returns parsed account tenant list rows", async () => {
    fromMock.mockImplementationOnce(() =>
      createThenableQuery({
        data: [
          {
            id: "tenant-1",
            name: "Tenant A1",
            email: "tenant.a1@oasis.test",
            phone: "+447700900101",
            property_id: "property-1",
            created_at: "2026-03-28T10:00:00Z",
          },
        ],
        error: null,
      }),
    );

    const { listAccountTenants } = await import("../../src/services/tenantService.js");
    const rows = await listAccountTenants("account-1");

    expect(rows).toEqual([
      {
        id: "tenant-1",
        name: "Tenant A1",
        email: "tenant.a1@oasis.test",
        phone: "+447700900101",
        propertyId: "property-1",
        createdAt: "2026-03-28T10:00:00Z",
      },
    ]);
  });

  it("returns parsed property-scoped maintenance request bundles", async () => {
    fromMock
      .mockImplementationOnce(() =>
        createThenableQuery({
          data: [
            {
              id: "request-1",
              account_id: "account-1",
              property_id: "property-1",
              reported_by_tenant_id: "tenant-1",
              title: "Leaking tap",
              description: "Kitchen tap",
              priority: "HIGH",
              status: "OPEN",
              created_at: "2026-03-28T10:00:00Z",
              updated_at: "2026-03-28T11:00:00Z",
            },
          ],
          count: 1,
          error: null,
        }),
      )
      .mockImplementationOnce(() =>
        createThenableQuery({
          data: [
            {
              id: "work-order-1",
              account_id: "account-1",
              property_id: "property-1",
              maintenance_request_id: "request-1",
              contractor_user_id: "contractor-1",
              contractor_name: "Contractor A1",
              contractor_phone: "+447700900101",
              status: "ASSIGNED",
              created_at: "2026-03-28T12:00:00Z",
            },
          ],
          count: 1,
          error: null,
        }),
      )
      .mockImplementationOnce(() =>
        createThenableQuery({
          data: { id: "tenant-row-1" },
          error: null,
        }),
      );

    const {
      listLinkedWorkOrdersForRequests,
      listMaintenanceRequestsByProperty,
      resolveTenantReporterId,
    } = await import("../../src/services/maintenanceService.js");

    const requestPage = await listMaintenanceRequestsByProperty({
      accountId: "account-1",
      propertyId: "property-1",
      page: 1,
      pageSize: 20,
    });
    const grouped = await listLinkedWorkOrdersForRequests({
      accountId: "account-1",
      propertyId: "property-1",
      requests: requestPage.data,
    });
    const tenantId = await resolveTenantReporterId({
      accountId: "account-1",
      propertyId: "property-1",
      userId: "user-1",
    });

    expect(requestPage.data[0]).toMatchObject({
      id: "request-1",
      priority: "high",
      status: "open",
    });
    expect(grouped["request-1"][0]).toMatchObject({
      id: "work-order-1",
      status: "assigned",
    });
    expect(tenantId).toBe("tenant-row-1");
  });
});
