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
      "Built with real landlord workflows in mind. Designed for operators who need control, accountability, and an AI-assisted picture of what needs action now.",
    highlights: [
      { label: "Command Center", href: "/features/command-center" },
      { label: "Maintenance Workflow", href: "/features/maintenance-management" },
      { label: "Property Health Scoring", href: "/features/portfolio-health" },
      { label: "Security & Audit Trail", href: "/features/security-audit" },
    ],
    microcopy: [
      "No credit card required.",
      "Built for landlords running real portfolios.",
      "See the workflow and the controls in minutes.",
    ],
    imageSrc: "/screenshots/command-center.png",
    imageAlt: "OASIS Command Center showing operator briefing, urgent items, overdue balance, and action queues across the portfolio.",
    primaryCta: { label: "Get Early Access", href: siteConfig.appUrl },
    secondaryCta: { label: "See The Tenant Portal", href: "/features/tenant-portal" },
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
        body: "Leases, receipts, ID checks, and agreement context drift into folders, inboxes, and old conversations when the work gets busy.",
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
        body: "Keep tenant context, document requests, agreement packets, and property history close to the work they support.",
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
        body: "The Command Center works like the brain of the operations hub, combining urgent queues with an operator briefing so nothing important gets quietly missed.",
        points: ["AI operator briefing", "urgent queues", "next actions"],
        imageSrc: "/screenshots/command-center.png",
        imageAlt: "OASIS Command Center with AI operator briefing and needs-action queues.",
      },
      {
        label: "Maintenance System",
        title: "Repairs move without the chaos",
        body: "Tenant, landlord, contractor, and completion all sit inside one maintenance workflow, now with AI triage support to speed the first operational read.",
        points: ["request to assignment", "AI triage help", "clear completion trail"],
        imageSrc: "/screenshots/maintenance-inbox.png",
        imageAlt: "OASIS Maintenance Inbox showing request columns, AI triage guidance, SLA age, and linked work orders.",
      },
      {
        label: "Tenant Portal",
        title: "Tenants get a clearer self-service lane",
        body: "Payments, maintenance visibility, documents, and agreement review all live in one tenant-safe portal instead of turning into repeated follow-up.",
        points: ["maintenance status clarity", "document access", "payment setup guidance"],
        imageSrc: "/screenshots/tenant-home.png",
        imageAlt: "OASIS tenant portal dashboard showing action items, payment visibility, and maintenance progress.",
      },
      {
        label: "Documents Workflow",
        title: "Agreement and evidence handoffs stay in one operating lane",
        body: "Templates, tenant document requests, contractor submissions, agreement packets, and signature readiness stay tied to the same account-scoped workflow.",
        points: ["template library", "agreement packets", "signature readiness"],
        imageSrc: "/screenshots/documents-workflow.png",
        imageAlt: "OASIS Documents page showing document requests, agreement packets, and signature workflow controls.",
      },
      {
        label: "Portfolio Health",
        title: "Property pressure becomes visible sooner",
        body: "Use portfolio health scoring to spot arrears, maintenance strain, and operational risk before they become vacancies, delays, or expensive cleanup, now with an AI explainer for the weakest address.",
        points: ["property health score", "AI risk explainer", "earlier action"],
        imageSrc: "/screenshots/portfolio-health.png",
        imageAlt: "OASIS Portfolio Health dashboard showing risk signals and an AI explanation of property pressure.",
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
  healthSection: {
    eyebrow: "Property Health",
    title: "Know which property is costing you money before the tenant calls",
    body:
      "OASIS turns portfolio health into something landlords can act on, not just review. Health scoring pulls together overdue rent, maintenance strain, stalled repairs, vacancy pressure, and contractor follow-through so risk shows up before it becomes expensive cleanup, with an explainer that tells you why a property is slipping.",
    items: [
      {
        title: "See pressure across the portfolio",
        body: "Review overdue balances, maintenance load, and open repair pressure without rebuilding the picture from separate pages.",
      },
      {
        title: "Catch deterioration earlier",
        body: "Spot high-risk properties, stalled repairs, and contractor acknowledgement delays before they become bigger operating problems, then see the facts driving that pressure.",
      },
      {
        title: "Act before small issues spread",
        body: "Use health signals to decide where to intervene first instead of waiting for the next complaint, missed payment, or vacancy surprise.",
      },
      {
        title: "Keep the risk tied to the work",
        body: "The same operating system that surfaces the pressure also shows the queues, requests, and records needed to respond.",
      },
    ],
    imageSrc: "/screenshots/portfolio-health.png",
    imageAlt: "OASIS Portfolio Health dashboard showing occupancy mix, finance pressure, and maintenance risk signals.",
    imageAlign: "left" as const,
  },
  tenantPortalSection: {
    eyebrow: "Tenant portal",
    title: "Give tenants a clearer experience without turning every update into a chase",
    body:
      "The tenant portal now deserves its own spotlight. Tenants can review payments, track maintenance activity, open shared documents, upload requested evidence, and complete agreement review steps inside a space built only for them.",
    items: [
      {
        title: "Self-service that reduces repeat questions",
        body: "Payment setup, active issues, and new updates stay visible in one tenant-safe dashboard instead of disappearing into scattered reminders.",
      },
      {
        title: "Document and agreement handoff in one place",
        body: "Tenants can see requested documents, upload what is needed, review agreement packets, and follow signature handoff from the same portal.",
      },
      {
        title: "Professional experience without role leakage",
        body: "The portal feels complete for tenants while staying tightly scoped to their tenancy, their requests, and their records.",
      },
    ],
    imageSrc: "/screenshots/tenant-documents.png",
    imageAlt: "OASIS tenant portal documents page showing requests, uploads, and agreement packet review.",
    primaryCta: { label: "See The Tenant Portal", href: "/features/tenant-portal" },
    secondaryCta: { label: "Explore Tenant Workflows", href: "/features/tenant-management" },
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
        body: "The contractor updates progress, the quote lands in the same workflow, and approval happens with the job context, recommendation, and repair history already in front of you.",
        href: "/features/maintenance-management",
        points: ["review the quote", "approve with context", "keep the trail intact"],
        imageSrc: "/screenshots/maintenance-inbox.png",
        imageAlt: "OASIS maintenance workflow showing linked request context, work-order progress, and the next repair decision.",
      },
    ],
  },
  securitySection: {
    eyebrow: "Security and accountability",
    title: "Move fast without losing control",
    body:
      "OASIS is built so landlords do not have to choose between speed and accountability. Permissions, audit trails, and review surfaces help you understand who changed what, what was approved, and what deserves attention next.",
    items: [
      {
        title: "Role-based access",
        body: "Keep owners, staff, contractors, and tenants in the right lanes instead of exposing the whole portfolio to everyone.",
      },
      {
        title: "Audit trail where it matters",
        body: "Review the key actions behind document requests, agreement packets, work orders, and security-sensitive decisions without reconstructing the story from raw logs.",
      },
      {
        title: "Operational accountability",
        body: "When approvals, updates, and access changes happen, the trail is already there for review.",
      },
      {
        title: "Review surfaces for real operators",
        body: "Security Audit and related review views help serious operators diagnose problems with the right scoped signal.",
      },
    ],
    imageSrc: "/screenshots/security-audit.png",
    imageAlt: "OASIS Security Audit page showing policy settings, hosted events, and account-scoped review.",
  },
  finalCta: {
    title: "Try OASIS before we launch publicly",
    body:
      "If your real problem is keeping rent, repairs, records, and follow-up moving together, OASIS is built for that stage. Get early access, test it with real work, and help shape how it evolves.",
    primaryCta: { label: "Get Early Access", href: siteConfig.appUrl },
    secondaryCta: { label: "See The Tenant Portal", href: "/features/tenant-portal" },
  },
};
