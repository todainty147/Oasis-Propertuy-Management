import type { Locale } from "../../lib/i18n";

import { homepageContentByLocale } from "../../content/homepage";
import { ContentSection } from "./content-section";
import { FeatureGrid } from "./feature-grid";
import { FinalCta } from "./final-cta";
import { HeroSection } from "./hero-section";
import { ProductPreview } from "./product-preview";
import { WorkflowShowcase } from "./workflow-showcase";

export function MarketingHomePage({ locale }: { locale: Locale }) {
  const homepageContent = homepageContentByLocale[locale];

  return (
    <main lang={locale}>
      <HeroSection {...homepageContent.hero} />
      <ContentSection {...homepageContent.problemSection} />
      <FeatureGrid {...homepageContent.solutionSection} />
      <ProductPreview {...homepageContent.productPreview} />
      <ContentSection {...homepageContent.healthSection} />
      <ContentSection {...homepageContent.tenantPortalSection} />
      <WorkflowShowcase {...homepageContent.workflowSection} />
      <ContentSection {...homepageContent.securitySection} />
      <FinalCta {...homepageContent.finalCta} />
    </main>
  );
}
