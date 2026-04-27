import type { Locale } from "../../lib/i18n";
import { oasisVsLandlordStudioContentByLocale } from "../../content/comparisons/oasis-vs-landlordstudio-localized";
import { BenefitGrid } from "./benefit-grid";
import { ComparisonTable } from "./comparison-table";
import { ContentSection } from "./content-section";
import { FinalCta } from "./final-cta";
import { PageHero } from "./page-hero";

export function MarketingComparisonPage({ locale }: { locale: Locale }) {
  const content = oasisVsLandlordStudioContentByLocale[locale];

  return (
    <>
      <PageHero locale={locale} {...content.hero} />
      <ContentSection locale={locale} {...content.summary} />
      <ComparisonTable {...content.comparisonTable} />
      <ContentSection locale={locale} {...content.differences} />
      <BenefitGrid {...content.fit} />
      <FinalCta locale={locale} {...content.finalCta} />
    </>
  );
}
