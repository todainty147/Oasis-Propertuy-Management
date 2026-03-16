import { siteConfig } from "./site";

export const homepageContent = {
  seo: {
    title: "Property Management Software for Landlords | OASIS Rental",
    description:
      "OASIS Rental helps landlords manage tenants, maintenance, finances, and documents in one place. Built for modern property owners.",
    canonical: "https://oasisrental.com/",
  },
  hero: {
    eyebrow: "Built for modern landlords",
    title: "Manage tenants, maintenance, finances, and documents in one place",
    body:
      "OASIS helps landlords run rental operations without spreadsheets, scattered messages, or disconnected tools.",
    support: "Built for modern landlords and growing rental portfolios.",
    primaryCta: { label: "Start Free in OASIS", href: siteConfig.appUrl },
    secondaryCta: { label: "View Features", href: "/features" },
  },
  problemSection: {
    eyebrow: "The problem",
    title: "Managing rentals gets messy faster than most landlords expect",
    body:
      "As portfolios grow, the real challenge is not collecting information. It is keeping tenant records, maintenance issues, payments, and documents organized enough to act on them quickly.",
    items: [
      {
        title: "Scattered records",
        body: "Tenant info, lease documents, and payment history often end up split across inboxes, notes, and spreadsheets.",
      },
      {
        title: "Maintenance chaos",
        body: "Requests arrive through texts, calls, and emails with no reliable workflow for follow-up and completion.",
      },
      {
        title: "Poor visibility",
        body: "It becomes harder to see what needs attention across your portfolio before issues start piling up.",
      },
      {
        title: "Reactive management",
        body: "Landlords spend too much time chasing information instead of managing operations proactively.",
      },
    ],
  },
  solutionSection: {
    title: "One system for the day-to-day operations of rental portfolios",
    body:
      "OASIS connects tenant records, maintenance workflows, payments, and documents into one organized system so landlords can see what is happening and act faster.",
    items: [
      {
        title: "Tenant management",
        body: "Keep tenant details, linked properties, and rent context organized in one place.",
      },
      {
        title: "Maintenance workflow",
        body: "Track requests, assign work orders, and keep repairs moving with clearer status visibility.",
      },
      {
        title: "Rental accounting",
        body: "See paid, due, and overdue rent clearly with finance views shaped for landlords.",
      },
      {
        title: "Document storage",
        body: "Store leases, compliance files, and supporting records by tenant, property, or account.",
      },
    ],
  },
  productPreview: {
    title: "See everything happening across your rental portfolio",
    body:
      "OASIS is designed to make the important parts of rental operations visible at a glance, from overdue rent to active maintenance and the records tied to each property.",
    items: [
      {
        label: "Portfolio dashboard",
        title: "Portfolio dashboard",
        body: "Get a quick view of overdue rent, active maintenance, and issues that need attention.",
        points: ["overdue rent", "active maintenance", "tasks needing action"],
      },
      {
        label: "Tenant profile",
        title: "Tenant profile",
        body: "Review tenant details, rent status, and linked documents in one connected record.",
        points: ["tenant details", "rent status", "documents"],
      },
      {
        label: "Maintenance workflow",
        title: "Maintenance workflow",
        body: "Follow repairs from request to assignment to completion without losing the thread.",
        points: ["request tracking", "assigned contractor", "progress visibility"],
      },
    ],
  },
  workflowSection: {
    title: "Core workflows that keep rental operations moving",
    body:
      "Explore the three areas where landlords usually feel the most operational friction and where OASIS helps bring more structure and visibility.",
    items: [
      {
        label: "Tenant management",
        title: "Keep tenant records and rent context in one place",
        body: "See who lives where, what still needs follow-up, and how tenant records connect to the wider rental workflow.",
        href: "/features/tenant-management",
        points: ["centralized tenant profiles", "linked property context", "clearer follow-up"],
      },
      {
        label: "Maintenance management",
        title: "Track repairs through a clearer maintenance workflow",
        body: "Move away from fragmented maintenance follow-up and toward a system that makes status, ownership, and bottlenecks easier to see.",
        href: "/features/maintenance-management",
        points: ["request intake", "work order visibility", "repair progress tracking"],
      },
      {
        label: "Rental accounting",
        title: "Understand paid, due, and overdue rent faster",
        body: "Get finance visibility that helps landlords understand income status across the portfolio without rebuilding reports manually.",
        href: "/features/rental-accounting",
        points: ["paid and overdue rent", "property-level visibility", "faster action on issues"],
      },
    ],
  },
  benefitsSection: {
    title: "What landlords gain with OASIS",
    items: [
      {
        title: "Less admin work",
        body: "Keep records organized and avoid switching between tools just to understand what is happening.",
      },
      {
        title: "Better maintenance control",
        body: "Track requests, assignments, and repairs in one place with less guesswork.",
      },
      {
        title: "Clear financial visibility",
        body: "See paid, due, and overdue rent across your portfolio without relying on manual trackers.",
      },
      {
        title: "More professional operations",
        body: "Run your rentals with a structured system instead of disconnected manual processes.",
      },
    ],
  },
  pricingPreview: {
    title: "Simple plans for growing rental portfolios",
    body: "Choose the plan that fits your current portfolio and move up as your rental operations grow.",
    cta: { label: "See Pricing", href: "/pricing" },
  },
  testimonials: {
    title: "Built for landlords who want a clearer operating system",
    items: [
      "Helping landlords bring tenant records, maintenance, and payments into one workflow.",
      "Designed for modern rental portfolios that need better visibility and less admin sprawl.",
      "A cleaner operating layer for landlords moving beyond spreadsheets and disconnected tools.",
    ],
  },
  finalCta: {
    title: "Bring your rental operations into one clear system",
    body:
      "Stop juggling spreadsheets, messages, and scattered records. OASIS helps landlords run rental operations with more clarity and control.",
    primaryCta: { label: "Start Free", href: siteConfig.appUrl },
    secondaryCta: { label: "View Pricing", href: "/pricing" },
  },
};
