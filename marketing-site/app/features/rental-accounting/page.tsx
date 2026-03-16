import type { Metadata } from "next";

import { BenefitGrid } from "../../../components/marketing/benefit-grid";
import { ContentSection } from "../../../components/marketing/content-section";
import { FinalCta } from "../../../components/marketing/final-cta";
import { PageHero } from "../../../components/marketing/page-hero";
import { rentalAccountingContent } from "../../../content/features/rental-accounting";
import { buildMetadata } from "../../../lib/metadata";

export const metadata: Metadata = buildMetadata(rentalAccountingContent.seo);

export default function RentalAccountingPage() {
  return (
    <>
      <PageHero {...rentalAccountingContent.hero} />
      <ContentSection {...rentalAccountingContent.painPoints} />
      <ContentSection {...rentalAccountingContent.solution} />
      <BenefitGrid {...rentalAccountingContent.benefits} />
      <FinalCta {...rentalAccountingContent.finalCta} />
    </>
  );
}
