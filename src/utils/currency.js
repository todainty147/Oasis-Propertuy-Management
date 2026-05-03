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
