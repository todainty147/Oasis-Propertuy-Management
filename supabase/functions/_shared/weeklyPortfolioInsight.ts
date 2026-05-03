import { aliasForId, buildUntrustedJsonPrompt, redactForAiPrompt } from "./aiSafety.ts";

export type WeeklyPortfolioInsightInput = {
  accountId: string;
  generatedAt?: string | null;
  summary: {
    occupancyRate?: number | null;
    openRequests?: number | null;
    waitingOver48h?: number | null;
    overdueBalance?: number | null;
    highRiskPropertyCount?: number | null;
    averageHealthScore?: number | null;
    securityAlertCount?: number | null;
  };
  topAttentionItems?: Array<{
    title?: string | null;
    subtitle?: string | null;
    linkPath?: string | null;
  }> | null;
  lowHealthProperties?: Array<{
    propertyId?: string | null;
    label?: string | null;
    score?: number | null;
    category?: string | null;
  }> | null;
};

export type WeeklyPortfolioInsightOutput = {
  headline: string;
  wins: string[];
  risks: string[];
  recommended_focus: string[];
  properties_to_watch: string[];
  cashflow_notes: string[];
  confidence: "low" | "medium" | "high";
  source: "openai" | "fallback";
  generated_at: string;
};

function healthLabel(category: string | null | undefined) {
  const value = String(category || "").trim().toLowerCase();
  if (value === "healthy") return "healthy";
  if (value === "high_risk") return "high risk";
  return "attention needed";
}

export function buildFallbackWeeklyPortfolioInsight(
  input: WeeklyPortfolioInsightInput,
): WeeklyPortfolioInsightOutput {
  const occupancyRate = Number(input.summary?.occupancyRate || 0);
  const openRequests = Number(input.summary?.openRequests || 0);
  const waitingOver48h = Number(input.summary?.waitingOver48h || 0);
  const overdueBalance = Number(input.summary?.overdueBalance || 0);
  const highRiskPropertyCount = Number(input.summary?.highRiskPropertyCount || 0);
  const averageHealthScore = Number(input.summary?.averageHealthScore || 0);
  const securityAlertCount = Number(input.summary?.securityAlertCount || 0);

  const wins = [];
  if (occupancyRate >= 90) wins.push(`Occupancy is holding at ${occupancyRate}%.`);
  if (waitingOver48h === 0) wins.push("No repairs are stuck in waiting beyond 48 hours.");
  if (highRiskPropertyCount === 0 && averageHealthScore > 0) wins.push("No properties are currently flagged as high risk.");
  if (wins.length === 0) wins.push("The portfolio has a readable operating picture and the next priorities are clear.");

  const risks = [];
  if (overdueBalance > 0) risks.push(`Overdue rent remains the biggest pressure at ${Math.round(overdueBalance)}.`);
  if (openRequests > 0) risks.push(`${openRequests} maintenance request${openRequests === 1 ? "" : "s"} still need follow-through.`);
  if (waitingOver48h > 0) risks.push(`${waitingOver48h} repair item${waitingOver48h === 1 ? "" : "s"} have been waiting more than 48 hours.`);
  if (highRiskPropertyCount > 0) risks.push(`${highRiskPropertyCount} propert${highRiskPropertyCount === 1 ? "y is" : "ies are"} in a high-risk band.`);
  if (securityAlertCount > 0) risks.push(`${securityAlertCount} open security alert${securityAlertCount === 1 ? "" : "s"} deserve review.`);
  if (risks.length === 0) risks.push("No severe cross-portfolio pressure is visible in the current snapshot.");

  const recommendedFocus = [];
  if (overdueBalance > 0) recommendedFocus.push("Review arrears follow-up and the tenants behind the overdue balance.");
  if (waitingOver48h > 0 || openRequests > 0) recommendedFocus.push("Move the oldest maintenance handoffs forward before more tenant friction builds.");
  if (highRiskPropertyCount > 0) recommendedFocus.push("Open the lowest-scoring properties and review the risk drivers behind them.");
  if (securityAlertCount > 0) recommendedFocus.push("Check open security alerts for unusual access or denied-event patterns.");
  if (recommendedFocus.length === 0) recommendedFocus.push("Use the quieter week to tighten document, maintenance, and rent routines.");

  const propertiesToWatch = (input.lowHealthProperties || [])
    .slice(0, 3)
    .map((row) => `${String(row.label || "Property")} (${healthLabel(row.category)}${row.score != null ? `, score ${Math.round(Number(row.score))}` : ""})`);

  const cashflowNotes = [];
  if (overdueBalance > 0) cashflowNotes.push(`Overdue balance: ${Math.round(overdueBalance)}.`);
  if (occupancyRate < 100) cashflowNotes.push(`Occupancy is ${occupancyRate}%, so vacancy drag is still present.`);
  if (averageHealthScore > 0) cashflowNotes.push(`Average property health score: ${Math.round(averageHealthScore)}.`);
  if (cashflowNotes.length === 0) cashflowNotes.push("Cashflow pressure looks calm in the current weekly snapshot.");

  return {
    headline: risks[0] || wins[0],
    wins,
    risks,
    recommended_focus: recommendedFocus,
    properties_to_watch: propertiesToWatch,
    cashflow_notes: cashflowNotes,
    confidence: "medium",
    source: "fallback",
    generated_at: input.generatedAt || new Date().toISOString(),
  };
}

