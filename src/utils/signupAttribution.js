const STORAGE_KEY = "tenaqo.signup_attribution.v1";

function hasBrowserGlobals() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function readStoredAttribution() {
  if (!hasBrowserGlobals()) return {};
  try {
    const raw = window.sessionStorage?.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeStoredAttribution(value) {
  if (!hasBrowserGlobals()) return;
  try {
    window.sessionStorage?.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Attribution is useful but never critical.
  }
}

export function captureSignupAttribution() {
  if (!hasBrowserGlobals()) return {};

  const params = new URLSearchParams(window.location.search || "");
  const next = {
    signupSource: params.get("source") || params.get("signup_source") || "",
    utmSource: params.get("utm_source") || "",
    utmMedium: params.get("utm_medium") || "",
    utmCampaign: params.get("utm_campaign") || "",
    referrer: document.referrer || "",
    landingPath: `${window.location.pathname || ""}${window.location.search || ""}`,
  };

  const stored = readStoredAttribution();
  const merged = { ...stored };
  for (const [key, value] of Object.entries(next)) {
    if (value && !merged[key]) merged[key] = value;
  }
  writeStoredAttribution(merged);
  return merged;
}

export function getSignupAttribution() {
  if (!hasBrowserGlobals()) return {};
  return captureSignupAttribution();
}

export function clearSignupAttribution() {
  if (!hasBrowserGlobals()) return;
  try {
    window.sessionStorage?.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
}
