import { aliasForId, buildUntrustedJsonPrompt, redactForAiPrompt } from "./aiSafety.ts";

export type AttentionInsightInput = {
  accountId: string;
  generatedAt?: string | null;
  overdueAmount?: number;
  items?: AttentionInsightItem[];
  summary?: {
    urgentCount?: number;
    actionCount?: number;
    upcomingCount?: number;
    recentCount?: number;
    unreadAlertsCount?: number;
    overdueAmount?: number;
    propertiesWithIssuesCount?: number;
  } | null;
};

export type AttentionInsightItem = {
  id?: string | null;
  kind?: string | null;
  category?: string | null;
  severity?: string | null;
  bucket?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  title?: string | null;
  body?: string | null;
  linkPath?: string | null;
  propertyLabel?: string | null;
  tenantLabel?: string | null;
  entityLabel?: string | null;
  amount?: number | null;
  ageHours?: number | null;
  dueDays?: number | null;
};

export type AttentionInsightOutput = {
  summary: string;
  priority: "low" | "medium" | "high" | "urgent";
  top_reasons: string[];
  suggested_actions: Array<{
    label: string;
    action_type:
      | "review"
      | "assign_contractor"
      | "chase_payment"
      | "check_property"
      | "review_security";
    entity_type: string;
    entity_id: string | null;
    link_path: string | null;
  }>;
  confidence: "low" | "medium" | "high";
  source: "openai" | "fallback";
  generated_at: string;
};

type PromptInput = AttentionInsightInput & {
  maxActions?: number;
};

function normalizePriority(input: AttentionInsightInput): AttentionInsightOutput["priority"] {
  const urgentCount = Number(input.summary?.urgentCount || 0);
  const actionCount = Number(input.summary?.actionCount || 0);
  const overdueAmount = Number(input.summary?.overdueAmount ?? input.overdueAmount ?? 0);

  if (urgentCount >= 3 || overdueAmount >= 2500) return "urgent";
  if (urgentCount >= 1 || actionCount >= 6 || overdueAmount >= 750) return "high";
  if (actionCount >= 1) return "medium";
  return "low";
}

function labelForAction(item: AttentionInsightItem) {
  const title = String(item.title || item.entityLabel || item.propertyLabel || item.kind || "Review item").trim();
  if (/overdue|rent|arrears|payment/i.test(title)) return `Review ${title}`;
  if (/security|alert/i.test(title)) return `Review ${title}`;
  if (/contractor|work order|repair|maintenance/i.test(title)) return `Move ${title} forward`;
  return `Review ${title}`;
}

function inferActionType(item: AttentionInsightItem): AttentionInsightOutput["suggested_actions"][number]["action_type"] {
  const haystack = [
    item.category,
    item.kind,
    item.title,
    item.body,
  ]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");

  if (haystack.includes("security")) return "review_security";
  if (haystack.includes("rent") || haystack.includes("payment") || haystack.includes("arrears")) {
    return "chase_payment";
  }
  if (haystack.includes("contractor")) return "assign_contractor";
  if (haystack.includes("property")) return "check_property";
  return "review";
}

function compactReason(item: AttentionInsightItem) {
  const title = String(item.title || item.kind || "Item").trim();
  const parts = [title];

  if (item.propertyLabel) parts.push(item.propertyLabel);
  if (item.tenantLabel) parts.push(item.tenantLabel);
  if (Number.isFinite(Number(item.amount)) && Number(item.amount) > 0) {
    parts.push(`amount ${Number(item.amount).toFixed(0)}`);
  } else if (Number.isFinite(Number(item.ageHours)) && Number(item.ageHours) > 0) {
    parts.push(`${Math.round(Number(item.ageHours))}h open`);
  } else if (Number.isFinite(Number(item.dueDays))) {
    const dueDays = Number(item.dueDays);
    parts.push(dueDays < 0 ? `${Math.abs(dueDays)}d overdue` : dueDays === 0 ? "due today" : `due in ${dueDays}d`);
  }

  return parts.join(" • ");
}

function fallbackSummary(input: AttentionInsightInput) {
  const urgentCount = Number(input.summary?.urgentCount || 0);
  const actionCount = Number(input.summary?.actionCount || 0);
  const overdueAmount = Number(input.summary?.overdueAmount ?? input.overdueAmount ?? 0);
  const topItem = input.items?.[0];

  if (urgentCount > 0 && topItem?.title) {
    return `${urgentCount} urgent item${urgentCount === 1 ? "" : "s"} need attention. Start with ${topItem.title}.`;
  }
  if (actionCount > 0 && topItem?.title) {
    return `${actionCount} action item${actionCount === 1 ? "" : "s"} are active. ${topItem.title} is a good first review.`;
  }
  if (overdueAmount > 0) {
    return `There is still overdue balance to review. Finance follow-up is the clearest next move today.`;
  }
  return "The queue looks under control right now. Keep an eye on recent changes and upcoming follow-up.";
}

