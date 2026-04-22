import { siteConfig } from "../site";

export const oasisVsLandlordStudioContent = {
  seo: {
    title: "OASIS vs Landlord Studio | Which Is Better for Landlords?",
    description:
      "Compare OASIS Rental vs Landlord Studio for landlords weighing accounting and rent collection strengths against deeper property operations control.",
    canonical: "https://oasisrental.com/compare/oasis-vs-landlordstudio",
  },
  hero: {
    eyebrow: "Comparison",
    title: "OASIS vs Landlord Studio",
    body:
      "Landlord Studio publicly emphasizes rental accounting, bank feeds, rent collection, and landlord-friendly tracking tools. OASIS is the stronger fit when the daily problem is not just recording what happened, but keeping rent follow-up, repairs, documents, and operational decisions moving in one place.",
    imageSrc: "/screenshots/command-center.png",
    imageAlt: "OASIS Command Center showing urgent items and connected portfolio actions.",
  },
  summary: {
    eyebrow: "High-level comparison",
    title: "The real difference starts when accounting is no longer the whole job",
    body:
      "Landlord Studio looks strongest for landlords who want mobile-friendly accounting, reporting, bank feeds, online rent collection, and tenant portal convenience. OASIS becomes more compelling when the week is shaped by overdue balances, maintenance progress, contractor coordination, tenant context, and the need to know what to handle first.",
    imageSrc: "/screenshots/property-performance.png",
    imageAlt: "OASIS property performance view showing connected rent and operational context.",
  },
  comparisonTable: {
    title: "Side-by-side comparison",
    intro:
      "This is a fair comparison between two different strengths: Landlord Studio's accounting-oriented landlord toolkit and OASIS' property operations workflow.",
    competitorName: "Landlord Studio",
    rows: [
      {
        category: "Primary emphasis",
        oasis: "Property operations and coordination: what needs action, what is stuck, and what should move next",
        competitor: "Landlord accounting, reporting, rent collection, and mobile-friendly portfolio tracking",
      },
      {
        category: "Finance and rent collection",
        oasis: "Clear rent visibility and arrears pressure inside a wider operating workflow",
        competitor: "Stronger publicly advertised accounting stack with bank feeds, reporting, and online rent collection",
      },
      {
        category: "Maintenance workflow",
        oasis: "Request intake, work orders, status, ownership, contractor coordination, and action queues",
        competitor: "Maintenance request tracking, but with less emphasis on command-center style operational follow-through",
      },
      {
        category: "Daily visibility",
        oasis: "Command Center, portfolio health, and pressure signals make prioritization easier",
        competitor: "Useful tracking across key landlord tasks, with less emphasis on action queues and operational triage",
      },
      {
        category: "Outgrowing moment",
        oasis: "When missed follow-up, repair status, and arrears pressure are becoming operational problems",
        competitor: "When the main need is still accounting clarity, rent collection, and lighter management tooling",
      },
    ],
  },
  differences: {
    eyebrow: "Where OASIS stands out",
    title: "Why landlords may move to OASIS after outgrowing an accounting-first tool",
    body:
      "This is not a claim that Landlord Studio lacks useful landlord tooling. It clearly offers accounting, reporting, rent collection, tenant portal capabilities, and maintenance tracking. OASIS stands out when the harder problem is operational speed: seeing what needs attention, pushing work forward, and reducing dropped follow-up across the portfolio.",
    imageSrc: "/screenshots/maintenance-inbox.png",
    imageAlt: "OASIS Maintenance Inbox showing structured request workflow and linked work orders.",
    imageAlign: "left" as const,
    items: [
      {
        title: "Maintenance has a clearer path",
        body: "OASIS gives repair work a path from request to work order to progress review, helping landlords catch stalled items, blocked jobs, and missed ownership sooner.",
      },
      {
        title: "Action is easier to prioritize",
        body: "Command Center queues and portfolio health signals make it easier to decide what deserves attention first instead of manually reconstructing the week.",
      },
      {
        title: "Control goes beyond record-keeping",
        body: "OASIS keeps tenant context, documents, rent pressure, maintenance status, and auditability close to the operational decision instead of splitting them across separate views and routines.",
      },
    ],
  },
  fit: {
    title: "Which fit sounds more like your portfolio?",
    items: [
      {
        title: "Choose OASIS if",
        body: "You are spending more time chasing rent, checking repair progress, finding documents, or deciding which issue needs attention first than you are recording transactions.",
      },
      {
        title: "Choose Landlord Studio if",
        body: "You want mobile-friendly accounting, reporting, rent collection, tenant portal access, and a lighter landlord toolkit built around tracking and financial admin.",
      },
      {
        title: "You may be outgrowing simpler tools when",
        body: "The question is no longer where to store information, but how to keep rent, repairs, documents, and follow-up moving together without dropped handoffs.",
      },
    ],
  },
  finalCta: {
    title: "Need more operational control than an accounting-first landlord tool gives you?",
    body:
      "If your portfolio has moved beyond accounting clarity into day-to-day coordination pressure, OASIS gives rent, repairs, records, and action queues a clearer operating rhythm.",
    primaryCta: { label: "Get Early Access", href: siteConfig.appUrl },
    secondaryCta: { label: "Compare Plans", href: "/pricing" },
  },
};
