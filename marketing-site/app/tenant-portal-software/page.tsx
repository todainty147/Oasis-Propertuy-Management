import type { Metadata } from "next";

import { MarketingTenantPortalLandingPage } from "../../components/marketing/tenant-portal-landing-page";
import { tenantPortalLandingContentByLocale } from "../../content/tenant-portal-landing";
import { buildMetadata } from "../../lib/metadata";

const englishTenantPortalLandingContent = tenantPortalLandingContentByLocale.en;

export const metadata: Metadata = buildMetadata({
  title: englishTenantPortalLandingContent.seo.title,
  description: englishTenantPortalLandingContent.seo.description,
  canonical: englishTenantPortalLandingContent.seo.canonicalPath,
  languages: {
    en: "/tenant-portal-software",
    pl: "/pl/tenant-portal-software",
    de: "/de/tenant-portal-software",
    "x-default": "/tenant-portal-software",
  },
});

export default function TenantPortalSoftwarePage() {
  return <MarketingTenantPortalLandingPage locale="en" />;
}
