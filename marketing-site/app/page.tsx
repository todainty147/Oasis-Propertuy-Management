import type { Metadata } from "next";

import { BenefitGrid } from "../components/marketing/benefit-grid";
import { ContentSection } from "../components/marketing/content-section";
import { FeatureGrid } from "../components/marketing/feature-grid";
import { FinalCta } from "../components/marketing/final-cta";
import { HeroSection } from "../components/marketing/hero-section";
import { PricingPreview } from "../components/marketing/pricing-preview";
import { ProductPreview } from "../components/marketing/product-preview";
import { TestimonialStrip } from "../components/marketing/testimonial-strip";
import { WorkflowShowcase } from "../components/marketing/workflow-showcase";
import { homepageContent } from "../content/homepage";
import { buildMetadata } from "../lib/metadata";

export const metadata: Metadata = buildMetadata(homepageContent.seo);

export default function HomePage() {
  return (
    <>
      <HeroSection {...homepageContent.hero} />
      <ContentSection {...homepageContent.problemSection} />
      <FeatureGrid {...homepageContent.solutionSection} />
      <ProductPreview {...homepageContent.productPreview} />
      <WorkflowShowcase {...homepageContent.workflowSection} />
      <BenefitGrid {...homepageContent.benefitsSection} />
      <PricingPreview {...homepageContent.pricingPreview} />
      <TestimonialStrip {...homepageContent.testimonials} />
      <FinalCta {...homepageContent.finalCta} />
    </>
  );
}
