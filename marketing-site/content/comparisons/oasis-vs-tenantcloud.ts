import { siteConfig } from "../site";

export const oasisVsTenantCloudContent = {
  seo: {
    title: "OASIS vs TenantCloud | Which Is Better for Landlords?",
    description:
      "Compare OASIS Rental vs TenantCloud for landlords who want clearer operational control as their portfolio grows.",
    canonical: "https://oasisrental.com/compare/oasis-vs-tenantcloud",
  },
  hero: {
    eyebrow: "Comparison",
    title: "OASIS vs TenantCloud",
    body:
      "TenantCloud is a general all-in-one landlord tool. OASIS is positioned for landlords who want stronger control over what needs action across rent, repairs, records, and property health.",
    imageSrc: "/screenshots/command-center.png",
    imageAlt: "OASIS Command Center showing operations queues, overdue balance, and urgent actions.",
  },
  summary: {
    eyebrow: "High-level comparison",
    title: "This comparison is really about operating style",
    body:
      "TenantCloud can suit landlords who want a familiar all-in-one toolset. OASIS is a better fit when the priority is seeing portfolio pressure quickly and keeping follow-up from slipping.",
    imageSrc: "/screenshots/portfolio-health.png",
    imageAlt: "OASIS Portfolio Health dashboard showing finance mix and maintenance pressure.",
  },
  comparisonTable: {
    title: "Side-by-side comparison",
    intro:
      "This view focuses on how each product supports the practical day-to-day work of running rental properties.",
    competitorName: "TenantCloud",
    rows: [
      {
        category: "Core positioning",
        oasis: "Landlord control centre focused on clarity and follow-through",
        competitor: "All-in-one landlord software for managing common rental tasks",
      },
      {
        category: "Maintenance operations",
        oasis: "Requests, work orders, and status built around follow-through",
        competitor: "Supports maintenance, though OASIS is more explicitly framed around repair follow-through",
      },
      {
        category: "Portfolio oversight",
        oasis: "Dashboard signals and attention queues for what needs action",
        competitor: "Covers key landlord workflows with a more general product framing",
      },
      {
        category: "Tenant and finance context",
        oasis: "Rent context stays close to tenant and property decisions",
        competitor: "Useful all-in-one functionality, with a less operations-centric positioning",
      },
      {
        category: "Best fit for",
        oasis: "Landlords wanting clearer control as complexity grows",
        competitor: "Landlords wanting a familiar general-purpose rental management tool",
      },
    ],
  },
  differences: {
    eyebrow: "Where OASIS stands out",
    title: "Why operational landlords may prefer OASIS",
    body:
      "OASIS is aimed at landlords who want more than a place to store records. It is built to make the work that needs attention easier to see and easier to move forward.",
    imageSrc: "/screenshots/security-audit.png",
    imageAlt: "OASIS Security Audit page reinforcing operational trust and control.",
    imageAlign: "left" as const,
    items: [
      {
        title: "More attention on what needs action",
        body: "OASIS leans into surfacing pressure across maintenance, rent follow-up, and portfolio health.",
      },
      {
        title: "Context that supports decisions",
        body: "Tenant, repair, rent, and document context is organized around the decisions landlords make every week.",
      },
      {
        title: "A clearer path for growth",
        body: "OASIS is shaped for landlords who expect their operating rhythm to become more structured as portfolios expand.",
      },
    ],
  },
  fit: {
    title: "Who each product is best for",
    items: [
      {
        title: "Choose OASIS if",
        body: "You want stronger day-to-day control and clearer follow-through as rental admin gets more complex.",
      },
      {
        title: "Choose TenantCloud if",
        body: "You want a familiar all-in-one landlord tool and your current workflow does not yet demand as much operational structure.",
      },
      {
        title: "Choose OASIS over time if",
        body: "You want software that can support a more deliberate way of running rent, repairs, records, and follow-up.",
      },
    ],
  },
  finalCta: {
    title: "See whether OASIS is the better fit for your operating style",
    body:
      "If you want the next action to be clearer across rent, repairs, and records, OASIS is worth a closer look.",
    primaryCta: { label: "View Pricing", href: "/pricing" },
    secondaryCta: { label: "Open the App", href: siteConfig.appUrl },
  },
};
