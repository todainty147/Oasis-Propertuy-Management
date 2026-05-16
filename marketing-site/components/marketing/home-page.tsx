import type { Locale } from "../../lib/i18n";

import { homepageContentByLocale } from "../../content/homepage";
import { AgentComparison } from "./agent-comparison";
import { AppTease } from "./app-tease";
import { ContentSection } from "./content-section";
import { FeatureGrid } from "./feature-grid";
import { FinalCta } from "./final-cta";
import { HeroSection } from "./hero-section";
import { ProductPreview } from "./product-preview";
import { SeoFeatureSection } from "./seo-feature-section";
import { TestimonialCards } from "./testimonial-cards";
import { TrustBar } from "./trust-bar";

export function MarketingHomePage({ locale }: { locale: Locale }) {
  const c = homepageContentByLocale[locale];

  return (
    <main lang={locale}>
      {/* 1 — Psychological hero (PAS framework) */}
      <HeroSection {...c.hero} locale={locale} />

      {/* 2 — Trust bar (placeholder badges, no unverified logos) */}
      {c.trustBar && <TrustBar {...c.trustBar} />}

      {/* 3 — Testimonial cards (illustrative, disclaimer visible) */}
      {c.testimonials && <TestimonialCards {...c.testimonials} />}

      {/* 4 — Problem / why they switch */}
      <ContentSection {...c.problemSection} locale={locale} />

      {/* 5 — Solution grid */}
      <FeatureGrid {...c.solutionSection} />

      {/* 6 — App Tease: animated mini-dashboard */}
      {c.appTease && <AppTease {...c.appTease} />}

      {/* 7 — Product surface cards (compressed to 4 strongest) */}
      <ProductPreview {...c.productPreview} />

      {/* 8 — SEO feature section + yield + passive workflow sections */}
      {c.seoFeatureSection && (
        <SeoFeatureSection
          {...c.seoFeatureSection}
          rentalYield={c.rentalYieldSection}
          passiveLandlord={c.passiveLandlordSection}
        />
      )}

      {/* 9 — Tenaqo vs High-Street Agents */}
      {c.agentComparison && <AgentComparison {...c.agentComparison} />}

      {/* 10 — Final CTA */}
      <FinalCta {...c.finalCta} locale={locale} />
    </main>
  );
}
