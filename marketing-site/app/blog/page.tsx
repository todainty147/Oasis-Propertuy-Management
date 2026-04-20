import type { Metadata } from "next";

import { FinalCta } from "../../components/marketing/final-cta";
import { PageHero } from "../../components/marketing/page-hero";
import { siteConfig } from "../../content/site";
import { buildMetadata } from "../../lib/metadata";

export const metadata: Metadata = buildMetadata({
  title: "OASIS Rental Blog | Practical Landlord Operating Guides",
  description:
    "Practical landlord guides on rent follow-up, repairs, records, portfolio control, and running rentals without admin chaos.",
  canonical: "https://oasisrental.com/blog",
});

export default function BlogPage() {
  return (
    <>
      <PageHero
        eyebrow="Blog"
        title="Practical guides for landlords who want the work under control"
        body="The OASIS blog is where we turn rental operations into clear playbooks: how to reduce admin chaos, keep repairs moving, follow up on rent, and build better operating habits as your portfolio grows."
      />
      <section className="section">
        <div className="container">
          <div className="card content-block">
            <h2>What we will publish here</h2>
            <p className="muted">
              Expect practical landlord education, not generic software posts. We will focus on
              the operating questions that show up every week: what to chase, what to document,
              what to hand off, and how to keep a growing portfolio from becoming noisy.
            </p>
            <div className="grid grid-3" style={{ marginTop: "2rem" }}>
              <article className="feature-card">
                <h3>Rent follow-up</h3>
                <p className="muted">
                  How to spot arrears early, keep payment context clear, and reduce manual chasing.
                </p>
              </article>
              <article className="feature-card">
                <h3>Maintenance control</h3>
                <p className="muted">
                  How to move from repair messages to clear request, work order, and contractor routines.
                </p>
              </article>
              <article className="feature-card">
                <h3>Portfolio habits</h3>
                <p className="muted">
                  How small landlords can build simple operating rhythms before admin starts spreading.
                </p>
              </article>
            </div>
          </div>
        </div>
      </section>
      <FinalCta
        title="Want the operating system behind the guides?"
        body="Start with OASIS and bring rent, repairs, records, and follow-up into one landlord control centre."
        primaryCta={{ label: "View Pricing", href: "/pricing" }}
        secondaryCta={{ label: "Start Free", href: siteConfig.appUrl }}
      />
    </>
  );
}
