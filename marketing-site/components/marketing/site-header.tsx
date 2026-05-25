"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";

import { siteConfig, siteCopyByLocale } from "../../content/site";
import {
  getEquivalentMarketingPath,
  getLocaleFromPathname,
  getLocalizedMarketingHref,
  type Locale,
} from "../../lib/i18n";

const languageOrder: Locale[] = ["en", "pl", "de"];
const languageFlags: Record<Locale, string> = {
  en: "🇬🇧",
  pl: "🇵🇱",
  de: "🇩🇪",
};

const languageFullNames: Record<Locale, string> = {
  en: "English",
  pl: "Polski",
  de: "Deutsch",
};

export function SiteHeader() {
  const pathname = usePathname() || "/";
  const locale = getLocaleFromPathname(pathname);
  const copy = siteCopyByLocale[locale];
  const homeHref = locale === "en" ? "/" : `/${locale}`;
  const [navOpen, setNavOpen] = useState(false);
  const detailsRef = useRef<HTMLDetailsElement>(null);

  const closeNav = () => {
    setNavOpen(false);
    if (detailsRef.current) {
      detailsRef.current.open = false;
    }
  };

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
          <details className="language-switcher" ref={detailsRef}>
            <summary className="language-switcher__summary" aria-label={copy.languageSwitcherLabel}>
              <span aria-hidden="true">{languageFlags[locale]}</span>
              <span>{languageFullNames[locale]}</span>
              <span className="language-switcher__chevron" aria-hidden="true">
                <svg width="10" height="6" viewBox="0 0 10 6" fill="none" focusable="false">
                  <path
                    d="M1 1l4 4 4-4"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            </summary>
            <div className="language-switcher__menu">
              {languageOrder.map((targetLocale) => (
                <Link
                  key={targetLocale}
                  href={getEquivalentMarketingPath(pathname, targetLocale)}
                  className={`language-switcher__option ${
                    targetLocale === locale ? "language-switcher__option--active" : ""
                  }`}
                  hrefLang={targetLocale}
                  lang={targetLocale}
                  onClick={closeNav}
                >
                  <span aria-hidden="true">{languageFlags[targetLocale]}</span>
                  <span>{languageFullNames[targetLocale]}</span>
                </Link>
              ))}
            </div>
          </details>
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
