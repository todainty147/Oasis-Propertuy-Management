import type { Metadata } from "next";

import { MarketingPricingPage } from "../../components/marketing/pricing-page";
import { pricingContentByLocale } from "../../content/pricing";
import { buildMetadata } from "../../lib/metadata";

const englishPricingContent = pricingContentByLocale.en;

export const metadata: Metadata = buildMetadata({
  title: englishPricingContent.seo.title,
  description: englishPricingContent.seo.description,
  canonical: englishPricingContent.seo.canonicalPath,
  languages: {
    en: "/pricing",
    pl: "/pl/pricing",
    de: "/de/pricing",
    "x-default": "/pricing",
  },
});

export default function PricingPage() {
  return <MarketingPricingPage locale="en" />;
}
