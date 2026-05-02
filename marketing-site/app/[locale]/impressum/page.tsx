import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LegalNoticePage } from "../../../components/marketing/legal-notice-page";
import { legalNoticeContentByLocale } from "../../../content/legal";
import { buildMetadata } from "../../../lib/metadata";
import { isLocale, locales, type Locale } from "../../../lib/i18n";

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

  const content = legalNoticeContentByLocale[locale];

  return buildMetadata({
    title: content.seo.title,
    description: content.seo.description,
    canonical: content.seo.canonicalPath,
    languages: {
      en: "/impressum",
      pl: "/pl/impressum",
      de: "/de/impressum",
      "x-default": "/impressum",
    },
  });
}

export default async function LocalizedImpressumPage({ params }: { params: Params }) {
  const { locale } = await params;

  if (!isLocale(locale) || locale === "en") {
    notFound();
  }

  return <LegalNoticePage locale={locale as Locale} />;
}
