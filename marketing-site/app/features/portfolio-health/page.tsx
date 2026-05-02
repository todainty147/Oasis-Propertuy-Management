import type { Metadata } from "next";

import { BenefitGrid } from "../../../components/marketing/benefit-grid";
import { ContentSection } from "../../../components/marketing/content-section";
import { FinalCta } from "../../../components/marketing/final-cta";
import { PageHero } from "../../../components/marketing/page-hero";
import { portfolioHealthContent } from "../../../content/features/portfolio-health";
import { buildMetadata } from "../../../lib/metadata";

export const metadata: Metadata = buildMetadata(portfolioHealthContent.seo);

export default function PortfolioHealthPage() {
  return (
    <>
      <PageHero {...portfolioHealthContent.hero} />
      <ContentSection {...portfolioHealthContent.problemSection} />
      <ContentSection {...portfolioHealthContent.solutionSection} />
      <BenefitGrid {...portfolioHealthContent.benefits} />
      <FinalCta {...portfolioHealthContent.finalCta} />
    </>
  );
}
