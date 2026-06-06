export function calculateAgencyFeeExposure({
  propertyCount,
  averageMonthlyRent,
  agentFeePercent,
}: {
  propertyCount: number;
  averageMonthlyRent: number;
  agentFeePercent: number;
}) {
  const safePropertyCount = Math.max(0, Number.isFinite(propertyCount) ? propertyCount : 0);
  const safeRent = Math.max(0, Number.isFinite(averageMonthlyRent) ? averageMonthlyRent : 0);
  const safeFeePercent = Math.max(0, Number.isFinite(agentFeePercent) ? agentFeePercent : 0);
  const monthly = safePropertyCount * safeRent * (safeFeePercent / 100);

  return {
    monthly,
    annual: monthly * 12,
  };
}
