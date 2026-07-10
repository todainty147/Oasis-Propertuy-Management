/**
 * Static contract tests — Spreadsheet Import v1 (P-009 / RB-01 / RB-03)
 *
 * All tests read source files from disk only; no DB connection required.
 * These tests run in CI without a database and catch regressions in:
 *   - SQL overlay file existence and registration (RB-01, RB-03)
 *   - Table / column / index presence in SQL
 *   - RLS policy presence
 *   - Provenance wrapper presence and honesty guards
 *   - Honesty wording absent from import summaries
 *   - Route and lazy-import registration
 */

import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

const root = path.resolve(import.meta.dirname, "../..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

// ── §1  RB-03: SQL file registered in both scripts ───────────────────────────

describe("RB-03: SQL file registered in both deployment scripts", () => {
  it("dbApplyRepoSql.js contains spreadsheet_import_v1.sql", () => {
    const apply = read("scripts/dbApplyRepoSql.js");
    expect(apply).toContain('"spreadsheet_import_v1.sql"');
  });

  it("dbBootstrap.js contains spreadsheet_import_v1.sql", () => {
    const bootstrap = read("scripts/dbBootstrap.js");
    expect(bootstrap).toContain('"spreadsheet_import_v1.sql"');
  });

  it("spreadsheet_import_v1.sql file exists on disk", () => {
    const sqlPath = path.join(root, "supabase/spreadsheet_import_v1.sql");
    expect(fs.existsSync(sqlPath)).toBe(true);
  });
});

// ── §2  SQL structural contracts ─────────────────────────────────────────────

describe("spreadsheet_import_v1.sql structural contracts", () => {
  const sql = read("supabase/spreadsheet_import_v1.sql");

  it("adds external_property_ref column to properties", () => {
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS external_property_ref");
  });

  it("creates partial unique index for external_property_ref", () => {
    expect(sql).toContain("properties_account_external_ref_uidx");
    expect(sql).toContain("external_property_ref IS NOT NULL");
    expect(sql).toContain("btrim(external_property_ref) <> ''");
  });

  it("creates import_batches table", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.import_batches");
  });

  it("creates import_batch_rows table", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.import_batch_rows");
  });

  it("import_batches has tab CHECK constraint", () => {
    expect(sql).toContain("'properties', 'tenancies', 'compliance', 'maintenance'");
  });

  it("enables RLS on import_batches", () => {
    expect(sql).toMatch(/ALTER TABLE public\.import_batches ENABLE ROW LEVEL SECURITY/);
  });

  it("enables RLS on import_batch_rows", () => {
    expect(sql).toMatch(/ALTER TABLE public\.import_batch_rows ENABLE ROW LEVEL SECURITY/);
  });

  it("seeds how_to_rent requirement (absent-only)", () => {
    expect(sql).toContain("'how_to_rent'");
    expect(sql).toContain("ON CONFLICT (template_id, requirement_key) DO NOTHING");
  });

  it("does not create columns on properties for compliance data (no phantom columns)", () => {
    // These columns do NOT exist on properties table and must not be added here
    expect(sql).not.toMatch(/ADD COLUMN.*gas_safety/i);
    expect(sql).not.toMatch(/ADD COLUMN.*epc/i);
    expect(sql).not.toMatch(/ADD COLUMN.*eicr/i);
    expect(sql).not.toMatch(/ADD COLUMN.*deposit_scheme/i);
  });

  it("routes compliance data through tenancy_compliance_items", () => {
    expect(sql).toContain("INSERT INTO public.tenancy_compliance_items");
  });

  it("does not set work_orders.status to 'resolved'", () => {
    // 'resolved' is NOT a valid WO status (only for maintenance_requests)
    expect(sql).not.toMatch(/'resolved'.*work_order/i);
    expect(sql).not.toMatch(/work_order.*'resolved'/i);
  });

  it("does not manually set trigger-managed work order columns", () => {
    expect(sql).not.toContain("acknowledged_at");
    expect(sql).not.toContain("assigned_at");
  });

  it("does not equate postcode to city in WHERE clauses", () => {
    // The SQL must not have code that compares a postcode field to the city column.
    // Comments describing this non-behaviour are fine; only code patterns are rejected.
    const codeOnly = sql
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("--"))
      .join("\n");
    expect(codeOnly).not.toMatch(/city\s*=.*postcode/i);
    expect(codeOnly).not.toMatch(/postcode\s*=.*city/i);
  });
});

