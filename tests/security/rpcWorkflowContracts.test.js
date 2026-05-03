import { beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.fn();
const fromMock = vi.fn();
const storageUrlMock = vi.fn();

vi.mock("../../src/lib/supabase.js", () => ({
  supabase: {
    rpc: (...args) => rpcMock(...args),
    from: (...args) => fromMock(...args),
  },
}));

vi.mock("../../src/services/storageUrlService.js", () => ({
  createSignedStorageUrl: (...args) => storageUrlMock(...args),
}));

function createThenableQuery(result) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(() => query),
    single: vi.fn(() => query),
    update: vi.fn(() => query),
    delete: vi.fn(() => query),
    order: vi.fn(() => query),
    range: vi.fn(() => query),
    limit: vi.fn(() => query),
    abortSignal: vi.fn(() => query),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
    catch: (reject) => Promise.resolve(result).catch(reject),
  };

  return query;
}

describe("RPC workflow contracts", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    fromMock.mockReset();
    storageUrlMock.mockReset();
  });

  it("returns a stable notification write acknowledgement", async () => {
    rpcMock.mockResolvedValueOnce({ error: null });

    const { createNotifications } = await import("../../src/services/notificationService.js");
    const result = await createNotifications({
      accountId: "account-1",
      recipientUserIds: ["user-1", "user-2"],
      type: "work_order_created",
      title: "New work order",
    });

    expect(result).toEqual({
      ok: true,
      accountId: "account-1",
      recipientCount: 2,
      type: "work_order_created",
    });
  });

  it("returns parsed contractor rpc shapes from the service boundary", async () => {
    rpcMock
      .mockResolvedValueOnce({
        data: [
          {
            work_order_id: "wo-1",
            property_label: "11 Starlight Avenue, London",
            issue_title: "Leaking tap",
            issue_description: "Kitchen tap leaking",
            issue_priority: "HIGH",
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: ["IN_PROGRESS", "completed"],
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          id: "wo-1",
          account_id: "account-1",
          property_id: "property-1",
          maintenance_request_id: "req-1",
          contractor_user_id: "contractor-1",
          contractor_name: "Contractor A1",
          contractor_phone: "+447700900101",
          status: "IN_PROGRESS",
          scheduled_at: "2026-03-28T10:00:00Z",
          notes: "On the way",
        },
        error: null,
      });

    const {
      getContractorAllowedActions,
      listContractorWorkOrderCards,
      updateContractorWorkOrder,
    } = await import("../../src/services/contractorWorkOrderService.js");

    const cards = await listContractorWorkOrderCards(["wo-1"]);
    const actions = await getContractorAllowedActions("wo-1");
    const updated = await updateContractorWorkOrder({
      workOrderId: "wo-1",
      status: "in_progress",
      notes: "On the way",
    });

    expect(cards[0]).toMatchObject({
      work_order_id: "wo-1",
      issue_priority: "high",
    });
    expect(actions).toEqual(["in_progress", "completed"]);
    expect(updated).toMatchObject({
      id: "wo-1",
      status: "in_progress",
      notes: "On the way",
    });
  });

  it("returns parsed work order service rows for create and update flows", async () => {
    rpcMock.mockResolvedValueOnce({ data: "wo-1", error: null });
    fromMock
      .mockImplementationOnce(() =>
        createThenableQuery({
          data: {
            id: "wo-1",
            account_id: "account-1",
            property_id: "property-1",
            maintenance_request_id: "req-1",
            contractor_user_id: "contractor-1",
            contractor_name: "Contractor A1",
            contractor_phone: "+447700900101",
            status: "ASSIGNED",
            scheduled_at: null,
            notes: "Initial note",
            created_at: "2026-03-28T10:00:00Z",
            updated_at: "2026-03-28T10:00:00Z",
            maintenance_requests: { id: "req-1", title: "Tap", status: "open", priority: "high" },
          },
          error: null,
        }),
      )
      .mockImplementationOnce(() =>
        createThenableQuery({
          data: {
            id: "wo-1",
            account_id: "account-1",
            property_id: "property-1",
            contractor_user_id: "contractor-1",
            status: "IN_PROGRESS",
            scheduled_at: "2026-03-29T10:00:00Z",
            updated_at: "2026-03-28T11:00:00Z",
          },
          error: null,
        }),
      );

    const { createWorkOrder, updateWorkOrder } = await import("../../src/services/workOrderService.js");

    const created = await createWorkOrder({
      accountId: "account-1",
      propertyId: "property-1",
      maintenanceRequestId: "req-1",
      contractorName: "Contractor A1",
    });
    const updated = await updateWorkOrder("wo-1", {
      status: "in_progress",
      scheduled_at: "2026-03-29T10:00:00",
    }, { accountId: "account-1" });

    expect(created).toMatchObject({
      id: "wo-1",
      status: "assigned",
      maintenance_requests: { id: "req-1", title: "Tap" },
    });
    expect(updated).toMatchObject({
      id: "wo-1",
      status: "in_progress",
      scheduled_at: "2026-03-29T10:00:00Z",
    });
  });

  it("returns parsed security audit workflow rows", async () => {
    rpcMock
      .mockResolvedValueOnce({
        data: {
          id: "alert-1",
          account_id: "account-1",
          alert_type: "suspicious_login",
          severity: "warning",
          status: "ACKNOWLEDGED",
          acknowledged_by_user_id: "owner-1",
          acknowledged_at: "2026-03-28T12:00:00Z",
          metadata: { source: "integration-test" },
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          id: "job-1",
          account_id: "account-1",
          requested_by_user_id: "owner-1",
          requested_label: "March export",
          export_kind: "security_audit_csv",
          format: "csv",
          status: "QUEUED",
          filter_criteria: { action: "login" },
          artifact_bucket: "",
          artifact_path: "",
          row_count: null,
          file_size_bytes: null,
          error_summary: null,
          created_at: "2026-03-28T12:05:00Z",
          expires_at: "2026-04-11T12:05:00Z",
        },
        error: null,
      });

    const {
      applySecurityAlertWorkflow,
      requestSecurityAuditBackendExport,
    } = await import("../../src/services/securityAuditService.js");

    const workflow = await applySecurityAlertWorkflow({
      alertId: "alert-1",
      operation: "acknowledge",
    });
    const exportJob = await requestSecurityAuditBackendExport("account-1", {
      action: "login",
    });

    expect(workflow).toMatchObject({
      id: "alert-1",
      status: "acknowledged",
      acknowledged_by_user_id: "owner-1",
    });
    expect(exportJob).toMatchObject({
      id: "job-1",
      status: "queued",
      filter_criteria: { action: "login" },
    });
  });
});
