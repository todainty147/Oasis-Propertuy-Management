import { siteConfig } from "./site";

export const homepageContent = {
  seo: {
    title: "Property Management Software for Landlords | OASIS Rental",
    description:
      "OASIS helps landlords replace spreadsheets, WhatsApp threads, and guesswork with one clear way to run rent, repairs, records, and follow-up.",
    canonical: "https://oasisrental.com/",
  },
  hero: {
    eyebrow: "Built for modern landlords",
    title: "Stop juggling spreadsheets, WhatsApp, and guesswork",
    body:
      "Run your properties from one clear operating system built for small and growing landlords. Stay on top of rent, repairs, tenants, and records without agency-sized software.",
    support: "Simple enough to use every week. Strong enough to keep a growing portfolio under control.",
    imageSrc: "/screenshots/command-center.png",
    imageAlt: "OASIS Command Center showing urgent items, overdue balance, and action queues across the portfolio.",
    primaryCta: { label: "Start Running OASIS", href: siteConfig.appUrl },
    secondaryCta: { label: "See What Changes", href: "/features" },
  },
  problemSection: {
    eyebrow: "Why landlords switch",
    title: "The portfolio is not the problem. The scattered work is.",
    body:
      "Most landlords do not need more apps. They need fewer places to check before making the next decision.",
    items: [
      {
        title: "Rent needs chasing",
        body: "Paid, due, and overdue balances take too long to confirm when the truth lives in separate trackers.",
      },
      {
        title: "Repairs lose momentum",
        body: "A tenant message becomes a contractor note, then a half-remembered task, then a delayed repair.",
      },
      {
        title: "Records go missing",
        body: "Leases, documents, and property context drift into folders, inboxes, and old conversations.",
      },
      {
        title: "Every week starts with catch-up",
        body: "Before you can act, you have to rebuild what happened, what changed, and what still needs attention.",
      },
    ],
  },
  solutionSection: {
    title: "How OASIS helps",
    body:
      "OASIS groups the day-to-day work around outcomes landlords actually care about: rent paid, repairs moving, records ready, and action clear.",
    items: [
      {
        title: "Stay on top of rent",
        body: "Track paid, due, and overdue rent so follow-up starts from a clear payment picture.",
      },
      {
        title: "Handle repairs without chaos",
        body: "Move maintenance from first request to work order to progress tracking with less thread-hunting.",
      },
      {
        title: "Keep records ready",
        body: "Keep leases, property files, tenant context, and supporting documents tied to the right rental work.",
      },
      {
        title: "Act earlier",
        body: "Use portfolio and command-centre views to spot overdue balances, stalled work, and pressure before it spreads.",
      },
    ],
  },
  productPreview: {
    title: "Built for trust when the portfolio gets serious",
    body:
      "As your portfolio grows, control is not just about storing more data. It is about knowing what changed, where attention is needed, and which signals deserve review.",
    items: [
      {
        label: "Command Center",
        title: "The next action is easier to find",
        body: "Start from urgent queues, overdue balances, and issues that need action instead of opening five tabs to reconstruct the day.",
        points: ["urgent queues", "overdue balances", "action items"],
        imageSrc: "/screenshots/command-center.png",
        imageAlt: "OASIS Command Center with urgent and needs-action queues.",
      },
      {
        label: "Property Health",
        title: "Portfolio pressure becomes visible sooner",
        body: "Review occupancy, arrears pressure, maintenance load, and property health before small issues turn into bigger work.",
        points: ["property health score", "arrears pressure", "maintenance load"],
        imageSrc: "/screenshots/portfolio-health.png",
        imageAlt: "OASIS Portfolio Health dashboard showing occupancy mix, finance mix, and maintenance pressure.",
      },
      {
        label: "Security Audit",
        title: "Operational trust is part of the product",
        body: "Review high-trust events, policy controls, and operational signals when your rental business needs stronger oversight.",
        points: ["audit review", "policy controls", "operational signals"],
        imageSrc: "/screenshots/security-audit.png",
        imageAlt: "OASIS Security Audit page showing policy settings and security event review.",
      },
    ],
  },
  workflowSection: {
    title: "Start with the work that slows landlords down",
    body:
      "OASIS keeps the core rental routines close to the screens landlords actually use to make decisions.",
    items: [
      {
        label: "Rent",
        title: "Know what has been paid",
        body: "See rent status and overdue balances without rebuilding the same spreadsheet before every follow-up.",
        href: "/features/rental-accounting",
        points: ["paid and overdue rent", "property-level rent status", "faster follow-up"],
        imageSrc: "/screenshots/portfolio-health.png",
        imageAlt: "OASIS Portfolio Health dashboard showing finance mix and arrears aging.",
      },
      {
        label: "Repairs",
        title: "Turn repair messages into tracked work",
        body: "Keep request status, ownership, and progress in view so maintenance does not depend on memory.",
        href: "/features/maintenance-management",
        points: ["request intake", "work order tracking", "repair progress tracking"],
        imageSrc: "/screenshots/maintenance-inbox.png",
        imageAlt: "OASIS Maintenance Inbox showing request columns, SLA age, and linked work orders.",
      },
      {
        label: "Records",
        title: "Keep tenant and property context ready",
        body: "Find the people, documents, property links, and useful history without rebuilding the story from scattered places.",
        href: "/features/tenant-management",
        points: ["tenant profiles", "linked property context", "document history"],
        imageSrc: "/screenshots/property-performance.png",
        imageAlt: "OASIS property view showing rent, operational health score, and performance context for a property.",
      },
    ],
  },
  finalCta: {
    title: "Run the portfolio from one calmer place",
    body:
      "Bring rent, repairs, tenants, and records into OASIS, then spend less time wondering what needs your attention.",
    primaryCta: { label: "Start Running OASIS", href: siteConfig.appUrl },
    secondaryCta: { label: "Compare Plans", href: "/pricing" },
  },
};
