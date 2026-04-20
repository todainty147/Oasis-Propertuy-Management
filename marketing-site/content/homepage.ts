import { siteConfig } from "./site";

export const homepageContent = {
  seo: {
    title: "Property Management Software for Landlords | OASIS Rental",
    description:
      "OASIS Rental gives landlords a control centre for rent, repairs, records, and follow-up without spreadsheet chaos.",
    canonical: "https://oasisrental.com/",
  },
  hero: {
    eyebrow: "Built for modern landlords",
    title: "The landlord control centre for rent, repairs, records, and follow-through",
    body:
      "OASIS helps small and growing landlords stop juggling spreadsheets, messages, and scattered admin. See what needs attention, keep work moving, and run every property with more control.",
    support: "Built for landlords who want operational clarity without bloated agency software.",
    imageSrc: "/screenshots/command-center.png",
    imageAlt: "OASIS Command Center showing urgent items, overdue balance, and action queues across the portfolio.",
    primaryCta: { label: "Start Free", href: siteConfig.appUrl },
    secondaryCta: { label: "See How It Works", href: "/features" },
  },
  problemSection: {
    eyebrow: "The problem",
    title: "Rental admin gets messy when the work lives everywhere",
    body:
      "The problem is not effort. Landlords already work hard. The problem is trying to make decisions from rent trackers, tenant messages, maintenance updates, and documents that never sit in the same view.",
    items: [
      {
        title: "Scattered records",
        body: "Tenant details, leases, payment context, and property notes get split across files, chats, inboxes, and spreadsheets.",
      },
      {
        title: "Maintenance chaos",
        body: "Repair requests arrive from every direction, but ownership, status, and next steps are easy to lose.",
      },
      {
        title: "Hidden pressure",
        body: "Important follow-up hides behind routine admin until overdue rent, repair delays, and missing records start stacking up.",
      },
      {
        title: "Reactive management",
        body: "Too much time goes into rebuilding the story after a problem appears, instead of seeing the pressure early.",
      },
    ],
  },
  solutionSection: {
    title: "Bring the daily operating picture into focus",
    body:
      "OASIS gives landlords a practical command layer for the work that decides whether a portfolio feels calm or chaotic: who owes what, what repair is stuck, which property needs attention, and where the record lives.",
    items: [
      {
        title: "Tenant management",
        body: "Keep the people, property links, rent context, and useful history close to the work.",
      },
      {
        title: "Maintenance workflow",
        body: "Turn requests into visible work, assign responsibility, and spot bottlenecks sooner.",
      },
      {
        title: "Rental accounting",
        body: "Understand paid, due, and overdue rent from the landlord follow-up view, not a generic bookkeeping screen.",
      },
      {
        title: "Document storage",
        body: "Keep leases, compliance files, and supporting records tied to the right property, tenant, or account.",
      },
    ],
  },
  productPreview: {
    title: "Know what needs attention before the day runs away from you",
    body:
      "OASIS surfaces the work that needs follow-through, from overdue rent and stalled repairs to property health and audit signals.",
    items: [
      {
        label: "Command Center",
        title: "Command Center",
        body: "Review the queues and overdue items that need action now without hunting across separate trackers.",
        points: ["urgent queues", "overdue balances", "issues needing action"],
        imageSrc: "/screenshots/command-center.png",
        imageAlt: "OASIS Command Center with urgent and needs-action queues.",
      },
      {
        label: "Property Health",
        title: "Property and portfolio health",
        body: "Review occupancy, arrears pressure, maintenance load, and property health from a landlord operating view.",
        points: ["property health score", "arrears picture", "maintenance pressure"],
        imageSrc: "/screenshots/portfolio-health.png",
        imageAlt: "OASIS Portfolio Health dashboard showing occupancy mix, finance mix, and maintenance pressure.",
      },
      {
        label: "Security Audit",
        title: "Security audit and operational trust",
        body: "Review high-trust events, policy controls, and operational signals when you need stronger oversight.",
        points: ["audit review", "alert controls", "operational signals"],
        imageSrc: "/screenshots/security-audit.png",
        imageAlt: "OASIS Security Audit page showing policy settings and security event review.",
      },
    ],
  },
  workflowSection: {
    title: "Start where the chaos usually starts",
    body:
      "The biggest gains usually come from three places: tenant context, repair follow-through, and rent follow-up.",
    items: [
      {
        label: "Tenant management",
        title: "Keep tenant records and rent context in one place",
        body: "See who lives where, what context matters, and what needs follow-up without rebuilding the tenant story each time.",
        href: "/features/tenant-management",
        points: ["centralized tenant profiles", "linked property context", "clearer follow-up"],
        imageSrc: "/screenshots/property-performance.png",
        imageAlt: "OASIS property view showing rent, operational health score, and performance context for a property.",
      },
      {
        label: "Maintenance management",
        title: "Keep repairs moving after the first message",
        body: "Move from fragmented follow-up to a workflow where request status, ownership, and bottlenecks are easier to see.",
        href: "/features/maintenance-management",
        points: ["request intake", "work order tracking", "repair progress tracking"],
        imageSrc: "/screenshots/maintenance-inbox.png",
        imageAlt: "OASIS Maintenance Inbox showing request columns, SLA age, and linked work orders.",
      },
      {
        label: "Rental accounting",
        title: "See rent pressure before it becomes a chase",
        body: "Understand income status across the portfolio and act before arrears become a bigger operational problem.",
        href: "/features/rental-accounting",
        points: ["paid and overdue rent", "property-level rent status", "faster action on issues"],
        imageSrc: "/screenshots/portfolio-health.png",
        imageAlt: "OASIS Portfolio Health dashboard showing finance mix and arrears aging.",
      },
    ],
  },
  benefitsSection: {
    title: "What changes when the work is under control",
    items: [
      {
        title: "Less admin work",
        body: "Spend less time piecing together context before every decision.",
      },
      {
        title: "Better maintenance control",
        body: "See request status, assignments, and repair delays without relying on memory.",
      },
      {
        title: "Cleaner rent follow-up",
        body: "See paid, due, and overdue rent without rebuilding the same tracker every week.",
      },
      {
        title: "More proactive operations",
        body: "Run your properties with a system that helps pressure show up early.",
      },
    ],
  },
  pricingPreview: {
    title: "Simple plans for growing rental portfolios",
    body: "Start with the level of control your portfolio needs today and move up when the work gets heavier.",
    cta: { label: "See Pricing", href: "/pricing" },
  },
  testimonials: {
    title: "Built for landlords who want the work to feel manageable again",
    items: [
      "A practical control centre for landlords moving beyond spreadsheets and message threads.",
      "A calmer way to handle rent, repairs, records, and follow-up as the portfolio grows.",
      "A focused operating system for landlords, not a bloated platform built around agency complexity.",
    ],
  },
  finalCta: {
    title: "Run your properties without the chaos",
    body:
      "Bring rent, repairs, records, and follow-up into one control centre built for small and growing landlords.",
    primaryCta: { label: "Start Free", href: siteConfig.appUrl },
    secondaryCta: { label: "View Pricing", href: "/pricing" },
  },
};
