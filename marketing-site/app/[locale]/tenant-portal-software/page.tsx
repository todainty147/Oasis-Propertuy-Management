import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { MarketingTenantPortalLandingPage } from "../../../components/marketing/tenant-portal-landing-page";
import { tenantPortalLandingContentByLocale } from "../../../content/tenant-portal-landing";
import { isLocale, locales, type Locale } from "../../../lib/i18n";
import { buildMetadata } from "../../../lib/metadata";

type Params = Promise<{
  locale: string;
}>;

export function generateStaticParams() {
  return locales.filter((locale) => locale !== "en").map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;

  if (!isLocale(locale) || locale === "en") {
    return {};
  }

  const content = tenantPortalLandingContentByLocale[locale];

  return buildMetadata({
    title: content.seo.title,
    description: content.seo.description,
    canonical: content.seo.canonicalPath,
    languages: {
      en: "/tenant-portal-software",
      pl: "/pl/tenant-portal-software",
      de: "/de/tenant-portal-software",
      "x-default": "/tenant-portal-software",
    },
  });
}

export default async function LocalizedTenantPortalSoftwarePage({
  params,
}: {
  params: Params;
}) {
  const { locale } = await params;

  if (!isLocale(locale) || locale === "en") {
    notFound();
  }

  return <MarketingTenantPortalLandingPage locale={locale as Locale} />;
}
