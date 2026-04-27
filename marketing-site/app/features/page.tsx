import type { Metadata } from "next";

import { MarketingFeaturesPage } from "../../components/marketing/features-page";
import { featuresPageContentByLocale } from "../../content/features-page";
import { buildMetadata } from "../../lib/metadata";

const englishFeaturesContent = featuresPageContentByLocale.en;

export const metadata: Metadata = buildMetadata({
  title: englishFeaturesContent.seo.title,
  description: englishFeaturesContent.seo.description,
  canonical: englishFeaturesContent.seo.canonicalPath,
  languages: {
    en: "/features",
    pl: "/pl/features",
    de: "/de/features",
    "x-default": "/features",
  },
});

export default function FeaturesPage() {
  return <MarketingFeaturesPage locale="en" />;
}
