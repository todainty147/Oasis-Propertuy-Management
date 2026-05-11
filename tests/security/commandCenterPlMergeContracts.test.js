// tests/security/commandCenterPlMergeContracts.test.js
//
// Service-layer contract tests for the PL compliance merge added to
// commandCenterService.getCommandCenterData().
//
// These tests verify:
//   - pl_compliance_checklist_command_items is called with the correct account
//   - PL items are merged into the final items array
//   - A PL RPC failure never blocks main command center results
//   - PL items are normalized through the same normalizeRpcItem path as main items
//   - The empty-account guard still short-circuits before any RPC call

import { beforeEach, describe, expect, it, vi } from "vitest";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";

const rpcMock                           = vi.fn();
const getDashboardSnapshotMock          = vi.fn();
const listPropertyOperationalHealthScoresMock = vi.fn();
const getPlComplianceCommandItemsMock   = vi.fn();

vi.mock("../../src/lib/supabase.js", () => ({
  supabase: { rpc: (...args) => rpcMock(...args) },
}));

vi.mock("../../src/services/dashboardService.js", () => ({
  getDashboardSnapshot: (...args) => getDashboardSnapshotMock(...args),
}));

vi.mock("../../src/services/propertyHealthScoreService.js", () => ({
  listPropertyOperationalHealthScores: (...args) => listPropertyOperationalHealthScoresMock(...args),
}));

vi.mock("../../src/services/complianceChecklistService.js", () => ({
  getPlComplianceCommandItems: (...args) => getPlComplianceCommandItemsMock(...args),
}));

// Minimal command-center row shape returned by both RPCs
function makeCcRow(overrides = {}) {
  return {
    item_key:         "test-item-key",
    item_type:        "overdue_rent",
    category:         "finance",
    severity:         "urgent",
    bucket:           "urgent",
    entity_type:      "tenant",
    entity_id:        "some-tenant-id",
    title:            "Test item",
    body:             "",
    link_path:        "/tenants/some-tenant-id",
    property_id:      null,
    property_label:   "—",
    tenant_id:        null,
    tenant_label:     "—",
    entity_label:     "",
    contractor_label: "",
    amount:           0,
    age_hours:        0,
    due_days:         0,
    created_at:       new Date().toISOString(),
    resolved_state:   false,
    source_table:     "payments",
    sort_order:       10,
    ...overrides,
  };
}

function makePlRow(overrides = {}) {
  return makeCcRow({
    item_key:     "pl-notarial-some-uuid",
    item_type:    "pl_missing_notarial_declaration",
    category:     "compliance",
    severity:     "action",
    bucket:       "action",
    entity_type:  "tenant",
    source_table: "compliance_checklist_items",
    sort_order:   19,
    ...overrides,
  });
}

