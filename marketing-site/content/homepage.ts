import { siteConfig } from "./site";

export const homepageContent = {
  seo: {
    title: "Property Management Software for Landlords | OASIS Rental",
    description:
      "OASIS Rental helps landlords manage tenants, maintenance, finances, documents, and operational follow-up in one connected system built for modern rental portfolios.",
    canonical: "https://oasisrental.com/",
  },
  hero: {
    eyebrow: "Built for modern landlords",
    title: "Run rental operations from one connected system, not five disconnected tools",
    body:
      "OASIS gives landlords one operating layer for tenants, maintenance, finances, documents, and action queues so the next problem is visible before it turns into a fire drill.",
    support: "Built for growing portfolios that need clearer action, stronger visibility, and less reactive admin.",
    imageSrc: "/screenshots/command-center.png",
    imageAlt: "OASIS Command Center showing urgent items, overdue balance, and action queues across the portfolio.",
    primaryCta: { label: "Start Free in OASIS", href: siteConfig.appUrl },
    secondaryCta: { label: "View Features", href: "/features" },
  },
  problemSection: {
    eyebrow: "The problem",
    title: "Managing rentals gets messy faster than most landlords expect",
    body:
      "As portfolios grow, the hard part is not collecting information. It is turning scattered tenant records, maintenance issues, payments, and documents into a clear operating picture early enough to act.",
    items: [
      {
        title: "Scattered records",
        body: "Tenant info, lease documents, and payment history often end up split across inboxes, notes, and spreadsheets.",
      },
      {
        title: "Maintenance chaos",
        body: "Requests arrive through texts, calls, and emails with no reliable workflow for follow-up and completion.",
      },
      {
        title: "Poor visibility",
        body: "It becomes harder to see what needs attention across your portfolio before rent, repairs, and compliance work start stacking up.",
      },
      {
        title: "Reactive management",
        body: "Landlords spend too much time reconstructing context after something goes wrong instead of staying ahead of the next issue.",
      },
    ],
  },
  solutionSection: {
    title: "One system for the day-to-day operations of rental portfolios",
    body:
      "OASIS connects tenant records, maintenance workflows, payments, documents, and operational signals into one organized system so landlords can see what is moving, what is stuck, and what needs action next.",
    items: [
      {
        title: "Tenant management",
        body: "Keep tenant details, linked properties, and rent context organized in one place.",
      },
      {
        title: "Maintenance workflow",
        body: "Track requests, assign work orders, and keep repairs moving with clearer status visibility and fewer blind spots.",
      },
      {
        title: "Rental accounting",
        body: "See paid, due, and overdue rent clearly with finance views shaped around follow-up, not generic bookkeeping.",
      },
      {
        title: "Document storage",
        body: "Store leases, compliance files, and supporting records by tenant, property, or account without losing scope and history.",
      },
    ],
  },
  productPreview: {
    title: "See what needs attention across the portfolio before it becomes noise",
    body:
      "OASIS is designed to surface the important parts of rental operations at a glance, from overdue rent to stalled repairs, tenant follow-up, and the records tied to each property.",
    items: [
      {
        label: "Command Center",
        title: "Command Center",
        body: "See the queues, alerts, and overdue items that need action now instead of hunting through separate screens.",
        points: ["urgent queues", "overdue balances", "issues needing action"],
        imageSrc: "/screenshots/command-center.png",
        imageAlt: "OASIS Command Center with urgent and needs-action queues.",
      },
      {
        label: "Property Health",
        title: "Property and portfolio health",
        body: "Review occupancy, arrears pressure, maintenance load, and property health from one operational view.",
        points: ["property health score", "arrears visibility", "maintenance pressure"],
        imageSrc: "/screenshots/portfolio-health.png",
        imageAlt: "OASIS Portfolio Health dashboard showing occupancy mix, finance mix, and maintenance pressure.",
      },
      {
        label: "Security Audit",
        title: "Security audit and operational trust",
        body: "Review high-trust events, security policy controls, and the signals that help OASIS spot operational pressure early.",
        points: ["audit review", "alert controls", "operational signals"],
        imageSrc: "/screenshots/security-audit.png",
        imageAlt: "OASIS Security Audit page showing policy settings and security event review.",
      },
    ],
  },
  workflowSection: {
    title: "Core workflows that keep rental operations moving",
    body:
      "Explore the three areas where landlords usually feel the most operational friction and where OASIS helps bring more structure and visibility.",
    items: [
      {
        label: "Tenant management",
        title: "Keep tenant records and rent context in one place",
        body: "See who lives where, what still needs follow-up, and how tenant records connect to the wider rental workflow without rebuilding context each time.",
        href: "/features/tenant-management",
        points: ["centralized tenant profiles", "linked property context", "clearer follow-up"],
        imageSrc: "/screenshots/property-performance.png",
        imageAlt: "OASIS property view showing rent, operational health score, and performance context for a property.",
      },
      {
        label: "Maintenance management",
        title: "Track repairs through a clearer maintenance workflow",
        body: "Move away from fragmented maintenance follow-up and toward a system that makes status, ownership, and bottlenecks easier to see early.",
        href: "/features/maintenance-management",
        points: ["request intake", "work order visibility", "repair progress tracking"],
        imageSrc: "/screenshots/maintenance-inbox.png",
        imageAlt: "OASIS Maintenance Inbox showing request columns, SLA age, and linked work orders.",
      },
      {
        label: "Rental accounting",
        title: "Understand paid, due, and overdue rent faster",
        body: "Get finance visibility that helps landlords understand income status across the portfolio and act before arrears become a bigger operational problem.",
        href: "/features/rental-accounting",
        points: ["paid and overdue rent", "property-level visibility", "faster action on issues"],
        imageSrc: "/screenshots/portfolio-health.png",
        imageAlt: "OASIS Portfolio Health dashboard showing finance mix and arrears aging.",
      },
    ],
  },
  benefitsSection: {
    title: "What landlords gain with OASIS",
    items: [
      {
        title: "Less admin work",
        body: "Keep records organized and avoid switching between tools just to understand what is happening right now.",
      },
      {
        title: "Better maintenance control",
        body: "Track requests, assignments, and repairs in one place with less guesswork and earlier visibility into delays.",
      },
      {
        title: "Clear financial visibility",
        body: "See paid, due, and overdue rent across your portfolio without relying on manual trackers or reactive follow-up.",
      },
      {
        title: "More proactive operations",
        body: "Run your rentals with a structured system that helps you spot pressure before tenants feel it.",
      },
    ],
  },
  pricingPreview: {
    title: "Simple plans for growing rental portfolios",
    body: "Choose the plan that fits your current portfolio and move up as your rental operations grow.",
    cta: { label: "See Pricing", href: "/pricing" },
  },
  testimonials: {
    title: "Built for landlords who want a clearer operating system",
    items: [
      "Helping landlords bring tenant records, maintenance, payments, and action queues into one workflow.",
      "Designed for modern rental portfolios that need better visibility, faster follow-up, and less admin sprawl.",
      "A cleaner operating layer for landlords moving beyond spreadsheets, scattered inboxes, and reactive firefighting.",
    ],
  },
  finalCta: {
    title: "Bring your rental operations into one clear operating system",
    body:
      "Stop juggling spreadsheets, messages, and scattered records. OASIS helps landlords run rental operations with more clarity, faster follow-up, and earlier visibility into what needs attention.",
    primaryCta: { label: "Start Free", href: siteConfig.appUrl },
    secondaryCta: { label: "View Pricing", href: "/pricing" },
  },
};
