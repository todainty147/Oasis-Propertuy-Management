import { siteConfig } from "../site";

export const oasisVsBuildiumContent = {
  seo: {
    title: "Tenaqo vs Buildium | Which Is Better for Landlords?",
    description:
      "Compare Tenaqo vs Buildium for landlords choosing between a heavier platform and faster property operations control.",
    canonical: `${siteConfig.url}/compare/oasis-vs-buildium`,
  },
  hero: {
    eyebrow: "Comparison",
    title: "Tenaqo vs Buildium",
    body:
      "Buildium makes sense when you want a broader, heavier platform. Tenaqo is the better choice when you want a faster operating layer for arrears, repairs, records, and action queues without agency-style overhead.",
    imageSrc: "/screenshots/command-center.png",
    imageAlt: "Tenaqo Command Center showing urgent operational queues and overdue balance.",
  },
  summary: {
    eyebrow: "High-level comparison",
    title: "Choose Tenaqo when speed and clarity matter more than platform sprawl",
    body:
      "Most switchers are not asking which product has the most surface area. They are asking which one helps the team see the next action faster: overdue rent, repair bottlenecks, document context, and portfolio pressure.",
    imageSrc: "/screenshots/portfolio-health.png",
    imageAlt: "Tenaqo Portfolio Health dashboard showing occupancy, arrears, and maintenance pressure.",
  },
  comparisonTable: {
    title: "Side-by-side comparison",
    intro:
      "A fair comparison depends on whether you want broad platform coverage or a sharper property operations workflow.",
    competitorName: "Buildium",
    rows: [
      {
        category: "Operating model",
        oasis: "Property operations and coordination for landlords who want clear next actions",
        competitor: "Broad property management platform with wider administrative coverage",
      },
      {
        category: "Operational speed",
        oasis: "Action queues, arrears pressure, repairs, and follow-up stay central to the daily workflow",
        competitor: "More platform breadth, with more system weight around the day-to-day flow",
      },
      {
        category: "Maintenance workflow",
        oasis: "Request intake, work orders, status, bottlenecks, and follow-through are treated as core operating work",
        competitor: "Maintenance support lives inside a wider platform model",
      },
      {
        category: "Best-fit team",
        oasis: "Small to growing landlord operations that want control without unnecessary overhead",
        competitor: "Teams that want a more established, broader platform from the start",
      },
      {
        category: "Why switch",
        oasis: "Better when the pain is slow follow-up, stuck repairs, and not knowing what needs attention first",
        competitor: "Better when the goal is broader coverage even if the workflow feels heavier",
      },
    ],
  },
  differences: {
    eyebrow: "Where Tenaqo stands out",
    title: "Why operators moving off heavier platforms choose Tenaqo",
    body:
      "Tenaqo is built for landlords who want less system drag and more operational clarity. The emphasis is on what needs attention, what is stuck, and what should be reviewed next.",
    imageSrc: "/screenshots/security-audit.png",
    imageAlt: "Tenaqo Security Audit screen showing controls and operational trust tooling.",
    imageAlign: "left" as const,
    items: [
      {
        title: "Action is easier to prioritize",
        body: "Tenaqo keeps overdue balances, repair pressure, and urgent queues close to the operator's daily view.",
      },
      {
        title: "Maintenance has more follow-through shape",
        body: "Requests, work orders, status, and bottlenecks feel like a repair workflow, not just another record category.",
      },
      {
        title: "Better fit for focused operators",
        body: "Tenaqo suits landlords who are outgrowing spreadsheets but do not want the extra weight of a more bloated platform.",
      },
    ],
  },
  fit: {
    title: "Choose based on the way you want to run the work",
    items: [
      {
        title: "Choose Tenaqo if",
        body: "You want a faster, leaner operating layer with clear action queues, stronger maintenance follow-through, and daily visibility into what needs attention.",
      },
      {
        title: "Choose Buildium if",
        body: "You want a broader platform with more overall coverage and are comfortable with a heavier system around the daily work.",
      },
      {
        title: "You may be ready for Tenaqo when",
        body: "Your biggest pain is no longer storing information. It is moving from issue to action fast enough to keep the portfolio under control.",
      },
    ],
  },
  finalCta: {
    title: "Need faster operations than a heavier platform gives you?",
    body:
      "If you want clearer queues, stronger repair follow-through, and earlier visibility into portfolio pressure, Tenaqo is worth a closer look.",
    primaryCta: { label: "Get Early Access", href: siteConfig.appUrl },
    secondaryCta: { label: "Compare Plans", href: "/pricing" },
  },
};
