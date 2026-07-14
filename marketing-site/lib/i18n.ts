export const locales = ["en", "pl", "de"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

const localizedPaths = new Set([
  "/",
  "/features",
  "/features/command-center",
  "/features/compliance",
  "/features/maintenance-management",
  "/features/portfolio-health",
  "/features/rental-accounting",
  "/features/security-audit",
  "/features/tenant-management",
  "/features/tenant-portal",
  "/pricing",
  "/tenant-portal-software",
  "/blog",
  "/impressum",
  // /compare/tenaqo-vs-landlord-management-apps is English-only (WP4C).
  // Polish navigation links directly to the English route; the /pl/compare/...
  // page issues a permanent redirect (308) to the canonical English URL.
]);

const localizedPathAliases: Partial<Record<string, string>> = {};

export function isLocale(value: string): value is Locale {
  return locales.includes(value as Locale);
}

export function getLocaleFromPathname(pathname: string): Locale {
  if (pathname === "/pl" || pathname.startsWith("/pl/")) {
    return "pl";
  }

  if (pathname === "/de" || pathname.startsWith("/de/")) {
    return "de";
  }

  return defaultLocale;
}

export function stripLocalePrefix(pathname: string): string {
  const locale = getLocaleFromPathname(pathname);

  if (locale === defaultLocale) {
    return pathname || "/";
  }

  const prefix = `/${locale}`;
  const nextPath = pathname.startsWith(prefix) ? pathname.slice(prefix.length) || "/" : pathname;

  return nextPath.startsWith("/") ? nextPath : `/${nextPath}`;
}

export function getLocalePath(locale: Locale, pathname: string = "/"): string {
  const nextPath = pathname === "" ? "/" : pathname;

  if (locale === defaultLocale) {
    return nextPath;
  }

  return nextPath === "/" ? `/${locale}` : `/${locale}${nextPath}`;
}

export function getEquivalentMarketingPath(pathname: string, targetLocale: Locale): string {
  const normalizedPath = stripLocalePrefix(pathname || "/");
  const localizedEquivalent = localizedPaths.has(normalizedPath)
    ? normalizedPath
    : localizedPathAliases[normalizedPath];

  if (localizedEquivalent) {
    return getLocalePath(targetLocale, localizedEquivalent);
  }

  if (targetLocale === defaultLocale) {
    return normalizedPath;
  }

  return getLocalePath(targetLocale, "/");
}

export function getLocalizedMarketingHref(locale: Locale, href: string): string {
  if (href.startsWith("http://") || href.startsWith("https://") || !href.startsWith("/")) {
    return href;
  }

  const nextHref = locale === defaultLocale ? href : localizedPathAliases[href] || href;

  if (!localizedPaths.has(nextHref)) {
    return href;
  }

  return getLocalePath(locale, nextHref);
}
