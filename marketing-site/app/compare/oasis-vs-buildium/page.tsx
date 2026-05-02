import type { Metadata } from "next";

import { BenefitGrid } from "../../../components/marketing/benefit-grid";
import { ComparisonTable } from "../../../components/marketing/comparison-table";
import { ContentSection } from "../../../components/marketing/content-section";
import { FinalCta } from "../../../components/marketing/final-cta";
import { PageHero } from "../../../components/marketing/page-hero";
import { oasisVsBuildiumContent } from "../../../content/comparisons/oasis-vs-buildium";
import { buildMetadata } from "../../../lib/metadata";

export const metadata: Metadata = buildMetadata(oasisVsBuildiumContent.seo);

export default function OasisVsBuildiumPage() {
  return (
    <>
      <PageHero {...oasisVsBuildiumContent.hero} />
      <ContentSection {...oasisVsBuildiumContent.summary} />
      <ComparisonTable {...oasisVsBuildiumContent.comparisonTable} />
      <ContentSection {...oasisVsBuildiumContent.differences} />
      <BenefitGrid {...oasisVsBuildiumContent.fit} />
      <FinalCta {...oasisVsBuildiumContent.finalCta} />
    </>
  );
}
