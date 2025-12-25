/* ======================================================
   Monthly balance for a single rent cycle
   ====================================================== */
export function calculateMonthlyBalance({
  rent = 0,
  payments = [],
  year,
  month, // 0-based (JS Date)
}) {
  const paidThisMonth = payments
    .filter(
      (p) =>
        p.status === "Opłacone" &&
        p.paidAt &&
        new Date(p.paidAt).getFullYear() === year &&
        new Date(p.paidAt).getMonth() === month
    )
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  const remaining = Math.max(rent - paidThisMonth, 0);

  let status = "Zaległe";
  if (paidThisMonth === 0) status = "Zaległe";
  else if (paidThisMonth < rent) status = "Częściowo";
  else status = "Opłacone";

  return {
    paid: paidThisMonth,
    remaining,
    status,
  };
}

/* ======================================================
   Property-level finance (used by Finance page)
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
    rent,
    paid,
    remaining,
    paymentStatus: status,
  };
}

/* ======================================================
   Optional helpers (future-proofing)
   ====================================================== */

/**
 * Sum of all paid payments
 */
export function sumPaid(payments = []) {
  return payments
    .filter((p) => p.status === "Opłacone")
    .reduce((s, p) => s + Number(p.amount || 0), 0);
}

/**
 * Sum of all overdue payments
 */
export function sumOverdue(payments = []) {
  return payments
    .filter((p) => p.status === "Zaległe")
    .reduce((s, p) => s + Number(p.amount || 0), 0);
}

/**
 * Sum of all expected payments
 */
export function sumExpected(payments = []) {
  return payments.reduce(
    (s, p) => s + Number(p.amount || 0),
    0
  );
}
