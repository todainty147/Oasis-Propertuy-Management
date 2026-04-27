import type { Locale } from "../../lib/i18n";

import { tenantPortalLandingContentByLocale } from "../../content/tenant-portal-landing";
import { ContentSection } from "./content-section";
import { FeatureGrid } from "./feature-grid";
import { FinalCta } from "./final-cta";
import { HeroSection } from "./hero-section";
import { WorkflowShowcase } from "./workflow-showcase";

export function MarketingTenantPortalLandingPage({ locale }: { locale: Locale }) {
  const content = tenantPortalLandingContentByLocale[locale];

  return (
    <>
      <HeroSection {...content.hero} />
      <FeatureGrid {...content.problemSection} />
      <ContentSection {...content.portalSection} />
      <WorkflowShowcase {...content.workflowSection} />
      <ContentSection {...content.proofSection} />
      <FinalCta {...content.finalCta} />
    </>
  );
}
