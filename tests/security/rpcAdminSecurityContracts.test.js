import { beforeEach, describe, expect, it, vi } from "vitest";

const fromMock = vi.fn();

vi.mock("../../src/lib/supabase.js", () => ({
  supabase: {
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
    limit: vi.fn(() => query),
    gte: vi.fn(() => query),
    lte: vi.fn(() => query),
    maybeSingle: vi.fn(() => query),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
    catch: (reject) => Promise.resolve(result).catch(reject),
  };

  return query;
}

describe("admin/security reporting service contracts", () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it("returns parsed security audit ledger rows", async () => {
    fromMock.mockImplementation((table) => {
      if (table === "security_audit_ledger") {
        return createThenableQuery({
          data: [
            {
              id: "evt-1",
              account_id: "account-1",
              actor_user_id: "user-1",
              action: "WORK_ORDER_STATUS_CHANGED",
              entity_type: "WORK_ORDER",
              entity_id: "wo-1",
              metadata: { before: "assigned" },
              created_at: "2026-03-28T12:00:00Z",
            },
          ],
          error: null,
          count: 1,
        });
      }

      return createThenableQuery({ data: [], error: null, count: 0 });
    });

    const { listSecurityAuditEvents } = await import("../../src/services/securityAuditService.js");
    const result = await listSecurityAuditEvents("account-1", { page: 1, pageSize: 25 });

    expect(result.total).toBe(1);
    expect(result.rows).toEqual([
      expect.objectContaining({
        id: "evt-1",
        account_id: "account-1",
        action: "work_order_status_changed",
        entity_type: "work_order",
        entity_id: "wo-1",
        metadata: { before: "assigned" },
      }),
    ]);
  });

  it("returns parsed anomaly alerts, assignees, and export jobs", async () => {
    fromMock.mockImplementation((table) => {
      if (table === "security_anomaly_alerts") {
        return createThenableQuery({
          data: [
            {
              id: "alert-1",
              account_id: "account-1",
              alert_type: "unexpected_export_volume",
              severity: "URGENT",
              status: "OPEN",
              actor_user_id: "user-1",
              entity_type: "account",
              entity_id: "account-1",
              title: "Unexpected export volume",
              summary: "Large export requested",
              metadata: { rows: 9999 },
              alert_count: "2",
              classification: "",
              classified_by_user_id: null,
              classified_at: null,
              assigned_to_user_id: "user-2",
              assigned_by_user_id: "user-3",
              assigned_at: "2026-03-28T12:10:00Z",
              acknowledged_by_user_id: null,
              acknowledged_at: null,
              resolved_by_user_id: null,
              resolved_at: null,
              resolution_note: "",
              created_at: "2026-03-28T12:00:00Z",
              last_seen_at: "2026-03-28T12:11:00Z",
              updated_at: "2026-03-28T12:11:00Z",
            },
          ],
          error: null,
          count: 1,
        });
      }

      if (table === "security_audit_export_jobs") {
        return createThenableQuery({
          data: [
            {
              id: "job-1",
              account_id: "account-1",
              requested_by_user_id: "user-1",
              requested_label: "manual-export",
              export_kind: "security_audit",
              format: "csv",
              status: "COMPLETED",
              filter_criteria: { action: "login" },
              artifact_bucket: "documents",
              artifact_path: "exports/job-1.csv",
              row_count: "42",
              file_size_bytes: "2048",
              error_summary: "",
              created_at: "2026-03-28T10:00:00Z",
              started_at: "2026-03-28T10:01:00Z",
              completed_at: "2026-03-28T10:02:00Z",
              expires_at: "2026-04-04T10:02:00Z",
            },
          ],
          error: null,
          count: 1,
        });
      }

      if (table === "account_members") {
        return createThenableQuery({
          data: [
            { user_id: "user-1", role: "owner" },
            { user_id: "user-2", role: "admin" },
            { user_id: "user-3", role: "staff" },
          ],
          error: null,
          count: 3,
        });
      }

      return createThenableQuery({ data: [], error: null, count: 0 });
    });

    const {
      listSecurityAnomalyAlerts,
      listSecurityAlertAssignees,
      listSecurityAuditExportJobs,
    } = await import("../../src/services/securityAuditService.js");

    const alerts = await listSecurityAnomalyAlerts("account-1");
    const assignees = await listSecurityAlertAssignees("account-1");
    const jobs = await listSecurityAuditExportJobs("account-1");

    expect(alerts.rows).toEqual([
      expect.objectContaining({
        id: "alert-1",
        accountId: "account-1",
        severity: "urgent",
        status: "open",
        alertCount: 2,
        entityType: "account",
        entityId: "account-1",
      }),
    ]);

    expect(assignees).toEqual(
      expect.arrayContaining([
        { userId: "user-1", role: "owner", label: "owner • user-1" },
        { userId: "user-2", role: "admin", label: "admin • user-2" },
      ]),
    );

    expect(jobs.rows).toEqual([
      expect.objectContaining({
        id: "job-1",
        accountId: "account-1",
        requestedByUserId: "user-1",
        exportKind: "security_audit",
        status: "completed",
        rowCount: 42,
        fileSizeBytes: 2048,
        artifactBucket: "documents",
        artifactPath: "exports/job-1.csv",
      }),
    ]);
  });

  it("returns parsed document audit rows", async () => {
    fromMock.mockImplementation((table) => {
      if (table === "document_audit_log") {
        return createThenableQuery({
          data: [
            {
              id: "audit-1",
              account_id: "account-1",
              document_id: "doc-1",
              property_id: "property-1",
              tenant_id: null,
              user_id: "user-1",
              action: "DOWNLOAD",
              details: { via: "preview" },
              metadata: { request_id: "req-1" },
              performed_at: "2026-03-28T12:30:00Z",
            },
          ],
          error: null,
          count: 1,
        });
      }

      return createThenableQuery({ data: [], error: null, count: 0 });
    });

    const { fetchDocumentAudit } = await import("../../src/services/documentAuditService.js");
    const rows = await fetchDocumentAudit({ accountId: "account-1", documentId: "doc-1" });

    expect(rows).toEqual([
      {
        id: "audit-1",
        account_id: "account-1",
        document_id: "doc-1",
        property_id: "property-1",
        tenant_id: null,
        user_id: "user-1",
        action: "download",
        details: { via: "preview" },
        metadata: { request_id: "req-1" },
        performed_at: "2026-03-28T12:30:00Z",
      },
    ]);
  });
});
