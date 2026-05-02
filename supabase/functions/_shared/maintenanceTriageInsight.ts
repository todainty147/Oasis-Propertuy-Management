import { aliasForId, buildUntrustedJsonPrompt, redactForAiPrompt } from "./aiSafety.ts";

export type MaintenanceTriageWorkOrder = {
  id?: string | null;
  status?: string | null;
  contractorName?: string | null;
  createdAt?: string | null;
};

export type MaintenanceTriageInput = {
  accountId: string;
  requestId: string;
  generatedAt?: string | null;
  request: {
    id: string;
    title?: string | null;
    description?: string | null;
    priority?: string | null;
    status?: string | null;
    waitingReason?: string | null;
    createdAt?: string | null;
    propertyLabel?: string | null;
    reporterName?: string | null;
    reporterEmail?: string | null;
  };
  workOrders?: MaintenanceTriageWorkOrder[] | null;
  recentPropertyRequestCount?: number | null;
};

export type MaintenanceTriageInsightOutput = {
  request_id: string;
  request_title: string;
  category: string;
  urgency: "low" | "normal" | "high" | "urgent";
  safety_flag: boolean;
  suggested_trade: string;
  tenant_acknowledgement: string;
  manager_note: string;
  facts_used: string[];
  confidence: "low" | "medium" | "high";
  source: "openai" | "fallback";
  generated_at: string;
};

