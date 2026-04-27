"use client";

import Link from "next/link";
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
          <div className="logo">OASIS Rental</div>
          <p className="muted" style={{ marginTop: "0.75rem", maxWidth: 420 }}>
            {copy.footerBlurb}
          </p>
        </div>
        <div className="footer-links">
          <Link href={getLocalizedMarketingHref(locale, "/features")}>{copy.footerLinks.features}</Link>
          <Link href={getLocalizedMarketingHref(locale, "/pricing")}>{copy.footerLinks.pricing}</Link>
          <Link href={getLocalizedMarketingHref(locale, "/compare/oasis-vs-landlordstudio")}>
            {copy.footerLinks.compare}
          </Link>
          <Link href={getLocalizedMarketingHref(locale, "/blog")}>{copy.footerLinks.blog}</Link>
          <Link href={siteConfig.appUrl}>{copy.footerLinks.earlyAccess}</Link>
        </div>
      </div>
    </footer>
  );
}
