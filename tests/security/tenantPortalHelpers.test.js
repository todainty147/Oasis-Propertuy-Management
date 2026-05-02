import { describe, expect, it } from "vitest";

import {
  buildTenantMaintenanceProgress,
  buildTenantPaymentSummary,
  getTenantRequestStatusMeta,
  getTenantWorkOrderStatusMeta,
  partitionTenantDocuments,
  summarizeTenantMaintenance,
} from "../../src/utils/tenantPortal";

describe("tenantPortal helpers", () => {
  it("maps tenant-facing maintenance request statuses", () => {
    expect(getTenantRequestStatusMeta("open").labelKey).toBe(
      "tenantPortal.maintenance.requestStatus.received",
    );
    expect(getTenantRequestStatusMeta("in_progress").labelKey).toBe(
      "tenantPortal.maintenance.requestStatus.inProgress",
    );
    expect(getTenantRequestStatusMeta("waiting").helpKey).toBe(
      "tenantPortal.maintenance.requestHelp.waiting",
    );
  });

  it("maps tenant-facing work-order statuses", () => {
    expect(getTenantWorkOrderStatusMeta("assigned").labelKey).toBe(
      "tenantPortal.maintenance.workOrderStatus.scheduled",
    );
    expect(getTenantWorkOrderStatusMeta("blocked").labelKey).toBe(
      "tenantPortal.maintenance.workOrderStatus.waiting",
    );
    expect(getTenantWorkOrderStatusMeta("completed").helpKey).toBe(
      "tenantPortal.maintenance.workOrderHelp.completed",
    );
  });

  it("derives payment summary from tenant rows when snapshot is absent", () => {
    const summary = buildTenantPaymentSummary({}, [
      { id: 1, amount: 1200, status: "paid", paid_at: "2026-04-02" },
      { id: 2, amount: 1200, status: "pending", due_date: "2026-04-20" },
      { id: 3, amount: 300, status: "overdue", due_date: "2026-04-10" },
    ]);

    expect(summary.paid).toBe(1200);
    expect(summary.due).toBe(1200);
    expect(summary.overdue).toBe(300);
    expect(summary.outstanding).toBe(1500);
    expect(summary.state).toBe("overdue");
  });

  it("summarizes active and resolved maintenance items", () => {
    const summary = summarizeTenantMaintenance(
      [{ status: "open" }, { status: "resolved" }, { status: "waiting" }],
      [{ status: "assigned" }, { status: "completed" }, { status: "blocked" }],
    );

    expect(summary.activeRequests).toBe(2);
    expect(summary.activeWorkOrders).toBe(2);
    expect(summary.resolvedRequests).toBe(1);
  });

  it("builds a tenant-safe maintenance progress tracker from request and work-order state", () => {
    const progress = buildTenantMaintenanceProgress(
      [
        {
          id: "req-1",
          title: "Leaking tap",
          status: "in_progress",
          created_at: "2026-04-20T10:00:00.000Z",
          updated_at: "2026-04-20T12:00:00.000Z",
        },
      ],
      [
        {
          id: "wo-1",
          maintenance_request_id: "req-1",
          status: "assigned",
          contractor_name: "Hidden Contractor Ltd",
          created_at: "2026-04-21T09:00:00.000Z",
          assigned_at: "2026-04-21T09:30:00.000Z",
        },
      ],
    );

    expect(progress.hasItems).toBe(true);
    expect(progress.title).toBe("Leaking tap");
    expect(progress.workOrderId).toBe("wo-1");
    expect(progress.currentStepKey).toBe("tenantDashboard.progress.inProgress");
    expect(progress.milestones.map((row) => [row.key, row.state])).toEqual([
      ["reported", "complete"],
      ["reviewed", "complete"],
      ["assigned", "complete"],
      ["scheduled", "upcoming"],
      ["in_progress", "current"],
      ["completed", "upcoming"],
    ]);
    expect(JSON.stringify(progress)).not.toContain("Hidden Contractor Ltd");
  });

  it("marks blocked work orders as tenant-facing waiting progress", () => {
    const progress = buildTenantMaintenanceProgress(
      [{ id: "req-1", title: "Boiler", status: "waiting", created_at: "2026-04-20T10:00:00.000Z" }],
      [{ id: "wo-1", maintenance_request_id: "req-1", status: "blocked", created_at: "2026-04-21T09:00:00.000Z" }],
    );

    expect(progress.currentStepKey).toBe("tenantDashboard.progress.scheduled");
    expect(progress.milestones.find((row) => row.key === "scheduled")?.state).toBe("blocked");
    expect(progress.milestones.find((row) => row.key === "in_progress")?.state).toBe("blocked");
  });

  it("partitions recent and older documents without losing total visibility", () => {
    const groups = partitionTenantDocuments(
      [
        {
          id: "attention-low",
          created_at: "2026-04-18T10:00:00.000Z",
          tenant_highlight: "action_required",
          tenant_highlight_rank: 20,
        },
        {
          id: "attention-high",
          created_at: "2026-04-16T10:00:00.000Z",
          tenant_highlight: "action_required",
          tenant_highlight_rank: 5,
        },
        { id: "current", created_at: "2026-04-17T10:00:00.000Z", tenant_highlight: "current", tenant_highlight_rank: 50 },
        { id: "old", created_at: "2026-01-01T10:00:00.000Z" },
      ],
      { recentDays: 30, now: new Date("2026-04-21T10:00:00.000Z") },
    );

    expect(groups.total).toBe(4);
    expect(groups.recent.map((row) => row.id)).toEqual(["attention-high", "attention-low", "current"]);
    expect(groups.older.map((row) => row.id)).toEqual(["old"]);
    expect(groups.attention.map((row) => row.id)).toEqual(["attention-high", "attention-low"]);
    expect(groups.current.map((row) => row.id)).toEqual(["current"]);
  });
});
