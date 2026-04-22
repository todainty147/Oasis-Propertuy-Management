import type { Metadata } from "next";

import { ContentSection } from "../components/marketing/content-section";
import { FeatureGrid } from "../components/marketing/feature-grid";
import { FinalCta } from "../components/marketing/final-cta";
import { HeroSection } from "../components/marketing/hero-section";
import { ProductPreview } from "../components/marketing/product-preview";
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
      <ContentSection {...homepageContent.healthSection} />
      <WorkflowShowcase {...homepageContent.workflowSection} />
      <FinalCta {...homepageContent.finalCta} />
    </>
  );
}
