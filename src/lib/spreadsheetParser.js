/**
 * Spreadsheet parser for landlord import (P-009).
 *
 * Parses CSV text into typed row objects for each tab.
 * All matching/normalisation happens in the SQL RPC — this layer handles
 * only structural parsing, formula/injection neutralization, and field validation.
 *
 * Tabs: properties | tenancies | compliance | maintenance
 *
 * T-INTEGRITY-3: CSV/formula injection neutralization.
 * Cells starting with = @ + (followed by a letter) are neutralized by prefixing
 * with a tab character so they cannot execute in Excel/LibreOffice on round-trip export.
 * Affected rows are flagged with _injection_detected so callers can send them to
 * needs_review rather than silently importing an unreviewed formula value.
 */

/** Chars that trigger formula injection in common spreadsheet apps. */
const INJECTION_STARTERS = new Set(["=", "@"]);

/** Known DDE payload patterns (beyond leading-char detection). */
const DDE_PATTERNS = [
  /^=HYPERLINK\(/i,
  /^=cmd\|/i,
  /^=DDE\(/i,
  /^=MSEXCEL\|/i,
];

/**
 * Neutralize a single cell value for CSV/formula injection.
 * Prefixes dangerous values with a tab so spreadsheet apps treat them as text.
 * Returns { value, injectionDetected, original }.
 */
export function neutralizeFormulaValue(rawValue) {
  if (typeof rawValue !== "string" || rawValue === "") {
    return { value: rawValue, injectionDetected: false };
  }
  const trimmed = rawValue.trim();

  // Leading = or @ — always formula candidates
  if (INJECTION_STARTERS.has(trimmed[0])) {
    return { value: "\t" + trimmed, injectionDetected: true, original: rawValue };
  }

  // + or - followed by a letter → formula injection (not a number)
  if ((trimmed[0] === "+" || trimmed[0] === "-") && /^[+-][A-Za-z]/.test(trimmed)) {
    return { value: "\t" + trimmed, injectionDetected: true, original: rawValue };
  }

  // DDE patterns even without leading = (e.g. inside quoted cells)
  for (const pattern of DDE_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { value: "\t" + trimmed, injectionDetected: true, original: rawValue };
    }
  }

  return { value: rawValue, injectionDetected: false };
}

/** Parse a CSV string into an array of raw row objects keyed by header. */
export function parseCsv(csvText) {
  const lines = csvText
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((l) => l.trim().length > 0);

  if (lines.length < 2) return [];

  // Normalize headers: lowercase + collapse spaces/hyphens to underscores
  const headers = splitCsvLine(lines[0]).map((h) =>
    h.trim().toLowerCase().replace(/[\s\-]+/g, "_")
  );

  return lines.slice(1).map((line, i) => {
    const cells = splitCsvLine(line);
    const row = { _row_number: i + 2, _injection_detected: false };
    headers.forEach((header, idx) => {
      const raw = cells[idx] !== undefined ? cells[idx].trim() : "";
      const { value, injectionDetected } = neutralizeFormulaValue(raw);
      row[header] = value;
      if (injectionDetected) {
        row._injection_detected = true;
        row._injection_columns = row._injection_columns
          ? [...row._injection_columns, header]
          : [header];
      }
    });
    return row;
  });
}

function splitCsvLine(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      cells.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells;
}

/** Column aliases → canonical names for each tab. */
const COLUMN_ALIASES = {
  properties: {
    address: ["address", "property_address", "full_address"],
    city: ["city", "town", "location"],
    rent: ["rent", "monthly_rent", "rent_amount"],
    size: ["size", "property_size", "sq_ft", "sqft"],
    external_property_ref: ["external_property_ref", "property_ref", "ref", "external_ref", "id"],
  },
  tenancies: {
    external_property_ref: ["external_property_ref", "property_ref", "ref", "external_ref"],
    address: ["address", "property_address"],
    tenant_name: ["tenant_name", "name", "tenant"],
    tenant_email: ["tenant_email", "email"],
    tenant_phone: ["tenant_phone", "phone"],
    start_date: ["start_date", "lease_start", "tenancy_start"],
    end_date: ["end_date", "lease_end", "tenancy_end"],
    rent_amount: ["rent_amount", "rent", "monthly_rent"],
    rent_frequency: ["rent_frequency", "frequency"],
    deposit_amount: ["deposit_amount", "deposit"],
  },
  compliance: {
    external_property_ref: ["external_property_ref", "property_ref", "ref", "external_ref"],
    address: ["address", "property_address"],
    tenant_email: ["tenant_email", "email"],
    requirement_type: ["requirement_type", "type", "compliance_type", "category"],
    expiry_date: ["expiry_date", "expires", "expiry", "valid_until", "next_due"],
    completed_date: ["completed_date", "completed", "issued_date", "certificate_date"],
    scheme_reference: ["scheme_reference", "scheme_ref", "deposit_scheme_ref", "reference"],
    notes: ["notes", "note", "comments"],
  },
  maintenance: {
    external_property_ref: ["external_property_ref", "property_ref", "ref", "external_ref"],
    address: ["address", "property_address"],
    title: ["title", "issue", "subject"],
    description: ["description", "details", "notes"],
    priority: ["priority"],
    status: ["status"],
  },
};

/** Normalise a raw CSV row for a given tab by applying column aliases. */
function normaliseRow(rawRow, tab) {
  const aliases = COLUMN_ALIASES[tab] ?? {};
  const result = {};

  Object.entries(aliases).forEach(([canonical, candidates]) => {
    for (const candidate of candidates) {
      if (rawRow[candidate] !== undefined && rawRow[candidate] !== "") {
        result[canonical] = rawRow[candidate];
        break;
      }
    }
    if (result[canonical] === undefined) result[canonical] = "";
  });

  // Carry injection metadata through so RPC callers can route to needs_review
  result._injection_detected = rawRow._injection_detected || false;
  result._injection_columns = rawRow._injection_columns || [];

  return result;
}

const REQUIRED_FIELDS = {
  properties: ["address"],
  tenancies: ["tenant_email"],
  compliance: ["requirement_type"],
  maintenance: ["title"],
};

/**
 * Parse CSV text for a specific tab and return { rows, parseErrors, sourceRowCount }.
 *
 * T-INTEGRITY-1 support: sourceRowCount = total data rows in source (excluding header).
 * Callers should assert: rows.length + parseErrors.length == sourceRowCount.
 *
 * @param {string} csvText
 * @param {string} tab
 * @returns {{ rows: object[], parseErrors: string[], sourceRowCount: number }}
 */
export function parseTabCsv(csvText, tab) {
  const rawRows = parseCsv(csvText);
  const parseErrors = [];
  const rows = [];
  const required = REQUIRED_FIELDS[tab] ?? [];

  rawRows.forEach((raw) => {
    const row = normaliseRow(raw, tab);
    const rowNum = raw._row_number;

    // Injection-detected rows go to needs_review in the RPC; still included in rows[]
    // so the row-count invariant holds. Mark them so the RPC can route them correctly.
    if (row._injection_detected) {
      row._parse_warning = `Row ${rowNum}: formula/injection value detected in column(s): ${row._injection_columns.join(", ")}. Value neutralized. Please review before committing.`;
    }

    const missing = required.filter((field) => !row[field] || row[field].trim() === "");
    if (missing.length > 0) {
      parseErrors.push(`Row ${rowNum}: missing required field(s): ${missing.join(", ")}`);
      return; // excluded from rows[] — counts against parseErrors for row-count invariant
    }

    rows.push(row);
  });

  return {
    rows,
    parseErrors,
    // T-INTEGRITY-1: total data rows in source (header excluded)
    sourceRowCount: rawRows.length,
  };
}

/**
 * Assert the row-count invariant for a batch result (T-INTEGRITY-1).
 * Returns true if invariant holds; throws with details if not.
 *
 * batchResult: { total, imported, skipped, needs_review, error }
 * sourceRowCount: rows sent to the RPC (after parser filtering)
 */
export function assertRowCountInvariant(batchResult, sourceRowCount) {
  const { imported = 0, skipped = 0, needs_review = 0, error: errorCount = 0, total } = batchResult;
  const accountedFor = imported + skipped + needs_review + errorCount;

  if (total !== sourceRowCount) {
    throw new Error(
      `Row-count invariant violated: RPC received total=${total} but caller sent ${sourceRowCount} rows`
    );
  }
  if (accountedFor !== total) {
    throw new Error(
      `Row-count invariant violated: imported(${imported}) + skipped(${skipped}) + needs_review(${needs_review}) + error(${errorCount}) = ${accountedFor} ≠ total(${total}). ${total - accountedFor} row(s) unaccounted for.`
    );
  }
  return true;
}

/**
 * Compute a simple FNV-like hex hash of a string for idempotency checking.
 * Not cryptographic — only used to detect re-uploads of identical files.
 */
export function hashFileContent(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * Return template CSV headers for a given tab.
 */
export function getTemplateHeaders(tab) {
  const HEADERS = {
    properties: "address,city,rent,size,external_property_ref",
    tenancies:
      "address,external_property_ref,tenant_name,tenant_email,tenant_phone,start_date,end_date,rent_amount,rent_frequency,deposit_amount",
    compliance:
      "address,external_property_ref,tenant_email,requirement_type,expiry_date,completed_date,scheme_reference,notes",
    maintenance: "address,external_property_ref,title,description,priority,status",
  };
  return HEADERS[tab] ?? "";
}

/**
 * Validate a date string — returns true if parseable and not before year 2000.
 * Used for preview-time validation; the RPC does final enforcement.
 */
export function isValidImportDate(value) {
  if (!value || !value.trim()) return true; // empty is fine (optional)
  const d = new Date(value.trim());
  if (isNaN(d.getTime())) return false;
  if (d.getFullYear() < 2000) return false;
  // Reject Excel serial numbers (numeric strings)
  if (/^\d{4,6}$/.test(value.trim())) return false;
  return true;
}

/**
 * Parse a currency string to a number, or null if unparseable.
 * Handles UK format (£1,250.00) and plain numbers.
 * Does NOT handle ambiguous European format (1.250,00) — caller should flag for review.
 */
export function parseCurrencyValue(raw) {
  if (!raw || !raw.trim()) return null;
  const cleaned = raw.trim().replace(/^£/, "").replace(/,/g, "");
  const num = parseFloat(cleaned);
  if (isNaN(num)) return null;
  // Reject if original looked like European format (comma as decimal)
  if (/\d,\d{1,2}$/.test(raw.trim())) return null;
  return num;
}
