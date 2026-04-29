import { useMemo } from "react";
import { useAccount } from "../context/AccountContext";
import { getFeatureMinimumPlan, hasFeature } from "../lib/entitlements";

/**
 * Epic D2 — synchronous AI feature access hook.
 *
 * Returns { allowed, requiredPlan, activePlan } for a given AI feature key.
 * No network call — derives everything from AccountContext.
 *
 * @param {string} featureKey  e.g. "ai_maintenance_triage"
 */
export function useAiFeatureAccess(featureKey) {
  const { activePlan, isRootOperator } = useAccount();

  return useMemo(() => {
    if (isRootOperator) {
      return { allowed: true, requiredPlan: null, activePlan };
    }
    const allowed = hasFeature(activePlan, featureKey);
    const requiredPlan = allowed ? null : getFeatureMinimumPlan(featureKey);
    return { allowed, requiredPlan, activePlan };
  }, [activePlan, featureKey, isRootOperator]);
}
