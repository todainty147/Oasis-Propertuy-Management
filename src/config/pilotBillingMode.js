export const LIVE_STRIPE_BILLING_FLAG = "VITE_STRIPE_LIVE_BILLING_ENABLED";

export function isLiveStripeBillingEnabled(env = import.meta.env) {
  const value = String(env?.[LIVE_STRIPE_BILLING_FLAG] || "").trim().toLowerCase();
  return ["1", "true", "yes", "live"].includes(value);
}
