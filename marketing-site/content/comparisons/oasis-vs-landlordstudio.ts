import { siteConfig } from "../site";

export const oasisVsLandlordStudioContent = {
  seo: {
    title: "OASIS vs Landlord Studio | Which Is Better for Landlords?",
    description:
      "Compare OASIS Rental vs Landlord Studio for landlords moving from simple tracking into real property operations.",
    canonical: "https://oasisrental.com/compare/oasis-vs-landlordstudio",
  },
  hero: {
    eyebrow: "Comparison",
    title: "OASIS vs Landlord Studio",
    body:
      "Landlord Studio works when a lightweight tool is enough. OASIS is built for the stage where rent follow-up, repairs, documents, and portfolio attention need more structure and better follow-through.",
    imageSrc: "/screenshots/command-center.png",
    imageAlt: "OASIS Command Center showing urgent items and connected portfolio actions.",
  },
  summary: {
    eyebrow: "High-level comparison",
    title: "The real difference starts when basic tracking stops being enough",
    body:
      "A simpler landlord tool can work when the portfolio is quiet. OASIS becomes more compelling when the week is shaped by overdue balances, maintenance progress, tenant context, and the need to know what to handle first.",
    imageSrc: "/screenshots/property-performance.png",
    imageAlt: "OASIS property performance view showing connected rent and operational context.",
  },
  comparisonTable: {
    title: "Side-by-side comparison",
    intro:
      "This comparison is really about landlord maturity: light tracking versus a more operational way to keep work moving.",
    competitorName: "Landlord Studio",
    rows: [
      {
        category: "Operating stage",
        oasis: "Growing landlord operations where follow-up and prioritization are getting harder",
        competitor: "Earlier-stage or lighter landlord workflows that mainly need familiar tracking tools",
      },
      {
        category: "Maintenance workflow",
        oasis: "Request intake, work orders, status, ownership, and contractor coordination",
        competitor: "Maintenance support for landlords who need a lighter workflow",
      },
      {
        category: "Operational workflow",
        oasis: "Portfolio pressure, arrears, maintenance load, and action queues help decide what to handle first",
        competitor: "Good tracking where cross-portfolio operating pressure is less central",
      },
      {
        category: "Finance angle",
        oasis: "Built to keep rent follow-up close to the operational view, not buried inside a spreadsheet mindset",
        competitor: "Useful for landlords who still mainly need accounting and record-keeping support",
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
    title: "Why landlords outgrowing lighter tools may move to OASIS",
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
        body: "Command-center style views and portfolio signals make it easier to see where follow-up is needed before the work piles up.",
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
    title: "Ready for more follow-through than a lightweight tool gives you?",
    body:
      "If your portfolio has moved beyond simple tracking, OASIS gives rent, repairs, records, and action queues a clearer operating rhythm.",
    primaryCta: { label: "Get Early Access", href: siteConfig.appUrl },
    secondaryCta: { label: "Compare Plans", href: "/pricing" },
  },
};
