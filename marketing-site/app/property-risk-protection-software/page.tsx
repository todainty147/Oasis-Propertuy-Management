import Link from "next/link";
import type { Metadata } from "next";

import { buildMetadata } from "../../lib/metadata";

export const metadata: Metadata = buildMetadata({
  title: "Property Risk Protection Software | Tenaqo",
  description:
    "Protect your rental operations with organised compliance evidence, inspection records, tenant acknowledgements and deposit dispute packs.",
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
    body: "Prepare an organised evidence bundle with inspection reports, photos, tenant responses, deductions and supporting documents.",
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
          {["Compliance evidence", "Deposit dispute preparation", "Maintenance triage"].map((title) => (
            <article className="card" key={title}>
              <h2>{title}</h2>
              <p className="muted">Organise the operational records landlords need to review, reduce risk and keep decisions traceable.</p>
            </article>
          ))}
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
