export const locales = ["en", "pl", "de"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

const localizedHomeOnlyPaths = new Set(["/"]);

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

  if (localizedHomeOnlyPaths.has(normalizedPath)) {
    return getLocalePath(targetLocale, normalizedPath);
  }

  if (targetLocale === defaultLocale) {
    return normalizedPath;
  }

  return getLocalePath(targetLocale, "/");
}
