import { siteConfig } from "../site";

export const oasisVsLandlordStudioContent = {
  seo: {
    title: "OASIS vs Landlord Studio | Which Is Better for Landlords?",
    description:
      "Compare OASIS Rental vs Landlord Studio for landlords who are moving from simpler record-keeping into more active operations.",
    canonical: "https://oasisrental.com/compare/oasis-vs-landlordstudio",
  },
  hero: {
    eyebrow: "Comparison",
    title: "OASIS vs Landlord Studio",
    body:
      "Landlord Studio can be a good fit for landlords who want a familiar lightweight tool. OASIS is built for the stage where rent follow-up, repairs, documents, and portfolio attention need more structure.",
    imageSrc: "/screenshots/command-center.png",
    imageAlt: "OASIS Command Center showing urgent items and connected portfolio actions.",
  },
  summary: {
    eyebrow: "High-level comparison",
    title: "The difference is what happens after basic record-keeping stops being enough",
    body:
      "A simpler landlord tool can work when the portfolio is quiet. OASIS becomes more compelling when the week is shaped by overdue balances, maintenance progress, tenant context, and the need to know which action comes first.",
    imageSrc: "/screenshots/property-performance.png",
    imageAlt: "OASIS property performance view showing connected rent and operational context.",
  },
  comparisonTable: {
    title: "Side-by-side comparison",
    intro:
      "This comparison is about landlord maturity: simple organization versus a more structured way to keep work moving.",
    competitorName: "Landlord Studio",
    rows: [
      {
        category: "Best operating stage",
        oasis: "Growing landlord operations where follow-up and prioritization are becoming harder",
        competitor: "Earlier-stage or lighter landlord workflows that need familiar management tools",
      },
      {
        category: "Maintenance workflow",
        oasis: "Request intake, work orders, status, ownership, and contractor coordination",
        competitor: "Maintenance support for landlords who need a lighter workflow",
      },
      {
        category: "Portfolio visibility",
        oasis: "Portfolio pressure, arrears, maintenance load, and action queues help decide what to handle first",
        competitor: "Good day-to-day tooling where cross-portfolio operating pressure is less central",
      },
      {
        category: "Document organization",
        oasis: "Documents tied to tenant, property, and account context for easier evidence and follow-up",
        competitor: "Document support for simpler record management needs",
      },
      {
        category: "Outgrowing moment",
        oasis: "When missed follow-up, repair status, and arrears pressure are becoming operational problems",
        competitor: "When the main need is still lightweight organization and record-keeping",
      },
    ],
  },
  differences: {
    eyebrow: "Where OASIS stands out",
    title: "Why landlords outgrowing lighter tools may prefer OASIS",
    body:
      "OASIS is for the point where storing the record is not enough. It helps landlords move work forward when the portfolio starts producing more repair updates, overdue balances, and decisions than memory can comfortably hold.",
    imageSrc: "/screenshots/maintenance-inbox.png",
    imageAlt: "OASIS Maintenance Inbox showing structured request workflow and linked work orders.",
    imageAlign: "left" as const,
    items: [
      {
        title: "Maintenance has a clearer path",
        body: "OASIS gives repair work a path from request to work order to progress review, helping landlords catch stalled items sooner.",
      },
      {
        title: "Context supports decisions",
        body: "Tenant, document, maintenance, and rent context stays close to the action so landlords spend less time rebuilding the story.",
      },
      {
        title: "Queues make pressure harder to miss",
        body: "Command-centre style views and portfolio signals make it easier to see where follow-up is needed before the work piles up.",
      },
    ],
  },
  fit: {
    title: "Which fit sounds more like your portfolio?",
    items: [
      {
        title: "Choose OASIS if",
        body: "You are spending more time chasing rent, checking repair progress, finding documents, or deciding which issue needs attention first.",
      },
      {
        title: "Choose Landlord Studio if",
        body: "You want a lighter landlord tool and your workflow is still mostly record-keeping, tracking, and simpler day-to-day organization.",
      },
      {
        title: "You may be outgrowing simpler tools when",
        body: "The question is no longer where to store information, but how to keep rent, repairs, documents, and follow-up moving together.",
      },
    ],
  },
  finalCta: {
    title: "Ready for more structure than a lightweight tool?",
    body:
      "If your portfolio has moved beyond simple record-keeping, OASIS gives rent, repairs, records, and action queues a clearer operating rhythm.",
    primaryCta: { label: "Compare Plans", href: "/pricing" },
    secondaryCta: { label: "Get Early Access", href: siteConfig.appUrl },
  },
};
