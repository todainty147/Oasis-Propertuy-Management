import { siteConfig } from "../site";

export const oasisVsBuildiumContent = {
  seo: {
    title: "OASIS vs Buildium | Which Is Better for Landlords?",
    description:
      "Compare OASIS Rental vs Buildium for landlords who want practical control without a broad agency-style platform.",
    canonical: "https://oasisrental.com/compare/oasis-vs-buildium",
  },
  hero: {
    eyebrow: "Comparison",
    title: "OASIS vs Buildium",
    body:
      "Buildium is a broad property management platform. OASIS is the cleaner control centre for landlords who want rent, repairs, records, and follow-up to feel easier to run day to day.",
    imageSrc: "/screenshots/command-center.png",
    imageAlt: "OASIS Command Center showing urgent operational queues and overdue balance.",
  },
  summary: {
    eyebrow: "High-level comparison",
    title: "This choice often comes down to focused control versus wider platform depth",
    body:
      "Buildium may fit teams that want an established, wider platform. OASIS is a stronger fit when the priority is a focused operating view for the work landlords check every week: overdue rent, repairs, property health, documents, and follow-up.",
    imageSrc: "/screenshots/portfolio-health.png",
    imageAlt: "OASIS Portfolio Health dashboard showing occupancy, arrears, and maintenance pressure.",
  },
  comparisonTable: {
    title: "Side-by-side comparison",
    intro:
      "This comparison is framed around the workflows many independent landlords and growing portfolios care about most.",
    competitorName: "Buildium",
    rows: [
      {
        category: "Product direction",
        oasis: "Focused landlord control centre for day-to-day operating clarity",
        competitor: "Broader property management platform with a wider operational footprint",
      },
      {
        category: "Ease of day-to-day control",
        oasis: "Emphasis on what needs attention now: arrears, repairs, records, and portfolio pressure",
        competitor: "Strong platform depth, though some landlords may prefer simpler daily control",
      },
      {
        category: "Maintenance workflow",
        oasis: "Built around requests, work orders, bottlenecks, and follow-through",
        competitor: "Supports maintenance operations, with broader platform coverage beyond that workflow",
      },
      {
        category: "Best fit for",
        oasis: "Landlords who want focused control without broad-platform sprawl",
        competitor: "Operators looking for a more established all-in-one property management platform",
      },
      {
        category: "Growth path",
        oasis: "Good fit for landlords growing into more structured operating routines",
        competitor: "Good fit for teams wanting a broad platform from the outset",
      },
    ],
  },
  differences: {
    eyebrow: "Where OASIS stands out",
    title: "Why operational landlords may prefer OASIS",
    body:
      "OASIS is intentionally shaped around the practical work landlords need to move forward, with less emphasis on broad platform surface area and more emphasis on immediate operational control.",
    imageSrc: "/screenshots/security-audit.png",
    imageAlt: "OASIS Security Audit screen showing controls and operational trust tooling.",
    imageAlign: "left" as const,
    items: [
      {
        title: "Cleaner daily control",
        body: "OASIS is positioned for landlords who want the next action to be obvious without learning a larger agency-style system.",
      },
      {
        title: "Workflows built around follow-through",
        body: "Requests, rent pressure, documents, and property context stay close to the work that needs action.",
      },
      {
        title: "Built for practical portfolio control",
        body: "The product direction favors seeing portfolio pressure early and acting before small issues become operational drag.",
      },
    ],
  },
  fit: {
    title: "Who each product is best for",
    items: [
      {
        title: "Choose OASIS if",
        body: "You want a focused landlord control centre and less emphasis on a broad enterprise-style platform feel.",
      },
      {
        title: "Choose Buildium if",
        body: "You want a mature, wider property management platform and are comfortable with a product designed for a broader operational footprint.",
      },
      {
        title: "Choose OASIS over time if",
        body: "You value fast operating clarity and want software aligned with practical landlord routines.",
      },
    ],
  },
  finalCta: {
    title: "See whether OASIS fits the way you operate",
    body:
      "If you want a cleaner way to control rent, repairs, records, and follow-up, OASIS is worth exploring.",
    primaryCta: { label: "View Pricing", href: "/pricing" },
    secondaryCta: { label: "Open the App", href: siteConfig.appUrl },
  },
};
