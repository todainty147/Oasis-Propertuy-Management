import type { Metadata } from "next";

import { BenefitGrid } from "../../../components/marketing/benefit-grid";
import { ContentSection } from "../../../components/marketing/content-section";
import { FinalCta } from "../../../components/marketing/final-cta";
import { PageHero } from "../../../components/marketing/page-hero";
import { tenantManagementContent } from "../../../content/features/tenant-management";
import { buildMetadata } from "../../../lib/metadata";

export const metadata: Metadata = buildMetadata(tenantManagementContent.seo);

export default function TenantManagementPage() {
  return (
    <>
      <PageHero {...tenantManagementContent.hero} />
      <ContentSection {...tenantManagementContent.painPoints} />
      <ContentSection {...tenantManagementContent.solution} />
      <ContentSection {...tenantManagementContent.trustLayer} />
      <BenefitGrid {...tenantManagementContent.benefits} />
      <FinalCta {...tenantManagementContent.finalCta} />
    </>
  );
}
