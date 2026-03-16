import type { Metadata } from "next";

import { BenefitGrid } from "../../../components/marketing/benefit-grid";
import { ComparisonTable } from "../../../components/marketing/comparison-table";
import { ContentSection } from "../../../components/marketing/content-section";
import { FinalCta } from "../../../components/marketing/final-cta";
import { PageHero } from "../../../components/marketing/page-hero";
import { oasisVsLandlordStudioContent } from "../../../content/comparisons/oasis-vs-landlordstudio";
import { buildMetadata } from "../../../lib/metadata";

export const metadata: Metadata = buildMetadata(oasisVsLandlordStudioContent.seo);

export default function OasisVsLandlordStudioPage() {
  return (
    <>
      <PageHero {...oasisVsLandlordStudioContent.hero} />
      <ContentSection {...oasisVsLandlordStudioContent.summary} />
      <ComparisonTable {...oasisVsLandlordStudioContent.comparisonTable} />
      <ContentSection {...oasisVsLandlordStudioContent.differences} />
      <BenefitGrid {...oasisVsLandlordStudioContent.fit} />
      <FinalCta {...oasisVsLandlordStudioContent.finalCta} />
    </>
  );
}
