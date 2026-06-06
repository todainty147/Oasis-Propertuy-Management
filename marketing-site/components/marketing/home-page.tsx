import Link from "next/link";

import type { Locale } from "../../lib/i18n";

import { homepageContentByLocale } from "../../content/homepage";
import { siteConfig } from "../../content/site";
import { getLocalizedMarketingHref } from "../../lib/i18n";
import { HeroSection } from "./hero-section";
import { PortfolioHealthTeaser, ProductWalkthroughModal, TenantPortalTeaser } from "./product-teaser";

const painCards = [
  {
    title: "Rental work gets scattered",
    body:
      "Rent notes, maintenance messages, documents, and tenant updates drift across inboxes and spreadsheets until the real picture is hard to trust.",
  },
  {
    title: "Maintenance loses momentum",
    body:
      "Requests move through tenants, contractors, quotes, evidence, and approvals. Tenaqo keeps the thread visible without taking control away.",
  },
  {
    title: "Documents drift out of view",
    body:
      "Certificates, agreement packets, deposit evidence, and compliance records need a calm evidence trail, not another folder to remember.",
  },
];

const workflowCards = [
  {
    title: "Landlord control",
    body:
      "Command Center keeps approvals, follow-ups, rent visibility, and contractor activity in one landlord-controlled operating queue.",
  },
  {
    title: "Tenant experience",
    body:
      "Tenants get a simpler space for repairs, rent visibility, documents, and property updates without seeing the property team's working view.",
    visual: "tenant",
  },
  {
    title: "Evidence and follow-through",
    body:
      "Maintenance notes, documents, audit history, and AI-assisted summaries stay connected so decisions remain reviewable.",
  },
];

const founderTrustChips = [
  "Account-scoped access",
  "Tenant and contractor role separation",
  "Document audit history",
  "AI assists - landlord approves",
];

const trustPoints = [
  "Account-scoped access and role separation keep tenant, contractor, and landlord surfaces distinct.",
  "AI assists review and summaries; landlord approval and oversight remain in control.",
  "Tenaqo is designed to support your existing legal, tax and property advice workflows - not replace regulated professional judgement where it is required.",
  "Tenaqo does not collect rent, move money, or operate as a payment rail today.",
  "Tenaqo does not replace legal, tax, or regulated property advice.",
  "Audit history and document records support follow-up without promising automated compliance outcomes.",
];

export function MarketingHomePage({ locale }: { locale: Locale }) {
  const c = homepageContentByLocale[locale];
  const founderHref = getLocalizedMarketingHref(locale, c.hero.primaryCta.href || siteConfig.appUrl);
  const pricingHref = getLocalizedMarketingHref(locale, "/pricing");

  return (
    <div className="marketing-home" lang={locale}>
      <HeroSection {...c.hero} locale={locale} productTeaser />

      <section className="section homepage-pain" data-home-section="pain">
        <div className="container">
          <div className="homepage-section-title">
            <span className="eyebrow">Why landlords lose visibility</span>
            <h2>Three places rental operations usually break down</h2>
          </div>
          <div className="homepage-card-grid homepage-card-grid--three">
            {painCards.map((card) => (
              <article key={card.title} className="homepage-card">
                <h3>{card.title}</h3>
                <p>{card.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section product-teaser-section" data-home-section="portfolio-health">
        <div className="container product-teaser-section__layout">
          <div className="product-teaser-section__copy">
            <span className="eyebrow">Portfolio Health</span>
            <h2>Know where the portfolio needs attention next</h2>
            <p className="muted">
              Maintenance pressure, arrears, document readiness, and compliance evidence become
              one calmer review surface before small gaps become expensive.
            </p>
            <div className="button-row">
              <ProductWalkthroughModal label="See Tenaqo in action" />
            </div>
          </div>
          <PortfolioHealthTeaser />
        </div>
      </section>

      <section className="section homepage-workflows" data-home-section="workflows">
        <div className="container">
          <div className="homepage-section-title">
            <span className="eyebrow">Core workflows</span>
            <h2>Three surfaces, one operating layer</h2>
          </div>
          <div className="homepage-workflow-grid">
            {workflowCards.map((card) => (
              <article
                key={card.title}
                className={`homepage-workflow-card${card.visual === "tenant" ? " homepage-workflow-card--visual" : ""}`}
              >
                <div>
                  <h3>{card.title}</h3>
                  <p>{card.body}</p>
                </div>
                {card.visual === "tenant" ? (
                  <>
                    <TenantPortalTeaser compact />
                    <ProductWalkthroughModal
                      label="See the Tenant Portal in action"
                      initialScene="tenant-portal"
                    />
                  </>
                ) : null}
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section homepage-founder" data-home-section="founder-offer">
        <div className="container homepage-founder__inner">
          <div>
            <span className="eyebrow">Founder offer</span>
            <h2>Pro-level access at Starter price for the first 20 eligible landlords</h2>
            <p>
              Get 12 months to test the operational layer, including the current Pro workflows and
              a monthly AI allowance, while Tenaqo continues through early access.
            </p>
          </div>
          <div className="button-row">
            <Link href={founderHref} className="button button-primary">
              Claim Founder Access
            </Link>
            <Link href={pricingHref} className="button button-secondary">
              View pricing
            </Link>
          </div>
          <ul className="homepage-founder__trust" aria-label="Founder offer reassurance">
            {founderTrustChips.map((chip) => (
              <li key={chip}>{chip}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section homepage-trust" data-home-section="trust">
        <div className="container homepage-trust__layout">
          <div>
            <span className="eyebrow">Trust and boundaries</span>
            <h2>What Tenaqo is, and what it is not</h2>
            <p className="muted">
              Tenaqo is built as a landlord-controlled operating layer. It keeps work visible,
              evidence organised, and review steps clear without pretending to automate judgement.
            </p>
          </div>
          <ul className="homepage-trust__list">
            {trustPoints.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
