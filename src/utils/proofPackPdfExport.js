import { jsPDF } from "jspdf";

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN_LEFT = 20;
const MARGIN_RIGHT = 20;
const MARGIN_TOP = 30;
const MARGIN_BOTTOM = 25;
const CONTENT_W = PAGE_W - MARGIN_LEFT - MARGIN_RIGHT;
const LINE_H = 5.5;

function formatTimestamp(val) {
  if (!val) return "Not recorded";
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? String(val) : d.toLocaleString();
}

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
  const cx = PAGE_W / 2;
  const cy = PAGE_H / 2;
  doc.text("DEMO — NOT LEGAL SIGN-OFF", cx, cy, {
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
  ensureSpace(doc, 12, statusLabel, yRef);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(text, MARGIN_LEFT, yRef.y);
  yRef.y += 8;
  doc.setFont("helvetica", "normal");
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

function addText(doc, text, yRef, statusLabel) {
  const lines = doc.splitTextToSize(text, CONTENT_W);
  ensureSpace(doc, lines.length * LINE_H + 2, statusLabel, yRef);
  doc.text(lines, MARGIN_LEFT, yRef.y);
  yRef.y += lines.length * LINE_H + 2;
}

export function generateProofPackPdf(payload) {
  if (!payload) throw new Error("Payload is required");

  const { evaluation, obligation, evidence, basis_review, provenance, status } = payload;
  const evidenceItems = Array.isArray(evidence) ? evidence : [];
  const provenanceItems = Array.isArray(provenance) ? provenance : [];
  const traceStatus = status?.provenance_trace_status;
  const statusLabel = status?.pack_status_label || "Demo proof pack — not legal sign-off";
  const exportedAt = new Date().toISOString();

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  addPageWatermark(doc, statusLabel);

  const yRef = { y: MARGIN_TOP };

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Evidence state summary", MARGIN_LEFT, yRef.y);
  yRef.y += 8;

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(140, 100, 30);
  addText(doc, "This view shows recorded evidence state only. It is not a legal verdict.", yRef, statusLabel);
  addText(doc, "This export is a rendering of recorded evidence state at the time of export.", yRef, statusLabel);
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(9);

  yRef.y += 3;

  addField(doc, "Exported at", exportedAt, yRef, statusLabel);
  addField(doc, "Evaluated at", formatTimestamp(evaluation?.evaluated_at), yRef, statusLabel);
  addField(doc, "Evaluation ID", evaluation?.evaluation_id ?? "Not recorded", yRef, statusLabel);
  addField(doc, "Obligation instance ID", obligation?.obligation_instance_id ?? "Not recorded", yRef, statusLabel);
  addField(doc, "Input snapshot hash", evaluation?.input_snapshot_hash ?? "Not recorded", yRef, statusLabel);

  yRef.y += 4;

  addHeading(doc, "Component states", yRef, statusLabel);
  const states = [
    [status?.evaluation_recorded, "Evaluation recorded"],
    [status?.obligation_created, "Obligation created"],
    [status?.discharge_evidence_present, "Discharge evidence recorded", "Discharge evidence: not recorded"],
    [status?.provenance_trail_intact, "Provenance trail present"],
  ];
  for (const [present, yes, no] of states) {
    const marker = present ? "[YES]" : "[ - ]";
    const label = present ? yes : (no || yes);
    ensureSpace(doc, LINE_H + 1, statusLabel, yRef);
    doc.text(`${marker}  ${label}`, MARGIN_LEFT, yRef.y);
    yRef.y += LINE_H;
  }
  if (status?.basis_review_required) {
    ensureSpace(doc, LINE_H + 1, statusLabel, yRef);
    doc.text("[YES]  Basis review recommended", MARGIN_LEFT, yRef.y);
    yRef.y += LINE_H;
  }

  yRef.y += 4;

  addHeading(doc, "Obligation", yRef, statusLabel);
  addField(doc, "Kind", obligation?.obligation_kind, yRef, statusLabel);
  addField(doc, "Posture", obligation?.posture, yRef, statusLabel);
  addField(doc, "Exposure ceiling", obligation?.exposure_gbp_ceiling != null
    ? `£${Number(obligation.exposure_gbp_ceiling).toLocaleString()}`
    : null, yRef, statusLabel);
  addField(doc, "Created", formatTimestamp(obligation?.created_at), yRef, statusLabel);

  yRef.y += 4;

  addHeading(doc, "Evaluation", yRef, statusLabel);
  if (evaluation) {
    addField(doc, "Result", evaluation.result, yRef, statusLabel);
    addField(doc, "Confidence", evaluation.confidence, yRef, statusLabel);
    addField(doc, "Evaluated at", formatTimestamp(evaluation.evaluated_at), yRef, statusLabel);
    addField(doc, "Input snapshot hash", evaluation.input_snapshot_hash, yRef, statusLabel);
  } else {
    addText(doc, "Evaluation: not recorded", yRef, statusLabel);
  }

  yRef.y += 4;

  addHeading(doc, "Evidence", yRef, statusLabel);
  if (evidenceItems.length > 0) {
    for (const item of evidenceItems) {
      ensureSpace(doc, LINE_H * 5, statusLabel, yRef);
      addField(doc, "Identity", item.official_info_sheet_identity, yRef, statusLabel);
      addField(doc, "Type", item.evidence_type, yRef, statusLabel);
      addField(doc, "Service timestamp", formatTimestamp(item.service_evidence_timestamp), yRef, statusLabel);
      addField(doc, "Captured at", formatTimestamp(item.captured_at), yRef, statusLabel);
      yRef.y += 2;
    }
  } else {
    addText(doc, "Discharge evidence: not recorded", yRef, statusLabel);
  }

  yRef.y += 4;

  addHeading(doc, "Current state", yRef, statusLabel);
  addField(doc, "Posture", obligation?.posture, yRef, statusLabel);

  if (basis_review?.review_required) {
    yRef.y += 2;
    ensureSpace(doc, LINE_H * 4, statusLabel, yRef);
    doc.setFont("helvetica", "bold");
    doc.text("Review recommended", MARGIN_LEFT, yRef.y);
    yRef.y += LINE_H;
    doc.setFont("helvetica", "normal");
    addText(doc, "Discharged. Basis changed after discharge — review recommended.", yRef, statusLabel);
    addField(doc, "Change kind", basis_review.basis_change_kind, yRef, statusLabel);
    addField(doc, "Flagged at", formatTimestamp(basis_review.review_flagged_at), yRef, statusLabel);
  }

  yRef.y += 4;

  addHeading(doc, "Provenance", yRef, statusLabel);
  if (traceStatus) {
    const traceLabel = traceStatus.expected_events_present
      ? "Provenance trail: complete"
      : "Provenance trail: incomplete";
    addText(doc, traceLabel, yRef, statusLabel);
    addText(doc, `Expected events present: ${traceStatus.expected_events_present ? "yes" : "no"}`, yRef, statusLabel);
    const missing = traceStatus.missing_event_types ?? [];
    if (missing.length > 0) {
      addText(doc, `Missing event types: ${missing.join(", ")}`, yRef, statusLabel);
    }
  }

  if (provenanceItems.length > 0) {
    yRef.y += 2;
    addText(doc, `Ordered provenance trail (${provenanceItems.length} events):`, yRef, statusLabel);
    for (const event of provenanceItems) {
      ensureSpace(doc, LINE_H * 3, statusLabel, yRef);
      doc.text(
        `[${event.sequence_number}] ${event.event_type} · ${event.entity_type} · ${formatTimestamp(event.recorded_at)}`,
        MARGIN_LEFT + 2,
        yRef.y,
      );
      yRef.y += LINE_H;
      if (event.summary) {
        const summaryLines = doc.splitTextToSize(event.summary, CONTENT_W - 10);
        doc.text(summaryLines, MARGIN_LEFT + 6, yRef.y);
        yRef.y += summaryLines.length * LINE_H;
      }
    }
  }

  return { doc, exportedAt };
}

export function downloadProofPackPdf(payload) {
  const { doc } = generateProofPackPdf(payload);
  const obligationId = payload?.obligation?.obligation_instance_id || "unknown";
  const filename = `proof-pack-${obligationId.slice(0, 8)}.pdf`;
  doc.save(filename);
}
