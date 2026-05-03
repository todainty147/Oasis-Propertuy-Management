import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { MarketingBlogIndexPage } from "../../../components/marketing/blog-index-page";
import { blogIndexContentByLocale } from "../../../content/blog-index";
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

  const content = blogIndexContentByLocale[locale];

  return buildMetadata({
    title: content.seo.title,
    description: content.seo.description,
    canonical: content.seo.canonicalPath,
    languages: {
      en: "/blog",
      pl: "/pl/blog",
      de: "/de/blog",
      "x-default": "/blog",
    },
  });
}

export default async function LocalizedBlogPage({ params }: { params: Params }) {
  const { locale } = await params;

  if (!isLocale(locale) || locale === "en") {
    notFound();
  }

  return <MarketingBlogIndexPage locale={locale as Locale} />;
}
