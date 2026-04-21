import { siteConfig } from "../site";

export const oasisVsTenantCloudContent = {
  seo: {
    title: "OASIS vs TenantCloud | Which Is Better for Landlords?",
    description:
      "Compare OASIS Rental vs TenantCloud for landlords deciding between a general tool and a more operations-focused workflow.",
    canonical: "https://oasisrental.com/compare/oasis-vs-tenantcloud",
  },
  hero: {
    eyebrow: "Comparison",
    title: "OASIS vs TenantCloud",
    body:
      "TenantCloud offers a familiar all-in-one landlord toolkit. OASIS is the better fit when the priority is operational control: action queues, repair follow-through, arrears pressure, records, and portfolio visibility.",
    imageSrc: "/screenshots/command-center.png",
    imageAlt: "OASIS Command Center showing operations queues, overdue balance, and urgent actions.",
  },
  summary: {
    eyebrow: "High-level comparison",
    title: "The right choice depends on whether you need tools or sharper operational control",
    body:
      "TenantCloud can suit landlords who want broad all-in-one coverage. OASIS is built for landlords who want the day to start with what needs action: unpaid rent, maintenance pressure, missing context, and follow-up that should not slip.",
    imageSrc: "/screenshots/portfolio-health.png",
    imageAlt: "OASIS Portfolio Health dashboard showing finance mix and maintenance pressure.",
  },
  comparisonTable: {
    title: "Side-by-side comparison",
    intro:
      "This view focuses on how each product supports the practical work of running rentals when the portfolio starts getting noisier.",
    competitorName: "TenantCloud",
    rows: [
      {
        category: "Primary value",
        oasis: "Operational focus around what needs action, what is stuck, and what should be reviewed",
        competitor: "General all-in-one landlord software for common rental tasks",
      },
      {
        category: "Maintenance operations",
        oasis: "Request intake, work orders, status, ownership, and stalled repair awareness",
        competitor: "Maintenance support within a broader general-purpose toolset",
      },
      {
        category: "Scalability",
        oasis: "Command-center queues, portfolio health, arrears pressure, and maintenance load support a more professional operating model",
        competitor: "Broad workflow coverage that fits simpler DIY landlord management",
      },
      {
        category: "Workflow depth",
        oasis: "Rent status, tenant context, maintenance, and property decisions stay close together",
        competitor: "Useful all-in-one functionality for managing common landlord records",
      },
      {
        category: "Best-fit landlord",
        oasis: "Landlords who want stronger follow-through as complexity grows",
        competitor: "Landlords who want a familiar, general-purpose rental management tool",
      },
    ],
  },
  differences: {
    eyebrow: "Where OASIS stands out",
    title: "Why growing operators may choose OASIS over a general landlord tool",
    body:
      "OASIS is aimed at landlords who want the product to help decide what deserves attention next. It is less about having another place to enter data and more about making follow-up easier to manage.",
    imageSrc: "/screenshots/security-audit.png",
    imageAlt: "OASIS Security Audit page reinforcing operational trust and control.",
    imageAlign: "left" as const,
    items: [
      {
        title: "Action queues are central",
        body: "OASIS emphasizes queues and signals for overdue rent, urgent work, and portfolio pressure so landlords start from what matters.",
      },
      {
        title: "Maintenance is treated as follow-through",
        body: "Repair requests, work orders, status, and bottlenecks are part of the operating rhythm, not just a place to log an issue.",
      },
      {
        title: "Portfolio pressure is easier to review",
        body: "Portfolio health, arrears, maintenance load, and operational review surfaces help landlords spot pressure earlier.",
      },
    ],
  },
  fit: {
    title: "Choose based on how professional the operation needs to feel",
    items: [
      {
        title: "Choose OASIS if",
        body: "You want stronger day-to-day control, visible action queues, deeper maintenance follow-through, and portfolio signals that help prioritize work.",
      },
      {
        title: "Choose TenantCloud if",
        body: "You want a familiar all-in-one landlord tool and your current workflow does not yet need as much operational structure.",
      },
      {
        title: "You may be ready for OASIS when",
        body: "You are less worried about having a list of tools and more worried about missed rent follow-up, stalled repairs, and knowing what needs action today.",
      },
    ],
  },
  finalCta: {
    title: "Need more professional control than a simple all-in-one tool gives you?",
    body:
      "If action queues, repair follow-through, arrears pressure, and portfolio visibility matter most, OASIS is built for that way of working.",
    primaryCta: { label: "Get Early Access", href: siteConfig.appUrl },
    secondaryCta: { label: "Compare Plans", href: "/pricing" },
  },
};
