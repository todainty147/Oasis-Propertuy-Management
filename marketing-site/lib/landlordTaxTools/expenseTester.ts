import { TAX_TOOL_DISCLAIMER } from "./shared";

export type ExpenseTesterCategory = keyof typeof EXPENSE_TESTER_CATEGORIES;
export type ExpenseTesterConfidence = "high" | "medium" | "low";

export type ExpenseTesterInput = {
  description?: string;
  categoryHint?: string;
  propertyContext?: string;
  restoresSameStandard?: boolean | null;
  improvesOrAddsSomething?: boolean | null;
  propertyWasRunDownWhenPurchased?: boolean | null;
  partlyPersonalUse?: boolean | null;
  connectedToFinanceInsuranceLegalOrAgentFees?: boolean | null;
};

export const EXPENSE_TESTER_CATEGORIES = {
  repairs_maintenance: "Likely repairs & maintenance",
  capital_improvement: "Likely capital improvement",
  domestic_item_replacement: "Possible replacement of domestic item",
  finance_cost: "Likely finance or loan-related cost",
  professional_fee: "Likely professional or agent fee",
  insurance: "Likely insurance",
  running_cost: "Likely property running cost",
  mixed_use_review: "Mixed-use expense - review needed",
  needs_review: "Needs accountant review",
};

export const SAMPLE_EXPENSES = [
  "Replacing a broken boiler",
  "Upgrading kitchen worktop to granite",
  "Landlord insurance",
  "Letting agent fee",
  "Mortgage interest",
  "Redecoration between tenants",
  "New sofa for furnished rental",
  "Major renovation before first letting",
];

const CATEGORY_EXAMPLES = {
  repairs_maintenance: ["Fixing a leak", "Like-for-like boiler repair", "Repainting between tenants"],
  capital_improvement: ["Loft conversion", "Adding a bathroom", "Premium kitchen upgrade"],
  domestic_item_replacement: ["Replacement sofa", "New washing machine", "Replacement curtains"],
  finance_cost: ["Mortgage interest", "Loan arrangement fee", "Remortgage fee"],
  professional_fee: ["Letting agent fee", "Accountant fee", "Inventory clerk"],
  insurance: ["Landlord insurance", "Buildings insurance", "Rent guarantee cover"],
  running_cost: ["Council tax", "Service charge", "Cleaning"],
  mixed_use_review: ["Broadband with personal use", "Travel with mixed purpose", "Home office cost"],
  needs_review: ["Large renovation before first letting", "Conflicting repair and upgrade evidence"],
};

const CATEGORY_EXPLANATIONS = {
  repairs_maintenance:
    "Repairs usually restore an asset to its previous condition rather than improving it beyond what was there before.",
  capital_improvement:
    "Costs that improve the property beyond its previous condition are often treated differently from ordinary repairs.",
  domestic_item_replacement:
    "Replacement domestic items may need separate treatment from normal repairs or capital improvements.",
  finance_cost:
    "Residential property finance costs need separate handling because landlord finance-cost relief is restricted to a basic-rate tax reduction.",
  professional_fee:
    "Professional and management costs should usually be tracked separately from repairs and property running costs.",
  insurance: "Insurance costs are usually recorded separately from maintenance and repairs.",
  running_cost:
    "Running costs are part of ongoing property expense records but may need review if partly personal.",
  mixed_use_review: "Mixed-use costs may need apportionment between rental and personal use.",
  needs_review:
    "This could depend on timing, property condition, and whether the cost restores or improves the asset.",
};

const KEYWORDS = {
  repairs_maintenance: [
    "repair",
    "fix",
    "restore",
    "broken",
    "leak",
    "boiler repair",
    "plumbing repair",
    "electrical repair",
    "roof tile",
    "repaint",
    "redecorate",
    "redecoration",
    "like-for-like",
    "like for like",
  ],
  capital_improvement: [
    "upgrade",
    "extension",
    "loft conversion",
    "new room",
    "structural improvement",
    "premium upgrade",
    "granite worktop",
    "add bathroom",
    "add conservatory",
    "convert garage",
    "major renovation",
    "renovation before first letting",
  ],
  domestic_item_replacement: [
    "sofa",
    "bed",
    "fridge",
    "washing machine",
    "curtains",
    "carpet",
    "furniture",
    "appliance",
    "domestic item",
  ],
  finance_cost: [
    "mortgage interest",
    "loan interest",
    "bank interest",
    "lender fee",
    "arrangement fee",
    "finance cost",
    "remortgage fee",
  ],
  professional_fee: [
    "letting agent",
    "accountant",
    "solicitor",
    "legal fee",
    "management fee",
    "referencing",
    "inventory clerk",
    "eviction fee",
    "compliance certificate",
  ],
  insurance: ["landlord insurance", "building insurance", "buildings insurance", "contents insurance", "public liability", "rent guarantee"],
  running_cost: ["council tax", "water", "gas", "electricity", "service charge", "ground rent", "cleaning", "gardening"],
  mixed_use_review: ["phone", "car", "broadband", "home office", "mixed use", "travel"],
};

