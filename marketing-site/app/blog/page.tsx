import type { Metadata } from "next";

import Link from "next/link";

import { FinalCta } from "../../components/marketing/final-cta";
import { PageHero } from "../../components/marketing/page-hero";
import { blogArticles, blogCta } from "../../content/blog";
import { buildMetadata } from "../../lib/metadata";

export const metadata: Metadata = buildMetadata({
  title: "OASIS Rental Blog | Landlord Operating Guides",
  description:
    "Practical landlord guides on rent tracking, maintenance follow-up, portfolio growth, rental records, and operating rentals with more control.",
  canonical: "https://oasisrental.com/blog",
});

export default function BlogPage() {
  return (
    <>
      <PageHero
        eyebrow="Blog"
        title="Real-world insights for landlords who want more control and less chaos"
        body="No fluff. Just practical ways to stay on top of your properties, see what needs attention sooner, and replace reactive admin with a calmer operating rhythm."
      />
      <section className="section">
        <div className="container">
          <div className="section-title">
            <h2>Launch reading list</h2>
            <p className="muted">
              These first guides set the editorial direction for OASIS: practical, landlord-focused,
              and close to the weekly work of rent, repairs, records, and follow-up.
            </p>
          </div>
          <div className="grid grid-2">
            {blogArticles.map((article) => (
              <article key={article.title} className="card feature-card">
                <span className="eyebrow">{article.category}</span>
                <h3>{article.title}</h3>
                <p className="muted">{article.summary}</p>
                <div className="button-row">
                  <Link href={`/blog/${article.slug}`} className="button button-secondary">
                    Read more
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="section section-tight-top">
        <div className="container">
          <div className="card content-block">
            <h2>What OASIS publishes</h2>
            <p className="muted">
              We write for small and growing landlords who are trying to replace reactive admin
              with a better operating rhythm. That means fewer generic tips and more practical
              guidance on what to chase, what to document, what to review, and when a portfolio
              needs more structure.
            </p>
          </div>
        </div>
      </section>
      <FinalCta {...blogCta} />
    </>
  );
}
