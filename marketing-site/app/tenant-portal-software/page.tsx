import type { Metadata } from "next";

import { ContentSection } from "../../components/marketing/content-section";
import { FeatureGrid } from "../../components/marketing/feature-grid";
import { FinalCta } from "../../components/marketing/final-cta";
import { HeroSection } from "../../components/marketing/hero-section";
import { WorkflowShowcase } from "../../components/marketing/workflow-showcase";
import { tenantPortalLandingContent } from "../../content/tenant-portal-landing";
import { buildMetadata } from "../../lib/metadata";

export const metadata: Metadata = buildMetadata(tenantPortalLandingContent.seo);

export default function TenantPortalSoftwarePage() {
  return (
    <>
      <HeroSection {...tenantPortalLandingContent.hero} />
      <FeatureGrid {...tenantPortalLandingContent.problemSection} />
      <ContentSection {...tenantPortalLandingContent.portalSection} />
      <WorkflowShowcase {...tenantPortalLandingContent.workflowSection} />
      <ContentSection {...tenantPortalLandingContent.proofSection} />
      <FinalCta {...tenantPortalLandingContent.finalCta} />
    </>
  );
}