function hasKeyword(text: string, category: keyof typeof KEYWORDS) {
  return KEYWORDS[category].some((keyword) => text.includes(keyword));
}

export function getExpenseTesterExplanation(category: ExpenseTesterCategory) {
  return CATEGORY_EXPLANATIONS[category] || CATEGORY_EXPLANATIONS.needs_review;
}

export function getRecordKeepingChecklist(category: ExpenseTesterCategory) {
  const checklist = [
    "date",
    "supplier",
    "amount",
    "invoice/receipt",
    "property address",
    "reason for expense",
  ];

  if (category === "repairs_maintenance" || category === "capital_improvement" || category === "needs_review") {
    checklist.push("before/after notes if repair vs improvement is unclear");
  }

  if (category === "mixed_use_review") {
    checklist.push("apportionment notes showing rental vs personal use");
  }

  return checklist;
}

function buildResult(category: ExpenseTesterCategory, confidence: ExpenseTesterConfidence, reasons: string[]) {
  return {
    category,
    label: EXPENSE_TESTER_CATEGORIES[category],
    confidence,
    summary: `${EXPENSE_TESTER_CATEGORIES[category]}.`,
    explanation: getExpenseTesterExplanation(category),
    reasons,
    examples: CATEGORY_EXAMPLES[category] || [],
    caution: TAX_TOOL_DISCLAIMER,
    nextSteps: [
      "Keep the invoice or receipt with the property record.",
      "Record why the cost was incurred and which property it relates to.",
      "Ask an accountant to review the treatment before filing if the cost is large or unclear.",
    ],
    recordKeepingChecklist: getRecordKeepingChecklist(category),
    tenaqoCta:
      "Tenaqo helps landlords keep cleaner property records before Making Tax Digital deadlines arrive.",
  };
}

export function classifyExpense(input: ExpenseTesterInput = {}) {
  const description = String(input.description || "").trim();
  const categoryHint = String(input.categoryHint || "").trim();
  const propertyContext = String(input.propertyContext || "").trim();
  const text = `${description} ${categoryHint} ${propertyContext}`.toLowerCase();

  if (!description && !categoryHint && !propertyContext) {
    return buildResult("needs_review", "low", ["There is not enough information to classify this expense."]);
  }

  const repairSignal = hasKeyword(text, "repairs_maintenance") || input.restoresSameStandard === true;
  const improvementSignal = hasKeyword(text, "capital_improvement") || input.improvesOrAddsSomething === true;
  const runDownSignal = input.propertyWasRunDownWhenPurchased === true;

  if ((repairSignal && improvementSignal) || (runDownSignal && improvementSignal)) {
    return buildResult("needs_review", "low", [
      "The answers include both repair and improvement signals.",
      runDownSignal
        ? "Work on a run-down or unlettable property before first letting can depend heavily on timing and condition."
        : "Repair vs improvement treatment may need review.",
    ]);
  }

  if (input.partlyPersonalUse === true || hasKeyword(text, "mixed_use_review")) {
    return buildResult("mixed_use_review", "high", ["The expense appears to involve both rental and personal use."]);
  }

  if (input.connectedToFinanceInsuranceLegalOrAgentFees === true || hasKeyword(text, "finance_cost")) {
    if (hasKeyword(text, "insurance")) {
      return buildResult("insurance", "high", ["The description includes insurance wording."]);
    }
    if (hasKeyword(text, "professional_fee")) {
      return buildResult("professional_fee", "high", ["The description includes professional, legal, or agent fee wording."]);
    }
    return buildResult("finance_cost", "high", ["The description or answers indicate a finance or loan-related cost."]);
  }

  for (const category of ["insurance", "professional_fee", "domestic_item_replacement", "running_cost"] as const) {
    if (hasKeyword(text, category)) {
      return buildResult(category, "high", [`The description matches common ${EXPENSE_TESTER_CATEGORIES[category].toLowerCase()} wording.`]);
    }
  }

  if (improvementSignal || runDownSignal) {
    return buildResult("capital_improvement", improvementSignal ? "high" : "medium", [
      improvementSignal
        ? "The description or answers suggest the cost improves, upgrades, or adds something new."
        : "The property condition at purchase may affect treatment.",
    ]);
  }

  if (repairSignal) {
    return buildResult("repairs_maintenance", "high", [
      "The description or answers suggest the cost restores something to broadly the same standard.",
    ]);
  }

  return buildResult("needs_review", "medium", ["The expense does not clearly match a common category."]);
}
