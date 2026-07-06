import { jsPDF } from "jspdf";
import { mergeProofPackLabels } from "../components/compliance/proofPackPresentation";

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN_LEFT = 20;
const MARGIN_RIGHT = 20;
const MARGIN_TOP = 30;
const MARGIN_BOTTOM = 25;
const CONTENT_W = PAGE_W - MARGIN_LEFT - MARGIN_RIGHT;
const LINE_H = 5.5;
const INTRO_LINE_H = 5;

// Legacy label fallbacks — used only if the options.labels object is missing entries
const LEGACY_EXPORTED_AT_LABEL = "Exported";
const LEGACY_EVALUATED_AT_LABEL = "Checked";
const LEGACY_TRACE_COMPLETE_LABEL = "Expected compliance events present: Yes";
const LEGACY_TRACE_INCOMPLETE_LABEL = "Expected compliance events: sequence incomplete";
const LEGACY_MISSING_EVENTS_LABEL = "Missing events:";

// ── Human-readable date formatting ──────────────────────────────────────────

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatHumanDate(val) {
  if (!val) return "Not recorded";
  // Date-only strings (YYYY-MM-DD) — show without time
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(val))) {
    const [yr, mo, dy] = String(val).split("-").map(Number);
    return `${dy} ${MONTH_NAMES[mo - 1]} ${yr}`;
  }
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return String(val);
  const day = d.getUTCDate();
  const month = MONTH_NAMES[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${day} ${month} ${year}, ${hh}:${mm} (UTC)`;
}

// ── Value humanization maps ─────────────────────────────────────────────────

const OBLIGATION_KIND_LABELS = {
  information_sheet: "Renters' Rights Act — Information Sheet",
  written_statement: "Renters' Rights Act — Written Statement",
};

const TENANCY_CLASS_LABELS = {
  assured_shorthold: "Assured Shorthold Tenancy (AST)",
  assured: "Assured Tenancy",
  regulated: "Regulated Tenancy",
};

const REASON_CODE_LABELS = {
  AFF_INFO_SHEET: "Tenancy qualifies for the information sheet requirement",
  AFF_WRITTEN_STATEMENT: "Tenancy qualifies for written statement requirement",
  NOT_AFF_NO_TENANCY: "No active tenancy found",
  EXCL_JURISDICTION: "Property is outside the applicable jurisdiction",
  EXCL_COMPANY_LET: "Property is a company let — requirement does not apply",
  EXCL_RESIDENT_LANDLORD: "Resident landlord exemption applies",
  DEF_PENDING_REVIEW: "Decision deferred pending further review",
  NEEDS_TENANCY_CLASS: "Tenancy type required to complete assessment",
};

const RESULT_DISPLAY = {
  affected:
    "Affected — this tenancy appears to be within scope of the Renters' Rights Act Information Sheet requirement, so the obligation applies.",
  not_affected:
    "Not affected — this tenancy does not appear to be within scope of this requirement.",
  deferred:
    "Deferred — the assessment has been postponed. Check back when the relevant conditions are met.",
  needs_data:
    "More information needed — the check could not be completed because some required details are missing.",
};

const CONFIDENCE_DISPLAY = {
  high: "High — based on the input data recorded for this check.",
  medium: "Medium — based on partially available input data.",
  low: "Low — limited input data was available for this check.",
};

const POSTURE_DISPLAY_BRIEF = {
  discharged:
    "Discharged — the required action has been completed and evidence has been recorded.",
  open: "Open — the obligation has been identified and action is required.",
  superseded: "Superseded — this obligation has been replaced by a newer assessment.",
  requires_review: "Requires review — this obligation needs attention.",
};

const POSTURE_DISPLAY_CURRENT = {
  discharged:
    "Discharged — Tenaqo has recorded evidence that the obligation was completed.",
  open: "Open — action required. No completion evidence has been recorded yet.",
  superseded: "Superseded — replaced by a newer assessment.",
  requires_review: "Requires review — please check the obligation details.",
};

const EVIDENCE_TYPE_LABELS = {
  delivery_confirmation: "Delivery confirmation",
  upload_confirmation: "Upload confirmation",
  service_confirmation: "Service confirmation",
  manual_capture: "Manually recorded",
};

const RENT_FREQ_LABELS = {
  monthly: "per month",
  weekly: "per week",
  annual: "per year",
  annually: "per year",
};

// ── Event type humanization ─────────────────────────────────────────────────

const EVENT_TYPE_LABELS = {
  evaluation_run: "Compliance check run",
  "rpe.obligation.created": "Obligation created",
  "rpe.service_evidence.captured": "Evidence captured",
  "rpe.obligation.discharged": "Obligation discharged",
  "rpe.obligation.basis_change_recorded": "Basis change recorded",
  "rpe.obligation.superseded": "Obligation superseded",
  "rpe.obligation.requires_review": "Review flagged",
};

function humanizeEventType(raw) {
  if (!raw) return "Unknown event";
  if (EVENT_TYPE_LABELS[raw]) return EVENT_TYPE_LABELS[raw];
  return raw
    .replace(/^rpe\./i, "")
    .replace(/^rra\./i, "")
    .replace(/[._]/g, " ")
    .split(" ")
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

// ── Identity humanization ───────────────────────────────────────────────────

function humanizeIdentity(raw) {
  if (!raw) return "Not recorded";
  const s = String(raw);
  if (s.startsWith("govuk-rra-info-sheet:v1:")) return "GOV.UK RRA Information Sheet (v1)";
  if (s.startsWith("govuk-rra-info-sheet:v2:")) return "GOV.UK RRA Information Sheet (v2)";
  return s;
}

// ── Important limitations (caveats) ────────────────────────────────────────

const IMPORTANT_LIMITATIONS = [
  "This demo pack is not legal advice or legal sign-off.",
  "The evidence fingerprint identifies the decision inputs used for this evaluation. It is not a hash of this exported PDF.",
  "Formal disclosure-basis tracking is not yet enabled in this demo pack.",
  "This pack was generated from demo/seeded data unless the environment explicitly says otherwise.",
  "Documents or evidence referenced in the pack may be available inside Tenaqo rather than embedded directly in this PDF.",
];

// ── PDF drawing helpers ─────────────────────────────────────────────────────

function addPageWatermark(doc, statusLabel) {
  const label = statusLabel || "Demo proof pack — not legal sign-off";
  doc.setFontSize(8);
  doc.setTextColor(180, 140, 50);
  doc.text(label, PAGE_W / 2, 10, { align: "center" });
  doc.text(label, PAGE_W / 2, PAGE_H - 8, { align: "center" });

  doc.saveGraphicsState();
  doc.setGState(new doc.GState({ opacity: 0.06 }));
  doc.setFontSize(48);
  doc.setTextColor(180, 140, 50);
  doc.text("DEMO — NOT LEGAL SIGN-OFF", PAGE_W / 2, PAGE_H / 2, {
    align: "center",
    angle: 45,
  });
  doc.restoreGraphicsState();

  doc.setTextColor(0, 0, 0);
}

function ensureSpace(doc, needed, statusLabel, yRef) {
  if (yRef.y + needed > PAGE_H - MARGIN_BOTTOM) {
    doc.addPage();
    addPageWatermark(doc, statusLabel);
    yRef.y = MARGIN_TOP;
  }
}

function addHeading(doc, text, yRef, statusLabel) {
  ensureSpace(doc, 14, statusLabel, yRef);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(text, MARGIN_LEFT, yRef.y);
  yRef.y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
}

function addSectionIntro(doc, text, yRef, statusLabel) {
  const lines = doc.splitTextToSize(text, CONTENT_W);
  ensureSpace(doc, lines.length * INTRO_LINE_H + 3, statusLabel, yRef);
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  doc.text(lines, MARGIN_LEFT, yRef.y);
  yRef.y += lines.length * INTRO_LINE_H + 3;
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(9);
}

function addField(doc, label, value, yRef, statusLabel) {
  ensureSpace(doc, LINE_H * 2, statusLabel, yRef);
  doc.setFont("helvetica", "bold");
  doc.text(`${label}:`, MARGIN_LEFT, yRef.y);
  doc.setFont("helvetica", "normal");
  const valStr = value != null ? String(value) : "Not recorded";
  const lines = doc.splitTextToSize(valStr, CONTENT_W - 40);
  doc.text(lines, MARGIN_LEFT + 50, yRef.y);
  yRef.y += Math.max(LINE_H, lines.length * LINE_H) + 1;
}

// For labels too long for the two-column layout — label on its own line, value indented below.
function addFieldBlock(doc, label, value, yRef, statusLabel) {
  const valStr = value != null ? String(value) : "Not recorded";
  const labelLines = doc.splitTextToSize(`${label}:`, CONTENT_W);
  const valueLines = doc.splitTextToSize(valStr, CONTENT_W - 6);
  ensureSpace(doc, (labelLines.length + valueLines.length) * LINE_H + 3, statusLabel, yRef);
  doc.setFont("helvetica", "bold");
  doc.text(labelLines, MARGIN_LEFT, yRef.y);
  yRef.y += labelLines.length * LINE_H;
  doc.setFont("helvetica", "normal");
  doc.text(valueLines, MARGIN_LEFT + 6, yRef.y);
  yRef.y += valueLines.length * LINE_H + 2;
}

function addText(doc, text, yRef, statusLabel) {
  const lines = doc.splitTextToSize(text, CONTENT_W);
  ensureSpace(doc, lines.length * LINE_H + 2, statusLabel, yRef);
  doc.text(lines, MARGIN_LEFT, yRef.y);
  yRef.y += lines.length * LINE_H + 2;
}

// ── Main export ─────────────────────────────────────────────────────────────

export function generateProofPackPdf(payload, options = {}) {
  if (!payload) throw new Error("Payload is required");

  const labels = mergeProofPackLabels(options.labels);
  const { evaluation, obligation, evidence, basis_review, provenance, status, property, tenancy } = payload;
  const evidenceItems = Array.isArray(evidence) ? evidence : [];
  const provenanceItems = Array.isArray(provenance) ? provenance : [];
  const traceStatus = status?.provenance_trace_status;
  const statusLabel = status?.pack_status_label || "Demo proof pack — not legal sign-off";
  const exportedAt = new Date().toISOString();

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  addPageWatermark(doc, statusLabel);

  const yRef = { y: MARGIN_TOP };

  // ── Pack title ──────────────────────────────────────────────────────────
  doc.setFontSize(15);
  doc.setFont("helvetica", "bold");
  doc.text(labels.packTitle, MARGIN_LEFT, yRef.y);
  yRef.y += 8;

  // Sub-headline — may wrap
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  const headlineLines = doc.splitTextToSize(labels.headline, CONTENT_W);
  doc.text(headlineLines, MARGIN_LEFT, yRef.y);
  yRef.y += headlineLines.length * 6 + 2;

  // ── Demo / legal-status label ───────────────────────────────────────────
  doc.setTextColor(140, 100, 30);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  addText(doc, statusLabel, yRef, statusLabel);
  doc.setFont("helvetica", "normal");
  addText(
    doc,
    "This pack summarises what Tenaqo has on file for this tenancy's compliance check and the evidence supporting it. It is a record of what was recorded — not legal advice or a legal ruling.",
    yRef, statusLabel,
  );
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(9);

  yRef.y += 3;

  // ── Property summary ────────────────────────────────────────────────────
  if (property) {
    addHeading(doc, "Property", yRef, statusLabel);
    addSectionIntro(doc, "The property this compliance check applies to.", yRef, statusLabel);
    const addressParts = [property.address, property.city].filter(Boolean);
    addField(doc, "Address", addressParts.length > 0 ? addressParts.join(", ") : null, yRef, statusLabel);
    yRef.y += 2;
  }

  // ── Tenancy summary ─────────────────────────────────────────────────────
  if (tenancy) {
    addHeading(doc, "Tenancy", yRef, statusLabel);
    addSectionIntro(doc, "The tenancy this check relates to.", yRef, statusLabel);
    addField(doc, "Start date", formatHumanDate(tenancy.start_date), yRef, statusLabel);
    addField(doc, "End date", formatHumanDate(tenancy.end_date), yRef, statusLabel);
    if (tenancy.rent_amount != null) {
      const freq = RENT_FREQ_LABELS[tenancy.rent_frequency] ?? `(${tenancy.rent_frequency ?? "monthly"})`;
      addField(doc, "Rent", `£${Number(tenancy.rent_amount).toLocaleString()} ${freq}`, yRef, statusLabel);
    }
    if (tenancy.tenancy_class) {
      addField(doc, "Tenancy type",
        TENANCY_CLASS_LABELS[tenancy.tenancy_class] ?? tenancy.tenancy_class, yRef, statusLabel);
    }
    yRef.y += 2;
  }

  // ── Regulation and obligation ───────────────────────────────────────────
  addHeading(doc, "Regulation and obligation", yRef, statusLabel);
  addSectionIntro(doc, "The rule being checked and what it requires.", yRef, statusLabel);
  const obligKind = obligation?.obligation_kind;
  addField(doc, "Regulation", OBLIGATION_KIND_LABELS[obligKind] ?? obligKind, yRef, statusLabel);
  addField(
    doc, "Rule version",
    evaluation?.impact_rule_version != null
      ? `Version ${evaluation.impact_rule_version} — the version of Tenaqo's compliance rule used for this check`
      : "Not recorded",
    yRef, statusLabel,
  );

  yRef.y += 3;

  // ── Pack references (fingerprint only — UUIDs in Verification details) ──
  addField(doc, labels.exportedAt || LEGACY_EXPORTED_AT_LABEL, formatHumanDate(exportedAt), yRef, statusLabel);
  addField(doc, labels.evaluatedAt || LEGACY_EVALUATED_AT_LABEL, formatHumanDate(evaluation?.evaluated_at), yRef, statusLabel);
  addField(doc, labels.evidenceFingerprint, evaluation?.input_snapshot_hash ?? "Not recorded", yRef, statusLabel);
  addSectionIntro(
    doc,
    "This fingerprint uniquely identifies the information this check was based on. If that information changed, the fingerprint would change too. It is not a hash of this exported PDF.",
    yRef, statusLabel,
  );

  yRef.y += 4;

  // ── What's on file ──────────────────────────────────────────────────────
  addHeading(doc, "What's on file", yRef, statusLabel);
  addSectionIntro(doc, "What Tenaqo has recorded for this obligation.", yRef, statusLabel);

  const stateItems = [
    [status?.evaluation_recorded, "Compliance check completed", "Compliance check: not yet completed"],
    [status?.obligation_created, "Obligation identified and logged", "Obligation: not yet logged"],
    [status?.discharge_evidence_present, "Evidence of completion recorded", "Evidence of completion: not yet recorded"],
    [status?.provenance_trail_intact, "Recorded event history available", "Recorded event history: not available"],
  ];
  for (const [present, yes, no] of stateItems) {
    const marker = present ? "•" : "–";
    const stateLabel = present ? yes : (no || yes);
    ensureSpace(doc, LINE_H + 1, statusLabel, yRef);
    doc.text(`${marker}  ${stateLabel}`, MARGIN_LEFT, yRef.y);
    yRef.y += LINE_H;
  }
  if (status?.basis_review_required) {
    ensureSpace(doc, LINE_H + 1, statusLabel, yRef);
    doc.text(
      "•  Basis review recommended — the assessment changed after this obligation was discharged.",
      MARGIN_LEFT, yRef.y,
    );
    yRef.y += LINE_H;
  }

  yRef.y += 4;

  // ── What this pack covers ───────────────────────────────────────────────
  addHeading(doc, labels.whatCovers, yRef, statusLabel);
  addSectionIntro(doc, "A summary of the obligation and where it stands.", yRef, statusLabel);
  addField(doc, labels.obligationKind,
    OBLIGATION_KIND_LABELS[obligation?.obligation_kind] ?? obligation?.obligation_kind, yRef, statusLabel);

  const postureForBrief = POSTURE_DISPLAY_BRIEF[obligation?.posture]
    ?? (obligation?.posture ? obligation.posture.charAt(0).toUpperCase() + obligation.posture.slice(1) : null);
  addField(doc, labels.posture, postureForBrief, yRef, statusLabel);

  if (obligation?.exposure_gbp_ceiling != null) {
    addFieldBlock(
      doc, labels.exposureCeiling,
      `£${Number(obligation.exposure_gbp_ceiling).toLocaleString()} — the maximum possible penalty recorded for this rule. It does not mean a penalty has been issued.`,
      yRef, statusLabel,
    );
  } else {
    addFieldBlock(doc, labels.exposureCeiling, null, yRef, statusLabel);
  }
  addField(doc, labels.createdAt, formatHumanDate(obligation?.created_at), yRef, statusLabel);

  yRef.y += 4;

  // ── Assessment ──────────────────────────────────────────────────────────
  addHeading(doc, labels.assessment, yRef, statusLabel);
  addSectionIntro(doc, "What the compliance check found.", yRef, statusLabel);
  if (evaluation) {
    const resultText = RESULT_DISPLAY[evaluation.result]
      ?? (evaluation.result ? evaluation.result.charAt(0).toUpperCase() + evaluation.result.slice(1) : "Not recorded");
    addField(doc, labels.result, resultText, yRef, statusLabel);

    if (evaluation.reason_codes?.length > 0) {
      const readableCodes = evaluation.reason_codes
        .map((c) => REASON_CODE_LABELS[c] ?? c)
        .join("; ");
      addField(doc, "Reason", readableCodes, yRef, statusLabel);
    }

    const confidenceText = CONFIDENCE_DISPLAY[evaluation.confidence]
      ?? (evaluation.confidence ? evaluation.confidence.charAt(0).toUpperCase() + evaluation.confidence.slice(1) : "Not recorded");
    addField(doc, labels.confidence, confidenceText, yRef, statusLabel);
    addField(doc, labels.evaluatedAt, formatHumanDate(evaluation.evaluated_at), yRef, statusLabel);
  } else {
    addText(doc, "Compliance check: not recorded", yRef, statusLabel);
  }

  yRef.y += 4;

  // ── Evidence ────────────────────────────────────────────────────────────
  addHeading(doc, labels.evidence, yRef, statusLabel);
  addSectionIntro(doc, "What was recorded to support this result.", yRef, statusLabel);
  if (evidenceItems.length > 0) {
    for (const item of evidenceItems) {
      ensureSpace(doc, LINE_H * 5, statusLabel, yRef);
      addField(doc, "Reference document", humanizeIdentity(item.official_info_sheet_identity), yRef, statusLabel);
      addField(
        doc, labels.evidenceType,
        EVIDENCE_TYPE_LABELS[item.evidence_type] ?? (item.evidence_type
          ? item.evidence_type.replace(/_/g, " ").charAt(0).toUpperCase() + item.evidence_type.replace(/_/g, " ").slice(1)
          : null),
        yRef, statusLabel,
      );
      addField(doc, labels.serviceTimestamp, formatHumanDate(item.service_evidence_timestamp), yRef, statusLabel);
      addField(doc, labels.capturedAt, formatHumanDate(item.captured_at), yRef, statusLabel);
      yRef.y += 2;
    }
  } else {
    addText(doc, "Completion evidence has not yet been recorded.", yRef, statusLabel);
  }

  yRef.y += 4;

  // ── Current state ───────────────────────────────────────────────────────
  addHeading(doc, labels.currentState, yRef, statusLabel);
  const postureForCurrent = POSTURE_DISPLAY_CURRENT[obligation?.posture]
    ?? (obligation?.posture ? obligation.posture.charAt(0).toUpperCase() + obligation.posture.slice(1) : null);
  addField(doc, labels.posture, postureForCurrent, yRef, statusLabel);

  if (basis_review?.review_required) {
    yRef.y += 2;
    ensureSpace(doc, LINE_H * 5, statusLabel, yRef);
    doc.setFont("helvetica", "bold");
    doc.text("Review recommended", MARGIN_LEFT, yRef.y);
    yRef.y += LINE_H;
    doc.setFont("helvetica", "normal");
    addText(
      doc,
      "Tenaqo has recorded a change in the assessment after this obligation was discharged. A review is recommended.",
      yRef, statusLabel,
    );
    addField(doc, "Change kind", basis_review.basis_change_kind, yRef, statusLabel);
    addField(doc, "Flagged", formatHumanDate(basis_review.review_flagged_at), yRef, statusLabel);
  }

  yRef.y += 4;

  // ── Evaluation and proof-chain trail ────────────────────────────────────
  addHeading(doc, labels.proofTrail, yRef, statusLabel);
  addSectionIntro(
    doc,
    "A time-ordered record of the compliance events logged for this obligation, from the first check to completion. This covers the compliance events themselves — not the creation or export of this PDF.",
    yRef, statusLabel,
  );

  if (traceStatus) {
    if (traceStatus.expected_events_present) {
      addText(doc, labels.traceComplete || LEGACY_TRACE_COMPLETE_LABEL, yRef, statusLabel);
      addSectionIntro(doc, "Event sequence appears complete for this demo scenario.", yRef, statusLabel);
    } else {
      addText(doc, labels.traceIncomplete || LEGACY_TRACE_INCOMPLETE_LABEL, yRef, statusLabel);
      const missing = traceStatus.missing_event_types ?? [];
      if (missing.length > 0) {
        addText(doc, `${LEGACY_MISSING_EVENTS_LABEL} ${missing.map(humanizeEventType).join(", ")}`, yRef, statusLabel);
      }
    }
  }

  if (provenanceItems.length > 0) {
    yRef.y += 2;
    addText(doc, `${labels.orderedTrail} (${provenanceItems.length} events):`, yRef, statusLabel);
    for (const event of provenanceItems) {
      const eventLabel = humanizeEventType(event.event_type);
      const eventDate = formatHumanDate(event.recorded_at);
      const headerLine = `${event.sequence_number}. ${eventLabel} — ${eventDate}`;
      const headerLines = doc.splitTextToSize(headerLine, CONTENT_W - 6);
      ensureSpace(doc, headerLines.length * LINE_H + (event.summary ? LINE_H * 2 : LINE_H), statusLabel, yRef);
      doc.text(headerLines, MARGIN_LEFT + 2, yRef.y);
      yRef.y += headerLines.length * LINE_H;
      if (event.summary) {
        doc.setFontSize(8);
        doc.setTextColor(60, 60, 60);
        const displaySummary = event.summary.replace(
          "Obligation created with posture: open",
          "Obligation created (initially open)",
        );
        const summaryLines = doc.splitTextToSize(displaySummary, CONTENT_W - 10);
        doc.text(summaryLines, MARGIN_LEFT + 6, yRef.y);
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(9);
        yRef.y += summaryLines.length * INTRO_LINE_H;
      }
    }
  }

  yRef.y += 4;

  // ── Verification details ────────────────────────────────────────────────
  addHeading(doc, labels.verificationDetails, yRef, statusLabel);
  addSectionIntro(
    doc,
    "These are the internal references for the assessment and evidence trail recorded in Tenaqo.",
    yRef, statusLabel,
  );
  addField(doc, labels.evidenceFingerprint, evaluation?.input_snapshot_hash ?? "Not recorded", yRef, statusLabel);
  addField(doc, `${labels.assessmentReference}`, evaluation?.evaluation_id ?? "Not recorded", yRef, statusLabel);
  addField(doc, `${labels.obligationReference}`, obligation?.obligation_instance_id ?? "Not recorded", yRef, statusLabel);
  addField(
    doc, labels.proofTrailReference || "Event sequence",
    provenanceItems.length
      ? provenanceItems.map((e) => e.sequence_number).join(" -> ")
      : "Not recorded",
    yRef, statusLabel,
  );
  addField(doc, labels.evaluatedAt || LEGACY_EVALUATED_AT_LABEL, formatHumanDate(evaluation?.evaluated_at), yRef, statusLabel);
  addField(doc, labels.exportedAt || LEGACY_EXPORTED_AT_LABEL, formatHumanDate(exportedAt), yRef, statusLabel);

  // ── Important limitations — please read ─────────────────────────────────
  yRef.y += 6;
  addHeading(doc, "Important limitations — please read", yRef, statusLabel);
  doc.setFontSize(9);
  doc.setTextColor(70, 70, 70);
  for (const caveat of IMPORTANT_LIMITATIONS) {
    ensureSpace(doc, LINE_H * 3, statusLabel, yRef);
    const lines = doc.splitTextToSize(`• ${caveat}`, CONTENT_W - 4);
    doc.text(lines, MARGIN_LEFT + 2, yRef.y);
    yRef.y += lines.length * LINE_H + 1;
  }
  doc.setTextColor(0, 0, 0);

  return { doc, exportedAt };
}

export function downloadProofPackPdf(payload, options = {}) {
  const { doc } = generateProofPackPdf(payload, options);
  const obligationId = payload?.obligation?.obligation_instance_id || "unknown";
  const filename = `proof-pack-${obligationId.slice(0, 8)}.pdf`;
  doc.save(filename);
}
