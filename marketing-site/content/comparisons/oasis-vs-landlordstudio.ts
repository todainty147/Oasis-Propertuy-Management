import { siteConfig } from "../site";

export const oasisVsLandlordStudioContent = {
  seo: {
    title: "OASIS vs Landlord Studio | Which Is Better for Landlords?",
    description:
      "Compare OASIS Rental vs Landlord Studio for tenant management, maintenance workflows, rental accounting visibility, and day-to-day landlord operations.",
    canonical: "https://oasisrental.com/compare/oasis-vs-landlordstudio",
  },
  hero: {
    eyebrow: "Comparison",
    title: "OASIS vs Landlord Studio",
    body:
      "Both tools help landlords move beyond spreadsheets, but they are optimized for different operating styles. OASIS is aimed at landlords who want stronger operational visibility across tenants, maintenance, finances, documents, and action queues in one connected workflow.",
    imageSrc: "/screenshots/command-center.png",
    imageAlt: "OASIS Command Center showing urgent items and connected portfolio actions.",
  },
  summary: {
    eyebrow: "High-level comparison",
    title: "The difference comes down to operational depth",
    body:
      "If you want a lighter landlord tool with core finance and record-keeping features, Landlord Studio may fit. If you want a more connected operating system for tenant workflows, maintenance follow-through, work orders, documents, and portfolio visibility, OASIS is built for that direction.",
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
        oasis: "Connected rental operations across tenants, maintenance, finance, and documents",
        competitor: "Landlord-focused management with strong individual landlord tooling",
      },
      {
        category: "Maintenance workflow",
        oasis: "Built around requests, work orders, status visibility, and contractor coordination",
        competitor: "Maintenance support exists, but OASIS is positioned more around operational workflow depth",
      },
      {
        category: "Portfolio oversight",
        oasis: "Emphasis on dashboard visibility, operational status, and attention items",
        competitor: "Good day-to-day landlord tooling with a simpler operational layer",
      },
      {
        category: "Document organization",
        oasis: "Documents tied into tenant, property, and account workflows",
        competitor: "Document support, but less positioned around one connected operating system",
      },
      {
        category: "Best fit",
        oasis: "Landlords wanting one structured system for growing operations",
        competitor: "Landlords wanting a familiar and lighter all-in-one tool",
      },
    ],
  },
  differences: {
    eyebrow: "Where OASIS stands out",
    title: "Why some landlords will prefer OASIS",
    body:
      "OASIS is designed for landlords who want clearer operational control, especially when maintenance activity, overdue follow-up, and portfolio complexity start to grow.",
    imageSrc: "/screenshots/maintenance-inbox.png",
    imageAlt: "OASIS Maintenance Inbox showing structured request workflow and linked work orders.",
    imageAlign: "left" as const,
    items: [
      {
        title: "Stronger maintenance visibility",
        body: "OASIS leans into the full workflow around requests, work orders, status tracking, and operational bottlenecks.",
      },
      {
        title: "More connected operations",
        body: "Tenants, documents, maintenance, and finance views are positioned as one system rather than separate admin tasks.",
      },
      {
        title: "Built for day-to-day clarity",
        body: "The product direction focuses on reducing landlord admin friction and surfacing attention areas faster.",
      },
    ],
  },
  fit: {
    title: "Who each product is best for",
    items: [
      {
        title: "Choose OASIS if",
        body: "You want a more operationally focused platform for running tenants, maintenance, finance visibility, and documents together as your portfolio grows.",
      },
      {
        title: "Choose Landlord Studio if",
        body: "You want a lighter landlord tool and your workflow does not yet need as much operational structure around maintenance and cross-portfolio visibility.",
      },
      {
        title: "Choose OASIS over time if",
        body: "You expect your rental operations to become more process-heavy and want software that can support a more structured way of working.",
      },
    ],
  },
  finalCta: {
    title: "See whether OASIS is the better fit for your rental operations",
    body:
      "If you want clearer maintenance workflows, connected tenant and finance context, and better portfolio visibility, OASIS is worth a closer look.",
    primaryCta: { label: "View Pricing", href: "/pricing" },
    secondaryCta: { label: "Open the App", href: siteConfig.appUrl },
  },
};
