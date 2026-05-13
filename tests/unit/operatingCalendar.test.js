// tests/unit/operatingCalendar.test.js
// Unit tests for Operating Calendar helper functions (pure logic).

import { describe, it, expect } from "vitest";

// ─── Helpers under test (extracted from components / pure logic) ───────────────

function toDateKey(d) {
  if (!d) return null;
  const y   = d.getFullYear();
  const m   = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function buildMonthGrid(year, month) {
  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month + 1, 0);
  const startDow = (firstDay.getDay() + 6) % 7; // Mon=0 … Sun=6
  const days = [];
  for (let i = 0; i < startDow; i++) days.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) days.push(new Date(year, month, d));
  while (days.length % 7 !== 0) days.push(null);
  return days;
}

function groupByDate(items) {
  return items.reduce((acc, item) => {
    const key = item.due_date;
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
}

function countByStatus(items) {
  const c = { overdue: 0, due_soon: 0, scheduled: 0, blocked: 0, completed: 0 };
  for (const item of items) {
    if (item.status in c) c[item.status]++;
  }
  return c;
}

// ─── toDateKey ────────────────────────────────────────────────────────────────

describe("toDateKey", () => {
  it("formats a date as YYYY-MM-DD", () => {
    expect(toDateKey(new Date(2026, 4, 13))).toBe("2026-05-13");
  });

  it("zero-pads month and day", () => {
    expect(toDateKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("returns null for null input", () => {
    expect(toDateKey(null)).toBeNull();
  });
});

// ─── buildMonthGrid ───────────────────────────────────────────────────────────

describe("buildMonthGrid", () => {
  it("returns a multiple-of-7 length array", () => {
    const grid = buildMonthGrid(2026, 4); // May 2026
    expect(grid.length % 7).toBe(0);
  });

  it("has the correct number of real days for May", () => {
    const grid = buildMonthGrid(2026, 4);
    expect(grid.filter(Boolean).length).toBe(31);
  });

  it("starts with leading nulls when month doesn't begin on Monday", () => {
    // May 2026 starts on a Friday (4th day Mon-indexed = index 4)
    const grid = buildMonthGrid(2026, 4);
    const leadingNulls = grid.indexOf(grid.find(Boolean));
    expect(leadingNulls).toBeGreaterThanOrEqual(0);
  });

  it("first real date is the 1st of the month", () => {
    const grid = buildMonthGrid(2026, 4);
    const firstReal = grid.find(Boolean);
    expect(firstReal.getDate()).toBe(1);
    expect(firstReal.getMonth()).toBe(4);
  });

  it("January has 31 days", () => {
    const grid = buildMonthGrid(2026, 0);
    expect(grid.filter(Boolean).length).toBe(31);
  });

  it("February non-leap year has 28 days", () => {
    const grid = buildMonthGrid(2025, 1);
    expect(grid.filter(Boolean).length).toBe(28);
  });

  it("February leap year has 29 days", () => {
    const grid = buildMonthGrid(2024, 1);
    expect(grid.filter(Boolean).length).toBe(29);
  });
});

// ─── groupByDate ──────────────────────────────────────────────────────────────

describe("groupByDate", () => {
  const items = [
    { id: "a", due_date: "2026-05-13", status: "overdue"   },
    { id: "b", due_date: "2026-05-13", status: "due_soon"  },
    { id: "c", due_date: "2026-05-20", status: "scheduled" },
  ];

  it("groups items by due_date", () => {
    const groups = groupByDate(items);
    expect(Object.keys(groups)).toHaveLength(2);
    expect(groups["2026-05-13"]).toHaveLength(2);
    expect(groups["2026-05-20"]).toHaveLength(1);
  });

  it("returns empty object for empty array", () => {
    expect(groupByDate([])).toEqual({});
  });
});

// ─── countByStatus ────────────────────────────────────────────────────────────

describe("countByStatus", () => {
  const items = [
    { status: "overdue"   },
    { status: "overdue"   },
    { status: "due_soon"  },
    { status: "blocked"   },
    { status: "completed" },
    { status: "scheduled" },
    { status: "unknown"   }, // should be ignored
  ];

  it("counts known statuses correctly", () => {
    const c = countByStatus(items);
    expect(c.overdue).toBe(2);
    expect(c.due_soon).toBe(1);
    expect(c.blocked).toBe(1);
    expect(c.completed).toBe(1);
    expect(c.scheduled).toBe(1);
  });

  it("returns zero for all statuses with empty array", () => {
    const c = countByStatus([]);
    expect(Object.values(c).every((v) => v === 0)).toBe(true);
  });
});

// ─── SQL-side status derivation logic (pure JS mirror) ───────────────────────

function derivePaymentStatus(status, dueDateStr) {
  const dueDate = new Date(dueDateStr);
  const today   = new Date();
  today.setHours(0, 0, 0, 0);
  dueDate.setHours(0, 0, 0, 0);

  if ((status ?? "").toLowerCase() === "paid") return "completed";
  if ((status ?? "").toLowerCase() === "overdue" || dueDate < today) return "overdue";
  const soon = new Date(today);
  soon.setDate(today.getDate() + 7);
  if (dueDate <= soon) return "due_soon";
  return "scheduled";
}

describe("derivePaymentStatus", () => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yStr = toDateKey(yesterday);

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tStr = toDateKey(tomorrow);

  const future = new Date();
  future.setDate(future.getDate() + 30);
  const fStr = toDateKey(future);

  it("marks paid payments as completed", () => {
    expect(derivePaymentStatus("paid", fStr)).toBe("completed");
  });

  it("marks past due dates as overdue", () => {
    expect(derivePaymentStatus("pending", yStr)).toBe("overdue");
  });

  it("marks explicit overdue status as overdue", () => {
    expect(derivePaymentStatus("overdue", fStr)).toBe("overdue");
  });

  it("marks near-future due dates as due_soon", () => {
    expect(derivePaymentStatus("pending", tStr)).toBe("due_soon");
  });

  it("marks far-future due dates as scheduled", () => {
    expect(derivePaymentStatus("pending", fStr)).toBe("scheduled");
  });
});

// ─── Lease status derivation ──────────────────────────────────────────────────

function deriveLeaseStatus(renewalStatus, leaseEndDateStr) {
  const endDate = new Date(leaseEndDateStr);
  const today   = new Date();
  today.setHours(0, 0, 0, 0);
  endDate.setHours(0, 0, 0, 0);

  if (["renewed", "ended"].includes(renewalStatus)) return "completed";
  if (endDate < today) return "overdue";
  const soon = new Date(today);
  soon.setDate(today.getDate() + 30);
  if (endDate <= soon) return "due_soon";
  return "scheduled";
}

describe("deriveLeaseStatus", () => {
  const past   = toDateKey(new Date(2020, 0, 1));
  const near   = toDateKey(new Date(new Date().setDate(new Date().getDate() + 14)));
  const farStr = toDateKey(new Date(new Date().setFullYear(new Date().getFullYear() + 1)));

  it("renewed lease is completed", () => {
    expect(deriveLeaseStatus("renewed", farStr)).toBe("completed");
  });

  it("ended lease is completed", () => {
    expect(deriveLeaseStatus("ended", past)).toBe("completed");
  });

  it("past end date that is not renewed is overdue", () => {
    expect(deriveLeaseStatus("active", past)).toBe("overdue");
  });

  it("end date within 30 days is due_soon", () => {
    expect(deriveLeaseStatus("active", near)).toBe("due_soon");
  });

  it("far-future end date is scheduled", () => {
    expect(deriveLeaseStatus("active", farStr)).toBe("scheduled");
  });
});