function lower(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function countOpenWorkOrders(workOrders: MaintenanceTriageWorkOrder[] = []) {
  return workOrders.filter((row) => !["completed", "cancelled"].includes(lower(row?.status))).length;
}

function waitingReasonLabel(value: string | null | undefined) {
  const reason = lower(value);
  if (reason === "tenant_response") return "Waiting on tenant response";
  if (reason === "contractor_schedule") return "Waiting on contractor schedule";
  if (reason === "parts_ordered") return "Waiting on parts or materials";
  if (reason === "landlord_approval") return "Waiting on landlord approval";
  return null;
}

function detectCategoryAndTrade(haystack: string) {
  if (/(boiler|heating|radiator|no hot water|hot water|plumb|pipe|leak|tap|drain|toilet|sink)/i.test(haystack)) {
    return { category: "plumbing_heating", trade: "Plumber / heating engineer" };
  }
  if (/(electric|socket|wire|fuse|power|light fitting|sparking|trip switch)/i.test(haystack)) {
    return { category: "electrical", trade: "Electrician" };
  }
  if (/(door|lock|window|glass|roof|gutter|wall|floor|ceiling|joiner|carpenter)/i.test(haystack)) {
    return { category: "general_repairs", trade: "General builder / carpenter" };
  }
  if (/(mould|mold|damp|condensation|pest|mice|rat|cockroach)/i.test(haystack)) {
    return { category: "pest_damp", trade: "Damp specialist / pest control" };
  }
  if (/(fridge|oven|washing machine|dishwasher|appliance)/i.test(haystack)) {
    return { category: "appliance", trade: "Appliance engineer" };
  }
  if (/(clean|rubbish|garden|outside|exterior|communal)/i.test(haystack)) {
    return { category: "cleaning_exterior", trade: "Cleaning / grounds team" };
  }
  return { category: "general_repairs", trade: "General maintenance contractor" };
}

function detectUrgency(haystack: string, currentPriority: string | null | undefined) {
  const priority = lower(currentPriority);
  if (priority === "urgent") return "urgent";
  if (priority === "high") return "high";

  if (/(gas leak|sparking|exposed wire|flood|burst pipe|fire|smoke|water near electrics|ceiling collapse|lock(ed)? out|cannot lock)/i.test(haystack)) {
    return "urgent";
  }
  if (/(no heating|no hot water|major leak|boiler leak|toilet blocked|electrical fault|mould worsening|severe damp)/i.test(haystack)) {
    return "high";
  }
  if (/(broken|not working|repair|issue|problem|damage)/i.test(haystack)) {
    return "normal";
  }
  return "low";
}

function detectSafetyFlag(haystack: string) {
  return /(gas leak|sparking|exposed wire|flood|burst pipe|fire|smoke|water near electrics|ceiling collapse)/i.test(haystack);
}

function buildFacts(input: MaintenanceTriageInput) {
  const facts: string[] = [];
  const request = input.request || {};
  if (request.propertyLabel) facts.push(`Property: ${request.propertyLabel}`);
  if (request.status) facts.push(`Current status: ${request.status}`);
  if (request.priority) facts.push(`Current priority: ${request.priority}`);
  if (request.waitingReason) {
    const label = waitingReasonLabel(request.waitingReason);
    if (label) facts.push(label);
  }
  const openWorkOrders = countOpenWorkOrders(input.workOrders || []);
  if (openWorkOrders > 0) facts.push(`Open linked work orders: ${openWorkOrders}`);
  if (Number(input.recentPropertyRequestCount || 0) > 1) {
    facts.push(`Recent requests at this property: ${Number(input.recentPropertyRequestCount || 0)}`);
  }
  if (request.reporterName) facts.push(`Reported by: ${request.reporterName}`);
  return facts.slice(0, 6);
}

function buildTenantAcknowledgement(urgency: MaintenanceTriageInsightOutput["urgency"], safetyFlag: boolean) {
  if (safetyFlag) {
    return "Thanks, we have flagged this as a safety-sensitive issue. Please avoid the affected area if possible while we review the next step.";
  }
  if (urgency === "urgent") {
    return "Thanks, this looks urgent and the team should review it as a priority. We will update you once the next step is confirmed.";
  }
  if (urgency === "high") {
    return "Thanks, this looks important and the team should review it promptly. We will update you once the work is scheduled.";
  }
  return "Thanks, we have logged the issue and the team will review the next step shortly.";
}

function buildManagerNote({
  category,
  urgency,
  safetyFlag,
  suggestedTrade,
  workOrders,
}: {
  category: string;
  urgency: MaintenanceTriageInsightOutput["urgency"];
  safetyFlag: boolean;
  suggestedTrade: string;
  workOrders: MaintenanceTriageWorkOrder[];
}) {
  const parts = [
    `Suggested category: ${category.replaceAll("_", " ")}`,
    `Suggested urgency: ${urgency}`,
    `Suggested trade: ${suggestedTrade}`,
  ];
  if (safetyFlag) parts.push("Safety-sensitive wording detected.");
  if (countOpenWorkOrders(workOrders) > 0) parts.push("Check whether the linked work order already covers this issue.");
  return parts.join(" ");
}

export function buildFallbackMaintenanceTriageInsight(
  input: MaintenanceTriageInput,
): MaintenanceTriageInsightOutput {
  const title = String(input.request?.title || "").trim();
  const description = String(input.request?.description || "").trim();
  const haystack = `${title}\n${description}`;
  const mapping = detectCategoryAndTrade(haystack);
  const urgency = detectUrgency(haystack, input.request?.priority);
  const safetyFlag = detectSafetyFlag(haystack);
  const factsUsed = buildFacts(input);

  return {
    request_id: input.requestId,
    request_title: title || "Maintenance request",
    category: mapping.category,
    urgency,
    safety_flag: safetyFlag,
    suggested_trade: mapping.trade,
    tenant_acknowledgement: buildTenantAcknowledgement(urgency, safetyFlag),
    manager_note: buildManagerNote({
      category: mapping.category,
      urgency,
      safetyFlag,
      suggestedTrade: mapping.trade,
      workOrders: input.workOrders || [],
    }),
    facts_used: factsUsed,
    confidence: description ? "medium" : "low",
    source: "fallback",
    generated_at: input.generatedAt || new Date().toISOString(),
  };
}

export function buildMaintenanceTriagePrompt(input: MaintenanceTriageInput) {
  return buildUntrustedJsonPrompt({
      requestId: input.requestId,
      request: {
        title: redactForAiPrompt(input.request?.title),
        description: redactForAiPrompt(input.request?.description, 1_200),
        priority: String(input.request?.priority || ""),
        status: String(input.request?.status || ""),
        waitingReason: String(input.request?.waitingReason || ""),
        propertyAlias: aliasForId("property", input.request?.propertyLabel || input.requestId),
        reporterAlias: input.request?.reporterName ? "tenant:reported" : null,
      },
      linkedWorkOrders: (input.workOrders || []).slice(0, 5).map((row) => ({
        status: String(row?.status || ""),
        contractorAlias: row?.contractorName ? "contractor:assigned" : null,
      })),
      recentPropertyRequestCount: Number(input.recentPropertyRequestCount || 0),
      factsUsed: buildFacts(input)
        .filter((fact) => !/^Property:|^Reported by:/i.test(fact))
        .map((fact) => redactForAiPrompt(fact, 200)),
      allowedUrgency: ["low", "normal", "high", "urgent"],
  });
}

export function parseMaintenanceTriageInsightPayload(value: unknown): MaintenanceTriageInsightOutput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Maintenance triage insight payload must be an object");
  }

  const payload = value as Record<string, unknown>;
  const urgency = lower(String(payload.urgency || "normal"));
  const confidence = lower(String(payload.confidence || "medium"));
  const source = lower(String(payload.source || "openai"));

  return {
    request_id: String(payload.request_id || ""),
    request_title: String(payload.request_title || "").trim(),
    category: String(payload.category || "general_repairs").trim(),
    urgency: (["low", "normal", "high", "urgent"].includes(urgency) ? urgency : "normal") as MaintenanceTriageInsightOutput["urgency"],
    safety_flag: payload.safety_flag === true,
    suggested_trade: String(payload.suggested_trade || "").trim(),
    tenant_acknowledgement: String(payload.tenant_acknowledgement || "").trim(),
    manager_note: String(payload.manager_note || "").trim(),
    facts_used: Array.isArray(payload.facts_used)
      ? payload.facts_used.map((entry) => String(entry || "").trim()).filter(Boolean).slice(0, 6)
      : [],
    confidence: (["low", "medium", "high"].includes(confidence) ? confidence : "medium") as MaintenanceTriageInsightOutput["confidence"],
    source: (source === "fallback" ? "fallback" : "openai"),
    generated_at: String(payload.generated_at || new Date().toISOString()),
  };
}

export function buildMaintenanceTriageSourceHash(input: MaintenanceTriageInput) {
  const request = input.request || {};
  const workOrderFingerprint = (input.workOrders || [])
    .slice(0, 5)
    .map((row) => [row?.id || "", row?.status || "", row?.contractorName || ""].join(":"))
    .join("|");

  return [
    input.accountId,
    input.requestId,
    request.title || "",
    request.description || "",
    request.priority || "",
    request.status || "",
    request.waitingReason || "",
    input.recentPropertyRequestCount || 0,
    workOrderFingerprint,
  ].join("::");
}
