import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { MarketingFeaturesPage } from "../../../components/marketing/features-page";
import { featuresPageContentByLocale } from "../../../content/features-page";
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

  const content = featuresPageContentByLocale[locale];

  return buildMetadata({
    title: content.seo.title,
    description: content.seo.description,
    canonical: content.seo.canonicalPath,
    languages: {
      en: "/features",
      pl: "/pl/features",
      de: "/de/features",
      "x-default": "/features",
    },
  });
}

export default async function LocalizedFeaturesPage({ params }: { params: Params }) {
  const { locale } = await params;

  if (!isLocale(locale) || locale === "en") {
    notFound();
  }

  return <MarketingFeaturesPage locale={locale as Locale} />;
}
