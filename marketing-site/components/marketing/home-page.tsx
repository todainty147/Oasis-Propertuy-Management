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
      <HeroSection {...homepageContent.hero} locale={locale} />
      <ContentSection {...homepageContent.problemSection} locale={locale} />
      <FeatureGrid {...homepageContent.solutionSection} />
      <ProductPreview {...homepageContent.productPreview} />
      <ContentSection {...homepageContent.healthSection} locale={locale} />
      <ContentSection {...homepageContent.tenantPortalSection} locale={locale} />
      <WorkflowShowcase {...homepageContent.workflowSection} locale={locale} />
      <ContentSection {...homepageContent.securitySection} locale={locale} />
      <FinalCta {...homepageContent.finalCta} locale={locale} />
    </main>
  );
}
