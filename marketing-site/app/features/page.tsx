import type { Metadata } from "next";

import Link from "next/link";

import { FinalCta } from "../../components/marketing/final-cta";
import { PageHero } from "../../components/marketing/page-hero";
import { siteConfig } from "../../content/site";
import { buildMetadata } from "../../lib/metadata";

export const metadata: Metadata = buildMetadata({
  title: "OASIS Features | Rental Operations by Outcome",
  description:
    "See how OASIS helps landlords stay on top of rent, maintenance, tenant records, documents, and portfolio action.",
  canonical: "https://oasisrental.com/features",
});

const outcomeSections = [
  {
    eyebrow: "Rent and cash flow",
    title: "Know what has been paid, what is due, and what needs chasing",
    why:
      "Rent follow-up gets harder when the numbers live in spreadsheets, bank notes, and memory. OASIS keeps the payment picture close to the property and tenant context.",
    bullets: [
      "Track paid, due, and overdue rent without rebuilding a weekly tracker.",
      "Review arrears pressure at property and portfolio level.",
      "Prioritize follow-up around balances that need attention first.",
    ],
    href: "/features/rental-accounting",
    cta: "Explore rent tracking",
  },
  {
    eyebrow: "Maintenance",
    title: "Move repairs from first message to tracked work",
    why:
      "Maintenance becomes chaotic when every request starts in a different channel. OASIS gives landlords a clearer path from request intake to work order and progress tracking.",
    bullets: [
      "Capture repair requests in a structured maintenance workflow.",
      "Turn requests into work orders with ownership and status.",
      "Spot stalled repairs before they become repeated tenant complaints.",
    ],
    href: "/features/maintenance-management",
    cta: "Explore maintenance",
  },
  {
    eyebrow: "Portfolio health",
    title: "See which properties are building pressure before they become expensive",
    why:
      "OASIS is not just a place to read reports after the damage is done. Portfolio health surfaces arrears pressure, maintenance load, stalled work, and contractor follow-through so landlords can intervene earlier.",
    bullets: [
      "Review overdue rent, maintenance strain, and outstanding work in one risk view.",
      "Spot high-risk properties before the warning signs turn into bigger operational failures.",
      "Use health signals to decide where action matters most this week.",
    ],
    href: "/pricing",
    cta: "See the operations view",
  },
  {
    eyebrow: "Tenant context and portal",
    title: "Keep tenant records and tenant self-service usable when decisions need context",
    why:
      "Tenant admin should not require searching old messages before every decision, and tenants should not need to guess what is happening. OASIS keeps the people, property links, rent context, and tenant-facing workflow easier to reach.",
    bullets: [
      "Keep tenant profiles tied to the right property.",
      "Give tenants a clearer portal for payments, maintenance visibility, documents, and agreement review.",
      "Support faster follow-up when a tenant issue needs action.",
    ],
    href: "/features/tenant-portal",
    cta: "Explore tenant portal",
  },
  {
    eyebrow: "Documents and evidence",
    title: "Keep templates, requests, packets, and supporting records where the work happens",
    why:
      "Documents are only useful if landlords can find the right one at the moment it matters and participants know what still needs review. OASIS keeps templates, requests, packets, and records attached to the relevant account, property, or tenant context.",
    bullets: [
      "Upload reusable templates for UK, Poland, and other country-specific workflows.",
      "Request evidence from tenants or contractors and review uploads in one place.",
      "Send pre-signature agreement packets and track review status before external signing.",
    ],
    href: "/features/tenant-management",
    cta: "Explore document workflows",
  },
  {
    eyebrow: "Portfolio attention",
    title: "See the work that needs action before it spreads",
    why:
      "Growing portfolios do not fail because landlords lack effort. They get noisy when overdue balances, repair pressure, and missing follow-up are hard to see early.",
    bullets: [
      "Use command-centre queues to start from the most urgent work.",
      "Review portfolio health, arrears pressure, maintenance load, and contractor drag.",
      "Use security and operational review surfaces when stronger oversight matters.",
    ],
    href: "/pricing",
    cta: "Compare plans",
  },
];

export default function FeaturesPage() {
  return (
    <>
      <PageHero
        eyebrow="Features"
        title="Proof that OASIS runs the work landlords actually do"
        body="This is not a checklist of generic property software modules. OASIS is built around the outcomes that keep a rental portfolio calm: rent understood, repairs moving, records ready, and the next action clear."
        cta={{ label: "Get Early Access", href: siteConfig.appUrl }}
        imageSrc="/screenshots/command-center.png"
        imageAlt="OASIS Command Center showing urgent queues, overdue balances, and action items."
      />
      <section className="section">
        <div className="container">
          <div className="section-title">
            <h2>Features grouped by the work they improve</h2>
            <p className="muted">
              Each outcome below maps to real OASIS surfaces: rent tracking, maintenance
              workflows, tenant context, documents, portfolio health, command-centre queues,
              and operational review.
            </p>
          </div>
          <div className="grid grid-2">
            {outcomeSections.map((section) => (
              <article key={section.title} className="card feature-card">
                <span className="eyebrow">{section.eyebrow}</span>
                <h3>{section.title}</h3>
                <p className="muted">{section.why}</p>
                <ul className="muted">
                  {section.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
                <div className="button-row">
                  <Link href={section.href} className="button button-secondary">
                    {section.cta}
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
      <FinalCta
        title="Choose the part of your portfolio that needs control first"
        body="Start with rent, repairs, records, or portfolio attention. OASIS keeps the work close enough to act before the week turns into catch-up."
        primaryCta={{ label: "Get Early Access", href: siteConfig.appUrl }}
        secondaryCta={{ label: "Compare Plans", href: "/pricing" }}
      />
    </>
  );
}