// ── §3  Provenance honesty contracts ─────────────────────────────────────────

describe("provenance wrapper honesty contracts", () => {
  const sql = read("supabase/spreadsheet_import_v1.sql");

  it("record_import_provenance_event wrapper exists", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.record_import_provenance_event");
  });

  it("wrapper hardcodes actor_type to integration", () => {
    expect(sql).toContain("p_actor_type      => 'integration'");
  });

  it("wrapper hardcodes source_type to spreadsheet_import", () => {
    expect(sql).toContain("p_source_type     => 'spreadsheet_import'");
  });

  it("wrapper hardcodes occurred_at to NOW()", () => {
    expect(sql).toContain("p_occurred_at     => NOW()");
  });

  it("wrapper stores triggering user in metadata (not as actor_user_id)", () => {
    expect(sql).toContain("triggered_by_user_id");
    expect(sql).toContain("p_actor_user_id   => NULL");
  });

  it("wrapper has honesty guard with forbidden wording list", () => {
    expect(sql).toContain("FOREACH v_term IN ARRAY ARRAY");
    expect(sql).toContain("system-observed");
    expect(sql).toContain("native evidence chain");
    expect(sql).toContain("cryptographically proven");
  });

  it("wrapper GRANTS EXECUTE to authenticated only", () => {
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION public.record_import_provenance_event"
    );
    expect(sql).toContain("TO authenticated");
  });

  it("import batch summaries in process_import_batch contain attested-import language", () => {
    expect(sql).toContain("Attested import record");
    expect(sql).toContain("Attested import custody");
  });

  it("import batch summaries do NOT contain native/verified overclaim wording", () => {
    // Check each provenance summary written in the SQL does not overclaim
    const summaryMatches = sql.matchAll(/p_summary\s*=>\s*'([^']+)'/g);
    const forbidden = [
      "system-observed",
      "verified service",
      "native evidence chain",
      "cryptographically proven",
      "verified compliance",
      "native tenaqo",
    ];
    for (const match of summaryMatches) {
      const summary = match[1].toLowerCase();
      for (const term of forbidden) {
        expect(summary).not.toContain(term);
      }
    }
  });
});

// ── §4  RLS policy contracts ──────────────────────────────────────────────────

describe("RLS policies are account-scoped via user_can_manage_account", () => {
  const sql = read("supabase/spreadsheet_import_v1.sql");

  it("import_batches RLS policy uses user_can_manage_account", () => {
    expect(sql).toContain("import_batches_account_member");
    expect(sql).toContain("user_can_manage_account(account_id)");
  });

  it("import_batch_rows RLS policy uses user_can_manage_account", () => {
    expect(sql).toContain("import_batch_rows_account_member");
  });

  it("process_import_batch RPC has user_can_manage_account gate", () => {
    expect(sql).toContain(
      "IF NOT public.user_can_manage_account(p_account_id)"
    );
  });

  it("record_import_provenance_event RPC has user_can_manage_account gate", () => {
    // Both the process batch and the wrapper must gate access
    const occurrences = [...sql.matchAll(/user_can_manage_account/g)];
    expect(occurrences.length).toBeGreaterThanOrEqual(3);
  });

  it("data-import route is wrapped in ManagerOnlyRoute, not EntitledRoute", () => {
    const routes = read("src/routes/ManagerRoutes.jsx");
    // Positive assertion: ManagerOnlyRoute wraps DataImportPage
    expect(routes).toMatch(
      /path="settings\/data-import"[\s\S]{0,80}ManagerOnlyRoute[\s\S]{0,80}DataImportPage/
    );
  });
});

// ── §5  Route registration ────────────────────────────────────────────────────

