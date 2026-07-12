/**
 * Unit tests — spreadsheetParser.js (P-009 hardening pass)
 *
 * No database required. Covers:
 *   - CSV parsing (HP-03)
 *   - Formula/injection neutralization (T-INTEGRITY-3, SI-05)
 *   - Row-count invariant (T-INTEGRITY-1)
 *   - Date validation (ND-03, ND-04)
 *   - Currency parsing (ND-05)
 *   - Empty / minimal files (ND-06, K)
 *   - Orphan detection at parse time (ND-06)
 *   - Edge addresses (L, PM-03, PM-04)
 *   - Fixture files (loaded from disk)
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  parseCsv,
  parseTabCsv,
  neutralizeFormulaValue,
  assertRowCountInvariant,
  hashFileContent,
  isValidImportDate,
  parseCurrencyValue,
  getTemplateHeaders,
} from "../../src/lib/spreadsheetParser.js";

const FIXTURES = path.resolve(import.meta.dirname, "../fixtures/import");
function readFixture(name) {
  return fs.readFileSync(path.join(FIXTURES, name), "utf8");
}

// ── §1  Formula / injection neutralization (T-INTEGRITY-3) ───────────────────

describe("neutralizeFormulaValue — T-INTEGRITY-3", () => {
  it("neutralizes = prefix (formula injection)", () => {
    const result = neutralizeFormulaValue('=HYPERLINK("http://evil.com")');
    expect(result.injectionDetected).toBe(true);
    expect(result.value).not.toMatch(/^=/);
    expect(result.value).toContain("HYPERLINK");
  });

  it("neutralizes @ prefix", () => {
    const result = neutralizeFormulaValue("@SUM(1,2)");
    expect(result.injectionDetected).toBe(true);
    expect(result.value).not.toMatch(/^@/);
  });

  it("neutralizes + followed by letter (DDE)", () => {
    const result = neutralizeFormulaValue("+cmd|/C calc");
    expect(result.injectionDetected).toBe(true);
  });

  it("neutralizes - followed by letter", () => {
    const result = neutralizeFormulaValue("-cmd|/C calc");
    expect(result.injectionDetected).toBe(true);
  });

  it("does NOT neutralize plain negative numbers", () => {
    const { injectionDetected, value } = neutralizeFormulaValue("-1250.00");
    expect(injectionDetected).toBe(false);
    expect(value).toBe("-1250.00");
  });

  it("does NOT neutralize plain positive numbers", () => {
    const { injectionDetected } = neutralizeFormulaValue("+44 7700 900123");
    // +44 followed by space and digit — not a letter, so not flagged
    expect(injectionDetected).toBe(false);
  });

  it("does NOT neutralize normal addresses", () => {
    const { injectionDetected } = neutralizeFormulaValue("10 High Street");
    expect(injectionDetected).toBe(false);
  });

  it("does NOT neutralize normal email addresses", () => {
    const { injectionDetected } = neutralizeFormulaValue("tenant@example.com");
    // @ is the first char check, but trim would give 'tenant@...' not starting with @
    expect(injectionDetected).toBe(false);
  });

  it("neutralizes =DDE pattern", () => {
    const { injectionDetected } = neutralizeFormulaValue('=DDE("cmd","/C","calc")');
    expect(injectionDetected).toBe(true);
  });

  it("neutralizes =HYPERLINK( pattern", () => {
    const { injectionDetected } = neutralizeFormulaValue("=HYPERLINK(A1)");
    expect(injectionDetected).toBe(true);
  });

  it("neutralized value does not start with a formula char", () => {
    const { value } = neutralizeFormulaValue("=BAD()");
    expect(["=", "+", "-", "@"]).not.toContain(value[0]);
  });

  it("passes through empty string safely", () => {
    const { value, injectionDetected } = neutralizeFormulaValue("");
    expect(injectionDetected).toBe(false);
    expect(value).toBe("");
  });
});

// ── §2  CSV parsing (HP-03) ───────────────────────────────────────────────────

describe("parseCsv — core parsing", () => {
  it("returns empty array for header-only file", () => {
    const rows = parseCsv("address,city,rent\n");
    expect(rows).toHaveLength(0);
  });

  it("returns empty array for completely empty file", () => {
    expect(parseCsv("")).toHaveLength(0);
    expect(parseCsv("   ")).toHaveLength(0);
  });

  it("parses a simple 3-column file", () => {
    const rows = parseCsv("address,city,rent\n10 High Street,London,1200\n");
    expect(rows).toHaveLength(1);
    expect(rows[0].address).toBe("10 High Street");
    expect(rows[0].city).toBe("London");
    expect(rows[0].rent).toBe("1200");
  });

  it("handles quoted commas", () => {
    const rows = parseCsv('address,city\n"20 The Elms, Road",London\n');
    expect(rows[0].address).toBe("20 The Elms, Road");
  });

  it("handles escaped quotes inside cells", () => {
    const rows = parseCsv('address,city\n"20 ""The Elms"" Road",London\n');
    expect(rows[0].address).toBe('20 "The Elms" Road');
  });

  it("normalises header names to lowercase", () => {
    const rows = parseCsv("Address,CITY\n10 High Street,London\n");
    expect(rows[0].address).toBe("10 High Street");
    expect(rows[0].city).toBe("London");
  });

  it("handles CRLF line endings", () => {
    const rows = parseCsv("address,city\r\n10 High Street,London\r\n");
    expect(rows).toHaveLength(1);
    expect(rows[0].address).toBe("10 High Street");
  });

  it("assigns _row_number starting at 2", () => {
    const rows = parseCsv("address,city\n10 High Street,London\n20 Low Road,Manchester\n");
    expect(rows[0]._row_number).toBe(2);
    expect(rows[1]._row_number).toBe(3);
  });

  it("flags injection in row and sets _injection_detected", () => {
    const rows = parseCsv('address,city\n=BAD(),London\n');
    expect(rows[0]._injection_detected).toBe(true);
    expect(rows[0]._injection_columns).toContain("address");
  });

  it("safe rows have _injection_detected=false", () => {
    const rows = parseCsv("address,city\n10 High Street,London\n");
    expect(rows[0]._injection_detected).toBe(false);
  });
});

// ── §3  parseTabCsv with fixtures ────────────────────────────────────────────

describe("parseTabCsv — clean-small fixtures (HP-03)", () => {
  it("parses clean-small-properties with 3 rows", () => {
    const csv = readFixture("clean-small-properties.csv");
    const { rows, parseErrors, sourceRowCount } = parseTabCsv(csv, "properties");
    expect(sourceRowCount).toBe(3);
    expect(parseErrors).toHaveLength(0);
    expect(rows).toHaveLength(3);
    // T-INTEGRITY-1: rows + parseErrors == sourceRowCount
    expect(rows.length + parseErrors.length).toBe(sourceRowCount);
  });

  it("maps column aliases correctly for properties", () => {
    const csv = readFixture("clean-small-properties.csv");
    const { rows } = parseTabCsv(csv, "properties");
    expect(rows[0].address).toBeTruthy();
    expect(rows[0].external_property_ref).toBe("CLEAN-001");
  });

  it("parses clean-small-tenancies with 3 rows", () => {
    const csv = readFixture("clean-small-tenancies.csv");
    const { rows, parseErrors, sourceRowCount } = parseTabCsv(csv, "tenancies");
    expect(sourceRowCount).toBe(3);
    expect(parseErrors).toHaveLength(0);
    expect(rows.length + parseErrors.length).toBe(sourceRowCount);
  });

  it("parses clean-small-compliance with 6 rows", () => {
    const csv = readFixture("clean-small-compliance.csv");
    const { rows, parseErrors, sourceRowCount } = parseTabCsv(csv, "compliance");
    expect(sourceRowCount).toBe(6);
    expect(parseErrors).toHaveLength(0);
    expect(rows.length + parseErrors.length).toBe(sourceRowCount);
  });

  it("parses clean-small-maintenance with 2 rows", () => {
    const csv = readFixture("clean-small-maintenance.csv");
    const { rows, parseErrors, sourceRowCount } = parseTabCsv(csv, "maintenance");
    expect(sourceRowCount).toBe(2);
    expect(parseErrors).toHaveLength(0);
    expect(rows.length + parseErrors.length).toBe(sourceRowCount);
  });
});

describe("parseTabCsv — empty-minimal fixture (K)", () => {
  it("header-only file returns 0 rows and 0 errors", () => {
    const csv = readFixture("empty-minimal.csv");
    const { rows, parseErrors, sourceRowCount } = parseTabCsv(csv, "properties");
    expect(sourceRowCount).toBe(0);
    expect(rows).toHaveLength(0);
    expect(parseErrors).toHaveLength(0);
  });
});

describe("parseTabCsv — formula injection fixture (SI-05, T-INTEGRITY-3)", () => {
  it("detects injection in address column", () => {
    const csv = readFixture("formula-injection.csv");
    const { rows, sourceRowCount } = parseTabCsv(csv, "properties");
    // Row-count invariant still holds (injected rows ARE included in rows[])
    expect(rows.length).toBe(sourceRowCount);
    const injected = rows.filter((r) => r._injection_detected);
    expect(injected.length).toBeGreaterThanOrEqual(1);
  });

  it("injected cell values are neutralized (do not start with formula char)", () => {
    const csv = readFixture("formula-injection.csv");
    const { rows } = parseTabCsv(csv, "properties");
    const FORMULA_STARTERS = new Set(["=", "@", "+"]);
    rows.forEach((row) => {
      Object.entries(row).forEach(([key, val]) => {
        if (typeof val === "string" && !key.startsWith("_")) {
          expect(FORMULA_STARTERS.has(val[0])).toBe(false);
        }
      });
    });
  });

  it("parse warning is set on injected rows", () => {
    const csv = readFixture("formula-injection.csv");
    const { rows } = parseTabCsv(csv, "properties");
    const injected = rows.find((r) => r._injection_detected);
    expect(injected?._parse_warning).toBeTruthy();
  });
});

describe("parseTabCsv — messy-realistic fixture (C)", () => {
  it("handles quoted cells with commas", () => {
    const csv = readFixture("messy-realistic-properties.csv");
    const { rows } = parseTabCsv(csv, "properties");
    expect(rows.some((r) => r.address.includes("The Elms"))).toBe(true);
  });

  it("column alias mapping works for non-standard headers", () => {
    // messy file uses 'Address', 'CITY', 'Monthly Rent', 'Property Ref'
    const csv = readFixture("messy-realistic-properties.csv");
    const { rows } = parseTabCsv(csv, "properties");
    // 'Monthly Rent' maps to 'rent' alias via COLUMN_ALIASES
    expect(rows[0].rent).toBeTruthy();
    // 'Property Ref' maps to 'external_property_ref'
    expect(rows[0].external_property_ref).toBeTruthy();
  });
});

describe("parseTabCsv — orphan child rows fixture (G)", () => {
  it("orphan compliance rows parse without parse-level errors (RPC handles them)", () => {
    const csv = readFixture("orphan-child-rows-compliance.csv");
    const { rows, parseErrors, sourceRowCount } = parseTabCsv(csv, "compliance");
    // The parser passes them through; the RPC returns needs_review
    expect(parseErrors).toHaveLength(0);
    expect(rows).toHaveLength(sourceRowCount);
  });
});

describe("parseTabCsv — duplicates-and-conflicts fixture (D)", () => {
  it("duplicate external refs pass through (RPC detects conflict)", () => {
    const csv = readFixture("duplicates-and-conflicts-properties.csv");
    const { rows, sourceRowCount } = parseTabCsv(csv, "properties");
    // 4 rows; parser does not deduplicate — RPC handles conflict
    expect(rows).toHaveLength(sourceRowCount);
  });
});

describe("parseTabCsv — required field validation (ND-06)", () => {
  it("properties: row missing address goes to parseErrors", () => {
    const csv = "address,city\n,London\n10 High Street,Manchester\n";
    const { rows, parseErrors, sourceRowCount } = parseTabCsv(csv, "properties");
    expect(sourceRowCount).toBe(2);
    expect(parseErrors).toHaveLength(1);
    expect(rows).toHaveLength(1);
    expect(rows.length + parseErrors.length).toBe(sourceRowCount);
  });

  it("tenancies: row missing tenant_email goes to parseErrors", () => {
    const csv = "tenant_name,tenant_email\nJohn Smith,\n";
    const { rows, parseErrors, sourceRowCount } = parseTabCsv(csv, "tenancies");
    expect(sourceRowCount).toBe(1);
    expect(parseErrors).toHaveLength(1);
    expect(rows).toHaveLength(0);
    expect(rows.length + parseErrors.length).toBe(sourceRowCount);
  });

  it("maintenance: row missing title goes to parseErrors", () => {
    const csv = "external_property_ref,title,priority\nCLEAN-001,,normal\n";
    const { rows, parseErrors, sourceRowCount } = parseTabCsv(csv, "maintenance");
    expect(sourceRowCount).toBe(1);
    expect(parseErrors).toHaveLength(1);
    expect(rows.length + parseErrors.length).toBe(sourceRowCount);
  });
});

// ── §4  Row-count invariant (T-INTEGRITY-1) ───────────────────────────────────

describe("assertRowCountInvariant — T-INTEGRITY-1", () => {
  it("passes when all rows are accounted for", () => {
    const result = { total: 5, imported: 3, skipped: 1, needs_review: 1, error: 0 };
    expect(() => assertRowCountInvariant(result, 5)).not.toThrow();
  });

  it("throws when total !== sourceRowCount", () => {
    const result = { total: 5, imported: 3, skipped: 1, needs_review: 1, error: 0 };
    expect(() => assertRowCountInvariant(result, 6)).toThrow(/received total=5 but caller sent 6/);
  });

  it("throws when rows do not sum to total", () => {
    const result = { total: 5, imported: 3, skipped: 0, needs_review: 0, error: 0 };
    expect(() => assertRowCountInvariant(result, 5)).toThrow(/2 row\(s\) unaccounted/);
  });

  it("passes for zero-row import", () => {
    const result = { total: 0, imported: 0, skipped: 0, needs_review: 0, error: 0 };
    expect(() => assertRowCountInvariant(result, 0)).not.toThrow();
  });
});

// ── §5  Date validation (ND-03, ND-04) ───────────────────────────────────────

describe("isValidImportDate", () => {
  it("accepts ISO dates", () => {
    expect(isValidImportDate("2026-12-31")).toBe(true);
    expect(isValidImportDate("2027-06-01")).toBe(true);
  });

  it("accepts empty string (optional field)", () => {
    expect(isValidImportDate("")).toBe(true);
    expect(isValidImportDate(null)).toBe(true);
  });

  it("rejects unparseable dates (ND-03)", () => {
    expect(isValidImportDate("31/31/2026")).toBe(false);
    expect(isValidImportDate("not sure")).toBe(false);
    expect(isValidImportDate("2026-ish")).toBe(false);
  });

  it("rejects Excel serial numbers (ND-04)", () => {
    expect(isValidImportDate("45291")).toBe(false);
    expect(isValidImportDate("44927")).toBe(false);
  });

  it("rejects dates before 2000", () => {
    expect(isValidImportDate("1999-01-01")).toBe(false);
  });
});

// ── §6  Currency parsing (ND-05) ─────────────────────────────────────────────

describe("parseCurrencyValue", () => {
  it("parses UK pound format", () => {
    expect(parseCurrencyValue("£1,250.00")).toBe(1250);
    expect(parseCurrencyValue("£900")).toBe(900);
  });

  it("parses plain numbers", () => {
    expect(parseCurrencyValue("1200")).toBe(1200);
    expect(parseCurrencyValue("800.50")).toBe(800.5);
  });

  it("returns null for ambiguous European format (ND-05)", () => {
    // 1.250,00 looks like European decimal — ambiguous, reject
    expect(parseCurrencyValue("1.250,00")).toBeNull();
  });

  it("returns null for empty/unparseable", () => {
    expect(parseCurrencyValue("")).toBeNull();
    expect(parseCurrencyValue("not a number")).toBeNull();
    expect(parseCurrencyValue(null)).toBeNull();
  });
});

// ── §7  File hash / idempotency (RI-01) ─────────────────────────────────────

describe("hashFileContent", () => {
  it("same content produces same hash", () => {
    const text = "address,city\n10 High Street,London\n";
    expect(hashFileContent(text)).toBe(hashFileContent(text));
  });

  it("different content produces different hash", () => {
    expect(hashFileContent("abc")).not.toBe(hashFileContent("def"));
  });

  it("returns an 8-char hex string", () => {
    expect(hashFileContent("test")).toMatch(/^[0-9a-f]{8}$/);
  });
});

// ── §8  Maintenance history fixture (J) ──────────────────────────────────────

describe("maintenance-history fixture (J, MI-01–04)", () => {
  it("parses all maintenance rows from fixture", () => {
    const csv = readFixture("maintenance-history-maintenance.csv");
    const { rows, parseErrors, sourceRowCount } = parseTabCsv(csv, "maintenance");
    expect(sourceRowCount).toBe(5);
    expect(parseErrors).toHaveLength(0);
    expect(rows.length + parseErrors.length).toBe(sourceRowCount);
  });

  it("rows with invalid status still parse (RPC clamps to valid enum)", () => {
    const csv = readFixture("maintenance-history-maintenance.csv");
    const { rows } = parseTabCsv(csv, "maintenance");
    const badStatus = rows.find((r) => r.status === "done-ish");
    expect(badStatus).toBeDefined(); // parser passes through; RPC defaults it
  });
});

// ── §9  Edge addresses (L, PM-03) ────────────────────────────────────────────

describe("edge-addresses fixture (L)", () => {
  it("preserves flat/unit numbers in address", () => {
    const csv = readFixture("edge-addresses-properties.csv");
    const { rows } = parseTabCsv(csv, "properties");
    expect(rows.some((r) => r.address.includes("Flat 1/1"))).toBe(true);
    expect(rows.some((r) => r.address.includes("Flat 2"))).toBe(true);
  });

  it("two addresses differing only by flat number are kept separate", () => {
    const csv = readFixture("edge-addresses-properties.csv");
    const { rows } = parseTabCsv(csv, "properties");
    const flat1 = rows.find((r) => r.address.includes("Flat 1/1"));
    const flat2 = rows.find((r) => r.address.includes("Flat 2 "));
    const noFlat = rows.find((r) => r.address === "10 High Street");
    // All three are distinct rows at parser level — RPC decides matching
    expect(flat1).toBeDefined();
    expect(flat2).toBeDefined();
    expect(noFlat).toBeDefined();
  });
});

// ── §10  Unsupported file types (ND-09) ──────────────────────────────────────

describe("parseCsv — unsupported/binary content", () => {
  it("returns empty rows for binary-looking content (no valid header)", () => {
    // Binary content won't have a recognisable header → empty or garbage rows
    const binaryLike = "\x00\x01\x02\x03PDF header garbage";
    const rows = parseCsv(binaryLike);
    // parseCsv returns rows but they'll be empty/garbage — caller validates
    // The key assertion is that it does NOT throw
    expect(() => parseCsv(binaryLike)).not.toThrow();
  });

  it("does not execute any content as code", () => {
    // Ensure no eval or dynamic execution happens
    const malicious = "=EXEC(rm -rf /),city\nvalue,London\n";
    expect(() => parseCsv(malicious)).not.toThrow();
    const rows = parseCsv(malicious);
    // Value should be neutralized, not executed
    if (rows[0]) {
      const addresses = Object.values(rows[0]).filter((v) => typeof v === "string");
      addresses.forEach((v) => {
        expect(["=", "@"]).not.toContain(v[0]);
      });
    }
  });
});

// ── §11  Template coverage (getTemplateHeaders) ───────────────────────────────

const COMPLIANCE_TYPES = [
  "epc",
  "gas_safety_certificate",
  "eicr",
  "deposit_protection_certificate",
  "how_to_rent",
  "deposit_prescribed_information",
];

describe("getTemplateHeaders — returns full CSV with example rows", () => {
  it("returns a non-empty string for all four tabs", () => {
    for (const tab of ["properties", "tenancies", "compliance", "maintenance"]) {
      const csv = getTemplateHeaders(tab);
      expect(csv.trim().length).toBeGreaterThan(0);
    }
  });

  it("returns empty string for unknown tab", () => {
    expect(getTemplateHeaders("unknown")).toBe("");
  });

  it("properties template has external_property_ref and address columns", () => {
    const csv = getTemplateHeaders("properties");
    const header = csv.split("\n")[0];
    expect(header).toContain("external_property_ref");
    expect(header).toContain("address");
  });

  it("properties template includes example rows", () => {
    const lines = getTemplateHeaders("properties").split("\n").filter(Boolean);
    expect(lines.length).toBeGreaterThanOrEqual(2);
  });

  it("tenancies template has tenant_email and tenancy_start_date columns", () => {
    const csv = getTemplateHeaders("tenancies");
    const header = csv.split("\n")[0];
    expect(header).toContain("tenant_email");
    expect(header).toContain("tenancy_start_date");
  });

  it("compliance template uses compliance_type as the column name (not requirement_type)", () => {
    const header = getTemplateHeaders("compliance").split("\n")[0];
    expect(header).toContain("compliance_type");
    expect(header).not.toContain("requirement_type");
  });

  it("compliance template includes tenancy_start_date column", () => {
    const header = getTemplateHeaders("compliance").split("\n")[0];
    expect(header).toContain("tenancy_start_date");
  });

  it("compliance template includes all 6 compliance_type values in example rows", () => {
    const csv = getTemplateHeaders("compliance");
    for (const ct of COMPLIANCE_TYPES) {
      expect(csv).toContain(ct);
    }
  });

  it("compliance template example rows parse back to valid compliance_type via column aliases", () => {
    const csv = getTemplateHeaders("compliance");
    const { rows } = parseTabCsv(csv, "compliance");
    const types = rows.map((r) => r.requirement_type);
    for (const ct of COMPLIANCE_TYPES) {
      expect(types).toContain(ct);
    }
  });

  it("maintenance template has reported_date, completed_date, contractor_name, cost, notes", () => {
    const header = getTemplateHeaders("maintenance").split("\n")[0];
    expect(header).toContain("reported_date");
    expect(header).toContain("completed_date");
    expect(header).toContain("contractor_name");
    expect(header).toContain("cost");
    expect(header).toContain("notes");
  });

  it("maintenance template example rows include valid priority values (normal, urgent)", () => {
    const csv = getTemplateHeaders("maintenance");
    expect(csv).toContain("normal");
    expect(csv).toContain("urgent");
  });

  it("maintenance template example rows include valid status values (open, closed)", () => {
    const csv = getTemplateHeaders("maintenance");
    expect(csv).toContain(",open,");
    expect(csv).toContain(",closed,");
  });

  it("templates do not include phantom property-level compliance columns", () => {
    const phantom = ["epc_expiry", "gas_cp12_date", "eicr_date", "gas_safety_expiry"];
    for (const tab of ["properties", "tenancies", "compliance", "maintenance"]) {
      const csv = getTemplateHeaders(tab);
      for (const col of phantom) {
        expect(csv).not.toContain(col);
      }
    }
  });

  it("compliance template example rows are parseable with no parse errors", () => {
    const csv = getTemplateHeaders("compliance");
    const { rows, parseErrors } = parseTabCsv(csv, "compliance");
    expect(parseErrors).toHaveLength(0);
    expect(rows.length).toBeGreaterThan(0);
  });

  it("maintenance template example rows are parseable with no parse errors", () => {
    const csv = getTemplateHeaders("maintenance");
    const { rows, parseErrors } = parseTabCsv(csv, "maintenance");
    expect(parseErrors).toHaveLength(0);
    expect(rows.length).toBeGreaterThan(0);
  });
});
