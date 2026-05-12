import type { Locale } from "../../lib/i18n";

import { homepageContentByLocale } from "../../content/homepage";
import { AgentComparison } from "./agent-comparison";
import { ContentSection } from "./content-section";
import { FeatureGrid } from "./feature-grid";
import { FinalCta } from "./final-cta";
import { HeroSection } from "./hero-section";
import { ProductPreview } from "./product-preview";
import { SeoFeatureSection } from "./seo-feature-section";
import { TestimonialCards } from "./testimonial-cards";
import { TrustBar } from "./trust-bar";
import { WorkflowShowcase } from "./workflow-showcase";

export function MarketingHomePage({ locale }: { locale: Locale }) {
  const c = homepageContentByLocale[locale];

  return (
    <main lang={locale}>
      {/* 1 — Conversion hero */}
      <HeroSection {...c.hero} locale={locale} />

      {/* 2 — Trust bar */}
      {c.trustBar && <TrustBar {...c.trustBar} />}

      {/* 3 — Testimonial cards */}
      {c.testimonials && <TestimonialCards {...c.testimonials} />}

      {/* 4 — Problem / why they switch */}
      <ContentSection {...c.problemSection} locale={locale} />

      {/* 5 — Solution grid */}
      <FeatureGrid {...c.solutionSection} />

      {/* 6 — SEO features + yield + passive sections */}
      {c.seoFeatureSection && (
        <SeoFeatureSection
          {...c.seoFeatureSection}
          rentalYield={c.rentalYieldSection}
          passiveLandlord={c.passiveLandlordSection}
        />
      )}

      {/* 7 — Product preview tabs */}
      <ProductPreview {...c.productPreview} />

      {/* 8 — Property health */}
      <ContentSection {...c.healthSection} locale={locale} />

      {/* 9 — Tenant/contractor section */}
      <ContentSection {...c.tenantPortalSection} locale={locale} />

      {/* 10 — Workflow steps */}
      <WorkflowShowcase {...c.workflowSection} locale={locale} />

      {/* 11 — Security section */}
      <ContentSection {...c.securitySection} locale={locale} />

      {/* 12 — OASIS vs Traditional Agents */}
      {c.agentComparison && <AgentComparison {...c.agentComparison} />}

      {/* 13 — Final CTA */}
      <FinalCta {...c.finalCta} locale={locale} />
    </main>
  );
}
