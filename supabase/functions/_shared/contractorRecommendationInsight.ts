import { aliasForId, buildUntrustedJsonPrompt, redactForAiPrompt } from "./aiSafety.ts";

export type ContractorRecommendationContractor = {
  id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  userId?: string | null;
};

export type ContractorRecommendationHistoryRow = {
  contractorId?: string | null;
  contractorUserId?: string | null;
  contractorName?: string | null;
  propertyId?: string | null;
  status?: string | null;
  quoteAmount?: number | null;
  invoiceAmount?: number | null;
  assignedAt?: string | null;
  acknowledgedAt?: string | null;
  acknowledgementDueAt?: string | null;
  rating?: number | null;
};

export type ContractorRecommendationInput = {
  accountId: string;
  requestId: string;
  generatedAt?: string | null;
  request: {
    id: string;
    title?: string | null;
    description?: string | null;
    priority?: string | null;
    propertyId?: string | null;
    propertyLabel?: string | null;
  };
  suggestedTrade?: string | null;
  contractors?: ContractorRecommendationContractor[] | null;
  history?: ContractorRecommendationHistoryRow[] | null;
};

export type ContractorRecommendationOutput = {
  request_id: string;
  request_title: string;
  recommended_contractor_id: string | null;
  recommended_contractor_name: string;
  reason: string;
  alternatives: Array<{
    contractor_id: string;
    contractor_name: string;
    reason: string;
  }>;
  missing_data_warning: string | null;
  facts_used: string[];
  confidence: "low" | "medium" | "high";
  source: "openai" | "fallback";
  generated_at: string;
};

