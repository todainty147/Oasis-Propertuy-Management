import type { Metadata } from "next";

import { BenefitGrid } from "../../../components/marketing/benefit-grid";
import { ContentSection } from "../../../components/marketing/content-section";
import { FinalCta } from "../../../components/marketing/final-cta";
import { PageHero } from "../../../components/marketing/page-hero";
import { tenantPortalContent } from "../../../content/features/tenant-portal";
import { buildMetadata } from "../../../lib/metadata";

export const metadata: Metadata = buildMetadata(tenantPortalContent.seo);

export default function TenantPortalPage() {
  return (
    <>
      <PageHero {...tenantPortalContent.hero} />
      <ContentSection {...tenantPortalContent.visibilitySection} />
      <ContentSection {...tenantPortalContent.documentsSection} />
      <ContentSection {...tenantPortalContent.paymentsSection} />
      <ContentSection {...tenantPortalContent.trustLayer} />
      <BenefitGrid {...tenantPortalContent.benefits} />
      <FinalCta {...tenantPortalContent.finalCta} />
    </>
  );
}
