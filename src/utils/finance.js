/* ======================================================
   AGGREGATES (used by Finance dashboard)
   ====================================================== */

export function sumPaid(payments = []) {
  return payments
    .filter((p) => p.status === "Opłacone")
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);
}

export function sumOverdue(payments = []) {
  return payments
    .filter((p) => p.status === "Zaległe")
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);
}

export function sumExpected(payments = []) {
  return payments.reduce(
    (sum, p) => sum + Number(p.amount || 0),
    0
  );
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
    .filter(
      (p) =>
        p.status === "Opłacone" &&
        p.paidAt &&
        new Date(p.paidAt).getFullYear() === year &&
        new Date(p.paidAt).getMonth() === month
    )
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  const remaining = Math.max(rent - paid, 0);

  let status = "Zaległe";
  if (paid === 0) status = "Zaległe";
  else if (paid < rent) status = "Częściowo";
  else status = "Opłacone";

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

  const { paid, remaining, status } =
    calculateMonthlyBalance({
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
