"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { siteConfig, siteCopyByLocale } from "../../content/site";
import {
  getEquivalentMarketingPath,
  getLocaleFromPathname,
  getLocalizedMarketingHref,
  type Locale,
} from "../../lib/i18n";

const languageOrder: Locale[] = ["en", "pl", "de"];

export function SiteHeader() {
  const pathname = usePathname() || "/";
  const locale = getLocaleFromPathname(pathname);
  const copy = siteCopyByLocale[locale];
  const homeHref = locale === "en" ? "/" : `/${locale}`;

  return (
    <header className="site-header">
      <div className="container site-header__inner">
        <Link href={homeHref} className="logo">
          {siteConfig.name}
        </Link>
        <nav className="site-nav" aria-label="Primary">
          {siteConfig.nav.map((item) => (
            <Link
              key={item.key}
              href={getLocalizedMarketingHref(
                locale,
                copy.navHrefOverrides?.[item.key] || item.href,
              )}
            >
              {copy.nav[item.key]}
            </Link>
          ))}
          <div className="language-switcher" aria-label={copy.languageSwitcherLabel}>
            {languageOrder.map((targetLocale) => (
              <Link
                key={targetLocale}
                href={getEquivalentMarketingPath(pathname, targetLocale)}
                className={`language-switcher__link ${
                  targetLocale === locale ? "language-switcher__link--active" : ""
                }`}
                hrefLang={targetLocale}
                lang={targetLocale}
              >
                {copy.languageNames[targetLocale]}
              </Link>
            ))}
          </div>
          <Link href={siteConfig.appUrl}>{copy.signIn}</Link>
          <Link href={siteConfig.appUrl} className="button button-primary">
            {copy.primaryCta}
          </Link>
        </nav>
      </div>
    </header>
  );
}
