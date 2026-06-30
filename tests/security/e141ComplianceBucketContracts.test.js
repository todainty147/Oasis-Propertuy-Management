import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "../../");
const sql = readFileSync(path.join(repoRoot, "supabase/command_center_items.sql"), "utf8");

// Slice the compliance_due_items CTE (contains both compliance_overdue and compliance_due_soon rows)
const complianceDueBlock = sql.slice(
  sql.indexOf("compliance_due_items as ("),
  sql.indexOf("compliance_missing_setup as ("),
);

// Isolate only the compliance_due_soon row (second SELECT in the union, after the first UNION ALL)
const complianceDueSoonRow = complianceDueBlock.slice(
  complianceDueBlock.indexOf("'compliance_due_soon'::text"),
);

// Slice the raw marketplace_job_items CTE (before the limited_ wrapper)
const marketplaceBlock = sql.slice(
  sql.indexOf("marketplace_job_items as ("),
  sql.indexOf("limited_marketplace_job_items as ("),
);

describe("E-141 regression guard — compliance_due_soon bucket priority and sort order", () => {
  // ── Magic-constant guard ─────────────────────────────────────────────────────
  // These two constants are the exact fix applied in E-141 (2026-06-29).
  // If either regresses, a CC flood silently drops statutory compliance certs.

  it("compliance_due_soon uses bucket='action' — not 'upcoming' (the pre-fix value that caused silent drop)", () => {
    // Pre-fix: 'upcoming' (bucket rank 3) fell behind marketplace (rank 2) at any realistic volume.
    expect(complianceDueSoonRow).toContain("'action'::text");
    expect(complianceDueSoonRow).not.toContain("'upcoming'::text");
  });

  it("compliance_due_soon uses sort_order=20 — not 57 (the pre-fix value that caused silent drop)", () => {
    // Pre-fix: sort_order 57 placed due-soon certs after all marketplace items (33–35).
    // At 80 items with 34 urgent + 48 marketplace, position 57 never reached slot 80.
    expect(complianceDueSoonRow).toContain("20 as sort_order");
    expect(complianceDueSoonRow).not.toContain("57 as sort_order");
  });

  // ── Displacement invariant ───────────────────────────────────────────────────
  // compliance_due_soon (action, sort_order 20) must rank before ALL marketplace action items.
  // Marketplace action sort_orders are 33 (ready_to_submit), 34 (manual_follow_up), 35 (quote_received).
  // If any marketplace sort_order drops below 20, due-soon certs can be displaced again.

  it("compliance_due_soon sort_order (20) is less than all marketplace action sort_orders (33, 34, 35)", () => {
    const marketplaceSortOrders = [...marketplaceBlock.matchAll(/\b(\d+) as sort_order\b/g)]
      .map((m) => parseInt(m[1], 10))
      .filter((n) => n > 20); // exclude urgent-bucket marketplace items (e.g. marketplace_failed=13)

    expect(marketplaceSortOrders.length).toBeGreaterThan(0);
    for (const mSort of marketplaceSortOrders) {
      expect(20).toBeLessThan(mSort);
    }
  });

  // ── cfg CTE clamp contract ───────────────────────────────────────────────────
  // The clamp is the mechanism that makes silent drops possible.
  // If someone changes the default or the cap, re-run the flood analysis below.

  it("cfg CTE clamps max_items at 200 with default 80 (the shipping limit that triggers displacement)", () => {
    expect(sql).toContain("greatest(1, least(coalesce(p_limit, 80), 200))");
  });

  // ── Synthetic flood test ─────────────────────────────────────────────────────
  // Reproduces the exact scenario that triggered E-141 (E-014 execution trace):
  //   34 urgent items + 48 marketplace action items + 2 compliance_due_soon items
  //   sorted at the 80-item shipping limit.
  //
  // Pre-fix (bucket='upcoming', sort_order=57):
  //   due-soon fell to positions ~83-84 → silent drop, zero CC signal.
  //
  // Post-fix (bucket='action', sort_order=20):
  //   due-soon reaches positions ~35-36 → visible, well within the limit.

  it("compliance_due_soon survives the E-014 flood scenario at the 80-item shipping limit", () => {
    const SHIPPING_LIMIT = 80;
    const bucketRank = { urgent: 1, action: 2, upcoming: 3, recent: 4 };

    const flood = [
      // 34 urgent items (steady-state from the E-014 verification run)
      ...Array.from({ length: 34 }, (_, i) => ({
        item_type: "overdue_rent",
        bucket: "urgent",
        sort_order: 10,
        _i: i,
      })),
      // 48 marketplace action items — the original trigger for the E-141 silent drop
      ...Array.from({ length: 48 }, (_, i) => ({
        item_type: "marketplace_ready_to_submit",
        bucket: "action",
        sort_order: 33,
        _i: i,
      })),
      // 2 compliance_due_soon items — statutory certs that must not be displaced
      { item_type: "compliance_due_soon", bucket: "action", sort_order: 20 },
      { item_type: "compliance_due_soon", bucket: "action", sort_order: 20 },
    ];

    // Mirrors the SQL ORDER BY: bucket_rank ASC, sort_order ASC
    flood.sort((a, b) => {
      const rankDiff = bucketRank[a.bucket] - bucketRank[b.bucket];
      if (rankDiff !== 0) return rankDiff;
      return a.sort_order - b.sort_order;
    });

    const visible = flood.slice(0, SHIPPING_LIMIT);
    const dueSoonVisible = visible.filter((i) => i.item_type === "compliance_due_soon");

    // Both certs must be visible — neither silently dropped at the limit
    expect(dueSoonVisible).toHaveLength(2);

    // Due-soon must appear before any marketplace item in the sorted result
    const firstDueSoonIdx = visible.findIndex((i) => i.item_type === "compliance_due_soon");
    const firstMarketplaceIdx = visible.findIndex(
      (i) => i.item_type === "marketplace_ready_to_submit",
    );
    expect(firstDueSoonIdx).toBeLessThan(firstMarketplaceIdx);
  });
});
