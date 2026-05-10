// Currencies and countries supported for account-level localisation.
// Matches the CHECK constraint in currency_internationalization.sql.
export const SUPPORTED_CURRENCIES = [
  { code: "PLN", label: "Polish Złoty (PLN)" },
  { code: "EUR", label: "Euro (EUR)" },
  { code: "GBP", label: "British Pound (GBP)" },
  { code: "USD", label: "US Dollar (USD)" },
  { code: "CZK", label: "Czech Koruna (CZK)" },
  { code: "CHF", label: "Swiss Franc (CHF)" },
  { code: "DKK", label: "Danish Krone (DKK)" },
  { code: "SEK", label: "Swedish Krona (SEK)" },
  { code: "NOK", label: "Norwegian Krone (NOK)" },
  { code: "HUF", label: "Hungarian Forint (HUF)" },
  { code: "RON", label: "Romanian Leu (RON)" },
  { code: "BGN", label: "Bulgarian Lev (BGN)" },
  { code: "CAD", label: "Canadian Dollar (CAD)" },
  { code: "AUD", label: "Australian Dollar (AUD)" },
];

export const SUPPORTED_COUNTRIES = [
  { code: "PL", label: "Poland",          currency: "PLN" },
  { code: "DE", label: "Germany",         currency: "EUR" },
  { code: "GB", label: "United Kingdom",  currency: "GBP" },
  { code: "IE", label: "Ireland",         currency: "EUR" },
  { code: "FR", label: "France",          currency: "EUR" },
  { code: "NL", label: "Netherlands",     currency: "EUR" },
  { code: "BE", label: "Belgium",         currency: "EUR" },
  { code: "AT", label: "Austria",         currency: "EUR" },
  { code: "ES", label: "Spain",           currency: "EUR" },
  { code: "IT", label: "Italy",           currency: "EUR" },
  { code: "PT", label: "Portugal",        currency: "EUR" },
  { code: "CZ", label: "Czech Republic",  currency: "CZK" },
  { code: "CH", label: "Switzerland",     currency: "CHF" },
  { code: "DK", label: "Denmark",         currency: "DKK" },
  { code: "SE", label: "Sweden",          currency: "SEK" },
  { code: "NO", label: "Norway",          currency: "NOK" },
  { code: "HU", label: "Hungary",         currency: "HUF" },
  { code: "RO", label: "Romania",         currency: "RON" },
  { code: "BG", label: "Bulgaria",        currency: "BGN" },
  { code: "HR", label: "Croatia",         currency: "EUR" },
  { code: "US", label: "United States",   currency: "USD" },
  { code: "CA", label: "Canada",          currency: "CAD" },
  { code: "AU", label: "Australia",       currency: "AUD" },
];

// Maps an ISO 3166-1 alpha-2 country code to a BCP 47 locale suitable for
// Intl.NumberFormat so financial amounts are formatted in local conventions.
const COUNTRY_LOCALE_MAP = {
  PL: "pl-PL", DE: "de-DE", GB: "en-GB", IE: "en-IE",
  FR: "fr-FR", NL: "nl-NL", BE: "fr-BE", AT: "de-AT",
  ES: "es-ES", IT: "it-IT", PT: "pt-PT",
  CZ: "cs-CZ", CH: "de-CH", DK: "da-DK",
  SE: "sv-SE", NO: "nb-NO", HU: "hu-HU",
  RO: "ro-RO", BG: "bg-BG", HR: "hr-HR",
  US: "en-US", CA: "en-CA", AU: "en-AU",
};

/**
 * Returns a BCP 47 locale for the given country code.
 * Used to format financial amounts according to the account's country conventions
 * regardless of the user's browser locale.
 */
export function getLocaleForCountry(countryCode) {
  return COUNTRY_LOCALE_MAP[String(countryCode || "").toUpperCase()] || getUserLocale();
}

/**
 * Returns the default currency for a given country code.
 * Useful for auto-selecting currency when the user picks a country in settings.
 */
export function getDefaultCurrencyForCountry(countryCode) {
  const country = SUPPORTED_COUNTRIES.find(
    (c) => c.code === String(countryCode || "").toUpperCase()
  );
  return country?.currency || "PLN";
}

const EURO_REGIONS = new Set([
  "AT", "BE", "CY", "DE", "EE", "ES", "FI", "FR", "GR", "HR",
  "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PT", "SI", "SK",
]);

const REGION_CURRENCY_MAP = {
  AU: "AUD",
  BG: "BGN",
  CA: "CAD",
  CH: "CHF",
  CZ: "CZK",
  DK: "DKK",
  GB: "GBP",
  HU: "HUF",
  JP: "JPY",
  NO: "NOK",
  NZ: "NZD",
  PL: "PLN",
  RO: "RON",
  SE: "SEK",
  US: "USD",
};

export function getUserLocale() {
  if (typeof navigator === "undefined") return "en-GB";
  return navigator.languages?.find(Boolean) || navigator.language || "en-GB";
}

function getLocaleRegion(locale) {
  try {
    if (typeof Intl?.Locale === "function") {
      return new Intl.Locale(locale).maximize().region || "";
    }
  } catch {
    // Ignore and fall back to string parsing.
  }

  const match = String(locale || "").match(/[-_](\w{2})\b/i);
  if (match?.[1]) return match[1].toUpperCase();

  const lang = String(locale || "").slice(0, 2).toLowerCase();
  if (lang === "pl") return "PL";
  if (lang === "en") return "GB";
  return "";
}

export function getDefaultCurrency(locale = getUserLocale()) {
  const region = getLocaleRegion(locale);
  if (EURO_REGIONS.has(region)) return "EUR";
  return REGION_CURRENCY_MAP[region] || "USD";
}

export function formatCurrencyAmount(
  value,
  {
    currency = getDefaultCurrency(),
    locale = getUserLocale(),
    minimumFractionDigits = 2,
    maximumFractionDigits = 2,
    fallback = "—",
  } = {},
) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return fallback;

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits,
      maximumFractionDigits,
    }).format(amount);
  } catch {
    return `${amount.toFixed(maximumFractionDigits)} ${currency}`;
  }
}

export function getCurrencyOptions(locale = getUserLocale()) {
  const preferred = getDefaultCurrency(locale);
  return Array.from(new Set([preferred, "EUR", "GBP", "USD", "PLN"]));
}
