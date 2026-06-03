function safeNumber(value) {
  const next = Number(value ?? 0);
  return Number.isFinite(next) ? next : 0;
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function isPaidPayment(row) {
  return Boolean(row?.paidAt || row?.paid_at || ["paid", "opłacone", "oplacone"].includes(normalize(row?.status)));
}

function parseDate(value) {
  if (!value) return null;
  const next = value instanceof Date ? value : new Date(value);
  return Number.isNaN(next.getTime()) ? null : next;
}

function paymentSortValue(row) {
  return parseDate(row?.dueDate || row?.due_date || row?.createdAt || row?.created_at)?.getTime() || 0;
}

function isPastDue(row, today = new Date()) {
  const due = parseDate(row?.dueDate || row?.due_date);
  if (!due) return false;
  const now = today instanceof Date ? today : new Date(today);
  if (Number.isNaN(now.getTime())) return false;
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return due < todayStart;
}

export function isAdjustedFinancePayment(row) {
  if (row?.originalAmount == null) return false;
  return safeNumber(row.originalAmount) !== safeNumber(row.amount);
}

export function buildFinancePaymentDisplayRows(payments = [], propertyFinance = [], { today = new Date() } = {}) {
  const rows = Array.isArray(payments) ? payments : [];
  const remainingByProperty = new Map(
    (Array.isArray(propertyFinance) ? propertyFinance : [])
      .filter((row) => row?.propertyId)
      .map((row) => [String(row.propertyId), safeNumber(row.remaining)]),
  );

  const adjustedRows = new Map();
  const openRows = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => !isPaidPayment(row))
    .sort((a, b) => {
      const dateDelta = paymentSortValue(a.row) - paymentSortValue(b.row);
      if (dateDelta !== 0) return dateDelta;
      return String(a.row?.id || a.index).localeCompare(String(b.row?.id || b.index));
    });

  for (const { row, index } of openRows) {
    const propertyId = row?.propertyId || row?.property_id;
    if (!propertyId || !remainingByProperty.has(String(propertyId))) continue;

    const originalAmount = safeNumber(row.amount);
    const runningRemaining = safeNumber(remainingByProperty.get(String(propertyId)));
    const amount = Math.min(originalAmount, runningRemaining);
    remainingByProperty.set(String(propertyId), Math.max(runningRemaining - amount, 0));

    if (amount <= 0) {
      adjustedRows.set(index, null);
      continue;
    }

    adjustedRows.set(index, {
      ...row,
      amount,
      originalAmount,
      paidAgainstRunningBalance: Math.max(originalAmount - amount, 0),
      status: isPastDue(row, today) ? "overdue" : row.status,
    });
  }

  return rows
    .map((row, index) => {
      if (isPaidPayment(row)) return row;
      return adjustedRows.has(index) ? adjustedRows.get(index) : row;
    })
    .filter(Boolean);
}
