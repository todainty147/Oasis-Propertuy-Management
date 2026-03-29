import { siteConfig } from "../site";

export const oasisVsBuildiumContent = {
  seo: {
    title: "OASIS vs Buildium | Which Is Better for Landlords?",
    description:
      "Compare OASIS Rental vs Buildium for maintenance workflows, portfolio visibility, rental operations, and day-to-day landlord management.",
    canonical: "https://oasisrental.com/compare/oasis-vs-buildium",
  },
  hero: {
    eyebrow: "Comparison",
    title: "OASIS vs Buildium",
    body:
      "Both OASIS and Buildium help operators move beyond manual admin. The main difference is that Buildium is positioned as a broader property management platform, while OASIS is built as a cleaner operating system for landlords who want connected workflows and faster action.",
    imageSrc: "/screenshots/command-center.png",
    imageAlt: "OASIS Command Center showing urgent operational queues and overdue balance.",
  },
  summary: {
    eyebrow: "High-level comparison",
    title: "This choice often comes down to simplicity versus broader platform depth",
    body:
      "Buildium is a well-known option for operators who want a more established, wider property management platform. OASIS is a strong fit for landlords who want a more focused operating system centered on tenant workflows, maintenance follow-through, finance visibility, and day-to-day clarity.",
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
        oasis: "Focused landlord operating system built around connected day-to-day workflows",
        competitor: "Broader property management platform with a wider operational footprint",
      },
      {
        category: "Ease of day-to-day visibility",
        oasis: "Emphasis on clean portfolio awareness, maintenance status, and action-oriented dashboards",
        competitor: "Strong platform depth, though some landlords may prefer a simpler operating layer",
      },
      {
        category: "Maintenance workflow",
        oasis: "Positioned around requests, work orders, bottlenecks, and follow-through",
        competitor: "Supports maintenance operations, with broader platform coverage beyond that workflow",
      },
      {
        category: "Best fit for",
        oasis: "Modern landlords who want a clear, connected rental workflow",
        competitor: "Operators looking for a more established all-in-one property management platform",
      },
      {
        category: "Growth path",
        oasis: "Good fit for landlords growing into more structured operations",
        competitor: "Good fit for teams wanting a broad platform from the outset",
      },
    ],
  },
  differences: {
    eyebrow: "Where OASIS stands out",
    title: "Why some landlords will prefer OASIS over a broader platform",
    body:
      "OASIS is intentionally shaped around the workflows landlords deal with every week, with a product direction that emphasizes clarity, connected records, and less admin sprawl.",
    imageSrc: "/screenshots/security-audit.png",
    imageAlt: "OASIS Security Audit screen showing controls and operational trust tooling.",
    imageAlign: "left" as const,
    items: [
      {
        title: "Cleaner operating experience",
        body: "OASIS is positioned for landlords who want a more focused experience instead of a broad platform with more surface area.",
      },
      {
        title: "Connected workflow design",
        body: "Tenants, maintenance, documents, and finance visibility are presented as one connected system rather than separate modules.",
      },
      {
        title: "Built for practical portfolio control",
        body: "The product direction favors faster understanding of what needs attention across the portfolio.",
      },
    ],
  },
  fit: {
    title: "Who each product is best for",
    items: [
      {
        title: "Choose OASIS if",
        body: "You want a modern landlord workflow with strong day-to-day visibility and less emphasis on a broad enterprise-style platform feel.",
      },
      {
        title: "Choose Buildium if",
        body: "You want a mature, wider property management platform and are comfortable with a product designed for a broader operational footprint.",
      },
      {
        title: "Choose OASIS over time if",
        body: "You value cleaner operating visibility and want software that feels more directly aligned with practical landlord workflows.",
      },
    ],
  },
  finalCta: {
    title: "See whether OASIS is the better fit for your rental workflow",
    body:
      "If you want a more connected landlord operating system with strong maintenance, finance, and portfolio visibility, OASIS is worth exploring.",
    primaryCta: { label: "View Pricing", href: "/pricing" },
    secondaryCta: { label: "Open the App", href: siteConfig.appUrl },
  },
};
