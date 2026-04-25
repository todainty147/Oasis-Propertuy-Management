export type PropertyHealthReason = {
  key?: string | null;
  penalty?: number | null;
  amount?: number | null;
  count?: number | null;
};

export type PropertyHealthRow = {
  propertyId: string;
  propertyLabel?: string | null;
  score?: number | null;
  category?: string | null;
  reasons?: PropertyHealthReason[] | null;
  signals?: {
    overdueRentAmount?: number | null;
    openRequestCount?: number | null;
    activeWorkOrderCount?: number | null;
    stalledRepairCount?: number | null;
    ackOverdueCount?: number | null;
    longRunningRepairCount?: number | null;
    requests90Count?: number | null;
    overduePreventiveCount?: number | null;
    dueSoonPreventiveCount?: number | null;
    overdueComplianceCount?: number | null;
    dueSoonComplianceCount?: number | null;
    missingComplianceCount?: number | null;
    hasExpiredLease?: boolean | null;
    hasExpiringLease?: boolean | null;
    hasRenewalInProgress?: boolean | null;
    recentOperatingExpenses?: number | null;
    recentMaintenanceCost?: number | null;
    tenantCount?: number | null;
  } | null;
};

export type PropertyHealthInsightInput = {
  accountId: string;
  generatedAt?: string | null;
  property: PropertyHealthRow | null;
};

export type PropertyHealthInsightOutput = {
  property_id: string | null;
  property_label: string;
  category: "healthy" | "attention_needed" | "high_risk";
  health_explanation: string;
  risk_drivers: Array<{
    driver:
      | "vacancy"
      | "maintenance"
      | "arrears"
      | "compliance"
      | "contractor_delay"
      | "lease"
      | "operating_cost";
    severity: "low" | "medium" | "high";
    explanation: string;
  }>;
  recommended_next_step: string;
  non_ai_facts_used: string[];
  confidence: "low" | "medium" | "high";
  source: "openai" | "fallback";
  generated_at: string;
};

function currency(value: number | null | undefined) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return `£${Math.round(amount).toLocaleString("en-GB")}`;
}

function numberOrZero(value: number | null | undefined) {
  const next = Number(value || 0);
  return Number.isFinite(next) ? next : 0;
}

function normalizeCategory(value: string | null | undefined): PropertyHealthInsightOutput["category"] {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "healthy") return "healthy";
  if (normalized === "attention_needed") return "attention_needed";
  return "high_risk";
}

function pushFact(list: string[], value: string | null) {
  if (value) list.push(value);
}

function buildFacts(property: PropertyHealthRow): string[] {
  const facts: string[] = [];
  const signals = property.signals || {};

  pushFact(facts, currency(signals.overdueRentAmount) ? `Overdue rent: ${currency(signals.overdueRentAmount)}` : null);
  pushFact(facts, numberOrZero(signals.openRequestCount) > 0 ? `Open maintenance requests: ${numberOrZero(signals.openRequestCount)}` : null);
  pushFact(facts, numberOrZero(signals.activeWorkOrderCount) > 0 ? `Active work orders: ${numberOrZero(signals.activeWorkOrderCount)}` : null);
  pushFact(facts, numberOrZero(signals.stalledRepairCount) > 0 ? `Stalled repairs: ${numberOrZero(signals.stalledRepairCount)}` : null);
  pushFact(facts, numberOrZero(signals.ackOverdueCount) > 0 ? `Contractor acknowledgement overdue: ${numberOrZero(signals.ackOverdueCount)}` : null);
  pushFact(facts, numberOrZero(signals.longRunningRepairCount) > 0 ? `Long-running repairs: ${numberOrZero(signals.longRunningRepairCount)}` : null);
  pushFact(facts, numberOrZero(signals.requests90Count) > 0 ? `Requests in last 90 days: ${numberOrZero(signals.requests90Count)}` : null);
  pushFact(facts, numberOrZero(signals.overdueComplianceCount) > 0 ? `Overdue compliance items: ${numberOrZero(signals.overdueComplianceCount)}` : null);
  pushFact(facts, numberOrZero(signals.dueSoonComplianceCount) > 0 ? `Compliance due soon: ${numberOrZero(signals.dueSoonComplianceCount)}` : null);
  pushFact(facts, numberOrZero(signals.overduePreventiveCount) > 0 ? `Overdue preventive tasks: ${numberOrZero(signals.overduePreventiveCount)}` : null);
  pushFact(facts, signals.hasExpiredLease ? "Lease has expired" : null);
  pushFact(facts, signals.hasExpiringLease ? "Lease is expiring soon" : null);
  pushFact(facts, signals.hasRenewalInProgress ? "Lease renewal is in progress" : null);
  pushFact(
    facts,
    currency(numberOrZero(signals.recentOperatingExpenses) + numberOrZero(signals.recentMaintenanceCost))
      ? `Recent operating and maintenance cost: ${currency(numberOrZero(signals.recentOperatingExpenses) + numberOrZero(signals.recentMaintenanceCost))}`
      : null,
  );

  return facts.slice(0, 6);
}