export function buildFallbackAttentionInsight(input: AttentionInsightInput): AttentionInsightOutput {
  const items = Array.isArray(input.items) ? input.items.filter(Boolean) : [];
  const topReasons = items.slice(0, 3).map(compactReason);
  const suggestedActions = items.slice(0, 3).map((item) => ({
    label: labelForAction(item),
    action_type: inferActionType(item),
    entity_type: String(item.entityType || "portfolio"),
    entity_id: item.entityId ? String(item.entityId) : null,
    link_path: item.linkPath ? String(item.linkPath) : null,
  }));

  return {
    summary: fallbackSummary(input),
    priority: normalizePriority(input),
    top_reasons: topReasons.length > 0 ? topReasons : ["No urgent blockers are visible in the current queue."],
    suggested_actions: suggestedActions,
    confidence: items.length > 0 ? "medium" : "low",
    source: "fallback",
    generated_at: input.generatedAt || new Date().toISOString(),
  };
}

export function buildAttentionPrompt(input: PromptInput) {
  const normalized = {
    summary: {
      urgentCount: Number(input.summary?.urgentCount || 0),
      actionCount: Number(input.summary?.actionCount || 0),
      upcomingCount: Number(input.summary?.upcomingCount || 0),
      recentCount: Number(input.summary?.recentCount || 0),
      unreadAlertsCount: Number(input.summary?.unreadAlertsCount || 0),
      overdueAmount: Number(input.summary?.overdueAmount ?? input.overdueAmount ?? 0),
      propertiesWithIssuesCount: Number(input.summary?.propertiesWithIssuesCount || 0),
    },
    items: (input.items || []).slice(0, 12).map((item) => ({
      id: String(item.id || ""),
      title: redactForAiPrompt(item.title, 240),
      body: redactForAiPrompt(item.body, 500),
      category: String(item.category || ""),
      severity: String(item.severity || ""),
      entityType: String(item.entityType || ""),
      entityId: item.entityId ? String(item.entityId) : null,
      linkPath: item.linkPath ? String(item.linkPath) : null,
      propertyAlias: item.propertyLabel ? aliasForId("property", item.entityId || item.propertyLabel) : null,
      tenantAlias: item.tenantLabel ? "tenant:related" : null,
      amount: Number(item.amount || 0),
      ageHours: Number(item.ageHours || 0),
      dueDays: item.dueDays == null ? null : Number(item.dueDays),
    })),
  };

  return buildUntrustedJsonPrompt(normalized);
}

export function parseAttentionInsightPayload(value: unknown): AttentionInsightOutput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Attention insight payload must be an object");
  }

  const payload = value as Record<string, unknown>;
  const topReasons = Array.isArray(payload.top_reasons) ? payload.top_reasons.map((entry) => String(entry || "").trim()).filter(Boolean) : [];
  const suggestedActions = Array.isArray(payload.suggested_actions)
    ? payload.suggested_actions
        .filter((entry) => entry && typeof entry === "object")
        .map((entry) => {
          const record = entry as Record<string, unknown>;
          return {
            label: String(record.label || "").trim(),
            action_type: String(record.action_type || "review").trim() as AttentionInsightOutput["suggested_actions"][number]["action_type"],
            entity_type: String(record.entity_type || "portfolio").trim(),
            entity_id: record.entity_id == null ? null : String(record.entity_id),
            link_path: record.link_path == null ? null : String(record.link_path),
          };
        })
        .filter((entry) => entry.label)
    : [];

  const priority = String(payload.priority || "medium").trim().toLowerCase();
  const confidence = String(payload.confidence || "medium").trim().toLowerCase();
  const source = String(payload.source || "openai").trim().toLowerCase();

  return {
    summary: String(payload.summary || "").trim(),
    priority: (["low", "medium", "high", "urgent"].includes(priority) ? priority : "medium") as AttentionInsightOutput["priority"],
    top_reasons: topReasons.slice(0, 5),
    suggested_actions: suggestedActions.slice(0, 4),
    confidence: (["low", "medium", "high"].includes(confidence) ? confidence : "medium") as AttentionInsightOutput["confidence"],
    source: (source === "fallback" ? "fallback" : "openai"),
    generated_at: String(payload.generated_at || new Date().toISOString()),
  };
}

export function buildAttentionSourceHash(input: AttentionInsightInput) {
  const summary = input.summary || {};
  const itemFingerprint = (input.items || [])
    .slice(0, 12)
    .map((item) => [
      item.id || "",
      item.severity || "",
      item.category || "",
      item.entityId || "",
      item.linkPath || "",
      item.title || "",
      item.ageHours ?? "",
      item.dueDays ?? "",
      item.amount ?? "",
    ].join(":"))
    .join("|");

  return [
    input.accountId,
    summary.urgentCount || 0,
    summary.actionCount || 0,
    summary.upcomingCount || 0,
    summary.overdueAmount ?? input.overdueAmount ?? 0,
    itemFingerprint,
  ].join("::");
}
