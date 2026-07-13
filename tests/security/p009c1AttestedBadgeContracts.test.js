import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readSource(relativePath) {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

function normalized(source) {
  return source.replace(/\s+/g, " ");
}

describe("P-009C1 attested badge rendered-marker contracts", () => {
  // ── §1  compliance_gap_unified view ─────────────────────────────────────────

  it("view defines source_model as physical table name (never 'imported')", () => {
    const sql = readSource("supabase/p009c1_compliance_gap_unified.sql");
    expect(sql).toContain("'compliance_items'::text           as source_model");
    expect(sql).toContain("'tenancy_compliance_items'::text           as source_model");
    expect(sql).not.toMatch(/'imported'.*as source_model/);
  });

  it("view has security_invoker = true", () => {
    const sql = readSource("supabase/p009c1_compliance_gap_unified.sql");
    expect(sql).toContain("with (security_invoker = true)");
  });

  it("is_attested_import is TRUE only for TCI rows with import_batch_id IS NOT NULL", () => {
    const sql = readSource("supabase/p009c1_compliance_gap_unified.sql");
    expect(sql).toContain("(tci.import_batch_id is not null)          as is_attested_import");
    expect(sql).toContain("false                              as is_attested_import");
  });

  it("scan_status precedence: inactive before overdue before due_soon before current before missing", () => {
    const sql = readSource("supabase/p009c1_compliance_gap_unified.sql");
    const normalized = sql.replace(/\s+/g, " ");
    // TCI scan_status block: 'not_applicable' → 'inactive' must appear first
    const tciScanStart = normalized.indexOf("tci.status = 'not_applicable'");
    const tciOverdue = normalized.indexOf("then 'overdue'", tciScanStart);
    const tciDueSoon = normalized.indexOf("then 'due_soon'", tciScanStart);
    const tciCurrent = normalized.indexOf("then 'current'", tciScanStart);
    expect(tciScanStart).toBeGreaterThan(0);
    expect(tciOverdue).toBeGreaterThan(tciScanStart);
    expect(tciDueSoon).toBeGreaterThan(tciOverdue);
    expect(tciCurrent).toBeGreaterThan(tciDueSoon);
  });

  it("attested compliance calendar rows link to /compliance/safe, not /compliance/tax", () => {
    const sql = readSource("supabase/p009c1_compliance_gap_unified.sql");
    expect(sql).toContain("'/compliance/safe'::text");
    expect(sql).not.toContain("'/compliance/tax'");
  });

  it("command_center wrapper calls assert_command_center_access for attested rows", () => {
    const sql = readSource("supabase/p009c1_compliance_gap_unified.sql");
    expect(sql).toContain("public.assert_command_center_access(p_account_id)");
  });

  it("attention_center wrapper calls assert_manage_account_access for attested rows", () => {
    const sql = readSource("supabase/p009c1_compliance_gap_unified.sql");
    expect(sql).toContain("public.assert_manage_account_access(p_account_id)");
  });

  it("attested rows in CC/AC have source_table = 'tenancy_compliance_items'", () => {
    const sql = readSource("supabase/p009c1_compliance_gap_unified.sql");
    // Must appear in both CC and AC wrapper selects
    const count = (sql.match(/'tenancy_compliance_items'::text,\s*\d+/g) || []).length;
    expect(count).toBeGreaterThanOrEqual(2); // at least overdue + due_soon in CC
  });

  it("is_attested_import=true appears in get_operating_calendar attested branch", () => {
    const sql = readSource("supabase/p009c1_compliance_gap_unified.sql");
    expect(sql).toContain("true                                                            as is_attested_import");
    expect(sql).toContain("false as is_attested_import");
  });

  it("get_operating_calendar return type includes is_attested_import boolean", () => {
    const sql = readSource("supabase/p009c1_compliance_gap_unified.sql");
    expect(sql).toContain("is_attested_import boolean");
  });

  it("RB-01 idempotency: uses DROP FUNCTION IF EXISTS for all three wrappers", () => {
    const sql = readSource("supabase/p009c1_compliance_gap_unified.sql");
    const dropCount = (sql.match(/drop function if exists public\./g) || []).length;
    expect(dropCount).toBeGreaterThanOrEqual(3); // CC, AC, get_operating_calendar
  });

  it("RB-01: uses _v0 rename guard (DO $$ BEGIN IF NOT EXISTS)", () => {
    const sql = readSource("supabase/p009c1_compliance_gap_unified.sql");
    const guardCount = (sql.match(/rename to.*_v0/g) || []).length;
    expect(guardCount).toBeGreaterThanOrEqual(3); // CC, AC, calendar
  });

  it("RB-03: registered in dbApplyRepoSql.js OVERLAY_SEQUENCE after compliance_import_labeling.sql", () => {
    const applyScript = readSource("scripts/dbApplyRepoSql.js");
    const labelingIdx = applyScript.indexOf('"compliance_import_labeling.sql"');
    const unifiedIdx = applyScript.indexOf('"p009c1_compliance_gap_unified.sql"');
    expect(labelingIdx).toBeGreaterThan(0);
    expect(unifiedIdx).toBeGreaterThan(labelingIdx);
  });

  it("RB-03: registered in dbBootstrap.js bootstrapSteps", () => {
    const bootstrap = readSource("scripts/dbBootstrap.js");
    expect(bootstrap).toContain('"compliance_import_labeling.sql"');
    expect(bootstrap).toContain('"p009c1_compliance_gap_unified.sql"');
    const labelingIdx = bootstrap.indexOf('"compliance_import_labeling.sql"');
    const unifiedIdx = bootstrap.indexOf('"p009c1_compliance_gap_unified.sql"');
    expect(unifiedIdx).toBeGreaterThan(labelingIdx);
  });

  // ── §2  Frontend rendered-marker evidence ───────────────────────────────────

  it("CommandCenterPage renders attested badge when source === 'tenancy_compliance_items'", () => {
    const src = readSource("src/pages/CommandCenterPage.jsx");
    expect(src).toContain('item.source === "tenancy_compliance_items"');
    expect(src).toContain('data-testid="attested-badge"');
    expect(src).toContain("Attested import");
  });

  it("CalendarItemCard renders attested badge when item.is_attested_import is truthy", () => {
    const src = readSource("src/components/calendar/CalendarItemCard.jsx");
    expect(src).toContain("item.is_attested_import");
    expect(src).toContain('data-testid="attested-calendar-badge"');
    expect(src).toContain("Attested import");
  });

  it("PropertyComplianceCard renders attested rows with data-testid", () => {
    const src = readSource("src/components/PropertyComplianceCard.jsx");
    expect(src).toContain('data-testid="attested-compliance-row"');
    expect(src).toContain("attestedRows");
    expect(src).toContain("Attested import");
  });

  it("PropertyComplianceCard native summary counts come only from 'rows' (not attestedRows)", () => {
    const src = readSource("src/components/PropertyComplianceCard.jsx");
    const normalized = src.replace(/\s+/g, " ");
    // The summary useMemo must iterate 'rows', not 'attestedRows'
    const summaryStart = normalized.indexOf("const summary = useMemo");
    const summaryEnd = normalized.indexOf("return { overdue, dueSoon, active }", summaryStart);
    const summaryBlock = normalized.slice(summaryStart, summaryEnd + 50);
    expect(summaryBlock).toContain("for (const row of rows)");
    expect(summaryBlock).not.toContain("attestedRows");
  });

  it("COMPLIANCE_ACK_SELECT includes import_batch_id in TCI nested select", () => {
    const src = readSource("src/services/legalSecurityService.js");
    const ackSelectStart = src.indexOf("const COMPLIANCE_ACK_SELECT");
    const ackSelectEnd = src.indexOf("].join", ackSelectStart);
    const ackSelect = src.slice(ackSelectStart, ackSelectEnd);
    expect(ackSelect).toContain("import_batch_id");
    expect(ackSelect).toContain("tenancy_compliance_items(");
  });

  it("listAttestedComplianceItems is exported from legalSecurityService.js", () => {
    const src = readSource("src/services/legalSecurityService.js");
    expect(src).toContain("export async function listAttestedComplianceItems(");
    expect(src).toContain('.not("import_batch_id", "is", null)');
  });

  it("PropertyComplianceCard imports listAttestedComplianceItems", () => {
    const src = readSource("src/components/PropertyComplianceCard.jsx");
    expect(src).toContain('import { listAttestedComplianceItems }');
    expect(src).toContain("legalSecurityService");
  });

  it("CommandCenterPage subscribes to tenancy_compliance_items for realtime attested updates", () => {
    const src = readSource("src/pages/CommandCenterPage.jsx");
    expect(src).toContain('table: "tenancy_compliance_items"');
    expect(src).toContain("command-center-attested-compliance");
  });
});
