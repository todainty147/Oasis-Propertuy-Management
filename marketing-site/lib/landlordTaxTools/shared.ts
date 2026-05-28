export const TAX_TOOL_DISCLAIMER =
  "This tool provides general guidance only and is not tax advice. It does not submit anything to HMRC. Always confirm your position with HMRC guidance or a qualified accountant before making tax decisions.";

export function toMoney(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, number);
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}
