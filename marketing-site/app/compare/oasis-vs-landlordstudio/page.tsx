import type { Metadata } from "next";

import { MarketingComparisonPage } from "../../../components/marketing/comparison-page";
import { oasisVsLandlordStudioContentByLocale } from "../../../content/comparisons/oasis-vs-landlordstudio-localized";
import { buildMetadata } from "../../../lib/metadata";

export const metadata: Metadata = {
  ...buildMetadata({
    title: oasisVsLandlordStudioContentByLocale.en.seo.title,
    description: oasisVsLandlordStudioContentByLocale.en.seo.description,
    canonical: oasisVsLandlordStudioContentByLocale.en.seo.canonicalPath,
    languages: {
      en: "/compare/oasis-vs-landlordstudio",
      pl: "/pl/compare/oasis-vs-landlordstudio",
      de: "/de/compare/oasis-vs-landlordstudio",
      "x-default": "/compare/oasis-vs-landlordstudio",
    },
  }),
  // Legacy OASIS-era comparison page. Keep dark until content is refreshed
  // and the page strategy is separately approved.
  robots: { index: false, follow: true },
};

export default function OasisVsLandlordStudioPage() {
  return <MarketingComparisonPage locale="en" />;
}
