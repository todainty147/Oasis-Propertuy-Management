import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "../../");

const sql = readFileSync(path.join(repoRoot, "supabase/command_center_items.sql"), "utf8");
const pageSource = readFileSync(path.join(repoRoot, "src/pages/CommandCenterPage.jsx"), "utf8");
const messages = readFileSync(path.join(repoRoot, "src/i18n/messages.js"), "utf8");

describe("pending_cancellation_request command center SQL", () => {
  it("defines the pending_cancellation_request CTE", () => {
    expect(sql).toContain("pending_cancellation_requests as (");
  });

  it("uses item_type pending_cancellation_request", () => {
    expect(sql).toContain("'pending_cancellation_request'::text as item_type");
  });

  it("uses work_orders_pending_cancellation view (which pre-filters on pending_cancel_request)", () => {
    expect(sql).toContain("work_orders_pending_cancellation wo");
  });

  it("excludes completed and cancelled work orders", () => {
    const block = sql.slice(sql.indexOf("pending_cancellation_requests as ("), sql.indexOf("recently_updated_open"));
    expect(block).toContain("completed");
    expect(block).toContain("cancelled");
  });

  it("is included in the limited_work_order_items union", () => {
    const union = sql.slice(sql.indexOf("work_order_without_contractor"), sql.indexOf("invoice_awaiting_approval"));
    expect(union).toContain("pending_cancellation_requests");
  });

  it("assigns severity action and bucket action", () => {
    const block = sql.slice(sql.indexOf("pending_cancellation_requests as ("), sql.indexOf("recently_updated_open"));
    expect(block).toContain("'action'::text as severity");
    expect(block).toContain("'action'::text as bucket");
  });

  it("links to the work order detail page", () => {
    const block = sql.slice(sql.indexOf("pending_cancellation_requests as ("), sql.indexOf("recently_updated_open"));
    expect(block).toContain("'/work-orders/' || wo.id::text");
  });
});

describe("long_vacant_property command center SQL", () => {
  it("defines the long_vacant_properties CTE", () => {
    expect(sql).toContain("long_vacant_properties as (");
  });

  it("uses item_type long_vacant_property", () => {
    expect(sql).toContain("'long_vacant_property'::text as item_type");
  });

  it("uses limited_property_items limiter", () => {
    expect(sql).toContain("limited_property_items as (");
    expect(sql).toContain("long_vacant_properties");
  });

  it("is included in the unioned final CTE", () => {
    const unionBlock = sql.slice(sql.indexOf("unioned as ("), sql.indexOf("ordered as ("));
    expect(unionBlock).toContain("limited_property_items");
  });

  it("filters properties with no active tenant", () => {
    const block = sql.slice(sql.indexOf("long_vacant_properties as ("), sql.indexOf("limited_property_items"));
    expect(block).toContain("not exists");
    expect(block).toContain("archived_at is null");
  });

  it("applies a 30-day vacancy threshold", () => {
    const block = sql.slice(sql.indexOf("long_vacant_properties as ("), sql.indexOf("limited_property_items"));
    expect(block).toContain("30 days");
  });

  it("links to the property detail page", () => {
    const block = sql.slice(sql.indexOf("long_vacant_properties as ("), sql.indexOf("limited_property_items"));
    expect(block).toContain("'/properties/' || p.id::text");
  });

  it("scopes to p_account_id", () => {
    const block = sql.slice(sql.indexOf("long_vacant_properties as ("), sql.indexOf("limited_property_items"));
    expect(block).toContain("p_account_id");
  });
});

describe("CommandCenterPage realtime subscriptions", () => {
  it("subscribes to external_marketplace_jobs", () => {
    expect(pageSource).toContain("external_marketplace_jobs");
    expect(pageSource).toContain("command-center-marketplace");
  });

  it("subscribes to properties table for vacancy tracking", () => {
    expect(pageSource).toContain('"properties"');
    expect(pageSource).toContain("command-center-properties");
  });
});

describe("CommandCenterPage category filter", () => {
  it("renders a CategoryFilter component", () => {
    expect(pageSource).toContain("CategoryFilter");
    expect(pageSource).toContain("activeCategory");
    expect(pageSource).toContain("setActiveCategory");
  });

  it("passes category filter to all four section groups", () => {
    const urgentSection = pageSource.includes("view.groups.urgent.filter");
    const actionSection = pageSource.includes("view.groups.action.filter");
    const upcomingSection = pageSource.includes("view.groups.upcoming.filter");
    const recentSection = pageSource.includes("view.groups.recent.filter");
    expect(urgentSection).toBe(true);
    expect(actionSection).toBe(true);
    expect(upcomingSection).toBe(true);
    expect(recentSection).toBe(true);
  });

  it("ALL_CATEGORIES includes security, finance, maintenance, contractor, lease", () => {
    expect(pageSource).toContain('"security"');
    expect(pageSource).toContain('"finance"');
    expect(pageSource).toContain('"maintenance"');
    expect(pageSource).toContain('"contractor"');
    expect(pageSource).toContain('"lease"');
  });

  it("categoryClasses has a case for security", () => {
    const classesBlock = pageSource.slice(pageSource.indexOf("function categoryClasses"), pageSource.indexOf("function isFinancialApprovalItem"));
    expect(classesBlock).toContain('case "security"');
  });
});

describe("i18n keys for Epic 3 new item types", () => {
  const requiredKinds = [
    "attentionCenter.kind.security_alert",
    "attentionCenter.kind.long_vacant_property",
    "attentionCenter.kind.pending_cancellation_request",
    "commandCenter.filter.label",
    "commandCenter.filter.all",
  ];

  for (const key of requiredKinds) {
    it(`declares i18n key "${key}" in all locales`, () => {
      const count = (messages.match(new RegExp(`"${key}"`, "g")) || []).length;
      expect(count).toBeGreaterThanOrEqual(3);
    });
  }
});