function buildFallbackDrivers(property: PropertyHealthRow): PropertyHealthInsightOutput["risk_drivers"] {
  const drivers: PropertyHealthInsightOutput["risk_drivers"] = [];
  const signals = property.signals || {};

  if (numberOrZero(signals.overdueRentAmount) > 0) {
    drivers.push({
      driver: "arrears",
      severity: numberOrZero(signals.overdueRentAmount) >= 2000 ? "high" : "medium",
      explanation: `There is overdue rent outstanding against this property.`,
    });
  }

  const maintenancePressure = numberOrZero(signals.openRequestCount) + numberOrZero(signals.activeWorkOrderCount);
  if (maintenancePressure > 0) {
    drivers.push({
      driver: "maintenance",
      severity: maintenancePressure >= 4 ? "high" : maintenancePressure >= 2 ? "medium" : "low",
      explanation: `Maintenance pressure is active across requests and work orders.`,
    });
  }

  if (numberOrZero(signals.stalledRepairCount) > 0 || numberOrZero(signals.ackOverdueCount) > 0) {
    drivers.push({
      driver: "contractor_delay",
      severity:
        numberOrZero(signals.stalledRepairCount) + numberOrZero(signals.ackOverdueCount) >= 2 ? "high" : "medium",
      explanation: `Repairs are slowing down because contractor follow-up is overdue or stalled.`,
    });
  }

  if (numberOrZero(signals.overdueComplianceCount) > 0 || numberOrZero(signals.missingComplianceCount) > 0) {
    drivers.push({
      driver: "compliance",
      severity: numberOrZero(signals.overdueComplianceCount) > 0 ? "high" : "medium",
      explanation: `Compliance work needs attention before it becomes a larger operational risk.`,
    });
  }

  if (signals.hasExpiredLease || signals.hasExpiringLease || signals.hasRenewalInProgress) {
    drivers.push({
      driver: "lease",
      severity: signals.hasExpiredLease ? "high" : "medium",
      explanation: `The current lease state needs follow-up to protect continuity and occupancy.`,
    });
  }

  const totalCost = numberOrZero(signals.recentOperatingExpenses) + numberOrZero(signals.recentMaintenanceCost);
  if (totalCost > 0) {
    drivers.push({
      driver: "operating_cost",
      severity: totalCost >= 2000 ? "medium" : "low",
      explanation: `Recent operating and maintenance cost is worth checking against rent performance.`,
    });
  }

  return drivers.slice(0, 4);
}

function buildRecommendedNextStep(property: PropertyHealthRow) {
  const signals = property.signals || {};
  if (numberOrZero(signals.overdueRentAmount) > 0) return "Review arrears follow-up and confirm the next payment action.";
  if (numberOrZero(signals.stalledRepairCount) > 0 || numberOrZero(signals.ackOverdueCount) > 0) {
    return "Review the slowest repair and move the contractor follow-up forward.";
  }
  if (numberOrZero(signals.overdueComplianceCount) > 0 || numberOrZero(signals.missingComplianceCount) > 0) {
    return "Check overdue or missing compliance work before the risk grows.";
  }
  if (signals.hasExpiredLease || signals.hasExpiringLease) {
    return "Review the lease position and decide the next renewal or occupancy step.";
  }
  return "Open the property details and review the current risk drivers in context.";
}

function buildFallbackExplanation(property: PropertyHealthRow, drivers: PropertyHealthInsightOutput["risk_drivers"]) {
  const label = property.propertyLabel || "This property";
  if (drivers.length === 0) {
    return `${label} looks operationally steady right now. Keep an eye on changes, but there is no single high-pressure signal in the current snapshot.`;
  }
  const lead = drivers[0];
  return `${label} is under pressure mainly because ${lead.explanation.charAt(0).toLowerCase()}${lead.explanation.slice(1)}`;
}

export function buildFallbackPropertyHealthInsight(
  input: PropertyHealthInsightInput,
): PropertyHealthInsightOutput {
  const property = input.property;
  if (!property?.propertyId) {
    return {
      property_id: null,
      property_label: "",
      category: "healthy",
      health_explanation: "No property health explanation is available yet because there is no scoped property to explain.",
      risk_drivers: [],
      recommended_next_step: "Review the portfolio health list to select a property.",
      non_ai_facts_used: [],
      confidence: "low",
      source: "fallback",
      generated_at: input.generatedAt || new Date().toISOString(),
    };
  }

  const drivers = buildFallbackDrivers(property);
  return {
    property_id: property.propertyId,
    property_label: String(property.propertyLabel || ""),
    category: normalizeCategory(property.category),
    health_explanation: buildFallbackExplanation(property, drivers),
    risk_drivers: drivers,
    recommended_next_step: buildRecommendedNextStep(property),
    non_ai_facts_used: buildFacts(property),
    confidence: drivers.length >= 2 ? "high" : drivers.length === 1 ? "medium" : "low",
    source: "fallback",
    generated_at: input.generatedAt || new Date().toISOString(),
  };
}