export function buildWeeklyPortfolioPrompt(input: WeeklyPortfolioInsightInput) {
  return buildUntrustedJsonPrompt({
      summary: {
        occupancyRate: Number(input.summary?.occupancyRate || 0),
        openRequests: Number(input.summary?.openRequests || 0),
        waitingOver48h: Number(input.summary?.waitingOver48h || 0),
        overdueBalance: Number(input.summary?.overdueBalance || 0),
        highRiskPropertyCount: Number(input.summary?.highRiskPropertyCount || 0),
        averageHealthScore: Number(input.summary?.averageHealthScore || 0),
        securityAlertCount: Number(input.summary?.securityAlertCount || 0),
      },
      topAttentionItems: (input.topAttentionItems || []).slice(0, 5).map((item) => ({
        title: redactForAiPrompt(item?.title, 240),
        subtitle: redactForAiPrompt(item?.subtitle, 240),
        linkPath: item?.linkPath || null,
      })),
      lowHealthProperties: (input.lowHealthProperties || []).slice(0, 5).map((item) => ({
        propertyAlias: aliasForId("property", item?.propertyId || item?.label),
        score: item?.score == null ? null : Number(item.score),
        category: item?.category || null,
      })),
  });
}

export function parseWeeklyPortfolioInsightPayload(value: unknown): WeeklyPortfolioInsightOutput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Weekly portfolio insight payload must be an object");
  }

  const payload = value as Record<string, unknown>;
  const confidence = String(payload.confidence || "medium").trim().toLowerCase();
  const source = String(payload.source || "openai").trim().toLowerCase();

  return {
    headline: String(payload.headline || "").trim(),
    wins: Array.isArray(payload.wins)
      ? payload.wins.map((entry) => String(entry || "").trim()).filter(Boolean).slice(0, 4)
      : [],
    risks: Array.isArray(payload.risks)
      ? payload.risks.map((entry) => String(entry || "").trim()).filter(Boolean).slice(0, 4)
      : [],
    recommended_focus: Array.isArray(payload.recommended_focus)
      ? payload.recommended_focus.map((entry) => String(entry || "").trim()).filter(Boolean).slice(0, 4)
      : [],
    properties_to_watch: Array.isArray(payload.properties_to_watch)
      ? payload.properties_to_watch.map((entry) => String(entry || "").trim()).filter(Boolean).slice(0, 4)
      : [],
    cashflow_notes: Array.isArray(payload.cashflow_notes)
      ? payload.cashflow_notes.map((entry) => String(entry || "").trim()).filter(Boolean).slice(0, 4)
      : [],
    confidence: (["low", "medium", "high"].includes(confidence) ? confidence : "medium") as WeeklyPortfolioInsightOutput["confidence"],
    source: (source === "fallback" ? "fallback" : "openai"),
    generated_at: String(payload.generated_at || new Date().toISOString()),
  };
}

export function buildWeeklyPortfolioSourceHash(input: WeeklyPortfolioInsightInput) {
  const summary = input.summary || {};
  const topItems = (input.topAttentionItems || [])
    .map((item) => [item.title || "", item.subtitle || "", item.linkPath || ""].join(":"))
    .join("|");
  const properties = (input.lowHealthProperties || [])
    .map((item) => [item.propertyId || "", item.label || "", item.score || "", item.category || ""].join(":"))
    .join("|");

  return [
    input.accountId,
    summary.occupancyRate || 0,
    summary.openRequests || 0,
    summary.waitingOver48h || 0,
    summary.overdueBalance || 0,
    summary.highRiskPropertyCount || 0,
    summary.averageHealthScore || 0,
    summary.securityAlertCount || 0,
    topItems,
    properties,
  ].join("::");
}
