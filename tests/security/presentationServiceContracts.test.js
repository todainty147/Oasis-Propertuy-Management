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
    range: vi.fn(() => query),
    maybeSingle: vi.fn(() => query),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
    catch: (reject) => Promise.resolve(result).catch(reject),
  };

  return query;
}

describe("presentation-heavy service contracts", () => {
  beforeEach(() => {
    fromMock.mockReset();
    rpcMock.mockReset();
    getUserMock.mockReset();
  });

  it("returns parsed property performance bundles and contractor directory helpers", async () => {
    const complianceItemsQueue = [
      {
        data: [
          {
            id: "compliance-1",
            account_id: "account-1",
            property_id: "property-1",
            tenant_id: null,
            title: "Gas safety",
            category: "gas_safety",
            due_date: "2026-04-01",
            status: "ACTIVE",
            reminder_window_days: 30,
            recurrence_interval_months: 12,
            notes: "",
            created_at: "2026-03-28T10:00:00Z",
            updated_at: "2026-03-28T10:00:00Z",
          },
        ],
        error: null,
      },
      {
        data: [
          {
            id: "compliance-1",
            account_id: "account-1",
            property_id: "property-1",
            tenant_id: null,
            title: "Gas safety",
            category: "gas_safety",
            due_date: "2026-04-01",
            status: "ACTIVE",
            reminder_window_days: 30,
            recurrence_interval_months: 12,
            notes: "",
            created_at: "2026-03-28T10:00:00Z",
            updated_at: "2026-03-28T10:00:00Z",
          },
        ],
        error: null,
      },
    ];

    fromMock.mockImplementation((table) => {
      if (table === "maintenance_requests") {
        return createThenableQuery({
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
        });
      }

      if (table === "work_orders_with_flags") {
        return createThenableQuery({
          data: [
            {
              id: "wo-1",
              account_id: "account-1",
              property_id: "property-1",
              maintenance_request_id: "request-1",
              contractor_user_id: "contractor-1",
              contractor_name: "Contractor A1",
              contractor_phone: "+447700900101",
              status: "ASSIGNED",
              quote_amount: "180",
              invoice_amount: "0",
              created_at: "2026-03-28T12:00:00Z",
              acknowledgement_status: "PENDING",
            },
          ],
          error: null,
        });
      }

      if (table === "maintenance_expenses") {
        return createThenableQuery({
          data: [
            {
              id: "expense-1",
              account_id: "account-1",
              property_id: "property-1",
              amount: "75.5",
              approval_state: "APPROVED",
              expense_date: "2026-03-20",
              posted_at: "2026-03-21T10:00:00Z",
            },
          ],
          error: null,
        });
      }

      if (table === "property_operating_expenses") {
        return createThenableQuery({
          data: [
            {
              id: "opex-1",
              account_id: "account-1",
              property_id: "property-1",
              category: "TAX",
              expense_date: "2026-03-15",
              amount: "45",
              notes: "Council tax",
              created_by: "manager-1",
              created_at: "2026-03-15T10:00:00Z",
              updated_at: "2026-03-15T10:00:00Z",
            },
          ],
          error: null,
        });
      }

      if (table === "property_financial_profiles") {
        return createThenableQuery({
          data: {
            property_id: "property-1",
            account_id: "account-1",
            estimated_market_value: "250000",
            target_cap_rate: "6.5",
            notes: "Prime asset",
            created_at: "2026-03-01T10:00:00Z",
            updated_at: "2026-03-02T10:00:00Z",
          },
          error: null,
        });
      }

      if (table === "leases") {
        return createThenableQuery({
          data: [
            {
              id: "lease-1",
              account_id: "account-1",
              property_id: "property-1",
              tenant_id: "tenant-1",
              lease_start_date: "2026-01-01",
              lease_end_date: "2026-12-31",
              renewal_status: "ACTIVE",
              notice_period_days: 30,
              auto_renew: false,
              notes: "",
              property: { address: "11 Starlight Avenue" },
              tenant: { name: "Tenant A1" },
            },
          ],
          error: null,
        });
      }

      if (table === "preventive_maintenance_tasks") {
        return createThenableQuery({
          data: [
            {
              id: "pm-1",
              account_id: "account-1",
              property_id: "property-1",
              title: "Inspect boiler",
              category: "inspection",
              frequency: "MONTHLY",
              frequency_interval_days: 30,
              next_due_date: "2026-04-10",
              status: "ACTIVE",
              assigned_to_contractor_id: "contractor-1",
            },
          ],
          error: null,
        });
      }

      if (table === "compliance_items") {
        return createThenableQuery(complianceItemsQueue.shift());
      }

      if (table === "properties") {
        return createThenableQuery({
          data: [{ id: "property-1", address: "11 Starlight Avenue" }],
          error: null,
        });
      }

      if (table === "contractors") {
        return createThenableQuery({
          data: [
            {
              id: "contractor-1",
              name: "Contractor A1",
              phone: "+447700900101",
              email: "contractor.a1@oasis.test",
              user_id: "user-contractor-1",
              active: true,
            },
          ],
          count: 1,
          error: null,
        });
      }

      throw new Error(`Unexpected table ${table}`);
    });

    rpcMock.mockImplementation((fn) => {
      if (fn === "property_operational_health_snapshot") {
        return Promise.resolve({
          data: [
            {
              property_id: "property-1",
              property_label: "11 Starlight Avenue",
              score: "88",
              category: "healthy",
              reasons: [{ key: "maintenance_pressure", penalty: 6, count: 2 }],
              overdue_rent_amount: "0",
              open_request_count: "1",
              active_work_order_count: "1",
              tenant_count: "1",
            },
          ],
          error: null,
        });
      }

      throw new Error(`Unexpected rpc ${fn}`);
    });

    const { getPropertyPerformanceBundle } = await import("../../src/services/propertyOperationsService.js");
    const { countActiveContractors, listActiveContractors } = await import("../../src/services/contractorDirectoryService.js");

    const bundle = await getPropertyPerformanceBundle({
      accountId: "account-1",
      propertyId: "property-1",
    });
    const contractors = await listActiveContractors("account-1");
    const contractorCount = await countActiveContractors("account-1");

    expect(bundle.requests[0]).toMatchObject({
      id: "request-1",
      priority: "high",
      status: "open",
    });
    expect(bundle.workOrders[0]).toMatchObject({
      id: "wo-1",
      status: "assigned",
      quote_amount: 180,
    });
    expect(bundle.maintenanceExpenses[0]).toMatchObject({
      id: "expense-1",
      amount: 75.5,
      approval_state: "approved",
    });
    expect(bundle.operatingExpenses[0]).toMatchObject({
      id: "opex-1",
      category: "tax",
      amount: 45,
    });
    expect(bundle.financialProfile).toMatchObject({
      property_id: "property-1",
      estimated_market_value: 250000,
      target_cap_rate: 6.5,
    });
    expect(bundle.healthRows[0]).toMatchObject({
      propertyId: "property-1",
      score: 88,
      signals: expect.objectContaining({ openRequestCount: 1 }),
    });
    expect(contractors[0]).toMatchObject({
      id: "contractor-1",
      active: true,
      email: "contractor.a1@oasis.test",
    });
    expect(contractorCount).toBe(1);
  });

  it("returns parsed maintenance timeline events", async () => {
    fromMock.mockImplementation((table) => {
      if (table === "activity_log") {
        return createThenableQuery({
          data: [
            {
              id: "activity-1",
              account_id: "account-1",
              entity_type: "maintenance_request",
              entity_id: "request-1",
              action: "STATUS_CHANGE",
              field: "status",
              actor_role: "staff",
              created_at: "2026-03-28T09:00:00Z",
            },
          ],
          error: null,
        });
      }

      if (table === "work_order_audit_log") {
        return createThenableQuery({
          data: [
            {
              id: "audit-1",
              work_order_id: "wo-1",
              action: "assigned",
              created_at: "2026-03-28T10:00:00Z",
            },
          ],
          error: null,
        });
      }

      if (table === "work_order_attachments") {
        return createThenableQuery({
          data: [
            {
              id: "attachment-1",
              account_id: "account-1",
              work_order_id: "wo-1",
              uploaded_by: "user-1",
              file_name: "photo.jpg",
              mime_type: "image/jpeg",
              file_size: "2048",
              storage_bucket: "work-order-attachments",
              storage_path: "account/account-1/work_orders/wo-1/photo.jpg",
              kind: "PHOTO",
              created_at: "2026-03-28T11:00:00Z",
            },
          ],
          error: null,
        });
      }

      if (table === "work_order_financials") {
        return createThenableQuery({
          data: [
            {
              id: "financial-1",
              account_id: "account-1",
              work_order_id: "wo-1",
              quote_amount: "125",
              quote_status: "submitted",
              quote_submitted_at: "2026-03-28T12:00:00Z",
            },
          ],
          error: null,
        });
      }

      throw new Error(`Unexpected table ${table}`);
    });

    const { getMaintenanceTimelineEvents } = await import("../../src/services/maintenanceDashboardService.js");

    const t = (key, vars = {}) => {
      if (key === "maintenance.timeline.workOrderAction") {
        return `maintenance.timeline.workOrderAction:${vars.action}`;
      }
      return key;
    };

    const events = await getMaintenanceTimelineEvents({
      accountId: "account-1",
      request: {
        id: "request-1",
        title: "Leaking tap",
        status: "open",
        created_at: "2026-03-28T08:00:00Z",
      },
      linkedWorkOrders: [
        {
          id: "wo-1",
          created_at: "2026-03-28T08:30:00Z",
        },
      ],
      t,
    });

    expect(events.map((event) => event.title)).toEqual([
      "maintenance.timeline.requestCreated",
      "maintenance.timeline.workOrderCreated",
      "maintenance.timeline.requestStatusChanged",
      "maintenance.timeline.contractorAssigned",
      "maintenance.timeline.photoUploaded",
      "maintenance.timeline.quoteSubmitted",
    ]);
    expect(events[4].attachmentRow).toMatchObject({
      id: "attachment-1",
      kind: "photo",
      file_size: 2048,
    });
  });

  it("returns parsed tenant maintenance dashboard and issue rows", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "user-tenant-1" } },
      error: null,
    });

    fromMock.mockImplementation((table) => {
      if (table === "tenants") {
        return createThenableQuery({
          data: [
            {
              id: "tenant-1",
              account_id: "account-1",
              property_id: "property-1",
              user_id: "user-tenant-1",
              status: "ACTIVE",
              name: "Tenant A1",
              email: "tenant.a1@oasis.test",
              phone: "+447700900101",
              created_at: "2026-03-28T08:00:00Z",
              updated_at: "2026-03-28T08:00:00Z",
            },
          ],
          error: null,
        });
      }

      if (table === "maintenance_requests") {
        return createThenableQuery({
          data: [
            {
              id: "request-1",
              account_id: "account-1",
              property_id: "property-1",
              reported_by_tenant_id: "tenant-1",
              title: "Door issue",
              description: "Front door sticks",
              priority: "NORMAL",
              status: "IN_PROGRESS",
              created_at: "2026-03-28T09:00:00Z",
              updated_at: "2026-03-28T10:00:00Z",
            },
          ],
          error: null,
        });
      }

      if (table === "work_orders_with_flags") {
        return createThenableQuery({
          data: [
            {
              id: "wo-1",
              account_id: "account-1",
              property_id: "property-1",
              maintenance_request_id: "request-1",
              status: "ASSIGNED",
              scheduled_at: "2026-03-29T10:00:00Z",
              created_at: "2026-03-28T11:00:00Z",
              pending_cancel_request: true,
              last_cancel_resolution_action: "denied",
              acknowledgement_status: "PENDING",
            },
          ],
          error: null,
        });
      }

      if (table === "tenant_my_issues") {
        return createThenableQuery({
          data: [
            {
              maintenance_request_id: "request-1",
              account_id: "account-1",
              property_id: "property-1",
              title: "Door issue",
              maintenance_status: "IN_PROGRESS",
              priority: "NORMAL",
              created_at: "2026-03-28T09:00:00Z",
              latest_work_order_status: "ASSIGNED",
              latest_work_order_id: "wo-1",
            },
          ],
          error: null,
        });
      }

      throw new Error(`Unexpected table ${table}`);
    });

    const {
      getTenantMaintenanceDashboardData,
      listTenantIssueRows,
    } = await import("../../src/services/maintenanceService.js");

    const dashboardData = await getTenantMaintenanceDashboardData({
      accountId: "account-1",
      propertyId: "property-1",
      limit: 5,
    });
    const issueRows = await listTenantIssueRows({
      accountId: "account-1",
      propertyId: "property-1",
      limit: 20,
    });

    expect(dashboardData.requests[0]).toMatchObject({
      id: "request-1",
      status: "in_progress",
      priority: "normal",
    });
    expect(dashboardData.workOrders[0]).toMatchObject({
      id: "wo-1",
      status: "assigned",
      pending_cancel_request: true,
      acknowledgement_status: "pending",
    });
    expect(issueRows[0]).toMatchObject({
      maintenance_request_id: "request-1",
      maintenance_status: "in_progress",
      latest_work_order_status: "assigned",
    });
  });
});
