export const DISPUTE_PACK_ITEM_TYPES = [
  { value: "deduction", label: "Deduction" },
  { value: "check_in_report", label: "Check-in report" },
  { value: "check_out_report", label: "Check-out report" },
  { value: "inspection_report", label: "Inspection report" },
  { value: "photo_evidence", label: "Photo evidence" },
  { value: "invoice", label: "Invoice" },
  { value: "quote", label: "Quote" },
  { value: "receipt", label: "Receipt" },
  { value: "tenancy_agreement", label: "Tenancy agreement" },
  { value: "rent_statement", label: "Rent statement" },
  { value: "communication", label: "Communication" },
  { value: "note", label: "Note" },
  { value: "other", label: "Other" },
];

export const DISPUTE_PACK_ITEM_TYPE_VALUES = DISPUTE_PACK_ITEM_TYPES.map((type) => type.value);
export const DISPUTE_PACK_EVIDENCE_REFERENCE_TYPES = [
  ...DISPUTE_PACK_ITEM_TYPES,
  { value: "compliance_safe_item", label: "Compliance Safe item" },
];
export const DISPUTE_PACK_EVIDENCE_REFERENCE_TYPE_VALUES = DISPUTE_PACK_EVIDENCE_REFERENCE_TYPES.map((type) => type.value);
const EVIDENCE_REFERENCE_LABELS = Object.fromEntries(
  DISPUTE_PACK_EVIDENCE_REFERENCE_TYPES.map((type) => [type.value, type.label]),
);

export function normalizeDisputePackItemType(value, fallback = "") {
  const nextValue = String(value ?? "").trim();
  if (!nextValue) return fallback;
  return DISPUTE_PACK_ITEM_TYPE_VALUES.includes(nextValue) ? nextValue : "";
}

export function normalizeDisputePackEvidenceReferenceType(value, fallback = "") {
  const nextValue = String(value ?? "").trim();
  if (!nextValue) return fallback;
  return DISPUTE_PACK_EVIDENCE_REFERENCE_TYPE_VALUES.includes(nextValue) ? nextValue : "";
}

export function calculateDeductionTotal(items = []) {
  return items
    .filter((item) => item.item_type === "deduction")
    .reduce((total, item) => total + (Number(item.claimed_amount) || 0), 0);
}

function shouldIncludeInEvidenceIndex(item) {
  // Deductions only become evidence-index entries once they point at supporting evidence.
  return item.item_type !== "deduction" || Boolean(item.evidence_reference_type);
}

export function buildEvidenceIndex(items = []) {
  return items
    .filter(shouldIncludeInEvidenceIndex)
    .slice()
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
    .map((item, index) => ({
      number: index + 1,
      type: item.evidence_reference_type || item.item_type || "other",
      typeLabel: EVIDENCE_REFERENCE_LABELS[item.evidence_reference_type || item.item_type] || "Evidence item",
      title: item.title || "Evidence item",
      date: item.created_at || null,
      source: item.evidence_reference_id ? "Tenaqo reference" : "Manual entry",
    }));
}

export function toSortableDateTime(value) {
  if (!value) return 0;
  const text = String(value);
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T12:00:00Z` : text;
  const time = new Date(normalized).getTime();
  return Number.isFinite(time) ? time : 0;
}

export function buildDisputeTimeline(pack = {}, reports = []) {
  const events = [
    pack.created_at ? { date: pack.created_at, label: "Pack created", type: "pack" } : null,
    ...(reports || []).map((report) => ({
      date: report.inspection_date || report.created_at,
      label: `${String(report.inspection_type || "inspection").replace(/_/g, " ")} report`,
      type: "inspection_report",
    })),
  ].filter(Boolean);
  return events.sort((a, b) => toSortableDateTime(a.date) - toSortableDateTime(b.date));
}

export function compareInspectionReports(checkInReport, checkOutReport) {
  const rows = [];
  const checkOutByKey = new Map();
  const matchedKeys = new Set();
  for (const room of checkOutReport?.inspection_rooms || []) {
    for (const item of room.inspection_evidence_items || []) {
      checkOutByKey.set(`${String(room.room_name).toLowerCase()}:${String(item.item_label).toLowerCase()}`, { room, item });
    }
  }
  for (const room of checkInReport?.inspection_rooms || []) {
    for (const item of room.inspection_evidence_items || []) {
      const key = `${String(room.room_name).toLowerCase()}:${String(item.item_label).toLowerCase()}`;
      const match = checkOutByKey.get(key);
      if (match) {
        matchedKeys.add(key);
        rows.push({
          roomName: room.room_name,
          itemLabel: item.item_label,
          checkInCondition: item.condition_rating || null,
          checkOutCondition: match.item.condition_rating || null,
          checkInNotes: item.notes || "",
          checkOutNotes: match.item.notes || "",
        });
      }
    }
  }
  for (const [key, { room, item }] of checkOutByKey.entries()) {
    if (matchedKeys.has(key)) continue;
    rows.push({
      roomName: room.room_name,
      itemLabel: item.item_label,
      checkInCondition: null,
      checkOutCondition: item.condition_rating || null,
      checkInNotes: "",
      checkOutNotes: item.notes || "",
    });
  }
  return rows.sort((a, b) =>
    String(a.roomName || "").localeCompare(String(b.roomName || "")) ||
    String(a.itemLabel || "").localeCompare(String(b.itemLabel || ""))
  );
}

export function formatDisputePackMoney(value) {
  if (value === null || value === undefined || value === "") return "Not recorded";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "Not recorded";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(amount);
}
