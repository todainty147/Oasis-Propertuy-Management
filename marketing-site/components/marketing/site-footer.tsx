"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

import { siteConfig, siteCopyByLocale } from "../../content/site";
import { getLocaleFromPathname, getLocalizedMarketingHref } from "../../lib/i18n";

export function SiteFooter() {
  const pathname = usePathname() || "/";
  const locale = getLocaleFromPathname(pathname);
  const copy = siteCopyByLocale[locale];

  return (
    <footer className="site-footer">
      <div className="container site-footer__inner">
        <div>
          <div className="footer-logo" aria-label="Tenaqo rental operations software">
            <span className="footer-logo__tile" aria-hidden="true">
              <Image
                src="/brand/tenaqo/logo-icon-transparent.png"
                alt=""
                width={29}
                height={29}
                className="footer-logo__mark"
              />
            </span>
            <span className="footer-logo__text">
              <span className="footer-logo__name">Tenaqo</span>
              <span className="footer-logo__tagline">Rental operations software</span>
            </span>
          </div>
          <p className="muted" style={{ marginTop: "0.75rem", maxWidth: 420 }}>
            {copy.footerBlurb}
          </p>
        </div>
        <div className="footer-links">
          <Link href={getLocalizedMarketingHref(locale, "/features")}>{copy.footerLinks.features}</Link>
          <Link href={getLocalizedMarketingHref(locale, "/pricing")}>{copy.footerLinks.pricing}</Link>
          <Link href={getLocalizedMarketingHref(locale, "/compare/tenaqo-vs-landlord-management-apps")}>
            {copy.footerLinks.compare}
          </Link>
          {locale === "en" ? <Link href="/landlord-tools">{copy.footerLinks.tools}</Link> : null}
          <Link href={getLocalizedMarketingHref(locale, "/blog")}>{copy.footerLinks.blog}</Link>
          {locale !== "de" ? <Link href="/help">{copy.footerLinks.help}</Link> : null}
          {locale !== "de" ? <Link href="/changelog">{copy.footerLinks.changelog}</Link> : null}
          <Link href={getLocalizedMarketingHref(locale, "/impressum")}>{copy.footerLinks.legalNotice}</Link>
          <Link href={siteConfig.signupUrl}>{copy.footerLinks.earlyAccess}</Link>
        </div>
      </div>
    </footer>
  );
}
