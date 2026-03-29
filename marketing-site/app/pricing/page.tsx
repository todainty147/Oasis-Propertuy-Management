import type { Metadata } from "next";

import { FaqList } from "../../components/marketing/faq-list";
import { FinalCta } from "../../components/marketing/final-cta";
import { IncludedFeatures } from "../../components/marketing/included-features";
import { ContentSection } from "../../components/marketing/content-section";
import { PageHero } from "../../components/marketing/page-hero";
import { PricingCards } from "../../components/marketing/pricing-cards";
import { pricingContent } from "../../content/pricing";
import { buildMetadata } from "../../lib/metadata";

export const metadata: Metadata = buildMetadata(pricingContent.seo);

export default function PricingPage() {
  return (
    <>
      <PageHero {...pricingContent.hero} />
      <ContentSection {...pricingContent.intro} />
      <PricingCards plans={pricingContent.plans} />
      <IncludedFeatures {...pricingContent.included} />
      <FaqList items={pricingContent.faqs} />
      <FinalCta {...pricingContent.finalCta} />
    </>
  );
}
