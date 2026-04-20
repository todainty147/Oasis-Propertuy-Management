import { siteConfig } from "../site";

export const oasisVsLandlordStudioContent = {
  seo: {
    title: "OASIS vs Landlord Studio | Which Is Better for Landlords?",
    description:
      "Compare OASIS Rental vs Landlord Studio for landlords who need stronger follow-through as operations become more active.",
    canonical: "https://oasisrental.com/compare/oasis-vs-landlordstudio",
  },
  hero: {
    eyebrow: "Comparison",
    title: "OASIS vs Landlord Studio",
    body:
      "Landlord Studio is a familiar landlord tool. OASIS is aimed at landlords who want stronger daily control when rent follow-up, repair tracking, documents, and portfolio attention start competing for time.",
    imageSrc: "/screenshots/command-center.png",
    imageAlt: "OASIS Command Center showing urgent items and connected portfolio actions.",
  },
  summary: {
    eyebrow: "High-level comparison",
    title: "The difference comes down to how much follow-through your portfolio needs",
    body:
      "If your workflow is mostly record-keeping, a lighter tool may be enough. If your week is shaped by overdue items, repair progress, tenant context, and action queues, OASIS is built around that operating rhythm.",
    imageSrc: "/screenshots/property-performance.png",
    imageAlt: "OASIS property performance view showing connected rent and operational context.",
  },
  comparisonTable: {
    title: "Side-by-side comparison",
    intro:
      "This comparison focuses on the day-to-day workflows landlords care about most when choosing a property management platform.",
    competitorName: "Landlord Studio",
    rows: [
      {
        category: "Core focus",
        oasis: "Operational control across rent, repairs, records, and attention queues",
        competitor: "Landlord-focused management with strong individual landlord tooling",
      },
      {
        category: "Maintenance workflow",
        oasis: "Built around requests, work orders, status, and contractor coordination",
        competitor: "Maintenance support exists, but OASIS is positioned more around operational workflow depth",
      },
      {
        category: "Portfolio oversight",
        oasis: "Emphasis on portfolio pressure, attention items, and work that needs follow-up",
        competitor: "Good day-to-day landlord tooling with a simpler operational layer",
      },
      {
        category: "Document organization",
        oasis: "Documents tied into tenant, property, and account context",
        competitor: "Document support, but less positioned around landlord operating context",
      },
      {
        category: "Best fit",
        oasis: "Landlords wanting more structure as operations get busier",
        competitor: "Landlords wanting a familiar and lighter all-in-one tool",
      },
    ],
  },
  differences: {
    eyebrow: "Where OASIS stands out",
    title: "Why growing landlords may prefer OASIS",
    body:
      "OASIS is designed for landlords who want the work to move with less chasing, especially when maintenance activity, overdue follow-up, and portfolio complexity start to grow.",
    imageSrc: "/screenshots/maintenance-inbox.png",
    imageAlt: "OASIS Maintenance Inbox showing structured request workflow and linked work orders.",
    imageAlign: "left" as const,
    items: [
      {
        title: "Repair work is easier to track",
        body: "OASIS leans into the full path from request to work order, status tracking, and operational bottleneck.",
      },
      {
        title: "Context is closer to the action",
        body: "Tenant, document, maintenance, and rent context stays close to the decisions landlords need to make.",
      },
      {
        title: "Built for follow-through",
        body: "The product direction focuses on surfacing the next action faster, not just storing the record.",
      },
    ],
  },
  fit: {
    title: "Who each product is best for",
    items: [
      {
        title: "Choose OASIS if",
        body: "You want a more operationally focused platform for rent, repairs, documents, and attention queues as your portfolio grows.",
      },
      {
        title: "Choose Landlord Studio if",
        body: "You want a lighter landlord tool and your workflow does not yet need as much operational structure around maintenance and cross-portfolio control.",
      },
      {
        title: "Choose OASIS over time if",
        body: "You expect rental admin to become more process-heavy and want software that supports a more structured way of working.",
      },
    ],
  },
  finalCta: {
    title: "See whether OASIS fits your next stage",
    body:
      "If the work is moving beyond simple record-keeping, OASIS gives landlords a clearer way to stay in control.",
    primaryCta: { label: "View Pricing", href: "/pricing" },
    secondaryCta: { label: "Open the App", href: siteConfig.appUrl },
  },
};