export function buildPropertyHealthPrompt(input: PropertyHealthInsightInput) {
  const property = input.property;
  return [
    "You are generating a concise portfolio health explanation for one property inside a property operations platform.",
    "Use only the facts provided. Do not invent data. Keep it operational, specific, and calm.",
    "Return JSON only.",
    JSON.stringify({
      propertyId: property?.propertyId || null,
      propertyLabel: property?.propertyLabel || "",
      score: numberOrZero(property?.score),
      category: normalizeCategory(property?.category),
      reasons: (property?.reasons || []).map((reason) => ({
        key: String(reason?.key || ""),
        penalty: numberOrZero(reason?.penalty),
        amount: reason?.amount == null ? null : numberOrZero(reason.amount),
        count: reason?.count == null ? null : numberOrZero(reason.count),
      })),
      signals: property?.signals || {},
      nonAiFacts: property ? buildFacts(property) : [],
    }),
  ].join("\n\n");
}

export function parsePropertyHealthInsightPayload(value: unknown): PropertyHealthInsightOutput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Property health insight payload must be an object");
  }

  const payload = value as Record<string, unknown>;
  const category = normalizeCategory(String(payload.category || ""));
  const confidence = String(payload.confidence || "medium").trim().toLowerCase();
  const source = String(payload.source || "openai").trim().toLowerCase();
  const riskDrivers = Array.isArray(payload.risk_drivers)
    ? payload.risk_drivers
        .filter((entry) => entry && typeof entry === "object")
        .map((entry) => {
          const record = entry as Record<string, unknown>;
          const driver = String(record.driver || "maintenance").trim().toLowerCase();
          const severity = String(record.severity || "medium").trim().toLowerCase();
          return {
            driver: (
              [
                "vacancy",
                "maintenance",
                "arrears",
                "compliance",
                "contractor_delay",
                "lease",
                "operating_cost",
              ].includes(driver)
                ? driver
                : "maintenance"
            ) as PropertyHealthInsightOutput["risk_drivers"][number]["driver"],
            severity: (
              ["low", "medium", "high"].includes(severity) ? severity : "medium"
            ) as PropertyHealthInsightOutput["risk_drivers"][number]["severity"],
            explanation: String(record.explanation || "").trim(),
          };
        })
        .filter((entry) => entry.explanation)
    : [];

  const facts = Array.isArray(payload.non_ai_facts_used)
    ? payload.non_ai_facts_used.map((entry) => String(entry || "").trim()).filter(Boolean)
    : [];

  return {
    property_id: payload.property_id == null ? null : String(payload.property_id),
    property_label: String(payload.property_label || "").trim(),
    category,
    health_explanation: String(payload.health_explanation || "").trim(),
    risk_drivers: riskDrivers.slice(0, 4),
    recommended_next_step: String(payload.recommended_next_step || "").trim(),
    non_ai_facts_used: facts.slice(0, 6),
    confidence: (["low", "medium", "high"].includes(confidence) ? confidence : "medium") as PropertyHealthInsightOutput["confidence"],
    source: source === "fallback" ? "fallback" : "openai",
    generated_at: String(payload.generated_at || new Date().toISOString()),
  };
}

export function buildPropertyHealthSourceHash(input: PropertyHealthInsightInput) {
  const property = input.property;
  if (!property?.propertyId) return `${input.accountId}::none`;
  const signals = property.signals || {};
  const reasons = (property.reasons || [])
    .map((reason) => [reason?.key || "", numberOrZero(reason?.penalty), numberOrZero(reason?.count), numberOrZero(reason?.amount)].join(":"))
    .join("|");

  return [
    input.accountId,
    property.propertyId,
    numberOrZero(property.score),
    normalizeCategory(property.category),
    numberOrZero(signals.overdueRentAmount),
    numberOrZero(signals.openRequestCount),
    numberOrZero(signals.activeWorkOrderCount),
    numberOrZero(signals.stalledRepairCount),
    numberOrZero(signals.ackOverdueCount),
    numberOrZero(signals.overdueComplianceCount),
    numberOrZero(signals.missingComplianceCount),
    signals.hasExpiredLease ? 1 : 0,
    signals.hasExpiringLease ? 1 : 0,
    reasons,
  ].join("::");
}
