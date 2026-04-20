import type { Metadata } from "next";

import Link from "next/link";

import { FeatureGrid } from "../../components/marketing/feature-grid";
import { FinalCta } from "../../components/marketing/final-cta";
import { PageHero } from "../../components/marketing/page-hero";
import { homepageContent } from "../../content/homepage";
import { siteConfig } from "../../content/site";
import { buildMetadata } from "../../lib/metadata";

export const metadata: Metadata = buildMetadata({
  title: "OASIS Features | Proof by Landlord Outcome",
  description:
    "Explore how OASIS helps landlords regain control across rent follow-up, repairs, records, and portfolio attention.",
  canonical: "https://oasisrental.com/features",
});

export default function FeaturesPage() {
  return (
    <>
      <PageHero
        eyebrow="Features"
        title="Built around the outcomes landlords actually need"
        body="OASIS features are grouped around operational progress: know what needs attention, keep repairs moving, understand rent pressure, and keep records where the work happens."
        cta={{ label: "Start Free", href: siteConfig.appUrl }}
      />
      <FeatureGrid {...homepageContent.solutionSection} />
      <section className="section">
        <div className="container">
          <div className="card content-block">
            <h2>Choose the area you want under control first</h2>
            <p className="muted">
              Each workflow page goes deeper into a specific landlord outcome instead of repeating the whole platform story.
            </p>
            <div className="button-row">
              <Link href="/features/tenant-management" className="button button-secondary">
                Tenant management
              </Link>
              <Link href="/features/maintenance-management" className="button button-secondary">
                Maintenance management
              </Link>
              <Link href="/features/rental-accounting" className="button button-secondary">
                Rental accounting
              </Link>
            </div>
          </div>
        </div>
      </section>
      <section className="section section-tight-top">
        <div className="container">
          <div className="grid grid-3">
            <article className="card feature-card">
              <h3>Tenant management</h3>
              <p className="muted">
                Keep tenant context usable, connected to the right property, and easier to act on when follow-up is needed.
              </p>
              <div className="button-row">
                <Link href="/features/tenant-management" className="button button-secondary">
                  View page
                </Link>
              </div>
            </article>
            <article className="card feature-card">
              <h3>Maintenance management</h3>
              <p className="muted">
                Turn repair requests into tracked work, visible ownership, and cleaner contractor follow-through.
              </p>
              <div className="button-row">
                <Link
                  href="/features/maintenance-management"
                  className="button button-secondary"
                >
                  View page
                </Link>
              </div>
            </article>
            <article className="card feature-card">
              <h3>Rental accounting</h3>
              <p className="muted">
                See which rent needs attention and how payment pressure is shaping the portfolio.
              </p>
              <div className="button-row">
                <Link href="/features/rental-accounting" className="button button-secondary">
                  View page
                </Link>
              </div>
            </article>
          </div>
        </div>
      </section>
      <FinalCta
        title="Pick the workflow that is slowing you down"
        body="Whether rent, repairs, or records are creating the most noise, OASIS gives landlords a clearer way to keep the work moving."
        primaryCta={{ label: "Start Free", href: siteConfig.appUrl }}
        secondaryCta={{ label: "View Pricing", href: "/pricing" }}
      />
    </>
  );
}
