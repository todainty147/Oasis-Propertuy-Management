import { jsPDF } from "jspdf";

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN_LEFT = 20;
const MARGIN_RIGHT = 20;
const MARGIN_TOP = 30;
const MARGIN_BOTTOM = 25;
const CONTENT_W = PAGE_W - MARGIN_LEFT - MARGIN_RIGHT;
const LINE_H = 5.5;
const INTRO_LINE_H = 5;

// ── Human-readable date formatting ────────────────────────────────────────────

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatHumanDate(val) {
  if (!val) return "Not recorded";
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

// ── Value maps ────────────────────────────────────────────────────────────────

const WORK_ORDER_STATUS_LABELS = {
  assigned: "Assigned — awaiting contractor acknowledgement",
  in_progress: "In progress — work underway",
  completed: "Completed",
  blocked: "Blocked — waiting on parts or access",
  cancelled: "Cancelled",
};

const PRIORITY_LABELS = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

const MAINTENANCE_STAGE_LABELS = {
  contractor_completion: "Contractor completion photo",
  pre_work: "Pre-work condition photo",
  post_work: "Post-work condition photo",
  inspection: "Inspection photo",
};

const REQUEST_STATUS_LABELS = {
  open: "Open",
  in_progress: "In progress",
  waiting: "Waiting",
  resolved: "Resolved",
  closed: "Closed",
};

// Fix 2: value is the role only — the field label already reads "Uploaded by"
const ATTESTER_ROLE_LABELS = {
  contractor: "Contractor",
  landlord: "Landlord",
  tenant: "Tenant",
};

const HASH_TRUST_DISPLAY = {
  verified:
    "Stored file hash: verified — the server-computed hash matched the client-reported hash. This confirms stored byte integrity only.",
  verification_failed:
    "Stored file hash: MISMATCH — the server-computed hash did not match the client-reported hash.",
  client_asserted_unverified:
    "Stored file hash: client-reported, not yet server-verified.",
  not_available:
    "Stored file hash: not recorded.",
};

const MAINT_EVENT_TYPE_LABELS = {
  "photo.received": "Photo received",
  "photo.hash_verified": "File hash verified",
  "photo.hash_verification_failed": "File hash verification failed",
  "photo.hash_verification_error": "File hash verification error (transient)",
};

function humanizeEventType(raw) {
  if (!raw) return "Unknown event";
  if (MAINT_EVENT_TYPE_LABELS[raw]) return MAINT_EVENT_TYPE_LABELS[raw];
  return raw
    .replace(/[._]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Required caveats (must not be weakened) ───────────────────────────────────

const MAINTENANCE_LIMITATIONS = [
  "This demo pack is not legal advice or legal sign-off.",
  "This pack records the maintenance evidence currently on file in Tenaqo.",
  "Photo references are metadata only. Photo previews and downloads are not included in this demo pack.",
  "Stored file hash verification, where shown, confirms stored byte integrity only. It does not prove the photo is authentic, when or where it was taken, or that the work was completed.",
  "Antivirus scanning for work-order photos is not included in this v0 pack.",
  "If a completion time is shown, it is derived from the work order's recorded status/update timestamp because no dedicated completed_at field exists yet.",
];

const WATERMARK_LABEL = "Demo maintenance pack — not legal sign-off";

// ── PDF drawing helpers ───────────────────────────────────────────────────────

function addPageWatermark(doc, statusLabel) {
  const label = statusLabel || WATERMARK_LABEL;
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

// ── Main export ───────────────────────────────────────────────────────────────

export function generateMaintenancePackPdf(payload, _options = {}) {
  if (!payload) throw new Error("Payload is required");

  const {
    workOrder,
    maintenanceRequest,
    property,
    contractor,
    attachments = [],
    provenance = [],
    generatedAt,
  } = payload;

  const exportedAt = generatedAt || new Date().toISOString();
  const statusLabel = WATERMARK_LABEL;

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  addPageWatermark(doc, statusLabel);

  const yRef = { y: MARGIN_TOP };

  // ── Pack title ──────────────────────────────────────────────────────────────
  doc.setFontSize(15);
  doc.setFont("helvetica", "bold");
  doc.text("Maintenance Evidence Pack", MARGIN_LEFT, yRef.y);
  yRef.y += 8;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  const introLines = doc.splitTextToSize(
    "A record of the maintenance evidence recorded in Tenaqo for this work order.",
    CONTENT_W,
  );
  doc.text(introLines, MARGIN_LEFT, yRef.y);
  yRef.y += introLines.length * 6 + 2;

  // ── Demo / legal-status label ───────────────────────────────────────────────
  doc.setTextColor(140, 100, 30);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  addText(doc, statusLabel, yRef, statusLabel);
  doc.setFont("helvetica", "normal");
  addText(
    doc,
    "This pack shows the maintenance evidence recorded in Tenaqo for this work order. It is a record of what was captured — not a legal or technical verdict on the work done.",
    yRef,
    statusLabel,
  );
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(9);
  yRef.y += 3;

  // ── Property summary ────────────────────────────────────────────────────────
  addHeading(doc, "Property", yRef, statusLabel);
  addSectionIntro(doc, "The property this work order relates to.", yRef, statusLabel);
  if (property) {
    const addressParts = [property.address, property.city].filter(Boolean);
    addField(
      doc, "Address",
      addressParts.length > 0 ? addressParts.join(", ") : null,
      yRef, statusLabel,
    );
  } else {
    addText(doc, "Property details not recorded.", yRef, statusLabel);
  }
  yRef.y += 2;

  // ── Maintenance request summary ─────────────────────────────────────────────
  if (maintenanceRequest) {
    addHeading(doc, "Maintenance request", yRef, statusLabel);
    addSectionIntro(
      doc,
      "The underlying maintenance request this work order was raised for.",
      yRef, statusLabel,
    );
    addField(doc, "Title", maintenanceRequest.title, yRef, statusLabel);
    if (maintenanceRequest.description) {
      addFieldBlock(doc, "Description", maintenanceRequest.description, yRef, statusLabel);
    }
    addField(
      doc, "Priority",
      PRIORITY_LABELS[maintenanceRequest.priority] ?? maintenanceRequest.priority,
      yRef, statusLabel,
    );
    addField(
      doc, "Request status",
      REQUEST_STATUS_LABELS[maintenanceRequest.status] ?? maintenanceRequest.status,
      yRef, statusLabel,
    );
    addField(doc, "Reported on", formatHumanDate(maintenanceRequest.created_at), yRef, statusLabel);
    yRef.y += 2;
  }

  // ── Work order summary ──────────────────────────────────────────────────────
  addHeading(doc, "Work order", yRef, statusLabel);
  addSectionIntro(doc, "The work order created to address this maintenance issue.", yRef, statusLabel);
  addField(
    doc, "Work order reference",
    workOrder?.id ? `${workOrder.id.slice(0, 8)}...` : "Not recorded",
    yRef, statusLabel,
  );
  if (workOrder?.scheduled_at) {
    addField(doc, "Scheduled", formatHumanDate(workOrder.scheduled_at), yRef, statusLabel);
  }
  if (workOrder?.notes) {
    addFieldBlock(doc, "Notes", workOrder.notes, yRef, statusLabel);
  }
  yRef.y += 2;

  // ── Contractor summary ──────────────────────────────────────────────────────
  addHeading(doc, "Contractor", yRef, statusLabel);
  addSectionIntro(doc, "The contractor assigned to carry out the work.", yRef, statusLabel);
  const contractorName = contractor?.name ?? workOrder?.contractor_name ?? null;
  const contractorPhone = contractor?.phone ?? workOrder?.contractor_phone ?? null;
  const contractorEmail = contractor?.email ?? null;
  addField(doc, "Name", contractorName, yRef, statusLabel);
  if (contractorPhone) addField(doc, "Phone", contractorPhone, yRef, statusLabel);
  if (contractorEmail) addField(doc, "Email", contractorEmail, yRef, statusLabel);
  yRef.y += 2;

  // ── Status summary ──────────────────────────────────────────────────────────
  addHeading(doc, "Status", yRef, statusLabel);
  const woStatus = workOrder?.status;
  addField(
    doc, "Work order status",
    WORK_ORDER_STATUS_LABELS[woStatus] ?? (woStatus || "Not recorded"),
    yRef, statusLabel,
  );
  if (woStatus === "completed" && workOrder?.updated_at) {
    addField(
      doc, "Recorded completion time",
      formatHumanDate(workOrder.updated_at),
      yRef, statusLabel,
    );
    addSectionIntro(
      doc,
      "Completion time is derived from the work order's recorded status/update timestamp because no dedicated completed_at field exists yet.",
      yRef, statusLabel,
    );
  }
  yRef.y += 2;

  // ── Cost summary (only if quote or invoice recorded) ───────────────────────
  if (workOrder?.quote_amount != null || workOrder?.invoice_amount != null) {
    addHeading(doc, "Cost", yRef, statusLabel);
    addSectionIntro(doc, "Cost figures recorded against this work order.", yRef, statusLabel);
    if (workOrder.quote_amount != null) {
      addField(doc, "Quote", `GBP ${Number(workOrder.quote_amount).toFixed(2)}`, yRef, statusLabel);
    }
    if (workOrder.invoice_amount != null) {
      addField(doc, "Invoice", `GBP ${Number(workOrder.invoice_amount).toFixed(2)}`, yRef, statusLabel);
    }
    yRef.y += 2;
  }

  // ── Photo evidence references (metadata only) ───────────────────────────────
  addHeading(doc, "Photo evidence references", yRef, statusLabel);
  addSectionIntro(
    doc,
    "Photo evidence record exists. References are metadata only. Photo previews and downloads are not included in this demo pack.",
    yRef, statusLabel,
  );

  if (attachments.length > 0) {
    for (let i = 0; i < attachments.length; i += 1) {
      const att = attachments[i];
      ensureSpace(doc, LINE_H * 6, statusLabel, yRef);
      doc.setFont("helvetica", "bold");
      doc.text(`Photo ${i + 1} of ${attachments.length}:`, MARGIN_LEFT, yRef.y);
      yRef.y += LINE_H;
      doc.setFont("helvetica", "normal");
      addField(doc, "File name", att.file_name ?? "Not recorded", yRef, statusLabel);
      if (att.file_size != null) {
        addField(doc, "File size", `${att.file_size} bytes`, yRef, statusLabel);
      }
      addField(
        doc, "Evidence type",
        MAINTENANCE_STAGE_LABELS[att.maintenance_stage] ?? (att.maintenance_stage || "Not recorded"),
        yRef, statusLabel,
      );
      addField(
        doc, "Uploaded by",
        ATTESTER_ROLE_LABELS[att.attester_role] ?? (att.attester_role || "Not recorded"),
        yRef, statusLabel,
      );
      addField(doc, "Received", formatHumanDate(att.created_at), yRef, statusLabel);
      yRef.y += 2;
    }
  } else {
    addText(doc, "No photo evidence records found for this work order.", yRef, statusLabel);
  }

  yRef.y += 2;

  // ── Stored file hash verification status ────────────────────────────────────
  addHeading(doc, "Stored file hash verification", yRef, statusLabel);
  addSectionIntro(
    doc,
    "Stored file hash verification, where shown, confirms stored byte integrity only. It does not prove photo authenticity, capture time, location, or that the work was completed.",
    yRef, statusLabel,
  );

  if (attachments.length > 0) {
    for (let i = 0; i < attachments.length; i += 1) {
      const att = attachments[i];
      const hashDisplay =
        HASH_TRUST_DISPLAY[att.hash_trust] ??
        (att.hash_trust ? `Hash trust status: ${att.hash_trust}` : "Stored file hash: not recorded");
      ensureSpace(doc, LINE_H * 4, statusLabel, yRef);
      doc.setFont("helvetica", "bold");
      doc.text(`Photo ${i + 1}:`, MARGIN_LEFT, yRef.y);
      doc.setFont("helvetica", "normal");
      yRef.y += LINE_H;
      addFieldBlock(doc, "Hash status", hashDisplay, yRef, statusLabel);
      if (att.content_hash_verified_at) {
        addField(doc, "Verified at", formatHumanDate(att.content_hash_verified_at), yRef, statusLabel);
      }
      yRef.y += 1;
    }
  } else {
    addText(doc, "No photo attachments — hash verification not applicable.", yRef, statusLabel);
  }

  yRef.y += 4;

  // ── Timeline / proof-chain trail ────────────────────────────────────────────
  addHeading(doc, "Timeline and proof-chain trail", yRef, statusLabel);
  addSectionIntro(
    doc,
    "A time-ordered record of the provenance events logged for this work order in Tenaqo. This covers work order events only — not the creation or export of this PDF.",
    yRef, statusLabel,
  );

  if (provenance.length > 0) {
    addText(
      doc,
      `Timeline (${provenance.length} event${provenance.length !== 1 ? "s" : ""}):`,
      yRef, statusLabel,
    );
    for (const event of provenance) {
      const eventLabel = humanizeEventType(event.event_type);
      const eventDate = formatHumanDate(event.occurred_at);
      const seqNum = event.sequence_number ?? "?";
      const headerLine = `${seqNum}. ${eventLabel} — ${eventDate}`;
      const headerLines = doc.splitTextToSize(headerLine, CONTENT_W - 6);
      ensureSpace(
        doc,
        headerLines.length * LINE_H + (event.summary ? LINE_H * 2 : LINE_H),
        statusLabel, yRef,
      );
      doc.text(headerLines, MARGIN_LEFT + 2, yRef.y);
      yRef.y += headerLines.length * LINE_H;
      if (event.summary) {
        doc.setFontSize(8);
        doc.setTextColor(60, 60, 60);
        const summaryLines = doc.splitTextToSize(event.summary, CONTENT_W - 10);
        doc.text(summaryLines, MARGIN_LEFT + 6, yRef.y);
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(9);
        yRef.y += summaryLines.length * INTRO_LINE_H;
      }
    }
  } else {
    addText(doc, "No provenance events recorded for this work order.", yRef, statusLabel);
  }

  yRef.y += 4;

  // ── Verification details ────────────────────────────────────────────────────
  addHeading(doc, "Verification details", yRef, statusLabel);
  addSectionIntro(
    doc,
    "Internal references for this maintenance evidence pack.",
    yRef, statusLabel,
  );
  addField(doc, "Work order ID", workOrder?.id ?? "Not recorded", yRef, statusLabel);
  addField(doc, "Property ID", property?.id ?? "Not recorded", yRef, statusLabel);
  addField(
    doc, "Photo records",
    `${attachments.length} attachment${attachments.length !== 1 ? "s" : ""} on file`,
    yRef, statusLabel,
  );
  addField(
    doc, "Provenance events",
    `${provenance.length} event${provenance.length !== 1 ? "s" : ""} recorded`,
    yRef, statusLabel,
  );
  addField(doc, "Generated", formatHumanDate(exportedAt), yRef, statusLabel);

  // ── Important limitations — please read ─────────────────────────────────────
  yRef.y += 6;
  addHeading(doc, "Important limitations — please read", yRef, statusLabel);
  doc.setFontSize(9);
  doc.setTextColor(70, 70, 70);
  for (const caveat of MAINTENANCE_LIMITATIONS) {
    ensureSpace(doc, LINE_H * 3, statusLabel, yRef);
    const lines = doc.splitTextToSize(`• ${caveat}`, CONTENT_W - 4);
    doc.text(lines, MARGIN_LEFT + 2, yRef.y);
    yRef.y += lines.length * LINE_H + 1;
  }
  doc.setTextColor(0, 0, 0);

  return { doc, exportedAt };
}
