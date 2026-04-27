import type { Locale } from "../../lib/i18n";

import { pricingContentByLocale } from "../../content/pricing";
import { ContentSection } from "./content-section";
import { FaqList } from "./faq-list";
import { FinalCta } from "./final-cta";
import { IncludedFeatures } from "./included-features";
import { PageHero } from "./page-hero";
import { PricingCards } from "./pricing-cards";

export function MarketingPricingPage({ locale }: { locale: Locale }) {
  const content = pricingContentByLocale[locale];

  return (
    <>
      <PageHero {...content.hero} />
      <ContentSection {...content.intro} />
      <PricingCards plans={content.plans} ctaLabel={content.planCtaLabel} />
      <IncludedFeatures {...content.included} />
      <FaqList title={content.faqTitle} items={content.faqs} />
      <FinalCta {...content.finalCta} />
    </>
  );
}
