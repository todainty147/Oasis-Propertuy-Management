import { siteConfig } from "../site";

export const oasisVsBuildiumContent = {
  seo: {
    title: "OASIS vs Buildium | Which Is Better for Landlords?",
    description:
      "Compare OASIS Rental vs Buildium for landlords choosing between broad platform depth and focused operating control.",
    canonical: "https://oasisrental.com/compare/oasis-vs-buildium",
  },
  hero: {
    eyebrow: "Comparison",
    title: "OASIS vs Buildium",
    body:
      "Buildium can make sense for teams that want a broad property management platform. OASIS is the sharper choice when a landlord wants daily control over arrears, repairs, records, and action queues without taking on a heavier agency-style system.",
    imageSrc: "/screenshots/command-center.png",
    imageAlt: "OASIS Command Center showing urgent operational queues and overdue balance.",
  },
  summary: {
    eyebrow: "High-level comparison",
    title: "Choose OASIS when operating control matters more than platform breadth",
    body:
      "The decision is not simply which product has more surface area. For many independent and growing landlords, the better question is which tool makes the next action easier to see: overdue rent, repair bottlenecks, document context, and portfolio pressure.",
    imageSrc: "/screenshots/portfolio-health.png",
    imageAlt: "OASIS Portfolio Health dashboard showing occupancy, arrears, and maintenance pressure.",
  },
  comparisonTable: {
    title: "Side-by-side comparison",
    intro:
      "A fair comparison depends on what kind of operation you are building. OASIS is strongest when the portfolio needs clearer daily action, not broad platform sprawl.",
    competitorName: "Buildium",
    rows: [
      {
        category: "Operating model",
        oasis: "Focused control for landlords who need clear next actions",
        competitor: "Broad property management platform for wider operating needs",
      },
      {
        category: "Daily visibility",
        oasis: "Action queues, arrears pressure, repairs, records, and portfolio signals are central to the experience",
        competitor: "Strong platform depth, with more breadth for teams that want a larger system",
      },
      {
        category: "Maintenance workflow",
        oasis: "Request intake, work orders, status, bottlenecks, and follow-through are treated as core operating work",
        competitor: "Supports maintenance operations within a broader platform",
      },
      {
        category: "Best-fit landlord",
        oasis: "Small to growing landlords who want control without unnecessary agency complexity",
        competitor: "Teams looking for an established, wider property management platform",
      },
      {
        category: "When complexity grows",
        oasis: "Helps landlords build structured routines around follow-up, pressure, and review",
        competitor: "Fits operators ready to adopt broader platform processes from the start",
      },
    ],
  },
  differences: {
    eyebrow: "Where OASIS stands out",
    title: "Why a landlord may choose OASIS over a broader platform",
    body:
      "OASIS is built for landlords who want software to reduce daily ambiguity. The emphasis is on what needs attention, what is stuck, and what should be reviewed next.",
    imageSrc: "/screenshots/security-audit.png",
    imageAlt: "OASIS Security Audit screen showing controls and operational trust tooling.",
    imageAlign: "left" as const,
    items: [
      {
        title: "Action is easier to prioritize",
        body: "OASIS keeps overdue balances, repair pressure, and urgent queues close to the landlord's daily operating view.",
      },
      {
        title: "Maintenance has more follow-through shape",
        body: "Requests, work orders, status, and bottlenecks are presented as a repair workflow, not just another record category.",
      },
      {
        title: "Better fit for focused operators",
        body: "OASIS suits landlords who are outgrowing spreadsheets but do not want to manage the overhead of a broader agency platform.",
      },
    ],
  },
  fit: {
    title: "Choose based on the operation you want to run",
    items: [
      {
        title: "Choose OASIS if",
        body: "You want clear action queues, stronger maintenance follow-through, portfolio visibility, and a product shaped around small to growing landlords.",
      },
      {
        title: "Choose Buildium if",
        body: "You want a mature platform with broad property management coverage and are comfortable adopting a larger operating system.",
      },
      {
        title: "You may be ready for OASIS when",
        body: "Your biggest pain is no longer storing information. It is knowing which rent, repair, document, or property issue needs action first.",
      },
    ],
  },
  finalCta: {
    title: "See whether focused control beats platform breadth for you",
    body:
      "If you want clearer queues, stronger repair follow-through, and earlier visibility into portfolio pressure, OASIS is worth a closer look.",
    primaryCta: { label: "Compare Plans", href: "/pricing" },
    secondaryCta: { label: "Start Running OASIS", href: siteConfig.appUrl },
  },
};
