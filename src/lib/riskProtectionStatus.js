const STATUS_LABELS = {
  missing: "Missing",
  logged: "Logged",
  evidence_logged: "Evidence logged",
  acknowledged: "Acknowledged",
  signed: "Signed",
  pending: "Pending",
  shared: "Pending",
  viewed: "Viewed",
  needs_review: "Needs review",
  disputed: "Disputed",
  tenant_disputed: "Disputed",
  expiring_soon: "Expiring soon",
  expired: "Expired",
  locked: "Locked",
  archived: "Archived",
  revoked: "Revoked",
  tenant_signed: "Signed",
  not_applicable: "Not applicable",
  unknown: "Unknown",
};

const STATUS_TONES = {
  missing: "critical",
  expired: "critical",
  pending: "warning",
  shared: "warning",
  viewed: "warning",
  needs_review: "warning",
  disputed: "warning",
  tenant_disputed: "warning",
  expiring_soon: "warning",
  logged: "success",
  evidence_logged: "success",
  acknowledged: "success",
  signed: "success",
  tenant_signed: "success",
  locked: "neutral",
  archived: "muted",
  revoked: "muted",
  not_applicable: "muted",
  unknown: "neutral",
};

const BADGE_CLASSES = {
  critical: "border-rose-400/30 bg-rose-400/10 text-rose-100",
  warning: "border-amber-400/30 bg-amber-400/10 text-amber-100",
  success: "border-emerald-400/30 bg-emerald-400/10 text-emerald-100",
  neutral: "border-slate-600 bg-slate-800 text-slate-200",
  muted: "border-slate-700 bg-slate-900 text-slate-400",
};

export function normaliseRiskProtectionStatus(status) {
  const normalized = String(status || "").trim().toLowerCase();
  return normalized || "unknown";
}

export function getStatusLabel(status) {
  const normalized = normaliseRiskProtectionStatus(status);
  return STATUS_LABELS[normalized] || normalized.replace(/_/g, " ");
}

export function getStatusTone(status) {
  return STATUS_TONES[normaliseRiskProtectionStatus(status)] || "neutral";
}

export function getRiskProtectionBadgeProps(status) {
  const tone = getStatusTone(status);
  return {
    label: getStatusLabel(status),
    tone,
    className: BADGE_CLASSES[tone] || BADGE_CLASSES.neutral,
  };
}