describe("commandCenterService — PL compliance merge contracts", () => {
  const { accountA } = isolationFixtures.accounts;

  beforeEach(() => {
    rpcMock.mockReset();
    getDashboardSnapshotMock.mockReset();
    listPropertyOperationalHealthScoresMock.mockReset();
    getPlComplianceCommandItemsMock.mockReset();

    getDashboardSnapshotMock.mockResolvedValue({ overdue_amount: 0 });
    listPropertyOperationalHealthScoresMock.mockResolvedValue([]);
    rpcMock.mockResolvedValue({ data: [], error: null });
    getPlComplianceCommandItemsMock.mockResolvedValue([]);
  });

  it("calls getPlComplianceCommandItems with the correct account_id", async () => {
    const { getCommandCenterData } = await import("../../src/services/commandCenterService.js");
    await getCommandCenterData(accountA.id);
    expect(getPlComplianceCommandItemsMock).toHaveBeenCalledWith(accountA.id, 40);
  });

  it("does NOT call getPlComplianceCommandItems when account_id is null", async () => {
    const { getCommandCenterData } = await import("../../src/services/commandCenterService.js");
    await getCommandCenterData(null);
    expect(getPlComplianceCommandItemsMock).not.toHaveBeenCalled();
  });

  it("merges PL compliance items into the combined items array", async () => {
    const plRow = makePlRow();
    getPlComplianceCommandItemsMock.mockResolvedValue([plRow]);

    const { getCommandCenterData } = await import("../../src/services/commandCenterService.js");
    const result = await getCommandCenterData(accountA.id);

    const plItem = result.items.find((i) => i.id === plRow.item_key);
    expect(plItem).toBeDefined();
    expect(plItem.kind).toBe("pl_missing_notarial_declaration");
    expect(plItem.category).toBe("compliance");
    expect(plItem.source).toBe("compliance_checklist_items");
  });

  it("places an urgent PL item in the urgent bucket group", async () => {
    const urgentPl = makePlRow({
      item_key:     "pl-tax-overdue-uuid",
      item_type:    "pl_tax_office_deadline_overdue",
      severity:     "urgent",
      bucket:       "urgent",
    });
    getPlComplianceCommandItemsMock.mockResolvedValue([urgentPl]);

    const { getCommandCenterData } = await import("../../src/services/commandCenterService.js");
    const result = await getCommandCenterData(accountA.id);

    const urgentIds = result.groups.urgent.map((i) => i.id);
    expect(urgentIds).toContain(urgentPl.item_key);
  });

  it("places an action PL item in the action bucket group", async () => {
    const actionPl = makePlRow({
      item_key:  "pl-handover-uuid",
      item_type: "pl_missing_handover_protocol",
      severity:  "action",
      bucket:    "action",
    });
    getPlComplianceCommandItemsMock.mockResolvedValue([actionPl]);

    const { getCommandCenterData } = await import("../../src/services/commandCenterService.js");
    const result = await getCommandCenterData(accountA.id);

    const actionIds = result.groups.action.map((i) => i.id);
    expect(actionIds).toContain(actionPl.item_key);
  });

  it("does not fail when PL RPC throws — main items are still returned", async () => {
    rpcMock.mockResolvedValue({ data: [makeCcRow()], error: null });
    getPlComplianceCommandItemsMock.mockRejectedValue(new Error("PL RPC unavailable"));

    const { getCommandCenterData } = await import("../../src/services/commandCenterService.js");
    const result = await getCommandCenterData(accountA.id);

    // Main item is present despite PL failure
    expect(result.items.length).toBeGreaterThanOrEqual(1);
    expect(result.items.find((i) => i.id === "test-item-key")).toBeDefined();
  });

  it("does not fail when PL RPC returns null data", async () => {
    getPlComplianceCommandItemsMock.mockResolvedValue(null);

    const { getCommandCenterData } = await import("../../src/services/commandCenterService.js");
    await expect(getCommandCenterData(accountA.id)).resolves.toBeDefined();
  });

  it("counts PL compliance items in categoryCounts under 'compliance'", async () => {
    const plRow = makePlRow();
    getPlComplianceCommandItemsMock.mockResolvedValue([plRow]);

    const { getCommandCenterData } = await import("../../src/services/commandCenterService.js");
    const result = await getCommandCenterData(accountA.id);

    expect(result.categoryCounts.compliance).toBeGreaterThanOrEqual(1);
  });

  it("normalizes PL item linkPath to /compliance/poland", async () => {
    const plRow = makePlRow({ link_path: "/compliance/poland" });
    getPlComplianceCommandItemsMock.mockResolvedValue([plRow]);

    const { getCommandCenterData } = await import("../../src/services/commandCenterService.js");
    const result = await getCommandCenterData(accountA.id);

    const plItem = result.items.find((i) => i.id === plRow.item_key);
    expect(plItem?.linkPath).toBe("/compliance/poland");
  });

  it("does not duplicate PL items — one row produces one result item", async () => {
    const plRow = makePlRow();
    getPlComplianceCommandItemsMock.mockResolvedValue([plRow]);

    const { getCommandCenterData } = await import("../../src/services/commandCenterService.js");
    const result = await getCommandCenterData(accountA.id);

    const matchingItems = result.items.filter((i) => i.id === plRow.item_key);
    expect(matchingItems).toHaveLength(1);
  });

  it("still calls the main command_center_items RPC even when PL returns items", async () => {
    getPlComplianceCommandItemsMock.mockResolvedValue([makePlRow()]);

    const { getCommandCenterData } = await import("../../src/services/commandCenterService.js");
    await getCommandCenterData(accountA.id);

    expect(rpcMock).toHaveBeenCalledWith("command_center_items", {
      p_account_id: accountA.id,
      p_limit: 80,
    });
  });
});

// ── Import contract: complianceChecklistService is imported ───────────────

describe("commandCenterService import contract", () => {
  it("imports getPlComplianceCommandItems from complianceChecklistService", () => {
    const { readFileSync } = require("node:fs");
    const { fileURLToPath } = require("node:url");
    const serviceCode = readFileSync(
      new URL("../../src/services/commandCenterService.js", import.meta.url),
      "utf8",
    );
    expect(serviceCode).toContain("getPlComplianceCommandItems");
    expect(serviceCode).toContain("complianceChecklistService");
  });

  it("handles PL items alongside RR items in the same merge", () => {
    const { readFileSync } = require("node:fs");
    const serviceCode = readFileSync(
      new URL("../../src/services/commandCenterService.js", import.meta.url),
      "utf8",
    );
    // Both rrItems and plItems should be in the final items spread
    expect(serviceCode).toContain("...rrItems");
    expect(serviceCode).toContain("...plItems");
  });
});