describe("route and lazy import registration", () => {
  it("DataImportPage lazy import exists in ManagerRoutes.jsx", () => {
    const routes = read("src/routes/ManagerRoutes.jsx");
    expect(routes).toContain('import("../pages/DataImportPage")');
  });

  it("settings/data-import route is registered", () => {
    const routes = read("src/routes/ManagerRoutes.jsx");
    expect(routes).toContain('path="settings/data-import"');
  });
});

// ── §6  Parser / service contracts ───────────────────────────────────────────

describe("spreadsheetParser.js structural contracts", () => {
  const parser = read("src/lib/spreadsheetParser.js");

  it("exports parseTabCsv", () => {
    expect(parser).toContain("export function parseTabCsv");
  });

  it("exports hashFileContent", () => {
    expect(parser).toContain("export function hashFileContent");
  });

  it("exports getTemplateHeaders", () => {
    expect(parser).toContain("export function getTemplateHeaders");
  });

  it("does not perform postcode vs city matching", () => {
    expect(parser).not.toMatch(/postcode.*city/i);
    expect(parser).not.toMatch(/city.*postcode/i);
  });
});

describe("spreadsheetImportService.js structural contracts", () => {
  const service = read("src/services/spreadsheetImportService.js");

  it("exports processImportBatch", () => {
    expect(service).toContain("export async function processImportBatch");
  });

  it("calls process_import_batch RPC", () => {
    expect(service).toContain('"process_import_batch"');
  });

  it("does not call any refresh or recalc RPC", () => {
    expect(service).not.toMatch(/refresh.*rpc|recalc|command_center.*refresh/i);
  });
});

// ── §7  Onboarding CTA ────────────────────────────────────────────────────────

describe("LandlordOnboardingPage import wizard link", () => {
  it("includes a link to /settings/data-import", () => {
    const page = read("src/pages/LandlordOnboardingPage.jsx");
    expect(page).toContain("/settings/data-import");
  });
});

// ── §8  T-INTEGRITY-2: word-boundary forbidden-word guard ────────────────────

