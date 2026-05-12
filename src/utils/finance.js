import {
  PAYMENT_STATUS,
  isOverdueStatus,
  isPaidStatus,
} from "./statuses";

/* ======================================================
   AGGREGATES (used by Finance dashboard)
   ====================================================== */

function toDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * We treat "paid" as:
 * - paidAt is set (most reliable), OR
 * - status is one of: 'paid' or legacy 'Opłacone'
 */
function isPaid(p) {
  if (!p) return false;
  if (p.paidAt) return true;
  return isPaidStatus(p.status);
}

/**
 * Overdue:
 * - not paid
 * - dueDate exists and is before today
 * - OR status is 'overdue' / legacy 'Zaległe'
 */
function isOverdue(p) {
  if (!p) return false;
  if (isPaid(p)) return false;

  if (isOverdueStatus(p.status)) return true;

  const due = toDate(p.dueDate);
  if (!due) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);

  return due < today;
}

function paymentMonthKey(payment, fallbackKey = "undated") {
  const referenceDate = toDate(payment?.dueDate) ?? toDate(payment?.paidAt);
  if (!referenceDate) return `${fallbackKey}:${payment?.id || "unknown"}`;
  return `${referenceDate.getFullYear()}-${String(referenceDate.getMonth() + 1).padStart(2, "0")}`;
}

function todayFloor() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

export function buildPaymentCycles(payments = [], { rentByPropertyId = {}, horizonDays = 7 } = {}) {
  const horizon = new Date(todayFloor());
  horizon.setDate(horizon.getDate() + Math.max(1, Number(horizonDays || 7)));

  const cycles = new Map();

  payments.forEach((payment, index) => {
    if (!payment) return;

    const propertyId = String(payment.propertyId || "unknown-property");
    const tenantId = String(payment.tenantId || "unknown-tenant");
    const month = paymentMonthKey(payment, `undated-${index}`);
    const cycleKey = `${propertyId}:${tenantId}:${month}`;
    const amount = Number(payment.amount || 0);
    const dueDate = toDate(payment.dueDate);
    const propertyRent = Number(payment.propertyRent ?? rentByPropertyId[propertyId] ?? 0);
    const existing = cycles.get(cycleKey) ?? {
      propertyId,
      tenantId,
      month,
      paidAmount: 0,
      billedAmount: 0,
      openDueDate: null,
      hasOverdue: false,
    };

    // A-2: billed = contractual rent; don't let payment amounts inflate the threshold
    existing.billedAmount = propertyRent > 0 ? propertyRent : existing.billedAmount;

    if (isPaid(payment)) {
      existing.paidAmount += amount;
    } else {
      if (!existing.openDueDate || (dueDate && dueDate < existing.openDueDate)) {
        existing.openDueDate = dueDate || existing.openDueDate;
      }
      if (isOverdue(payment)) {
        existing.hasOverdue = true;
      }
    }

    cycles.set(cycleKey, existing);
  });

  return Array.from(cycles.values()).map((cycle) => {
    const remainingAmount = Math.max(cycle.billedAmount - cycle.paidAmount, 0);
    const isDueSoon = Boolean(
      remainingAmount > 0 &&
      cycle.openDueDate &&
      cycle.openDueDate >= todayFloor() &&
      cycle.openDueDate <= horizon,
    );

    return {
      ...cycle,
      remainingAmount,
      isDueSoon,
    };
  });
}

export function sumPaid(payments = []) {
  return payments
    .filter(isPaid)
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);
}

export function sumOverdue(payments = []) {
  return buildPaymentCycles(payments)
    .filter((cycle) => cycle.remainingAmount > 0 && cycle.hasOverdue)
    .reduce((sum, cycle) => sum + cycle.remainingAmount, 0);
}

export function sumDueSoon(payments = [], horizonDays = 7) {
  return buildPaymentCycles(payments, { horizonDays })
    .filter((cycle) => cycle.remainingAmount > 0 && cycle.isDueSoon)
    .reduce((sum, cycle) => sum + cycle.remainingAmount, 0);
}

export function sumExpected(payments = []) {
  return buildPaymentCycles(payments)
    .reduce((sum, cycle) => sum + cycle.remainingAmount, 0);
}

/* ======================================================
   MONTHLY BALANCE (single rent cycle)
   ====================================================== */

export function calculateMonthlyBalance({
  rent = 0,
  payments = [],
  year,
  month, // 0-based (JS Date)
}) {
  const targetMonth = `${year}-${String(month + 1).padStart(2, "0")}`;
  const propertyId = String(payments[0]?.propertyId || "property");
  const cycles = buildPaymentCycles(payments, {
    rentByPropertyId: {
      [propertyId]: Number(rent || 0),
    },
  });
  const currentCycle = cycles.find((cycle) => cycle.month === targetMonth) ?? {
    paidAmount: 0,
    billedAmount: Number(rent || 0),
    remainingAmount: Number(rent || 0),
    hasOverdue: false,
  };

  const paid = currentCycle.paidAmount;
  const remaining = currentCycle.remainingAmount;

  let status = PAYMENT_STATUS.PENDING;
  if (remaining <= 0) status = PAYMENT_STATUS.PAID;
  else if (currentCycle.hasOverdue) status = PAYMENT_STATUS.OVERDUE;
  else if (paid > 0) status = PAYMENT_STATUS.PARTIAL;

  return {
    paid,
    remaining,
    status,
  };
}

/* ======================================================
   PROPERTY-LEVEL FINANCE (Finance page)
   ====================================================== */

export function calculatePropertyFinance({
  property,
  payments = [],
}) {
  const rent = Number(property?.rent) || 0;

  // All-time totals: sum every paid record and every unpaid record independently.
  // A current-month-only cycle lookup was the previous approach but caused
  // historical paid amounts to vanish (e.g. a Dec payment was invisible in May).
  const paid = sumPaid(payments);
  const unpaidPayments = payments.filter((p) => !isPaid(p));
  const remaining = unpaidPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const hasOverdue = unpaidPayments.some((p) => isOverdue(p));

  let status = PAYMENT_STATUS.PENDING;
  if (remaining <= 0 && paid > 0) status = PAYMENT_STATUS.PAID;
  else if (hasOverdue)            status = PAYMENT_STATUS.OVERDUE;
  else if (paid > 0)              status = PAYMENT_STATUS.PARTIAL;

  return {
    propertyId: property.id,
    address: property.address,
    city: property.city,

    rent,
    paid,
    remaining,
    paymentStatus: status,
  };
}
