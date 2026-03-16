import type { Metadata } from "next";

import Link from "next/link";

import { FeatureGrid } from "../../components/marketing/feature-grid";
import { FinalCta } from "../../components/marketing/final-cta";
import { PageHero } from "../../components/marketing/page-hero";
import { homepageContent } from "../../content/homepage";
import { siteConfig } from "../../content/site";
import { buildMetadata } from "../../lib/metadata";

export const metadata: Metadata = buildMetadata({
  title: "Property Management Software Features | OASIS Rental",
  description:
    "Explore OASIS Rental features for tenant management, maintenance tracking, rental accounting, document management, and landlord operations.",
  canonical: "https://oasisrental.com/features",
});

export default function FeaturesPage() {
  return (
    <>
      <PageHero
        eyebrow="Features"
        title="Features Built for Day-to-Day Rental Management"
        body="OASIS is designed around the real operating needs of landlords: tenants, maintenance, finances, and documents all connected in one place."
        cta={{ label: "Open the App", href: siteConfig.appUrl }}
      />
      <FeatureGrid {...homepageContent.solutionSection} />
      <section className="section">
        <div className="container">
          <div className="card content-block">
            <h2>Explore the core workflows</h2>
            <p className="muted">
              Start with the feature areas that matter most to your current rental operations.
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
                See how OASIS helps landlords organize tenant records, linked properties,
                and payment context without scattered admin.
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
                Explore a clearer workflow for maintenance requests, work orders, and repair
                follow-through.
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
                Learn how OASIS gives landlords better visibility into paid, due, and
                overdue rental income.
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
        title="See how OASIS helps landlords run rental operations with more clarity and less admin."
        body="Move from scattered admin to a more connected system built around real landlord workflows."
        primaryCta={{ label: "Start Free", href: siteConfig.appUrl }}
        secondaryCta={{ label: "View Pricing", href: "/pricing" }}
      />
    </>
  );
}
