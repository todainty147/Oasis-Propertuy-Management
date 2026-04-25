import { describe, expect, it } from "vitest";

import {
  buildAttentionSourceHash,
  buildFallbackAttentionInsight,
  parseAttentionInsightPayload,
} from "../../supabase/functions/_shared/attentionInsight.ts";

describe("attention insight helper contracts", () => {
  it("builds a stable fallback insight from queue facts", () => {
    const result = buildFallbackAttentionInsight({
      accountId: "account-1",
      generatedAt: "2026-04-25T12:00:00.000Z",
      summary: {
        urgentCount: 2,
        actionCount: 4,
        overdueAmount: 1250,
      },
      items: [
        {
          id: "wo-1",
          title: "Blocked repair follow-up",
          category: "maintenance",
          severity: "urgent",
          entityType: "work_order",
          entityId: "wo-1",
          linkPath: "/maintenance-inbox?status=waiting",
          ageHours: 52,
        },
      ],
    });

    expect(result.priority).toBe("high");
    expect(result.source).toBe("fallback");
    expect(result.summary).toContain("Blocked repair follow-up");
    expect(result.suggested_actions[0]).toMatchObject({
      action_type: "review",
      entity_type: "work_order",
      entity_id: "wo-1",
      link_path: "/maintenance-inbox?status=waiting",
    });
  });

  it("parses and normalizes structured model payloads", () => {
    const result = parseAttentionInsightPayload({
      summary: "Review the contractor queue first.",
      priority: "urgent",
      top_reasons: ["2 repairs are blocked"],
      suggested_actions: [
        {
          label: "Open the blocked repairs list",
          action_type: "assign_contractor",
          entity_type: "work_order",
          entity_id: "wo-1",
          link_path: "/maintenance-inbox?woStatus=blocked",
        },
      ],
      confidence: "high",
      source: "openai",
      generated_at: "2026-04-25T12:00:00.000Z",
    });

    expect(result).toMatchObject({
      priority: "urgent",
      confidence: "high",
      source: "openai",
    });
    expect(result.suggested_actions[0].link_path).toBe("/maintenance-inbox?woStatus=blocked");
  });

  it("changes the source hash when queue facts change", () => {
    const left = buildAttentionSourceHash({
      accountId: "account-1",
      summary: { urgentCount: 1, actionCount: 2, overdueAmount: 0 },
      items: [{ id: "a", title: "One" }],
    });
    const right = buildAttentionSourceHash({
      accountId: "account-1",
      summary: { urgentCount: 2, actionCount: 2, overdueAmount: 0 },
      items: [{ id: "a", title: "One" }],
    });

    expect(left).not.toBe(right);
  });
});

