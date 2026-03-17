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

export function sumPaid(payments = []) {
  return payments
    .filter(isPaid)
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);
}

export function sumOverdue(payments = []) {
  return payments
    .filter(isOverdue)
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);
}

export function sumExpected(payments = []) {
  // Expected = unpaid (includes due + overdue)
  return payments
    .filter((p) => !isPaid(p))
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);
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
  const paid = payments
    .filter((p) => {
      if (!isPaid(p)) return false;
      const paidAt = toDate(p.paidAt);
      if (!paidAt) return false;
      return paidAt.getFullYear() === year && paidAt.getMonth() === month;
    })
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  const remaining = Math.max(Number(rent || 0) - paid, 0);

  // Keep your existing Polish labels (so UI doesn’t change)
  let status = PAYMENT_STATUS.OVERDUE;
  if (paid === 0) status = PAYMENT_STATUS.OVERDUE;
  else if (paid < rent) status = PAYMENT_STATUS.PARTIAL;
  else status = PAYMENT_STATUS.PAID;

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
  date = new Date(),
}) {
  const rent = Number(property?.rent) || 0;

  const { paid, remaining, status } = calculateMonthlyBalance({
    rent,
    payments,
    year: date.getFullYear(),
    month: date.getMonth(),
  });

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
