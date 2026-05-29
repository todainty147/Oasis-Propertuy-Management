export const CONDITION_RATINGS = [
  { value: "excellent", label: "Excellent" },
  { value: "good", label: "Good" },
  { value: "fair", label: "Fair" },
  { value: "poor", label: "Poor" },
  { value: "damaged", label: "Damaged" },
  { value: "needs_review", label: "Needs review" },
];

export function normalizeConditionRating(value) {
  const safe = String(value || "").trim().toLowerCase();
  return CONDITION_RATINGS.some((rating) => rating.value === safe) ? safe : "";
}

export function getConditionRatingLabel(value) {
  return CONDITION_RATINGS.find((rating) => rating.value === value)?.label || "Not rated";
}

export function sortBySortOrder(rows = []) {
  return rows.slice().sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
}

export function calculateInspectionReportCounts(report = {}) {
  const rooms = report.inspection_rooms || [];
  const evidenceItems = rooms.flatMap((room) => room.inspection_evidence_items || []);
  const photoCount = evidenceItems.reduce((total, item) => total + (item.inspection_photos || []).length, 0);
  const ratedCount = evidenceItems.filter((item) => Boolean(item.condition_rating)).length;
  return {
    roomCount: rooms.length,
    itemCount: evidenceItems.length,
    photoCount,
    ratedCount,
  };
}

export function calculateInspectionCompletion(report = {}) {
  const counts = calculateInspectionReportCounts(report);
  const percent = counts.itemCount > 0 ? Math.round((counts.ratedCount / counts.itemCount) * 100) : 0;
  return { ...counts, percent };
}

export function getFirstIncompleteRoomId(rooms = []) {
  const sortedRooms = sortBySortOrder(rooms);
  const incomplete = sortedRooms.find((room) => {
    const items = room.inspection_evidence_items || [];
    return items.length === 0 || items.some((item) => !item.condition_rating);
  });
  return incomplete?.id || sortedRooms[0]?.id || "";
}

export function calculateEvidenceVaultStats(reports = []) {
  const monthKey = new Date().toISOString().slice(0, 7);
  return reports.reduce((stats, report) => {
    const counts = calculateInspectionReportCounts(report);
    if (report.status === "draft") stats.draftReports += 1;
    if (report.status === "locked") stats.lockedReports += 1;
    if (String(report.created_at || "").startsWith(monthKey)) stats.reportsThisMonth += 1;
    stats.photosCaptured += counts.photoCount;
    return stats;
  }, {
    draftReports: 0,
    lockedReports: 0,
    photosCaptured: 0,
    reportsThisMonth: 0,
  });
}

export function filterInspectionReportsByStatus(reports = [], status = "active") {
  if (status === "active") {
    return reports.filter((report) => ["draft", "ready_for_signature", "signed", "locked"].includes(report.status));
  }
  return reports.filter((report) => report.status === status);
}

export function isInspectionReportEditable(report = {}) {
  return !["locked", "archived"].includes(report?.status);
}

export function formatInspectionType(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
