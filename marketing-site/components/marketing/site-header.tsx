"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";

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
  const [navOpen, setNavOpen] = useState(false);

  const closeNav = () => setNavOpen(false);

  return (
    <header className="site-header">
      <a className="skip-to-main" href="#main-content">
        {locale === "pl" ? "Przejdź do treści" : locale === "de" ? "Zum Inhalt springen" : "Skip to main content"}
      </a>
      <div className="container site-header__inner">
        <Link href={homeHref} className="logo" onClick={closeNav} aria-label="Tenaqo rental operations software — home">
          <span className="logo__tile" aria-hidden="true">
            <Image
              src="/brand/tenaqo/logo-icon-transparent.png"
              alt=""
              width={28}
              height={28}
              className="logo__mark"
              priority
            />
          </span>
          <span className="logo__text">
            <span className="logo__name">Tenaqo</span>
            <span className="logo__tagline">Rental operations software</span>
          </span>
        </Link>

        <button
          className="site-header__hamburger"
          onClick={() => setNavOpen((o) => !o)}
          aria-label={navOpen ? "Close menu" : "Open menu"}
          aria-expanded={navOpen}
          aria-controls="primary-nav"
        >
          {navOpen ? (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <line x1="4" y1="4" x2="16" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <line x1="16" y1="4" x2="4" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <line x1="3" y1="6" x2="17" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <line x1="3" y1="10" x2="17" y2="10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <line x1="3" y1="14" x2="17" y2="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          )}
        </button>

        <nav
          id="primary-nav"
          className={`site-nav${navOpen ? " site-nav--open" : ""}`}
          aria-label="Primary"
        >
          {siteConfig.nav.map((item) => (
            <Link
              key={item.key}
              href={getLocalizedMarketingHref(
                locale,
                copy.navHrefOverrides?.[item.key] || item.href,
              )}
              onClick={closeNav}
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
                onClick={closeNav}
              >
                {copy.languageNames[targetLocale]}
              </Link>
            ))}
          </div>
          <Link href={siteConfig.appUrl} onClick={closeNav}>
            {copy.signIn}
          </Link>
          <Link href={siteConfig.appUrl} className="button button-primary" onClick={closeNav}>
            {copy.primaryCta}
          </Link>
        </nav>
      </div>
    </header>
  );
}
