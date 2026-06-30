import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CHECKATRADE_CATEGORY_IDS_VERIFIED } from "../../src/config/checkatradeCategoryMap";

const root = path.resolve(__dirname, "../..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

// ---------------------------------------------------------------------------
// E-074 — Checkatrade go-live gating contracts
// Scope: Checkatrade only. Fixflo and Fixly remain out of scope.
// ---------------------------------------------------------------------------

describe("E-074: Checkatrade go-live gate — SQL contracts", () => {
  it("repair SQL adds category_ids_verified column defaulting to false", () => {
    const sql = read("supabase/phase2_repair_e066b_e077_e074.sql");
    expect(sql).toContain("add column if not exists category_ids_verified boolean not null default false");
  });

  it("repair SQL creates enforce_checkatrade_go_live_gate trigger function", () => {
    const sql = read("supabase/phase2_repair_e066b_e077_e074.sql");
    expect(sql).toContain("enforce_checkatrade_go_live_gate");
    expect(sql).toContain("live_submission_enabled");
    expect(sql).toContain("category_ids_verified is not true");
    expect(sql).toContain("create trigger tg_enforce_checkatrade_go_live_gate");
  });

  it("go-live gate trigger also blocks external_submission_url without verified IDs", () => {
    const sql = read("supabase/phase2_repair_e066b_e077_e074.sql");
    expect(sql).toContain("external_submission_url");
  });

  it("list_marketplace_integration_settings now returns category_ids_verified", () => {
    const sql = read("supabase/phase2_repair_e066b_e077_e074.sql");
    expect(sql).toContain("category_ids_verified boolean");
    expect(sql).toContain("category_ids_verified");
  });
});

describe("E-074: Checkatrade go-live gate — settings parser contract", () => {
  it("parseMarketplaceIntegrationSettingRow exposes categoryIdsVerified from DB response", () => {
    const contracts = read("src/services/rpcContracts.js");
    expect(contracts).toContain("categoryIdsVerified");
    expect(contracts).toContain("category_ids_verified");
  });
});

describe("E-074: Checkatrade go-live gate — category map contract", () => {
  it("CHECKATRADE_CATEGORY_IDS_VERIFIED is exported and false until IDs are verified", () => {
    expect(CHECKATRADE_CATEGORY_IDS_VERIFIED).toBe(false);
  });

  it("checkatradeCategoryMap.js documents the go-live verification requirement", () => {
    const cfg = read("src/config/checkatradeCategoryMap.js");
    expect(cfg).toContain("CHECKATRADE_CATEGORY_IDS_VERIFIED");
    expect(cfg).toContain("developer.checkatrade.com");
  });
});

describe("E-074: Checkatrade go-live gate — UI submit button contract", () => {
  it("submit button is gated on live_submission_enabled, not just enabled", () => {
    const panel = read("src/components/work-orders/ExternalMarketplacePanel.jsx");
    // The button must check configuration.live_submission_enabled
    expect(panel).toContain("live_submission_enabled");
    // The button must NOT be gated solely on enabled === true for the disabled state
    // (enabled alone is the staged state, not the live state)
    const submitDisabledPattern = /disabled=\{.*?enabled.*?!==.*?true.*?\}/;
    const buttonSection = panel.slice(panel.indexOf("submitApi"));
    // live_submission_enabled must appear in the button's disabled logic
    expect(buttonSection).toContain("live_submission_enabled");
  });

  it("staged account copy makes clear jobs will NOT be dispatched to contractors", () => {
    const panel = read("src/components/work-orders/ExternalMarketplacePanel.jsx");
    expect(panel).toContain("NOT");
    expect(panel).toContain("dispatched");
  });

  it("staged-state button shows non-live label, not 'Submit to Checkatrade API'", () => {
    const panel = read("src/components/work-orders/ExternalMarketplacePanel.jsx");
    expect(panel).toContain("submitApiLiveOnly");
  });

  it("Checkatrade disabled account copy still available (API not configured path)", () => {
    const panel = read("src/components/work-orders/ExternalMarketplacePanel.jsx");
    expect(panel).toContain("apiDisabled");
    expect(panel).toContain("Manual handoff");
  });

  it("Fixflo is not re-tested — remains out of scope (absent from live surface)", () => {
    const panel = read("src/components/work-orders/ExternalMarketplacePanel.jsx");
    // Fixflo should not appear in the UI panel — it is rejected by D-05
    expect(panel.toLowerCase()).not.toContain("fixflo");
  });

  it("Fixly manual handoff copy is still present and honest", () => {
    const panel = read("src/components/work-orders/ExternalMarketplacePanel.jsx");
    expect(panel).toContain("manualFixly");
    expect(panel).toContain("Fixly");
  });
});
