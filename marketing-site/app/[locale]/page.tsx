import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { MarketingHomePage } from "../../components/marketing/home-page";
import { homepageContentByLocale } from "../../content/homepage";
import { buildMetadata } from "../../lib/metadata";
import { isLocale, locales, type Locale } from "../../lib/i18n";

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

  const content = homepageContentByLocale[locale];

  return buildMetadata({
    title: content.seo.title,
    description: content.seo.description,
    canonical: content.seo.canonicalPath,
    languages: {
      en: "/",
      pl: "/pl",
      de: "/de",
      "x-default": "/",
    },
  });
}

export default async function LocalizedHomePage({ params }: { params: Params }) {
  const { locale } = await params;

  if (!isLocale(locale) || locale === "en") {
    notFound();
  }

  return <MarketingHomePage locale={locale as Locale} />;
}
