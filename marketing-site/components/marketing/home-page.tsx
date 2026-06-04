import type { Locale } from "../../lib/i18n";

import { homepageContentByLocale } from "../../content/homepage";
import { LandlordToolsCta } from "../landlord-tools/landlord-tools-cta";
import { AgentComparison } from "./agent-comparison";
import { AppTease } from "./app-tease";
import { ContentSection } from "./content-section";
import { FeatureGrid } from "./feature-grid";
import { FinalCta } from "./final-cta";
import { HeroSection } from "./hero-section";
import { ProductPreview } from "./product-preview";
import { PortfolioHealthTeaser, ProductWalkthroughModal } from "./product-teaser";
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

      {/* 7 — Portfolio Health product teaser */}
      <section className="section product-teaser-section">
        <div className="container product-teaser-section__layout">
          <div className="product-teaser-section__copy">
            <span className="eyebrow">Portfolio Health</span>
            <h2>Know where the portfolio needs attention next</h2>
            <p className="muted">
              Tenaqo brings rent visibility, maintenance pressure, document readiness, and
              compliance gaps into a review surface that keeps landlord oversight in control.
            </p>
            <div className="button-row">
              <ProductWalkthroughModal label="See Tenaqo in action" />
            </div>
          </div>
          <PortfolioHealthTeaser />
        </div>
      </section>

      {/* 8 — Product surface cards (compressed to 4 strongest) */}
      <ProductPreview {...c.productPreview} />

      {/* 9 — SEO feature section + yield + passive workflow sections */}
      {c.seoFeatureSection && (
        <SeoFeatureSection
          {...c.seoFeatureSection}
          rentalYield={c.rentalYieldSection}
          passiveLandlord={c.passiveLandlordSection}
        />
      )}

      <LandlordToolsCta locale={locale} />

      {/* 10 — Tenaqo vs High-Street Agents */}
      {c.agentComparison && <AgentComparison {...c.agentComparison} />}

      {/* 11 — Final CTA */}
      <FinalCta {...c.finalCta} locale={locale} />
    </main>
  );
}
