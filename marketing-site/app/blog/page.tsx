import type { Metadata } from "next";

import { FinalCta } from "../../components/marketing/final-cta";
import { PageHero } from "../../components/marketing/page-hero";
import { siteConfig } from "../../content/site";
import { buildMetadata } from "../../lib/metadata";

export const metadata: Metadata = buildMetadata({
  title: "OASIS Rental Blog | Landlord Guides and Property Management Insights",
  description:
    "Explore landlord guides, property management insights, maintenance workflows, and rental operations content from OASIS Rental.",
  canonical: "https://oasisrental.com/blog",
});

export default function BlogPage() {
  return (
    <>
      <PageHero
        eyebrow="Blog"
        title="Landlord guides and property management insights"
        body="The OASIS blog will feature practical content for landlords on tenant management, maintenance workflows, rental finance visibility, and portfolio operations."
      />
      <section className="section">
        <div className="container">
          <div className="card content-block">
            <h2>Content is on the way</h2>
            <p className="muted">
              This is the first placeholder for the OASIS blog. Next up are landlord guides,
              comparison articles, and practical content designed to support the public
              marketing site.
            </p>
          </div>
        </div>
      </section>
      <FinalCta
        title="Want to see the product while the content library grows?"
        body="Explore pricing or jump into the app to see how OASIS helps landlords stay organized."
        primaryCta={{ label: "View Pricing", href: "/pricing" }}
        secondaryCta={{ label: "Open the App", href: siteConfig.appUrl }}
      />
    </>
  );
}
