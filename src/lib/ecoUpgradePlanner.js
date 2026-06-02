export const EPC_BANDS = Object.freeze({
  A: { min: 92, max: 100 },
  B: { min: 81, max: 91 },
  C: { min: 69, max: 80 },
  D: { min: 55, max: 68 },
  E: { min: 39, max: 54 },
  F: { min: 21, max: 38 },
  G: { min: 1, max: 20 },
});

const BAND_ORDER = ["A", "B", "C", "D", "E", "F", "G"];

export function normalizeEpcBand(value) {
  const band = String(value || "").trim().toUpperCase();
  return band in EPC_BANDS ? band : "unknown";
}

export function scoreToEpcBand(score) {
  if (score == null || score === "") return "unknown";
  const numeric = Number(score);
  if (!Number.isFinite(numeric)) return "unknown";
  const clamped = Math.max(1, Math.min(100, Math.round(numeric)));
  return BAND_ORDER.find((band) => clamped >= EPC_BANDS[band].min && clamped <= EPC_BANDS[band].max) || "unknown";
}

export function epcBandToScoreRange(band) {
  const normalized = normalizeEpcBand(band);
  return EPC_BANDS[normalized] || null;
}

export function getBandMidpoint(band) {
  const range = epcBandToScoreRange(band);
  if (!range) return null;
  return Math.round((range.min + range.max) / 2);
}

function getProfileScore(profile = {}) {
  const rawScore = profile.current_epc_score ?? profile.currentEpcScore;
  if (rawScore != null && rawScore !== "") {
    const explicit = Number(rawScore);
    if (Number.isFinite(explicit)) return Math.max(1, Math.min(100, Math.round(explicit)));
  }
  return getBandMidpoint(profile.current_epc_band ?? profile.currentEpcBand);
}

function getItemCost(item = {}) {
  const explicit = Number(item.estimated_cost ?? item.estimatedCost);
  if (Number.isFinite(explicit)) return explicit;
  const low = Number(item.typical_cost_low ?? item.typicalCostLow);
  const high = Number(item.typical_cost_high ?? item.typicalCostHigh);
  if (Number.isFinite(low) && Number.isFinite(high)) return Math.round((low + high) / 2);
  if (Number.isFinite(low)) return low;
  if (Number.isFinite(high)) return high;
  return 0;
}

function getItemPoints(item = {}) {
  const explicit = Number(item.estimated_epc_points_gain ?? item.estimatedEpcPointsGain);
  if (Number.isFinite(explicit)) return Math.round(explicit);
  const low = Number(item.estimated_epc_points_low ?? item.estimatedEpcPointsLow);
  const high = Number(item.estimated_epc_points_high ?? item.estimatedEpcPointsHigh);
  if (Number.isFinite(low) && Number.isFinite(high)) return Math.round((low + high) / 2);
  if (Number.isFinite(low)) return Math.round(low);
  if (Number.isFinite(high)) return Math.round(high);
  return 0;
}

export function calculateUpgradePlanTotals(items = []) {
  const selected = (items || []).filter((item) => item?.selected !== false);
  return selected.reduce(
    (totals, item) => ({
      selectedCount: totals.selectedCount + 1,
      estimatedTotalCost: totals.estimatedTotalCost + getItemCost(item),
      estimatedEpcPointsGain: totals.estimatedEpcPointsGain + getItemPoints(item),
      highPriorityUpgrades: totals.highPriorityUpgrades + (item.priority === "high" ? 1 : 0),
      completedUpgrades: totals.completedUpgrades + (item.completed_at || item.completedAt ? 1 : 0),
    }),
    { selectedCount: 0, estimatedTotalCost: 0, estimatedEpcPointsGain: 0, highPriorityUpgrades: 0, completedUpgrades: 0 },
  );
}

export function estimateUpgradeImpact(profile = {}, selectedItems = []) {
  const currentScore = getProfileScore(profile);
  const targetBand = normalizeEpcBand(profile.target_epc_band ?? profile.targetEpcBand ?? "C");
  const targetRange = epcBandToScoreRange(targetBand);
  const totals = calculateUpgradePlanTotals(selectedItems);
  const hasMissingData = currentScore == null || selectedItems.some((item) => getItemPoints(item) <= 0 || getItemCost(item) <= 0);
  const estimatedResultScore = currentScore == null
    ? null
    : Math.max(1, Math.min(100, currentScore + totals.estimatedEpcPointsGain));
  const estimatedResultBand = estimatedResultScore == null ? "unknown" : scoreToEpcBand(estimatedResultScore);
  const targetReached = Boolean(
    targetRange &&
    estimatedResultScore != null &&
    estimatedResultScore >= targetRange.min,
  );

  return {
    currentScore,
    currentBand: currentScore == null ? normalizeEpcBand(profile.current_epc_band ?? profile.currentEpcBand) : scoreToEpcBand(currentScore),
    targetBand,
    estimatedResultScore,
    estimatedResultBand,
    targetReached,
    confidence: hasMissingData ? "low" : "medium",
    disclaimer: "Indicative planning estimate only. Review the suggested upgrade path with an EPC assessor.",
    ...totals,
  };
}

export function suggestUpgradePath(profile = {}, options = [], targetBand = "C") {
  const targetRange = epcBandToScoreRange(targetBand);
  const currentScore = getProfileScore(profile);
  const activeOptions = (options || []).filter((option) => option?.active !== false);
  const selected = [];
  let projectedScore = currentScore ?? 0;

  for (const option of activeOptions.sort((a, b) => getItemCost(a) - getItemCost(b))) {
    if (targetRange && projectedScore >= targetRange.min) break;
    const item = { ...option, selected: true, estimated_cost: getItemCost(option), estimated_epc_points_gain: getItemPoints(option) };
    selected.push(item);
    projectedScore += getItemPoints(item);
  }

  return {
    targetBand: normalizeEpcBand(targetBand),
    items: selected,
    impact: estimateUpgradeImpact({ ...profile, target_epc_band: targetBand }, selected),
  };
}

export function getEpcRiskLevel(profile = {}) {
  const band = normalizeEpcBand(profile.current_epc_band ?? profile.currentEpcBand ?? scoreToEpcBand(profile.current_epc_score ?? profile.currentEpcScore));
  if (band === "F" || band === "G") return "critical";
  if (band === "E") return "warning";
  if (band === "D") return "planning";
  if (band === "A" || band === "B" || band === "C") return "good";
  return "needs_data";
}
