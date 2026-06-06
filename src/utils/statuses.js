export const PAYMENT_STATUS = {
  PAID: "paid",
  PARTIAL: "partial",
  PENDING: "pending",
  OVERDUE: "overdue",
  VOID: "void",
  OTHER: "other",
};

export const OCCUPANCY_STATUS = {
  OCCUPIED: "occupied",
  VACANT: "vacant",
  OTHER: "other",
};

export const WORK_ORDER_STATUS = {
  ASSIGNED: "assigned",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  BLOCKED: "blocked",
};

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

export function normalizePaymentStatus(status) {
  const value = normalize(status);
  if (["paid", "opłacone", "oplacone"].includes(value)) return PAYMENT_STATUS.PAID;
  if (["partial", "częściowo", "czesciowo"].includes(value)) return PAYMENT_STATUS.PARTIAL;
  if (["due", "pending", "oczekujące", "oczekujace"].includes(value)) return PAYMENT_STATUS.PENDING;
  if (["overdue", "zaległe", "zalegle"].includes(value)) return PAYMENT_STATUS.OVERDUE;
  if (["void", "voided", "unieważnione", "uniewaznione", "storniert", "annulliert"].includes(value)) return PAYMENT_STATUS.VOID;
  return PAYMENT_STATUS.OTHER;
}

export function paymentStatusLabelKey(status) {
  const normalized = normalizePaymentStatus(status);
  if (normalized === PAYMENT_STATUS.PAID) return "payments.status.paid";
  if (normalized === PAYMENT_STATUS.PARTIAL) return "payments.status.partial";
  if (normalized === PAYMENT_STATUS.PENDING) return "payments.status.pending";
  if (normalized === PAYMENT_STATUS.OVERDUE) return "payments.status.overdue";
  if (normalized === PAYMENT_STATUS.VOID) return "payments.status.void";
  return null;
}

export function normalizeOccupancyStatus(status) {
  const value = normalize(status);
  if (["occupied", "wynajęte", "wynajete"].includes(value)) return OCCUPANCY_STATUS.OCCUPIED;
  if (["vacant", "wolne"].includes(value)) return OCCUPANCY_STATUS.VACANT;
  return OCCUPANCY_STATUS.OTHER;
}

export function occupancyStatusLabelKey(status) {
  const normalized = normalizeOccupancyStatus(status);
  if (normalized === OCCUPANCY_STATUS.OCCUPIED) return "status.occupied";
  if (normalized === OCCUPANCY_STATUS.VACANT) return "status.vacant";
  return null;
}

export function normalizeWorkOrderStatus(status) {
  const value = normalize(status);
  if (["przypisane", "assigned"].includes(value)) return WORK_ORDER_STATUS.ASSIGNED;
  if (["w trakcie", "in progress", "in_progress"].includes(value)) return WORK_ORDER_STATUS.IN_PROGRESS;
  if (["zakończone", "zakonczone", "completed"].includes(value)) return WORK_ORDER_STATUS.COMPLETED;
  if (["anulowane", "cancelled"].includes(value)) return WORK_ORDER_STATUS.CANCELLED;
  if (["zablokowane", "blocked"].includes(value)) return WORK_ORDER_STATUS.BLOCKED;
  return value;
}

export function isPaidStatus(status) {
  return normalizePaymentStatus(status) === PAYMENT_STATUS.PAID;
}

export function isVoidOrDeletedPaymentStatus(status) {
  const rawStatus = normalize(status);
  return normalizePaymentStatus(status) === PAYMENT_STATUS.VOID || rawStatus === "deleted";
}

export function isPendingLikeStatus(status) {
  const normalized = normalizePaymentStatus(status);
  return normalized === PAYMENT_STATUS.PENDING || normalized === PAYMENT_STATUS.PARTIAL;
}

export function isOverdueStatus(status) {
  return normalizePaymentStatus(status) === PAYMENT_STATUS.OVERDUE;
}
