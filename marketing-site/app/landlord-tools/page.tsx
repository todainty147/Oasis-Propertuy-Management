import Link from "next/link";

import { buildMetadata } from "../../lib/metadata";
import { TAX_TOOL_DISCLAIMER } from "../../lib/landlordTaxTools/shared";

export const metadata = buildMetadata({
  title: "Free Landlord Tax Tools | Tenaqo",
  description:
    "Free landlord tax tools for checking expense categories, Section 24 impact and Making Tax Digital readiness. General guidance only.",
  canonical: "/landlord-tools",
});

const tools = [
  {
    title: "HMRC Expense Tester",
    body: "Check whether a landlord cost may be repairs, maintenance, capital improvement, insurance, finance cost, professional fee or another category.",
    href: "/landlord-tools/hmrc-expense-tester",
  },
  {
    title: "Section 24 Shock Calculator",
    body: "Compare a simplified old-style deduction view with the current basic-rate finance cost credit approach.",
    href: "/landlord-tools/section-24-shock-calculator",
  },
  {
    title: "MTD Readiness Check",
    body: "Check whether your rental and self-employment income may fall into MTD thresholds and what records to organise.",
    href: "/landlord-tools/mtd-readiness-check",
  },
];

export default function LandlordToolsPage() {
  return (
    <>
      <section className="page-hero">
        <div className="container">
          <span className="eyebrow">Landlord tax tools</span>
          <h1>Free landlord tax tools for cleaner property records</h1>
          <p className="muted" style={{ maxWidth: 760, marginTop: "1.25rem" }}>
            Simple, practical tools to help UK landlords understand expenses, finance-cost restrictions and Making Tax Digital readiness before they become urgent.
          </p>
          <p className="muted" style={{ maxWidth: 760, marginTop: "0.75rem" }}>
            Built for UK landlords using simple English-language guidance.
          </p>
        </div>
      </section>
      <section className="section section-tight-top">
        <div className="container grid grid-3">
          {tools.map((tool) => (
            <article className="tax-tool-card card" key={tool.href}>
              <h2>{tool.title}</h2>
              <p className="muted">{tool.body}</p>
              <Link className="button button-secondary" href={tool.href}>
                Open tool
              </Link>
            </article>
          ))}
        </div>
      </section>
      <section className="section section-tight-top">
        <div className="container">
          <p className="tax-tool-disclaimer">{TAX_TOOL_DISCLAIMER}</p>
        </div>
      </section>
    </>
  );
}
