import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { MarketingComparisonPage } from "../../../../components/marketing/comparison-page";
import { oasisVsLandlordStudioContentByLocale } from "../../../../content/comparisons/oasis-vs-landlordstudio-localized";
import { isLocale, locales, type Locale } from "../../../../lib/i18n";
import { buildMetadata } from "../../../../lib/metadata";

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

  const content = oasisVsLandlordStudioContentByLocale[locale];

  return buildMetadata({
    title: content.seo.title,
    description: content.seo.description,
    canonical: content.seo.canonicalPath,
    languages: {
      en: "/compare/oasis-vs-landlordstudio",
      pl: "/pl/compare/oasis-vs-landlordstudio",
      de: "/de/compare/oasis-vs-landlordstudio",
      "x-default": "/compare/oasis-vs-landlordstudio",
    },
  });
}

export default async function LocalizedOasisVsLandlordStudioPage({
  params,
}: {
  params: Params;
}) {
  const { locale } = await params;

  if (!isLocale(locale) || locale === "en") {
    notFound();
  }

  return <MarketingComparisonPage locale={locale as Locale} />;
}