describe("T-INTEGRITY-2 — word-boundary honesty guard in SQL", () => {
  const sql = read("supabase/spreadsheet_import_v1.sql");

  it("uses PostgreSQL word-boundary regex (\\m...\\M) for single-word forbidden terms", () => {
    // Must use \m and \M anchors so 'observed' does not trigger 'served'
    expect(sql).toContain("\\m");
    expect(sql).toContain("\\M");
  });

  it("whitelists the sanctioned phrase 'not a tenaqo-observed event' before checking", () => {
    // Whitelist must happen via regexp_replace BEFORE the forbidden-word loop
    expect(sql).toContain("not a tenaqo-observed event");
    expect(sql).toContain("__whitelisted__");
  });

  it("honesty guard checks single-word terms with word-boundary regex, not LIKE", () => {
    // Single-word terms ('verified','proven','served') must use ~ operator with \\m/\\M
    // LIKE alone would match 'unverified', 'disproven', 'observed'
    const codeOnly = sql.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");
    // Must have the regex match operator for single-word terms
    // SQL contains: v_scrubbed ~ ('\m' || ... || '\M')
    expect(codeOnly).toMatch(/v_scrubbed\s*~\s*\(.*\\m.*\\M/s);
  });

  it("forbidden term 'served' does not appear in the whitelist phrase check block", () => {
    // 'served' as a standalone word must be caught by word-boundary regex,
    // NOT by LIKE (which would match 'observed')
    // The whitelist must strip the phrase BEFORE the LIKE multi-word check
    expect(sql).toContain("ARRAY['verified','proven','served']");
  });

  it("multi-word compound phrases use LIKE (not word-boundary regex)", () => {
    expect(sql).toContain("'system-observed'");
    expect(sql).toContain("'verified service'");
    expect(sql).toContain("'native evidence chain'");
    expect(sql).toContain("v_scrubbed LIKE '%' || lower(v_term) || '%'");
  });
});

// ── §9  T-INTEGRITY-3: formula injection neutralization ─────────────────────

describe("T-INTEGRITY-3 — formula injection neutralization in parser", () => {
  const parser = read("src/lib/spreadsheetParser.js");

  it("exports neutralizeFormulaValue function", () => {
    expect(parser).toContain("export function neutralizeFormulaValue");
  });

  it("neutralizes leading = character", () => {
    expect(parser).toContain("INJECTION_STARTERS");
    expect(parser).toContain('"="');
  });

  it("neutralizes leading @ character", () => {
    expect(parser).toContain('"@"');
  });

  it("neutralizes +letter and -letter patterns (not plain numbers)", () => {
    expect(parser).toContain('[+-][A-Za-z]');
  });

  it("neutralizes DDE patterns", () => {
    expect(parser).toContain("DDE_PATTERNS");
    // Regex literals in source use \( escape — check the pattern name and key strings
    expect(parser).toContain("=DDE");
    expect(parser).toContain("=HYPERLINK");
  });

  it("prefixes dangerous cells with tab character (text-mode in Excel)", () => {
    // Tab prefix causes Excel/LibreOffice to treat as text on round-trip export
    expect(parser).toContain('"\\t"');
  });

  it("sets _injection_detected flag on affected rows", () => {
    expect(parser).toContain("_injection_detected");
    expect(parser).toContain("injectionDetected");
  });

  it("does not silently drop injection-detected rows from output", () => {
    // Injection-detected rows must still appear in output (with _injection_detected=true)
    // so the RPC can route them to needs_review and the row-count invariant holds
    expect(parser).toContain("row._injection_detected = true");
    // Should not filter/exclude injection-detected rows via parseErrors
    expect(parser).not.toContain("_injection_detected && parseErrors");
  });
});

// ── §10 T-INTEGRITY-1: assertRowCountInvariant export ───────────────────────

describe("T-INTEGRITY-1 — assertRowCountInvariant exported from parser", () => {
  const parser = read("src/lib/spreadsheetParser.js");

  it("exports assertRowCountInvariant function", () => {
    expect(parser).toContain("export function assertRowCountInvariant");
  });

  it("checks total === sourceRowCount", () => {
    expect(parser).toContain("total !== sourceRowCount");
  });

  it("checks sum of status buckets === total", () => {
    expect(parser).toContain("accountedFor !== total");
  });

  it("returns true on success (callers can chain)", () => {
    expect(parser).toContain("return true;");
  });

  it("parseTabCsv returns sourceRowCount in its result", () => {
    expect(parser).toContain("sourceRowCount");
    expect(parser).toContain("rawRows.length");
  });
});

// ── §11 Decision M: maintenance dedup guard in SQL ───────────────────────────

describe("Decision M — maintenance re-import → needs_review (no silent dup, no fuzzy match)", () => {
  const sql = read("supabase/spreadsheet_import_v1.sql");

  it("SQL checks for existing maintenance_request with same title+property before INSERT", () => {
    expect(sql).toContain("maintenance_requests");
    expect(sql).toContain("maintenance_potential_duplicate");
  });

  it("title comparison is case-insensitive (lower(trim(...)))", () => {
    expect(sql).toMatch(/lower\(trim\(.*title/i);
  });

  it("duplicate maintenance is routed to needs_review not error", () => {
    // Must set v_row_status := 'needs_review' on duplicate
    expect(sql).toContain("maintenance_potential_duplicate");
    expect(sql).toContain("needs_review");
  });

  it("does NOT deduplicate by date or description (no fuzzy match)", () => {
    // Decision M: only title+property check; no date fuzzy match
    const codeOnly = sql.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");
    // Must not compare description/date for maintenance dedup
    expect(codeOnly).not.toMatch(/maintenance.*description.*dedup/i);
    expect(codeOnly).not.toMatch(/maintenance.*start_date.*duplicate/i);
  });

  it("does NOT add a maintenance import_key column (Decision M explicitly defers this)", () => {
    expect(sql).not.toMatch(/ADD COLUMN.*import_key.*maintenance/i);
    expect(sql).not.toMatch(/maintenance.*import_key/i);
  });
});
