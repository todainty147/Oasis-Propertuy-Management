import { describe, expect, it } from "vitest";

import {
  filterTenantTimelineItems,
  groupTenantTimelineItems,
  tenantTimelineCategoryForType,
  tenantTimelineGroupKeyForDate,
} from "../../src/utils/tenantTimelinePresentation.js";

describe("tenant timeline presentation helpers", () => {
  it("maps event types into tenant-friendly categories", () => {
    expect(tenantTimelineCategoryForType("payment_paid")).toBe("payments");
    expect(tenantTimelineCategoryForType("maintenance_request")).toBe("maintenance");
    expect(tenantTimelineCategoryForType("work_order_completed")).toBe("maintenance");
    expect(tenantTimelineCategoryForType("document_uploaded")).toBe("documents");
    expect(tenantTimelineCategoryForType("lease_start")).toBe("lease");
    expect(tenantTimelineCategoryForType("notification_sent")).toBe("general");
  });

  it("groups updates into today, yesterday, last 7 days, and earlier", () => {
    const now = new Date("2026-04-22T12:00:00Z");

    expect(tenantTimelineGroupKeyForDate("2026-04-22T09:00:00Z", now)).toBe("today");
    expect(tenantTimelineGroupKeyForDate("2026-04-21T20:00:00Z", now)).toBe("yesterday");
    expect(tenantTimelineGroupKeyForDate("2026-04-18T11:00:00Z", now)).toBe("last7");
    expect(tenantTimelineGroupKeyForDate("2026-04-01T11:00:00Z", now)).toBe("earlier");
  });

  it("filters and groups the visible timeline items without mutating scope", () => {
    const items = [
      { key: "p1", type: "payment_overdue", at: "2026-04-22T09:00:00Z" },
      { key: "m1", type: "work_order_opened", at: "2026-04-21T09:00:00Z" },
      { key: "d1", type: "document_uploaded", at: "2026-04-18T09:00:00Z" },
      { key: "l1", type: "lease_start", at: "2026-03-18T09:00:00Z" },
    ];

    expect(filterTenantTimelineItems(items, "payments").map((item) => item.key)).toEqual(["p1"]);
    expect(filterTenantTimelineItems(items, "maintenance").map((item) => item.key)).toEqual(["m1"]);

    const grouped = groupTenantTimelineItems(items, new Date("2026-04-22T12:00:00Z"));
    expect(grouped.today.map((item) => item.key)).toEqual(["p1"]);
    expect(grouped.yesterday.map((item) => item.key)).toEqual(["m1"]);
    expect(grouped.last7.map((item) => item.key)).toEqual(["d1"]);
    expect(grouped.earlier.map((item) => item.key)).toEqual(["l1"]);
  });
});
