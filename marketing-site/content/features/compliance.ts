import { siteConfig } from "../site";

export const complianceContent = {
  seo: {
    title: "Compliance Suite for Landlords | OASIS Rental",
    description:
      "Lease clause analysis, rent-risk scoring, and tax deadline tracking — OASIS brings portfolio compliance into one connected workspace so nothing slips through the cracks.",
    canonical: "https://marketing.oasisrentalmgt.app/features/compliance",
  },
  hero: {
    eyebrow: "Compliance suite",
    title: "Stay ahead of lease risk, rent exposure, and tax deadlines",
    body:
      "Compliance should not live in spreadsheets, inboxes, and last-minute reminders. OASIS brings lease review, rent-risk monitoring, and tax-readiness tracking into one connected workspace — helping landlords spot issues earlier, organise evidence, and act before small risks become expensive problems.",
    imageSrc: "/screenshots/compliance-suite.png",
    imageAlt:
      "OASIS Compliance suite showing Lease Auditor findings, Rent Shield risk scores, and Tax Readiness dashboard.",
  },
  problemSection: {
    eyebrow: "Why it matters",
    title: "Portfolio compliance is not one task. It is a chain of responsibilities that are easy to miss.",
    body:
      "Each item is small on its own. Together they build into the kind of risk that shows up at renewal time, at tax time, or when a tenant stops paying. OASIS brings these signals into one place and turns them into clear actions.",
    items: [
      {
        title: "A lease clause that needs review",
        body: "Break clauses, repair obligations, and deposit conditions can create friction or liability if they are unclear, outdated, or poorly understood.",
      },
      {
        title: "A property showing early signs of rent pressure",
        body: "Late payments, maintenance build-up, and tenancy changes are early signals. They are easy to miss when they live in separate screens.",
      },
      {
        title: "A tax deadline approaching",
        body: "Year-end should not be a scramble. Without a clear view of what is due, what is done, and what is missing, it usually is.",
      },
      {
        title: "Evidence that has not been attached",
        body: "Accountants and solicitors need organised records. Scattered documents, missing uploads, and broken references slow down every review.",
      },
    ],
  },
  leaseAuditorSection: {
    eyebrow: "Lease Auditor",
    title: "Review lease agreements faster — and know where to focus",
    body:
      "Lease agreements can hide risk in the details. OASIS Lease Auditor scans extracted lease text and surfaces clauses that may need closer attention — so your team spends less time searching and more time acting on what actually matters.",
    items: [
      {
        title: "Upload, extract, analyse",
        body: "Upload a lease PDF through the tenant record, let OASIS process the document, and the Lease Auditor highlights potential areas of concern with a risk level: Low, Medium, High, or Critical.",
      },
      {
        title: "Plain-English explanations",
        body: "Each finding includes a clear explanation of why the clause may be worth reviewing and which category of risk it falls into.",
      },
      {
        title: "Clause areas OASIS can flag",
        body: "Break clauses · Rent review terms · Repair obligations · Deposit conditions · Assignment and subletting · Insurance requirements · Service charges · Alterations · Dispute resolution wording.",
      },
      {
        title: "Review, note, dismiss, and complete",
        body: "Your team can review findings, add internal notes, dismiss items that are not relevant, and mark the audit complete when satisfied.",
      },
    ],
    imageSrc: "/screenshots/lease-auditor.png",
    imageAlt:
      "OASIS Lease Auditor showing AI-flagged clause findings with risk levels and plain-English explanations.",
    imageAlign: "right" as const,
    disclaimer:
      "Lease Auditor is AI-assisted review support. It does not provide legal advice or determine whether a lease is legally valid. OASIS surfaces clauses worth reviewing — your solicitor or qualified adviser makes the final call.",
  },
  rentShieldSection: {
    eyebrow: "Rent Shield",
    title: "See which properties may need attention before arrears escalate",
    body:
      "Rent problems rarely appear out of nowhere. They build through patterns — late payments, high maintenance activity, tenancy pressure. Rent Shield gives each property a risk view based on operational data already held in OASIS.",
    items: [
      {
        title: "Risk built from what OASIS already knows",
        body: "Payment history, overdue balances, maintenance activity, and property-level operational pressure combine into a clear risk band for each address.",
      },
      {
        title: "From reactive chasing to proactive control",
        body: "Instead of waiting until an arrears problem is urgent, Rent Shield gives your team an early view of which properties are most likely to need action.",
      },
      {
        title: "Prioritise follow-up across the portfolio",
        body: "Identify higher-risk properties, connect rent exposure with maintenance pressure, and recalculate as the portfolio changes.",
      },
      {
        title: "Part of the same operational picture",
        body: "Rent Shield connects into property health scoring so rent risk is visible alongside maintenance strain, compliance pressure, and vacancy signals.",
      },
    ],
    imageSrc: "/screenshots/rent-shield.png",
    imageAlt:
      "OASIS Rent Shield showing per-property risk bands and portfolio-wide rent exposure scoring.",
    imageAlign: "left" as const,
    disclaimer:
      "Rent Shield is an operational risk estimate based on available OASIS data. It is not financial advice, credit scoring, insurance advice, or a guarantee of rent payment.",
  },
  taxSection: {
    eyebrow: "Tax Readiness Dashboard",
    title: "Know what is due, what is done, and what still needs attention",
    body:
      "Tax season should not be a scramble through spreadsheets, emails, receipts, and old notes. The OASIS Tax Readiness Dashboard helps landlords and finance teams keep tax-related tasks organised throughout the year.",
    items: [
      {
        title: "One view of the full picture",
        body: "Upcoming deadlines, completed obligations, overdue items, missing evidence, and records ready for export — all visible from one place.",
      },
      {
        title: "Export packs for accountants",
        body: "Export relevant data for specific date ranges, giving your accountant or bookkeeper a cleaner, more structured starting point.",
      },
      {
        title: "Less last-minute admin",
        body: "Track obligations, organise records, link supporting documents, and reduce the pressure that comes from leaving everything to the final week.",
      },
      {
        title: "Evidence attached to the right record",
        body: "Supporting documents stay linked to the relevant tax item so nothing needs to be found, re-uploaded, or re-explained when review time arrives.",
      },
    ],
    imageSrc: "/screenshots/tax-readiness.png",
    imageAlt:
      "OASIS Tax Readiness Dashboard showing deadline status, completed obligations, and export controls.",
    imageAlign: "right" as const,
    disclaimer:
      "OASIS helps organise tax-related records and exports. It does not provide tax, accounting, or legal advice. Always verify records with a qualified professional before filing.",
  },
  connectedSection: {
    eyebrow: "Compliance that connects to your operations",
    title: "Part of daily operations, not a separate checklist",
    body:
      "The Compliance Suite is not hidden away from the rest of the system. It connects into the way OASIS already works, so compliance becomes something your team sees and acts on every day.",
    items: [
      {
        title: "Lease findings link to tenant records",
        body: "Flagged clauses stay connected to the relevant tenant, property, and document so context is never lost when review time arrives.",
      },
      {
        title: "Rent risk connects to property health",
        body: "Rent exposure signals feed into the portfolio health view so the full pressure picture — maintenance, arrears, compliance — sits in one place.",
      },
      {
        title: "High-priority issues surface inside the Attention Center",
        body: "Critical compliance items can appear as action queue entries so nothing important sits unnoticed in a background dashboard.",
      },
      {
        title: "Evidence stays attached to the work",
        body: "Documents, exports, and reviewed items remain linked to the relevant record so accountants, solicitors, and your own team always start from the same point.",
      },
    ],
  },
  benefits: {
    title: "Built for evidence and accountability",
    items: [
      {
        title: "A record of what was flagged",
        body: "Every AI finding, manual note, and dismissed item is part of a clear review trail — not scattered across inboxes and memory.",
      },
      {
        title: "Who reviewed it and when",
        body: "Audit actions, status changes, and completed reviews are timestamped and tied to the account so oversight stays visible.",
      },
      {
        title: "Evidence attached to the right place",
        body: "Supporting documents, exports, and uploaded evidence link to the relevant record rather than floating loose in general storage.",
      },
      {
        title: "What still needs follow-up",
        body: "Pending items, overdue reviews, and high-risk findings stay visible until they are resolved — not buried once they are seen once.",
      },
    ],
  },
  finalCta: {
    title: "Lease risk, rent exposure, and tax deadlines — managed, not chased",
    body:
      "See how OASIS turns compliance into a managed, auditable process so nothing slips through the cracks as the portfolio grows.",
    primaryCta: { label: "See OASIS in action", href: siteConfig.appUrl },
    secondaryCta: { label: "Explore all features", href: "/features" },
  },
};
