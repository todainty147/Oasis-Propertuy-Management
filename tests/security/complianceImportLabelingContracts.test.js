/**
 * P-009B: Compliance Import Labeling Gate — Contract Tests
 *
 * RB-02: An imported compliance date MUST be visibly distinguished from
 * a natively-recorded date wherever a landlord can see it.
 *
 * Test plan:
 *  PH-03  — imported compliance item renders "Attested import" label
 *  PH-03b — native compliance item does NOT render "Attested import" label
 *  RG-04  — marker wording is on the approved list; no forbidden words
 *  SQL-1  — SQL file adds import_batch_id column + trigger
 *  SQL-2  — SQL file registered in dbApplyRepoSql.js (RB-03)
 *  QR-1   — import_batch_id selected in COMPLIANCE_SELECT
 *  QR-2   — Drawer label distinguishes attested-import from "Manually entered"
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

// ── Approved wording ──────────────────────────────────────────────────────────
// Must contain at least one of these
const APPROVED_LABEL_WORDS = ["Attested import", "Attested import — not independently verified"];
// Must not contain any of these in the import label context
const FORBIDDEN_WORDS = ["verified compliance", "legally compliant", "proven", "certified", "independently verified compliance"];

describe("P-009B compliance import labeling gate", () => {

  // ── SQL structure ───────────────────────────────────────────────────────────

  it("SQL-1: compliance_import_labeling.sql adds import_batch_id column to tenancy_compliance_items", () => {
    const sql = read("supabase/compliance_import_labeling.sql");
    expect(sql).toContain("tenancy_compliance_items");
    expect(sql).toContain("import_batch_id");
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS import_batch_id/i);
    expect(sql).toContain("import_batches");  // FK reference
  });

  it("SQL-1: SQL file includes trigger to auto-set import_batch_id from provenance events", () => {
    const sql = read("supabase/compliance_import_labeling.sql");
    expect(sql).toContain("_set_compliance_item_import_batch");
    expect(sql).toContain("provenance_events");
    expect(sql).toContain("source_type = 'spreadsheet_import'");
    expect(sql).toContain("entity_type    = 'compliance_item'");
    expect(sql).toContain("AFTER INSERT ON public.provenance_events");
    // Trigger function must be SECURITY DEFINER to bypass RLS for the UPDATE
    expect(sql).toContain("SECURITY DEFINER");
  });

  it("SQL-1: SQL file includes back-fill UPDATE for pre-existing imported items", () => {
    const sql = read("supabase/compliance_import_labeling.sql");
    // Back-fill joins provenance_events to tenancy_compliance_items
    expect(sql).toContain("UPDATE public.tenancy_compliance_items");
    expect(sql).toContain("provenance_events");
    expect(sql).toContain("source_type = 'spreadsheet_import'");
  });

  it("SQL-1: trigger is idempotent — never overwrites an existing import_batch_id", () => {
    const sql = read("supabase/compliance_import_labeling.sql");
    // The WHERE clause must include a NULL guard so re-running is safe
    expect(sql).toContain("import_batch_id IS NULL");
  });

  it("SQL-2: compliance_import_labeling.sql is registered in dbApplyRepoSql.js (RB-03)", () => {
    const apply = read("scripts/dbApplyRepoSql.js");
    expect(apply).toContain("compliance_import_labeling.sql");
    // Must come AFTER spreadsheet_import_v1.sql (the table must exist first)
    const importIdx = apply.indexOf("spreadsheet_import_v1.sql");
    const labelIdx  = apply.indexOf("compliance_import_labeling.sql");
    expect(importIdx).toBeGreaterThan(-1);
    expect(labelIdx).toBeGreaterThan(importIdx);
  });

  // ── Read-path: COMPLIANCE_SELECT ────────────────────────────────────────────

  it("QR-1: import_batch_id is selected in COMPLIANCE_SELECT in legalSecurityService.js", () => {
    const svc = read("src/services/legalSecurityService.js");
    // Must appear in the COMPLIANCE_SELECT array (used by listComplianceSafeItems)
    expect(svc).toContain('"import_batch_id"');
    // Must appear before the closing bracket of COMPLIANCE_SELECT
    const selectStart = svc.indexOf("const COMPLIANCE_SELECT");
    const selectEnd   = svc.indexOf("].join", selectStart);
    expect(selectEnd).toBeGreaterThan(selectStart);
    const selectBlock = svc.slice(selectStart, selectEnd);
    expect(selectBlock).toContain('"import_batch_id"');
  });

  // ── Rendering: list view ────────────────────────────────────────────────────

  it("PH-03: ComplianceSafePage renders the Attested import badge when import_batch_id is set", () => {
    const page = read("src/pages/compliance/ComplianceSafePage.jsx");
    // The list row must conditionally render the badge based on import_batch_id
    expect(page).toContain("item.import_batch_id");
    expect(page).toContain("Attested import");
    // Must include a testid so integration tests can assert presence
    expect(page).toContain('data-testid="compliance-import-label"');
  });

  it("PH-03b: Attested import badge is conditional — native items (no import_batch_id) do not get it", () => {
    const page = read("src/pages/compliance/ComplianceSafePage.jsx");
    // The badge must be inside a conditional block, not rendered unconditionally
    // Verify the conditional surrounds the badge
    const badgeIdx = page.indexOf('"compliance-import-label"');
    expect(badgeIdx).toBeGreaterThan(-1);

    // Walk back to find the enclosing conditional
    const precedingCode = page.slice(Math.max(0, badgeIdx - 200), badgeIdx);
    expect(precedingCode).toContain("import_batch_id");
    // The condition must be a truthy check, not a negation
    expect(precedingCode).toMatch(/item\.import_batch_id\s*\?/);
  });

  // ── Rendering: detail drawer ────────────────────────────────────────────────

  it("QR-2: ComplianceSafePage drawer shows 'Attested import — not independently verified' for imported items", () => {
    const page = read("src/pages/compliance/ComplianceSafePage.jsx");
    expect(page).toContain("Attested import — not independently verified");
    expect(page).toContain('data-testid="compliance-import-drawer-label"');
  });

  it("QR-2: ComplianceSafePage drawer does NOT show 'Manually entered' for imported items", () => {
    const page = read("src/pages/compliance/ComplianceSafePage.jsx");
    // The "Manually entered" branch must exclude items where import_batch_id is set
    const manuallyEnteredIdx = page.indexOf("Manually entered");
    expect(manuallyEnteredIdx).toBeGreaterThan(-1);
    // Walk back to find the enclosing condition
    const precedingCode = page.slice(Math.max(0, manuallyEnteredIdx - 300), manuallyEnteredIdx);
    // Must guard with !import_batch_id so imported items don't reach "Manually entered"
    expect(precedingCode).toContain("!item.import_batch_id");
  });

  // ── Wording gate (RG-04) ────────────────────────────────────────────────────

  it("RG-04: import label uses approved wording (Attested import / Attested import — not independently verified)", () => {
    const page = read("src/pages/compliance/ComplianceSafePage.jsx");
    const hasApproved = APPROVED_LABEL_WORDS.some((w) => page.includes(w));
    expect(hasApproved).toBe(true);
  });

  it("RG-04: import label does not use forbidden wording (verified compliance, proven, certified, legally compliant)", () => {
    const page = read("src/pages/compliance/ComplianceSafePage.jsx");
    // Extract just the label text around the import badge markers
    const importLabelCtx = [
      ...page.matchAll(/Attested import[^"<]{0,120}/g),
    ].map((m) => m[0]).join(" ");

    for (const forbidden of FORBIDDEN_WORDS) {
      expect(importLabelCtx.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it("RG-04: SQL comment does not claim the label is a compliance verification", () => {
    const sql = read("supabase/compliance_import_labeling.sql");
    // The comment on the column must not make verification claims.
    // Use word-boundary checks so "provenance" (technical term) does not false-positive on "proven".
    const comment = sql.match(/COMMENT ON COLUMN.*?;/s)?.[0] || "";
    const c = comment.toLowerCase();
    // "proven" as a standalone word (not as part of "provenance")
    expect(c).not.toMatch(/\bproven\b/);
    expect(c).not.toMatch(/\bcertified\b/);
    expect(c).not.toMatch(/verified compliance/);
    // Must contain the honest framing
    expect(comment).toContain("Attested import");
  });

  // ── Unreachable surfaces (confirm no accidental labels added) ───────────────

  it("PropertyComplianceCard does not reference import_batch_id (IMPORTED-DATA-CANNOT-REACH-IT)", () => {
    const card = read("src/components/PropertyComplianceCard.jsx");
    // This card reads from compliance_items (old table), not tenancy_compliance_items.
    // It should not render an import badge — no imported data can reach it.
    expect(card).not.toContain("import_batch_id");
    expect(card).not.toContain("Attested import");
  });

  it("command_center_items SQL reads from compliance_items only — no import_batch_id exposure", () => {
    const sql = read("supabase/command_center_items.sql");
    // Command Centre compliance signals come from compliance_items (old table), NOT tenancy_compliance_items.
    // Verify the SQL references compliance_items for compliance signals.
    expect(sql).toContain("compliance_due_items");
    expect(sql).toContain("from public.compliance_items");
    // The SQL must NOT read tenancy_compliance_items for compliance signals.
    expect(sql).not.toContain("tenancy_compliance_items");
  });
});
