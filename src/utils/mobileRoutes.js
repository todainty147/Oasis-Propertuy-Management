/**
 * Mobile route utilities.
 *
 * - resolveRoleHome: returns the correct home path for a given role
 * - parseMobileDeepLink: validates and resolves a /mobile/* deep link
 * - MOBILE_DEEP_LINKS: canonical deep link path map
 */

/** Role → home path mapping for mobile shortcuts */
export const ROLE_HOME_PATHS = {
  owner:      "/command-center",
  admin:      "/command-center",
  staff:      "/command-center",
  tenant:     "/tenant/home",
  contractor: "/contractor-portal",
};

/** Fallback for unknown / loading roles */
export const DEFAULT_HOME_PATH = "/dashboard";

/**
 * Returns the mobile home path for the given role string.
 * Safe to call with null / undefined — returns DEFAULT_HOME_PATH.
 */
export function resolveRoleHome(role) {
  const normalised = String(role || "").toLowerCase().trim();
  return ROLE_HOME_PATHS[normalised] ?? DEFAULT_HOME_PATH;
}

/**
 * Canonical deep link paths.
 *
 * Used by:
 *  - Push notification click handlers (service worker)
 *  - Notification linkPath values
 *  - Capacitor deep link resolver
 */
export const MOBILE_DEEP_LINKS = {
  commandCenter:    "/command-center",
  maintenanceItem:  (id) => `/maintenance-inbox?requestId=${id}`,
  workOrderItem:    (id) => `/work-orders/${id}`,
  tenantIssueItem:  (id) => `/tenant/maintenance/${id}`,
  documentItem:     (id) => `/documents?id=${id}`,
  financePayment:   (id) => `/finance?paymentId=${id}`,
  complianceItem:   (id) => `/compliance?item=${id}`,
};

/**
 * Parses a /mobile/* deep link and returns a safe internal path.
 * Returns null if the deep link is not recognised.
 *
 * This is the authoritative parser for Capacitor deep link resolution.
 * Route guards and RLS still apply — this only resolves the URL, not permissions.
 */
export function parseMobileDeepLink(rawPath) {
  if (!rawPath || typeof rawPath !== "string") return null;

  const path = rawPath.replace(/^\/mobile/, "").replace(/\?.*$/, "");
  const [, segment, id] = path.split("/");

  switch (segment) {
    case "command-center":  return "/command-center";
    case "maintenance":     return id ? `/maintenance-inbox?requestId=${id}` : "/maintenance-inbox";
    case "work-orders":     return id ? `/work-orders/${id}` : null;
    case "documents":       return id ? `/documents?id=${id}` : "/documents";
    case "compliance":      return id ? `/compliance?item=${id}` : "/compliance";
    case "finance":
      return segment === "finance" && id ? `/finance?paymentId=${id}` : "/finance";
    case "tenant":
      return id ? `/tenant/maintenance/${id}` : "/tenant/home";
    default:
      return null;
  }
}
