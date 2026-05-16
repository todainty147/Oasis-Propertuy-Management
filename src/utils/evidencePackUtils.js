import { NAJEM_OKAZJONALNY_ITEM_KEYS } from "./complianceMarket.js";

// ---------------------------------------------------------------------------
// Completion calculation
// ---------------------------------------------------------------------------

/**
 * Calculates evidence pack completion from checklist item rows.
 * Returns 0–100 integer.
 *
 * Weighting:
 *   status=complete or not_applicable → fully done (1.0)
 *   status=pending + evidence_document_id set  → partially done (0.5)
 *   status=pending + no evidence               → not done (0.0)
 */
export function calcCompletionPct(items = []) {
  if (items.length === 0) return 0;
  const score = items.reduce((sum, item) => {
    if (item.status === "complete" || item.status === "not_applicable") return sum + 1;
    if (item.status === "pending" && item.evidence_document_id)         return sum + 0.5;
    return sum;
  }, 0);
  return Math.round((score / items.length) * 100);
}

/**
 * Returns items that are still actionable (pending without confirmed evidence).
 */
export function getMissingItems(items = []) {
  return items.filter(
    (i) => i.status === "pending" && !i.evidence_document_id,
  );
}

/**
 * Returns items that have a document linked but are not yet marked complete.
 */
export function getPendingReviewItems(items = []) {
  return items.filter(
    (i) => i.status === "pending" && i.evidence_document_id,
  );
}

/**
 * Returns items that are fully resolved (complete or N/A).
 */
export function getResolvedItems(items = []) {
  return items.filter(
    (i) => i.status === "complete" || i.status === "not_applicable",
  );
}

/**
 * Sorts checklist items in NAJEM_OKAZJONALNY_ITEM_KEYS display order.
 */
export function sortChecklistItems(items = []) {
  return [...items].sort((a, b) => {
    const ai = NAJEM_OKAZJONALNY_ITEM_KEYS.indexOf(a.item_key);
    const bi = NAJEM_OKAZJONALNY_ITEM_KEYS.indexOf(b.item_key);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
}

// ---------------------------------------------------------------------------
// Document eligibility for a checklist item
// ---------------------------------------------------------------------------

/**
 * Returns true if a document MIME type is eligible to be linked to any checklist item.
 * Tenaqo allows PDF, images, and Office documents as evidence.
 */
export function isDocumentEligible(mimeType) {
  const ALLOWED = new Set([
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ]);
  return ALLOWED.has(String(mimeType || "").toLowerCase());
}

// ---------------------------------------------------------------------------
// Name-based AI-free suggestion (mirrors edge function logic, no network call)
// ---------------------------------------------------------------------------

/**
 * Pure client-side suggestion based on document name and tags.
 * Returns suggestions with {item_key, confidence, reasoning}.
 * Confidence: 'high' | 'medium' | 'low'.
 * Not a legal determination — always labelled as suggestion.
 */
export function suggestByDocumentName(docName = "", tags = []) {
  const name   = String(docName || "").toLowerCase();
  const tagSet = new Set((tags || []).map((t) => String(t).toUpperCase()));
  const results = [];

  if (tagSet.has("UMOWA") || name.includes("umowa") || name.includes("najem") || name.includes("lease")) {
    results.push({ item_key: "lease_agreement", confidence: tagSet.has("UMOWA") ? "high" : "medium", reasoning: "Nazwa lub tag sugeruje umowę najmu." });
  }
  if (name.includes("notarial") || name.includes("notariusz") || name.includes("akt notarialny")) {
    results.push({ item_key: "notarial_declaration", confidence: "medium", reasoning: "Nazwa sugeruje oświadczenie notarialne." });
  }
  if (name.includes("adres zastępczy") || name.includes("alternative address") || name.includes("oświadczenie adres")) {
    results.push({ item_key: "alternative_address_decl", confidence: "medium", reasoning: "Nazwa sugeruje oświadczenie o adresie zastępczym." });
  }
  if (name.includes("zgoda właściciela") || name.includes("owner consent") || name.includes("zgoda na zamieszkanie")) {
    results.push({ item_key: "owner_consent", confidence: "medium", reasoning: "Nazwa sugeruje zgodę właściciela nieruchomości zastępczej." });
  }
  if (name.includes("urząd skarbowy") || name.includes("us ") || name.includes("naczelnik") || name.includes("zgłoszenie najmu") || name.includes("tax office")) {
    results.push({ item_key: "tax_office_notification", confidence: "medium", reasoning: "Nazwa sugeruje zgłoszenie do urzędu skarbowego." });
    results.push({ item_key: "tax_office_proof", confidence: "low", reasoning: "Dokument może być dowodem złożenia zgłoszenia — wymaga weryfikacji." });
  }
  if (tagSet.has("PROTOKOL") || name.includes("protokół") || name.includes("protokol") || name.includes("zdawczo") || name.includes("handover")) {
    results.push({ item_key: "handover_protocol", confidence: tagSet.has("PROTOKOL") ? "high" : "medium", reasoning: "Nazwa lub tag sugeruje protokół zdawczo-odbiorczy." });
  }
  if (name.includes("kaucja") || name.includes("depozyt") || name.includes("deposit") || name.includes("potwierdzenie wpłaty")) {
    results.push({ item_key: "deposit_confirmation", confidence: "medium", reasoning: "Nazwa sugeruje potwierdzenie wpłaty kaucji." });
  }
  if (name.includes("licznik") || name.includes("odczyt") || name.includes("meter") || name.includes("stan licznika")) {
    results.push({ item_key: "meter_readings", confidence: "medium", reasoning: "Nazwa sugeruje odczyty liczników." });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Handover protocol status
// ---------------------------------------------------------------------------

/**
 * Derives human-readable status label key for a handover protocol.
 */
export function deriveHandoverStatus(protocol) {
  if (!protocol) return null;
  if (protocol.status === "completed")          return "completed";
  if (protocol.status === "landlord_confirmed") return "landlord_confirmed";
  return "draft";
}

// ---------------------------------------------------------------------------
// Meter reading validation
// ---------------------------------------------------------------------------

const VALID_METER_TYPES = new Set([
  "electricity", "gas", "water_cold", "water_hot", "heat", "other",
]);

/**
 * Validates a meter reading entry before submission.
 * Returns null if valid, or an error key string.
 */
export function validateMeterReading({ meterType, readingValue }) {
  if (!VALID_METER_TYPES.has(meterType)) return "invalid_meter_type";
  if (!String(readingValue || "").trim()) return "reading_value_required";
  return null;
}

export const METER_TYPE_KEYS = [
  "electricity", "gas", "water_cold", "water_hot", "heat", "other",
];
