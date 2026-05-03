import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { MarketingPricingPage } from "../../../components/marketing/pricing-page";
import { pricingContentByLocale } from "../../../content/pricing";
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

  const content = pricingContentByLocale[locale];

  return buildMetadata({
    title: content.seo.title,
    description: content.seo.description,
    canonical: content.seo.canonicalPath,
    languages: {
      en: "/pricing",
      pl: "/pl/pricing",
      de: "/de/pricing",
      "x-default": "/pricing",
    },
  });
}

export default async function LocalizedPricingPage({ params }: { params: Params }) {
  const { locale } = await params;

  if (!isLocale(locale) || locale === "en") {
    notFound();
  }

  return <MarketingPricingPage locale={locale as Locale} />;
}
