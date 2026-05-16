// Supported compliance markets understood by Tenaqo.
export const COMPLIANCE_MARKETS = Object.freeze(['pl', 'uk', 'generic']);

// Maps ISO 3166-1 alpha-2 country codes to Tenaqo compliance markets.
const COUNTRY_TO_MARKET = Object.freeze({
  PL: 'pl',
  GB: 'uk',
  IE: 'uk',
});

/**
 * Resolves the effective compliance market for a given account + optional property.
 *
 * Resolution priority:
 *   1. property.market (explicit per-property override)
 *   2. account.default_market (explicit per-account override)
 *   3. account.country_code (mapped via COUNTRY_TO_MARKET)
 *   4. Fallback: 'uk' (existing default for UK-focused compliance)
 *
 * @param {{ account?: object, property?: object }} opts
 * @returns {'pl'|'uk'|'generic'}
 */
export function resolveComplianceMarket({ account = {}, property = {} } = {}) {
  const propertyMarket = property?.market;
  if (propertyMarket && COMPLIANCE_MARKETS.includes(propertyMarket)) {
    return propertyMarket;
  }

  const accountMarket = account?.default_market;
  if (accountMarket && COMPLIANCE_MARKETS.includes(accountMarket)) {
    return accountMarket;
  }

  const countryCode = String(account?.country_code || '').toUpperCase();
  if (countryCode && COUNTRY_TO_MARKET[countryCode]) {
    return COUNTRY_TO_MARKET[countryCode];
  }

  return 'uk';
}

/**
 * Returns true when the resolved market is Poland.
 */
export function isPolishMarket(opts) {
  return resolveComplianceMarket(opts) === 'pl';
}

// Najem Okazjonalny checklist item keys, in display order.
export const NAJEM_OKAZJONALNY_ITEM_KEYS = Object.freeze([
  'lease_agreement',
  'notarial_declaration',
  'alternative_address_decl',
  'owner_consent',
  'tax_office_notification',
  'tax_office_deadline',
  'tax_office_proof',
  'handover_protocol',
  'deposit_confirmation',
  'meter_readings',
]);

/**
 * Derives the checklist status summary from an array of compliance_checklist_items rows.
 * Returns { total, complete, notApplicable, pending, overdue }.
 */
export function summariseChecklist(items = []) {
  const total         = items.length;
  const complete      = items.filter((i) => i.status === 'complete').length;
  const notApplicable = items.filter((i) => i.status === 'not_applicable').length;
  const overdue       = items.filter((i) => {
    if (i.status !== 'pending' || !i.due_date) return false;
    return new Date(i.due_date) < new Date(new Date().toDateString());
  }).length;
  const pending       = items.filter((i) => i.status === 'pending').length;

  return { total, complete, notApplicable, pending, overdue };
}

/**
 * Calculates the suggested Tax Office notification due date (lease_start + 14 days).
 * Returns a Date or null.
 */
export function calcTaxOfficeDueDate(leaseStartDateString) {
  if (!leaseStartDateString) return null;
  const d = new Date(`${String(leaseStartDateString).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + 14);
  return d;
}

/**
 * Derives the command center bucket for a checklist item based on its due_date.
 * Mirrors the SQL bucket mapping in pl_compliance_checklist_command_items.
 *
 * @param {string|null} dueDateString
 * @returns {'urgent'|'action'|'upcoming'}
 */
export function checklistItemBucket(dueDateString) {
  if (!dueDateString) return 'action';
  const today   = new Date(new Date().toDateString());
  const dueDate = new Date(`${String(dueDateString).slice(0, 10)}T00:00:00`);
  const diffDays = Math.round((dueDate - today) / 86_400_000);

  if (diffDays < 0)  return 'urgent';
  if (diffDays <= 1) return 'urgent';
  if (diffDays <= 7) return 'action';
  return 'upcoming';
}
