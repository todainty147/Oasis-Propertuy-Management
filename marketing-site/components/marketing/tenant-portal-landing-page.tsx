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
      <HeroSection {...content.hero} locale={locale} />
      <FeatureGrid {...content.problemSection} />
      <ContentSection {...content.portalSection} locale={locale} />
      <WorkflowShowcase {...content.workflowSection} locale={locale} />
      <ContentSection {...content.proofSection} locale={locale} />
      <FinalCta {...content.finalCta} locale={locale} />
    </>
  );
}
