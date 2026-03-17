export const PAYMENT_STATUS = {
  PAID: "paid",
  PARTIAL: "partial",
  PENDING: "pending",
  OVERDUE: "overdue",
  OTHER: "other",
};

export const OCCUPANCY_STATUS = {
  OCCUPIED: "occupied",
  VACANT: "vacant",
  OTHER: "other",
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
  return PAYMENT_STATUS.OTHER;
}

export function paymentStatusLabelKey(status) {
  const normalized = normalizePaymentStatus(status);
  if (normalized === PAYMENT_STATUS.PAID) return "payments.status.paid";
  if (normalized === PAYMENT_STATUS.PARTIAL) return "payments.status.partial";
  if (normalized === PAYMENT_STATUS.PENDING) return "payments.status.pending";
  if (normalized === PAYMENT_STATUS.OVERDUE) return "payments.status.overdue";
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

export function isPaidStatus(status) {
  return normalizePaymentStatus(status) === PAYMENT_STATUS.PAID;
}

export function isPendingLikeStatus(status) {
  const normalized = normalizePaymentStatus(status);
  return normalized === PAYMENT_STATUS.PENDING || normalized === PAYMENT_STATUS.PARTIAL;
}

export function isOverdueStatus(status) {
  return normalizePaymentStatus(status) === PAYMENT_STATUS.OVERDUE;
}
