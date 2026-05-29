import { describe, expect, it } from "vitest";

import {
  buildDefaultEvidenceItemsPayload,
  getDefaultEvidenceItemsForRoom,
  getDefaultInspectionRoomNames,
} from "../../src/data/inspectionRoomTemplates";
import {
  calculateEvidenceVaultStats,
  calculateInspectionReportCounts,
  filterInspectionReportsByStatus,
  getConditionRatingLabel,
  isInspectionReportEditable,
  normalizeConditionRating,
} from "../../src/lib/evidenceVault";

describe("Evidence Vault helpers", () => {
  it("builds default room and checklist item templates", () => {
    expect(getDefaultInspectionRoomNames()).toContain("Kitchen");
    expect(getDefaultEvidenceItemsForRoom("Kitchen")).toContain("Worktop");

    const payload = buildDefaultEvidenceItemsPayload(["Kitchen", "Keys"]);
    expect(payload).toEqual([
      expect.objectContaining({ room_name: "Kitchen", items: expect.arrayContaining(["Sink"]) }),
      expect.objectContaining({ room_name: "Keys", items: expect.arrayContaining(["Front door keys"]) }),
    ]);
  });

  it("calculates report counts and dashboard stats", () => {
    const reports = [
      {
        status: "draft",
        created_at: new Date().toISOString(),
        inspection_rooms: [
          {
            inspection_evidence_items: [
              { condition_rating: "good", inspection_photos: [{ id: "photo-1" }] },
              { condition_rating: null, inspection_photos: [] },
            ],
          },
        ],
      },
      { status: "locked", created_at: "2020-01-01T00:00:00Z", inspection_rooms: [] },
    ];

    expect(calculateInspectionReportCounts(reports[0])).toMatchObject({
      roomCount: 1,
      itemCount: 2,
      photoCount: 1,
      ratedCount: 1,
    });
    expect(calculateEvidenceVaultStats(reports)).toMatchObject({
      draftReports: 1,
      lockedReports: 1,
      photosCaptured: 1,
      reportsThisMonth: 1,
    });
  });

  it("normalises conditions, filters statuses and blocks locked edits", () => {
    expect(normalizeConditionRating("GOOD")).toBe("good");
    expect(normalizeConditionRating("unknown")).toBe("");
    expect(getConditionRatingLabel("needs_review")).toBe("Needs review");
    expect(filterInspectionReportsByStatus([{ status: "draft" }, { status: "archived" }], "active")).toEqual([{ status: "draft" }]);
    expect(isInspectionReportEditable({ status: "locked" })).toBe(false);
    expect(isInspectionReportEditable({ status: "draft" })).toBe(true);
  });
});
