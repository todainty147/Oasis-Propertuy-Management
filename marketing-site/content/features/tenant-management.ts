import { siteConfig } from "../site";

export const tenantManagementContent = {
  seo: {
    title: "Tenant Management Software for Landlords | OASIS Rental",
    description:
      "Keep tenant records, property links, documents, and rent context organized with OASIS tenant management software for landlords.",
    canonical: "https://oasisrental.com/features/tenant-management",
  },
  hero: {
    eyebrow: "Tenant management",
    title: "Keep tenant context close to every property decision",
    body:
      "OASIS helps landlords keep tenant details, linked properties, payment context, and documents in a usable workflow so important context is easier to act on.",
    imageSrc: "/screenshots/property-performance.png",
    imageAlt: "OASIS property performance view showing connected rent and operational context for an occupied property.",
  },
  painPoints: {
    eyebrow: "Landlord pain points",
    title: "Tenant admin slows down when context is hard to find",
    body:
      "When tenant information lives across inboxes, notes, spreadsheets, and payment threads, simple tasks start taking longer than they should.",
    items: [
      {
        title: "Fragmented records",
        body: "Contact details, lease context, and occupancy information often end up spread across too many places.",
      },
      {
        title: "Unclear payment context",
        body: "It becomes harder to see who is current, who is overdue, and where follow-up is actually needed.",
      },
      {
        title: "Reactive operations",
        body: "Without a structured system, landlords spend more time chasing information than making decisions.",
      },
    ],
    imageSrc: "/screenshots/property-requests.png",
    imageAlt: "OASIS property request view showing linked requests and operational follow-up in context.",
  },
  solution: {
    eyebrow: "How OASIS helps",
    title: "A tenant workflow built around usable context",
    body:
      "OASIS keeps tenant details, property links, rent context, and document history close enough to support daily decisions.",
    items: [
      {
        title: "Centralized tenant profiles",
        body: "Keep the tenant record tied to the right property and connected to relevant documents and payments.",
      },
      {
        title: "Faster follow-up",
        body: "See status and context quickly instead of rebuilding the story from multiple tools every time a tenant issue needs attention.",
      },
      {
        title: "Cleaner follow-up",
        body: "Spot which tenants need attention without manually cross-checking rent trackers, notes, and documents.",
      },
    ],
    imageSrc: "/screenshots/security-audit.png",
    imageAlt: "OASIS Security Audit view showing policy controls and event review for operational trust.",
    imageAlign: "left" as const,
  },
  benefits: {
    title: "What landlords gain with a better tenant workflow",
    items: [
      {
        title: "Less manual admin",
        body: "Reduce the time spent searching for details and checking whether your records still match reality.",
      },
      {
        title: "Clearer oversight",
        body: "Understand who lives where and what needs follow-up without extra reconciliation work.",
      },
      {
        title: "More professional operations",
        body: "Run tenant management with the structure landlords need as portfolios grow.",
      },
      {
        title: "Stronger day-to-day control",
        body: "Stay organized across moves, updates, payment context, and linked records with less friction.",
      },
    ],
  },
  finalCta: {
    title: "Make tenant admin easier to act on",
    body:
      "See how OASIS helps landlords manage tenant information, payment context, documents, and property links without rebuilding context from separate trackers.",
    primaryCta: { label: "View Pricing", href: "/pricing" },
    secondaryCta: { label: "Open the App", href: siteConfig.appUrl },
  },
};
