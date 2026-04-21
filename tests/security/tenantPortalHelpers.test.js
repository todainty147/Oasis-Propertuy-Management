import { describe, expect, it } from "vitest";

import {
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

  it("partitions recent and older documents without losing total visibility", () => {
    const groups = partitionTenantDocuments(
      [
        { id: "new", created_at: "2026-04-18T10:00:00.000Z" },
        { id: "old", created_at: "2026-01-01T10:00:00.000Z" },
      ],
      { recentDays: 30, now: new Date("2026-04-21T10:00:00.000Z") },
    );

    expect(groups.total).toBe(2);
    expect(groups.recent.map((row) => row.id)).toEqual(["new"]);
    expect(groups.older.map((row) => row.id)).toEqual(["old"]);
  });
});
