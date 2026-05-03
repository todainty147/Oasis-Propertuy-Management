import type { Metadata } from "next";

import { BenefitGrid } from "../../../components/marketing/benefit-grid";
import { ContentSection } from "../../../components/marketing/content-section";
import { FinalCta } from "../../../components/marketing/final-cta";
import { PageHero } from "../../../components/marketing/page-hero";
import { commandCenterContent } from "../../../content/features/command-center";
import { buildMetadata } from "../../../lib/metadata";

export const metadata: Metadata = buildMetadata(commandCenterContent.seo);

export default function CommandCenterPage() {
  return (
    <>
      <PageHero {...commandCenterContent.hero} />
      <ContentSection {...commandCenterContent.problemSection} />
      <ContentSection {...commandCenterContent.solutionSection} />
      <BenefitGrid {...commandCenterContent.benefits} />
      <FinalCta {...commandCenterContent.finalCta} />
    </>
  );
}
