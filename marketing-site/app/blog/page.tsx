import type { Metadata } from "next";

import { FinalCta } from "../../components/marketing/final-cta";
import { PageHero } from "../../components/marketing/page-hero";
import { siteConfig } from "../../content/site";
import { buildMetadata } from "../../lib/metadata";

const launchArticles = [
  {
    category: "Productivity",
    title: "Why most landlord apps fail small landlords",
    summary:
      "A practical look at why tools built for agencies or generic admin often miss the way small landlords actually work: fast decisions, limited time, and too much context spread across messages and spreadsheets.",
  },
  {
    category: "Rent",
    title: "The hidden cost of missed rent tracking",
    summary:
      "Missed rent follow-up is not just a finance problem. It creates admin drag, awkward tenant conversations, and weaker confidence in the portfolio's cash position.",
  },
  {
    category: "Maintenance",
    title: "How organized landlords actually stay on top of maintenance",
    summary:
      "The best maintenance systems are not complicated. They make requests easy to capture, ownership clear, progress visible, and stalled work harder to ignore.",
  },
  {
    category: "Growth",
    title: "What breaks first when your portfolio starts growing",
    summary:
      "As a portfolio grows, the first failure point is usually not effort. It is follow-up: overdue rent, repair updates, missing records, and decisions that need better operating rhythm.",
  },
  {
    category: "Operations",
    title: "How to stop managing rentals across five disconnected tools",
    summary:
      "A guide to replacing scattered spreadsheets, folders, messages, and payment notes with a clearer rental operating routine landlords can actually keep using.",
  },
];

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
        title="Practical operating guides for landlords"
        body="The OASIS blog is built for landlords who want better ways to run rentals, not vague property management advice. Expect useful thinking on rent tracking, repair follow-up, tenant records, portfolio growth, and the habits that keep admin from taking over."
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
            {launchArticles.map((article) => (
              <article key={article.title} className="card feature-card">
                <span className="eyebrow">{article.category}</span>
                <h3>{article.title}</h3>
                <p className="muted">{article.summary}</p>
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
      <FinalCta
        title="Want the operating system behind the advice?"
        body="Use OASIS to turn better landlord habits into the way rent, repairs, records, and follow-up actually get managed."
        primaryCta={{ label: "Start Running OASIS", href: siteConfig.appUrl }}
        secondaryCta={{ label: "Compare Plans", href: "/pricing" }}
      />
    </>
  );
}
