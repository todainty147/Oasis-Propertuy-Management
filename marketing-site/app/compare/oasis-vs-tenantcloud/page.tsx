import type { Metadata } from "next";

import { BenefitGrid } from "../../../components/marketing/benefit-grid";
import { ComparisonTable } from "../../../components/marketing/comparison-table";
import { ContentSection } from "../../../components/marketing/content-section";
import { FinalCta } from "../../../components/marketing/final-cta";
import { PageHero } from "../../../components/marketing/page-hero";
import { oasisVsTenantCloudContent } from "../../../content/comparisons/oasis-vs-tenantcloud";
import { buildMetadata } from "../../../lib/metadata";

export const metadata: Metadata = buildMetadata(oasisVsTenantCloudContent.seo);

export default function OasisVsTenantCloudPage() {
  return (
    <>
      <PageHero {...oasisVsTenantCloudContent.hero} />
      <ContentSection {...oasisVsTenantCloudContent.summary} />
      <ComparisonTable {...oasisVsTenantCloudContent.comparisonTable} />
      <ContentSection {...oasisVsTenantCloudContent.differences} />
      <BenefitGrid {...oasisVsTenantCloudContent.fit} />
      <FinalCta {...oasisVsTenantCloudContent.finalCta} />
    </>
  );
}