function lower(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function matchesTrade(haystack: string, trade: string) {
  const combined = `${haystack} ${trade}`.toLowerCase();
  if (/(plumb|heating|boiler|pipe|leak|drain|tap|sink|toilet)/.test(combined)) return "plumbing";
  if (/(electri|socket|wire|light|power|fuse)/.test(combined)) return "electrical";
  if (/(clean|garden|exterior|grounds)/.test(combined)) return "cleaning";
  if (/(appliance|fridge|oven|dishwasher|washing machine)/.test(combined)) return "appliance";
  return "general";
}

function contractorMatchesHistoryContractor(
  contractor: ContractorRecommendationContractor,
  row: ContractorRecommendationHistoryRow,
) {
  if (contractor.userId && row.contractorUserId && contractor.userId === row.contractorUserId) return true;
  const contractorName = lower(contractor.name);
  const historyName = lower(row.contractorName);
  return contractorName && historyName && contractorName === historyName;
}

function summarizeFacts(input: ContractorRecommendationInput, chosenName: string, matches: ContractorRecommendationHistoryRow[]) {
  const facts: string[] = [];
  if (input.request.propertyLabel) facts.push(`Property: ${input.request.propertyLabel}`);
  if (input.suggestedTrade) facts.push(`Suggested trade: ${input.suggestedTrade}`);
  if (chosenName) facts.push(`Recommended contractor: ${chosenName}`);
  if (matches.length > 0) facts.push(`Comparable jobs reviewed: ${matches.length}`);
  const avgRating = average(matches.map((row) => Number(row.rating || 0)).filter((value) => value > 0));
  if (avgRating != null) facts.push(`Average rating: ${avgRating.toFixed(1)}/5`);
  const avgInvoice = average(matches.map((row) => Number(row.invoiceAmount || row.quoteAmount || 0)).filter((value) => value > 0));
  if (avgInvoice != null) facts.push(`Typical spend: ${Math.round(avgInvoice)}`);
  return facts.slice(0, 6);
}

function average(values: number[]) {
  if (!Array.isArray(values) || values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function acknowledgementHours(row: ContractorRecommendationHistoryRow) {
  const assigned = row.assignedAt ? new Date(row.assignedAt).getTime() : Number.NaN;
  const acknowledged = row.acknowledgedAt ? new Date(row.acknowledgedAt).getTime() : Number.NaN;
  if (!Number.isFinite(assigned) || !Number.isFinite(acknowledged) || acknowledged < assigned) return null;
  return (acknowledged - assigned) / 36e5;
}

function scoreContractor(
  contractor: ContractorRecommendationContractor,
  input: ContractorRecommendationInput,
) {
  const history = (input.history || []).filter((row) => contractorMatchesHistoryContractor(contractor, row));
  const tradeKey = matchesTrade(
    `${input.request.title || ""} ${input.request.description || ""} ${contractor.name || ""}`,
    input.suggestedTrade || "",
  );

  const propertyMatches = history.filter((row) => row.propertyId && row.propertyId === input.request.propertyId);
  const completed = history.filter((row) => ["completed", "in_progress"].includes(lower(row.status)));
  const ratings = history.map((row) => Number(row.rating || 0)).filter((value) => value > 0);
  const avgRating = average(ratings);
  const ackHours = average(
    history
      .map((row) => acknowledgementHours(row))
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value)),
  );
  const invoiceAvg = average(history.map((row) => Number(row.invoiceAmount || row.quoteAmount || 0)).filter((value) => value > 0));
  const score =
    (propertyMatches.length * 3) +
    (completed.length * 2) +
    (avgRating || 0) +
    (ackHours == null ? 0 : Math.max(0, 6 - Math.min(6, ackHours))) +
    (tradeKey === "general" ? 1 : 2);

  const reasons = [
    propertyMatches.length > 0 ? `${propertyMatches.length} related job${propertyMatches.length === 1 ? "" : "s"} at this property` : null,
    completed.length > 0 ? `${completed.length} completed or active similar assignment${completed.length === 1 ? "" : "s"}` : null,
    avgRating != null ? `average rating ${avgRating.toFixed(1)}/5` : null,
    ackHours != null ? `average acknowledgement ${ackHours.toFixed(1)}h` : null,
    invoiceAvg != null ? `typical invoice around ${Math.round(invoiceAvg)}` : null,
  ].filter(Boolean) as string[];

  return {
    contractor,
    score,
    history,
    reasons,
  };
}

export function buildFallbackContractorRecommendation(
  input: ContractorRecommendationInput,
): ContractorRecommendationOutput {
  const candidates = (input.contractors || []).map((contractor) => scoreContractor(contractor, input));
  candidates.sort((left, right) => right.score - left.score || left.contractor.name?.localeCompare(right.contractor.name || "") || 0);

  const best = candidates[0];
  const alternatives = candidates.slice(1, 3).map((entry) => ({
    contractor_id: entry.contractor.id,
    contractor_name: String(entry.contractor.name || entry.contractor.email || "Contractor").trim(),
    reason: entry.reasons[0] || "Available contractor with limited historical signal.",
  }));

  const recommendationName = best
    ? String(best.contractor.name || best.contractor.email || "Contractor").trim()
    : "No clear contractor match";
  const reason = best
    ? (best.reasons.length > 0
      ? `Suggested ${recommendationName} because ${best.reasons.join(", ")}.`
      : `Suggested ${recommendationName} because they are an active contractor on this account.`)
    : "No active contractor has enough signal yet. Pick the contractor with the clearest trade fit and fastest acknowledgement history.";

  return {
    request_id: input.requestId,
    request_title: String(input.request?.title || "Maintenance request").trim(),
    recommended_contractor_id: best?.contractor.id || null,
    recommended_contractor_name: recommendationName,
    reason,
    alternatives,
    missing_data_warning: candidates.length === 0
      ? "No active contractors are available on this account yet."
      : candidates.every((entry) => entry.history.length === 0)
        ? "Historical contractor signal is still thin, so this recommendation is mostly based on current availability."
        : null,
    facts_used: summarizeFacts(input, recommendationName, best?.history || []),
    confidence: best?.history?.length >= 3 ? "high" : best?.history?.length >= 1 ? "medium" : "low",
    source: "fallback",
    generated_at: input.generatedAt || new Date().toISOString(),
  };
}

export function buildContractorRecommendationPrompt(input: ContractorRecommendationInput) {
  return buildUntrustedJsonPrompt({
      requestId: input.requestId,
      request: {
        title: redactForAiPrompt(input.request?.title),
        description: redactForAiPrompt(input.request?.description, 1_200),
        priority: String(input.request?.priority || ""),
        propertyAlias: aliasForId("property", input.request?.propertyId || input.request?.propertyLabel),
      },
      suggestedTrade: String(input.suggestedTrade || ""),
      contractors: (input.contractors || []).slice(0, 12).map((contractor) => ({
        id: contractor.id,
        alias: aliasForId("contractor", contractor.id || contractor.userId || contractor.name || contractor.email),
      })),
      contractorHistory: (input.history || []).slice(0, 80).map((row) => ({
        contractorAlias: aliasForId("contractor", row.contractorUserId || row.contractorName || "contractor"),
        propertyAlias: aliasForId("property", row.propertyId || input.request?.propertyId || "property"),
        status: row.status || "",
        quoteAmount: Number(row.quoteAmount || 0),
        invoiceAmount: Number(row.invoiceAmount || 0),
        rating: row.rating == null ? null : Number(row.rating),
        acknowledgementHours: acknowledgementHours(row),
      })),
  });
}

export function parseContractorRecommendationPayload(value: unknown): ContractorRecommendationOutput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Contractor recommendation payload must be an object");
  }

  const payload = value as Record<string, unknown>;
  const confidence = lower(String(payload.confidence || "medium"));
  const source = lower(String(payload.source || "openai"));

  return {
    request_id: String(payload.request_id || "").trim(),
    request_title: String(payload.request_title || "").trim(),
    recommended_contractor_id: payload.recommended_contractor_id == null ? null : String(payload.recommended_contractor_id),
    recommended_contractor_name: String(payload.recommended_contractor_name || "").trim(),
    reason: String(payload.reason || "").trim(),
    alternatives: Array.isArray(payload.alternatives)
      ? payload.alternatives
          .filter((entry) => entry && typeof entry === "object")
          .map((entry) => {
            const record = entry as Record<string, unknown>;
            return {
              contractor_id: String(record.contractor_id || "").trim(),
              contractor_name: String(record.contractor_name || "").trim(),
              reason: String(record.reason || "").trim(),
            };
          })
          .filter((entry) => entry.contractor_id && entry.contractor_name)
      : [],
    missing_data_warning: payload.missing_data_warning == null ? null : String(payload.missing_data_warning).trim(),
    facts_used: Array.isArray(payload.facts_used)
      ? payload.facts_used.map((entry) => String(entry || "").trim()).filter(Boolean).slice(0, 6)
      : [],
    confidence: (["low", "medium", "high"].includes(confidence) ? confidence : "medium") as ContractorRecommendationOutput["confidence"],
    source: (source === "fallback" ? "fallback" : "openai"),
    generated_at: String(payload.generated_at || new Date().toISOString()),
  };
}

export function buildContractorRecommendationSourceHash(input: ContractorRecommendationInput) {
  const contractorFingerprint = (input.contractors || [])
    .map((contractor) => [contractor.id, contractor.userId || "", contractor.name || ""].join(":"))
    .join("|");
  const historyFingerprint = (input.history || [])
    .slice(0, 80)
    .map((row) => [
      row.contractorUserId || "",
      row.contractorName || "",
      row.propertyId || "",
      row.status || "",
      row.invoiceAmount || row.quoteAmount || "",
      row.rating || "",
      row.assignedAt || "",
      row.acknowledgedAt || "",
    ].join(":"))
    .join("|");

  return [
    input.accountId,
    input.requestId,
    input.request?.title || "",
    input.request?.description || "",
    input.request?.priority || "",
    input.request?.propertyId || "",
    input.suggestedTrade || "",
    contractorFingerprint,
    historyFingerprint,
  ].join("::");
}
