import { siteConfig } from "../site";

export const tenantManagementContent = {
  seo: {
    title: "Tenant Management Software for Landlords | OASIS Rental",
    description:
      "Keep tenant records, communication context, and rent visibility in one place with OASIS tenant management software for landlords.",
    canonical: "https://oasisrental.com/features/tenant-management",
  },
  hero: {
    eyebrow: "Tenant management",
    title: "Keep tenant records organized without juggling spreadsheets and messages",
    body:
      "OASIS gives landlords one place to track tenant details, linked properties, payment context, and day-to-day operational visibility so nothing important gets buried.",
  },
  painPoints: {
    eyebrow: "Landlord pain points",
    title: "Tenant admin gets messy faster than most landlords expect",
    body:
      "When tenant information lives across inboxes, notes, spreadsheets, and payment threads, simple tasks start taking longer than they should.",
    items: [
      {
        title: "Scattered records",
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
  },
  solution: {
    eyebrow: "How OASIS helps",
    title: "A cleaner tenant workflow from record-keeping to rent visibility",
    body:
      "OASIS brings tenant details, property links, and finance context together so landlords can move from fragmented admin to a more reliable operating system.",
    items: [
      {
        title: "Centralized tenant profiles",
        body: "Keep the tenant record tied to the right property and visible in the same system as documents and payments.",
      },
      {
        title: "Faster follow-up",
        body: "See status and context quickly instead of rebuilding the story from multiple tools every time.",
      },
      {
        title: "Better portfolio awareness",
        body: "Spot which tenants need attention without manually cross-checking rent trackers and notes.",
      },
    ],
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
        body: "Stay organized across moves, updates, and payment context with less friction.",
      },
    ],
  },
  finalCta: {
    title: "Bring tenant admin into one clearer system",
    body:
      "See how OASIS helps landlords manage tenant information, payment context, and property links without scattered admin.",
    primaryCta: { label: "View Pricing", href: "/pricing" },
    secondaryCta: { label: "Open the App", href: siteConfig.appUrl },
  },
};
