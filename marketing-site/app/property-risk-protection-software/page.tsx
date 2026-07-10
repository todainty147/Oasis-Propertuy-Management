import Link from "next/link";
import type { Metadata } from "next";

import { buildMetadata } from "../../lib/metadata";

export const metadata: Metadata = buildMetadata({
  title: "Evidence Packs and Property Risk Protection | Tenaqo",
  description:
    "Deposit Dispute Pack, Maintenance Evidence Pack and Compliance Proof Pack — landlord-readable operational records from data held in Tenaqo. Not legal advice or adjudicator decisions.",
  canonical: "/property-risk-protection-software",
});

const sections = [
  {
    title: "Compliance Safe",
    body: "Track tenancy documents, safety certificates, deposit evidence and tenant acknowledgements in one organised compliance checklist.",
  },
  {
    title: "Photo Evidence Vault",
    body: "Create structured check-in and check-out evidence records with room-by-room notes, photos, signatures and downloadable reports.",
  },
  {
    title: "Deposit Dispute Pack",
    body: "Bring together check-in and check-out condition records, deduction items, tenant responses, signatures and evidence references into a landlord-readable pack. This is an operational evidence record, not a decision by a deposit adjudicator.",
  },
  {
    title: "Maintenance Evidence Pack",
    body: "Turn a completed work order into a Maintenance Evidence Pack with job details, status history and evidence references. The pack records what Tenaqo holds — it does not prove photo authenticity or legal verification of the work.",
  },
  {
    title: "Compliance Proof Pack",
    body: "Create a landlord-readable Compliance Proof Pack from the compliance records and evidence held in Tenaqo. Packs are operational records, not legal advice or legal sign-off.",
  },
  {
    title: "Smart Maintenance Diagnostics",
    body: "Guide tenants through basic issue-specific questions before a maintenance request reaches the inbox.",
  },
  {
    title: "Tenant Application Links",
    body: "Create public application links for vacant properties and review pre-screening matches consistently and fairly.",
  },
];

const faqs = [
  {
    q: "Does Tenaqo provide legal advice?",
    a: "No. Tenaqo helps organise records, evidence and workflows. It does not replace qualified legal advice.",
  },
  {
    q: "Does Tenaqo decide deposit outcomes?",
    a: "No. It helps landlords keep clearer inspection and document records that can support review and dispute preparation.",
  },
  {
    q: "Can tenants submit maintenance information?",
    a: "Yes. Diagnostics are for basic information gathering only and do not replace emergency handling or professional advice.",
  },
  {
    q: "What do evidence packs contain?",
    a: "Evidence packs are landlord-readable records generated from data held in Tenaqo. The Deposit Dispute Pack covers inspection records, condition comparisons, deductions and tenant responses. The Maintenance Evidence Pack covers work-order details and status history. The Compliance Proof Pack covers compliance records and document history. All packs are operational records, not legal proof or adjudicator decisions.",
  },
];

export default function PropertyRiskProtectionPage() {
  return (
    <>
      <section className="page-hero">
        <div className="container">
          <span className="eyebrow">Risk Protection Suite</span>
          <h1>Protect your rental operations with organised evidence, compliance records and tenant responses</h1>
          <p className="muted" style={{ maxWidth: 820, marginTop: "1.25rem" }}>
            Protect your rental operations with organised compliance evidence, inspection records, tenant acknowledgements and deposit dispute packs.
            Tenaqo helps landlords keep everything in one place without pretending to replace legal advice.
          </p>
          <div className="button-row">
            <Link className="button button-primary" href="/pricing">Protect your rental operations with Tenaqo</Link>
            <Link className="button button-secondary" href="/features/compliance">Explore compliance features</Link>
          </div>
        </div>
      </section>

      <section className="section section-tight-top">
        <div className="container grid grid-4">
          {sections.map((section) => (
            <article className="card" key={section.title}>
              <h2>{section.title}</h2>
              <p className="muted">{section.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section section-tight-top">
        <div className="container">
          <div className="card">
            <span className="eyebrow">How Tenaqo works</span>
            <h2>One workspace for records, actions and evidence</h2>
            <p className="muted">
              Link compliance checklists, documents, inspections, maintenance diagnostics and tenant onboarding activity to the right property and account. Owners and admins keep control, while tenant-facing flows stay limited to the tasks explicitly exposed to them.
            </p>
          </div>
        </div>
      </section>

      <section className="section section-tight-top">
        <div className="container grid grid-3">
          {[
            { title: "Deposit Dispute Pack", body: "Organised inspection records, condition comparisons, deduction items and tenant responses in one landlord-readable pack." },
            { title: "Maintenance Evidence Pack", body: "Completed work-order details, job status history and evidence references in one record." },
            { title: "Compliance Proof Pack", body: "Compliance dates, document history and evidence records compiled into a landlord-readable pack." },
          ].map((item) => (
            <article className="card" key={item.title}>
              <h2>{item.title}</h2>
              <p className="muted">{item.body}</p>
            </article>
          ))}
        </div>
        <div className="container" style={{ marginTop: "1rem" }}>
          <p className="muted" style={{ textAlign: "center" }}>All evidence packs are operational records held in Tenaqo. They are not legal advice, legal proof or adjudicator decisions.</p>
        </div>
      </section>

      <section className="section section-tight-top">
        <div className="container grid grid-3">
          {faqs.map((item) => (
            <article className="card" key={item.q}>
              <h2>{item.q}</h2>
              <p className="muted">{item.a}</p>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
