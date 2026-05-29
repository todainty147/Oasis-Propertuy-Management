export const TENAQO_TAX_CATEGORIES = Object.freeze([
  "rent_income",
  "other_property_income",
  "repairs_and_maintenance",
  "repairs_maintenance",
  "domestic_item_replacement",
  "finance_cost",
  "professional_or_agent_fee",
  "professional_fee",
  "insurance",
  "property_running_cost",
  "running_cost",
  "capital_improvement",
  "mixed_use_review",
  "needs_accountant_review",
  "needs_review",
]);

export const MTD_CATEGORY_KEYS = Object.freeze({
  RENT_INCOME: "rent_income",
  OTHER_PROPERTY_INCOME: "other_property_income",
  REPAIRS_AND_MAINTENANCE: "repairs_and_maintenance",
  DOMESTIC_ITEM_REPLACEMENT: "domestic_item_replacement",
  FINANCE_COST_REVIEW: "finance_cost_review",
  PROFESSIONAL_OR_AGENT_FEE: "professional_or_agent_fee",
  INSURANCE: "insurance",
  PROPERTY_RUNNING_COST: "property_running_cost",
  REVIEW_CATEGORY: "review_category",
  EVIDENCE_ONLY: "evidence_only",
});

const CATEGORY_ALIASES = Object.freeze({
  repairs_maintenance: "repairs_and_maintenance",
  professional_fee: "professional_or_agent_fee",
  running_cost: "property_running_cost",
  needs_review: "needs_accountant_review",
});

const CATEGORY_TO_MTD = Object.freeze({
  rent_income: MTD_CATEGORY_KEYS.RENT_INCOME,
  other_property_income: MTD_CATEGORY_KEYS.OTHER_PROPERTY_INCOME,
  repairs_and_maintenance: MTD_CATEGORY_KEYS.REPAIRS_AND_MAINTENANCE,
  domestic_item_replacement: MTD_CATEGORY_KEYS.DOMESTIC_ITEM_REPLACEMENT,
  finance_cost: MTD_CATEGORY_KEYS.FINANCE_COST_REVIEW,
  professional_or_agent_fee: MTD_CATEGORY_KEYS.PROFESSIONAL_OR_AGENT_FEE,
  insurance: MTD_CATEGORY_KEYS.INSURANCE,
  property_running_cost: MTD_CATEGORY_KEYS.PROPERTY_RUNNING_COST,
  capital_improvement: MTD_CATEGORY_KEYS.REVIEW_CATEGORY,
  mixed_use_review: MTD_CATEGORY_KEYS.REVIEW_CATEGORY,
  needs_accountant_review: MTD_CATEGORY_KEYS.REVIEW_CATEGORY,
});

export function normalizeTenaqoTaxCategory(category) {
  const key = String(category || "").trim().toLowerCase();
  return CATEGORY_ALIASES[key] || key;
}

export function mapTenaqoCategoryToMtdCategory(category) {
  return CATEGORY_TO_MTD[normalizeTenaqoTaxCategory(category)] || "";
}

export function getCategoryMappingIssue(record = {}) {
  const direction = String(record.direction || "").toLowerCase();
  const category = normalizeTenaqoTaxCategory(record.tenaqoCategory || record.category || record.tax_category_code);
  const treatment = String(record.taxTreatment || record.tax_treatment || "").toLowerCase();

  if (direction === "evidence") return { issueStatus: "excluded", reason: "Evidence records are exported for readiness but are not included in income or expense totals." };
  if (!category && direction !== "income") return { issueStatus: "uncategorised", reason: "Add an MTD category before relying on this line." };
  if (["capital_improvement", "mixed_use_review", "needs_accountant_review"].includes(category)) {
    return { issueStatus: "needs_review", reason: "Review this category with an accountant before treating it as a quarterly update amount." };
  }
  if (category === "finance_cost") {
    return { issueStatus: "needs_review", reason: "Finance costs need Section 24 treatment review and are not ordinary running expenses." };
  }
  if (treatment === "capital_candidate" || treatment === "review_required") {
    return { issueStatus: "needs_review", reason: "This source record is marked for tax treatment review." };
  }
  return { issueStatus: "ok", reason: null };
}

export function mapRecordToHmrcCategoryKey(record = {}) {
  if (String(record.direction || "").toLowerCase() === "income") {
    const category = normalizeTenaqoTaxCategory(record.tenaqoCategory || record.category || record.tax_category_code);
    return category === "other_property_income" ? MTD_CATEGORY_KEYS.OTHER_PROPERTY_INCOME : MTD_CATEGORY_KEYS.RENT_INCOME;
  }
  return mapTenaqoCategoryToMtdCategory(record.tenaqoCategory || record.category || record.tax_category_code);
}

export function aggregateDraftLinesByCategory(lines = []) {
  const buckets = new Map();
  for (const line of lines) {
    if (!line?.include_in_draft && !line?.includeInDraft) continue;
    const key = line.hmrc_category_key || line.hmrcCategoryKey || line.mtd_category || line.mtdCategory || "uncategorised";
    const amount = Number(line.amount || 0);
    const current = buckets.get(key) || {
      categoryKey: key,
      direction: line.direction || "expense",
      total: 0,
      count: 0,
      issueCount: 0,
    };
    current.total += amount;
    current.count += 1;
    if (line.issue_status && line.issue_status !== "ok") current.issueCount += 1;
    buckets.set(key, current);
  }
  return Array.from(buckets.values()).sort((a, b) => a.categoryKey.localeCompare(b.categoryKey));
}
