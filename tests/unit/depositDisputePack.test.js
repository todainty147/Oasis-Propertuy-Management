import { describe, expect, it } from "vitest";

import {
  buildDisputeTimeline,
  buildEvidenceIndex,
  calculateDeductionTotal,
  compareInspectionReports,
  formatDisputePackMoney,
  normalizeDisputePackItemType,
  toSortableDateTime,
} from "../../src/lib/depositDisputePack";

describe("Deposit dispute pack helpers", () => {
  it("calculates deduction totals and builds an ordered evidence index", () => {
    const items = [
      { item_type: "deduction", title: "Cleaning", claimed_amount: 120, sort_order: 20 },
      { item_type: "deduction", title: "Keys", claimed_amount: "35.50", sort_order: 10 },
      { item_type: "inspection_report", title: "Check-in", evidence_reference_type: "check_in_report", evidence_reference_id: "r1", sort_order: 5 },
    ];

    expect(calculateDeductionTotal(items)).toBe(155.5);
    expect(buildEvidenceIndex(items).map((entry) => entry.title)).toEqual(["Check-in"]);
    expect(formatDisputePackMoney(155.5)).toBe("£155.50");
    expect(formatDisputePackMoney(null)).toBe("Not recorded");
    expect(formatDisputePackMoney(Number.NaN)).toBe("Not recorded");
  });

  it("builds a timeline and matches check-in/check-out items by room and label", () => {
    const pack = { created_at: "2026-05-29T10:00:00Z" };
    const reports = [{ inspection_type: "check_in", inspection_date: "2026-05-01" }];
    expect(buildDisputeTimeline(pack, reports).map((event) => event.type)).toEqual(["inspection_report", "pack"]);

    const checkIn = {
      inspection_rooms: [
        { room_name: "Kitchen", inspection_evidence_items: [{ item_label: "Floor", condition_rating: "good", notes: "Clean" }] },
      ],
    };
    const checkOut = {
      inspection_rooms: [
        { room_name: "Kitchen", inspection_evidence_items: [{ item_label: "Floor", condition_rating: "damaged", notes: "Scratched" }] },
      ],
    };

    expect(compareInspectionReports(checkIn, checkOut)).toEqual([
      expect.objectContaining({
        roomName: "Kitchen",
        itemLabel: "Floor",
        checkInCondition: "good",
        checkOutCondition: "damaged",
      }),
    ]);
  });

  it("keeps check-out-only evidence in report comparisons", () => {
    const checkIn = {
      inspection_rooms: [
        { room_name: "Kitchen", inspection_evidence_items: [{ item_label: "Floor", condition_rating: "good" }] },
      ],
    };
    const checkOut = {
      inspection_rooms: [
        {
          room_name: "Kitchen",
          inspection_evidence_items: [
            { item_label: "Floor", condition_rating: "good" },
            { item_label: "Worktop", condition_rating: "damaged", notes: "Burn mark" },
          ],
        },
      ],
    };

    expect(compareInspectionReports(checkIn, checkOut)).toEqual([
      expect.objectContaining({ itemLabel: "Floor", checkInCondition: "good", checkOutCondition: "good" }),
      expect.objectContaining({ itemLabel: "Worktop", checkInCondition: null, checkOutCondition: "damaged" }),
    ]);
  });

  it("handles empty totals and evidence indexes", () => {
    expect(calculateDeductionTotal([])).toBe(0);
    expect(buildEvidenceIndex([
      { item_type: "deduction", title: "Cleaning", claimed_amount: 100 },
    ])).toEqual([]);
  });

  it("normalizes dispute pack item types explicitly", () => {
    expect(normalizeDisputePackItemType("invoice")).toBe("invoice");
    expect(normalizeDisputePackItemType("")).toBe("");
    expect(normalizeDisputePackItemType("made_up_type")).toBe("");
    expect(normalizeDisputePackItemType(null, "deduction")).toBe("deduction");
  });

  it("normalizes sortable dates for mixed timeline inputs", () => {
    expect(toSortableDateTime(null)).toBe(0);
    expect(toSortableDateTime("")).toBe(0);
    expect(toSortableDateTime("invalid")).toBe(0);
    expect(toSortableDateTime("2026-05-01")).toBe(new Date("2026-05-01T12:00:00Z").getTime());
    expect(toSortableDateTime("2026-05-01T09:30:00Z")).toBe(new Date("2026-05-01T09:30:00Z").getTime());
    expect(toSortableDateTime("2024-02-29")).toBe(new Date("2024-02-29T12:00:00Z").getTime());
  });

  it("keeps orphaned evidence reference types visible as manual evidence", () => {
    expect(buildEvidenceIndex([
      {
        item_type: "deduction",
        title: "Cleaning",
        evidence_reference_type: "inspection_report",
        evidence_reference_id: null,
        sort_order: 1,
      },
    ])).toEqual([
      expect.objectContaining({
        type: "inspection_report",
        title: "Cleaning",
        source: "Manual entry",
      }),
    ]);
  });
});
