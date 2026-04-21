import { siteConfig } from "./site";

export const homepageContent = {
  seo: {
    title: "Property Operations Platform for Landlords | OASIS Rental",
    description:
      "OASIS helps systems-driven landlords run rent, repairs, records, and follow-up from one clear operations hub.",
    canonical: "https://oasisrental.com/",
  },
  hero: {
    eyebrow: "For systems-driven landlords",
    title: "Command your portfolio. Don’t just manage it.",
    body:
      "OASIS gives landlords one clear operations hub for rent, repairs, records, and follow-up.",
    support:
      "Built with real landlord workflows in mind. Designed for operators who need control, accountability, and a clearer picture of what needs action now.",
    highlights: [
      "Command Center",
      "Maintenance Workflow",
      "Property Health Scoring",
      "Security & Audit Trail",
    ],
    microcopy: [
      "No credit card required.",
      "Built for landlords running real portfolios.",
      "See the workflow and the controls in minutes.",
    ],
    imageSrc: "/screenshots/command-center.png",
    imageAlt: "OASIS Command Center showing urgent items, overdue balance, and action queues across the portfolio.",
    primaryCta: { label: "Get Early Access", href: siteConfig.appUrl },
    secondaryCta: { label: "See The Operations Hub", href: "/features" },
  },
  problemSection: {
    eyebrow: "Why operators switch",
    title: "The properties are manageable. The coordination is what breaks.",
    body:
      "Most landlords do not need more software categories. They need one place to see what is due, what is stuck, who owns the next step, and where risk is building.",
    items: [
      {
        title: "Rent follow-up slips",
        body: "Paid, due, and overdue balances take too long to confirm when the truth lives in separate trackers and message threads.",
      },
      {
        title: "Repairs lose momentum",
        body: "A tenant message becomes a contractor note, then a half-remembered task, then a delayed repair nobody owns properly.",
      },
      {
        title: "Records go missing",
        body: "Leases, documents, and property context drift into folders, inboxes, and old conversations when the work gets busy.",
      },
      {
        title: "Every week starts with catch-up",
        body: "Before you can act, you first have to reconstruct what happened, what changed, and what still needs attention.",
      },
    ],
  },
  solutionSection: {
    title: "One operations hub for the work after the message comes in",
    body:
      "OASIS is built for property operations and coordination: the daily work of keeping rent, repairs, records, and follow-up moving without dropped handoffs.",
    items: [
      {
        title: "See what needs attention",
        body: "Start from urgent queues, overdue balances, and stalled work instead of rebuilding the day from inboxes and memory.",
      },
      {
        title: "Push work forward",
        body: "Move maintenance from tenant request to contractor progress to completion without endless back-and-forth.",
      },
      {
        title: "Keep context close",
        body: "Keep leases, documents, tenant context, and property history close to the work they support.",
      },
      {
        title: "Catch pressure earlier",
        body: "Spot overdue rent, maintenance risk, and portfolio pressure before they turn into bigger operational problems.",
      },
    ],
  },
  productPreview: {
    title: "Built for the parts of portfolio work that break first",
    body:
      "OASIS is for landlords who are past simple record-keeping and need one brain for the portfolio: clearer ownership, faster decisions, and stronger follow-through as the work gets noisier.",
    items: [
      {
        label: "Command Center",
        title: "The mental load drops fast",
        body: "The Command Center works like the brain of the operations hub, showing what needs action now so nothing important gets quietly missed.",
        points: ["zero missed tasks", "urgent queues", "next actions"],
        imageSrc: "/screenshots/command-center.png",
        imageAlt: "OASIS Command Center with urgent and needs-action queues.",
      },
      {
        label: "Maintenance System",
        title: "Repairs move without the chaos",
        body: "Tenant, landlord, contractor, and completion all sit inside one maintenance workflow instead of spilling across calls, messages, and memory.",
        points: ["request to assignment", "contractor updates", "clear completion trail"],
        imageSrc: "/screenshots/maintenance-inbox.png",
        imageAlt: "OASIS Maintenance Inbox showing request columns, SLA age, and linked work orders.",
      },
      {
        label: "Portfolio Health",
        title: "Property pressure becomes visible sooner",
        body: "Use portfolio health scoring to spot arrears, maintenance strain, and operational risk before they become vacancies, delays, or expensive cleanup.",
        points: ["property health score", "risk visibility", "earlier action"],
        imageSrc: "/screenshots/portfolio-health.png",
        imageAlt: "OASIS Portfolio Health dashboard showing occupancy mix, finance mix, and maintenance pressure.",
      },
      {
        label: "Security & Audit",
        title: "Everyone stays accountable",
        body: "Review who changed what, what was approved, and what deserves attention when the portfolio needs stronger controls.",
        points: ["role-based access", "audit review", "operational accountability"],
        imageSrc: "/screenshots/security-audit.png",
        imageAlt: "OASIS Security Audit page showing policy settings and security event review.",
      },
    ],
  },
  workflowSection: {
    title: "See the workflow in action",
    body:
      "Instead of another generic feature list, here is what operational control looks like when OASIS is running the workflow.",
    items: [
      {
        label: "T:00",
        title: "Tenant reports the issue from their phone",
        body: "The request lands with the right property context instead of getting buried in WhatsApp, email, or a call you need to remember later.",
        href: "/features/maintenance-management",
        points: ["mobile-first request", "property context included", "clear intake record"],
        imageSrc: "/screenshots/property-requests.png",
        imageAlt: "OASIS property request view showing tenant-reported issues and linked operational follow-up.",
      },
      {
        label: "T:05",
        title: "Manager assigns the contractor with one click",
        body: "Everyone stays updated automatically, and the job moves forward without copy-pasting details into another thread.",
        href: "/features/maintenance-management",
        points: ["assign fast", "track ownership", "keep everyone aligned"],
        imageSrc: "/screenshots/maintenance-inbox.png",
        imageAlt: "OASIS Maintenance Inbox showing request columns, SLA age, and linked work orders.",
      },
      {
        label: "T:15",
        title: "Contractor quotes and the next decision is obvious",
        body: "The contractor updates progress, the quote lands in the same workflow, and approval happens with the job context already in front of you.",
        href: "/features/maintenance-management",
        points: ["review the quote", "approve with context", "keep the trail intact"],
        imageSrc: "/screenshots/maintenance-inbox.png",
        imageAlt: "OASIS maintenance workflow showing linked request context, work-order progress, and the next repair decision.",
      },
    ],
  },
  finalCta: {
    title: "Try OASIS before we launch publicly",
    body:
      "If your real problem is keeping rent, repairs, records, and follow-up moving together, OASIS is built for that stage. Get early access, test it with real work, and help shape how it evolves.",
    primaryCta: { label: "Get Early Access", href: siteConfig.appUrl },
    secondaryCta: { label: "Compare Plans", href: "/pricing" },
  },
};
