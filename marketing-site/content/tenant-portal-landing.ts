import { siteConfig } from "./site";

export const tenantPortalLandingContent = {
  seo: {
    title: "Tenant Portal Software for Landlords | Clearer Tenant Self-Service | OASIS Rental",
    description:
      "Reduce tenant confusion with a clearer portal for payments, maintenance status, documents, and agreement review.",
    canonical: "https://oasisrental.com/tenant-portal-software",
  },
  hero: {
    eyebrow: "Tenant trust landing page",
    title: "Stop answering the same tenant questions over and over",
    body:
      "OASIS gives landlords a tenant-safe portal for payments, maintenance visibility, documents, and agreement review so tenants can self-serve the basics without losing trust in the process.",
    support:
      "Built for real landlord workflows. Strong enough to reduce tenant uncertainty today, without pretending the portal is already a separate premium product line.",
    highlights: [
      "Tenant-safe dashboard",
      "Maintenance status visibility",
      "Document requests and uploads",
      "Agreement packet review",
    ],
    microcopy: [
      "Grounded in the current OASIS product.",
      "No fake pay-now claims.",
      "Clearer communication without role leakage.",
    ],
    imageSrc: "/screenshots/tenant-home.png",
    imageAlt: "OASIS tenant portal dashboard showing summary cards, maintenance items, and payment visibility.",
    primaryCta: { label: "Get Early Access", href: siteConfig.appUrl },
    secondaryCta: { label: "See The Tenant Portal", href: "/features/tenant-portal" },
  },
  problemSection: {
    title: "Why tenant communication gets noisy",
    body:
      "The issue is rarely that tenants want too much. It is that routine answers are scattered across inboxes, attachments, payment instructions, and repair updates that never stay in one place.",
    items: [
      {
        title: "Payment questions repeat",
        body: "Tenants ask how to pay, where to pay, and who to contact because the setup is not visible where they expect it.",
      },
      {
        title: "Maintenance updates feel vague",
        body: "A request may be active, assigned, or in progress, but the tenant still feels left in the dark.",
      },
      {
        title: "Documents drift into old threads",
        body: "Receipts, ID files, and agreements disappear into email attachments and screenshot history when they should stay tied to the tenancy.",
      },
    ],
  },
  portalSection: {
    eyebrow: "What tenants can do today",
    title: "A cleaner tenant experience without giving away the landlord console",
    body:
      "The current OASIS tenant portal already gives tenants a clear view of the things they care about most, while keeping the operational controls on the landlord side.",
    items: [
      {
        title: "Review payments",
        body: "Show outstanding balances, payment history, accepted methods, external payment portal links, support contact details, and autopay guidance.",
      },
      {
        title: "Track maintenance progress",
        body: "Let tenants follow active issues and work orders from a tenant-safe dashboard instead of asking for every update manually.",
      },
      {
        title: "Open documents and respond to requests",
        body: "Tenants can review available records, upload requested evidence, and keep document handoffs inside the same portal.",
      },
      {
        title: "Complete agreement review steps",
        body: "Agreement packets already support sent, viewed, and completed review states before external signing integrations go further.",
      },
    ],
    imageSrc: "/screenshots/tenant-documents.png",
    imageAlt: "OASIS tenant documents page showing document requests and agreement packet review.",
    imageAlign: "left" as const,
  },
  workflowSection: {
    title: "What the tenant-facing workflow feels like",
    body:
      "This is the win: tenants get a calmer, clearer path while the landlord team keeps the operational controls.",
    items: [
      {
        label: "Step 1",
        title: "Tenant sees what needs attention right away",
        body: "The dashboard highlights payment review, active issues, new updates, and available documents in one tenant-safe view.",
        href: "/features/tenant-portal",
        points: ["one tenant-safe home base", "fewer routine emails", "clearer next step"],
        imageSrc: "/screenshots/tenant-home.png",
        imageAlt: "OASIS tenant portal dashboard with summary cards and action items.",
      },
      {
        label: "Step 2",
        title: "Tenant responds inside the same portal",
        body: "If the landlord team requests a receipt, ID file, or agreement review, the tenant can handle it from the documents area instead of digging through old messages.",
        href: "/features/tenant-portal",
        points: ["upload requested evidence", "review agreement packets", "keep the trail intact"],
        imageSrc: "/screenshots/tenant-documents.png",
        imageAlt: "OASIS tenant documents page showing a requested upload and agreement packet review.",
      },
      {
        label: "Step 3",
        title: "Landlord keeps control while the communication load drops",
        body: "The portal reduces confusion without exposing the broader landlord workflow, keeping the experience professional and tightly scoped.",
        href: "/features/tenant-management",
        points: ["account-scoped access", "role isolation", "same workflow spine as the main app"],
        imageSrc: "/screenshots/security-audit.png",
        imageAlt: "OASIS Security Audit view supporting the controlled, account-scoped trust model behind the tenant portal.",
      },
    ],
  },
  proofSection: {
    eyebrow: "Why this converts",
    title: "The tenant portal is not a bonus feature. It is part of operational trust.",
    body:
      "A landlord platform feels more complete when tenants can see the right information without leaking into the wrong surfaces. That lowers communication drag and makes the operation feel more credible on both sides.",
    items: [
      {
        title: "Fewer repeated questions",
        body: "Routine payment, document, and maintenance questions have somewhere better to land than the landlord inbox.",
      },
      {
        title: "More professional tenant experience",
        body: "Tenants see a cleaner, purpose-built interface rather than a restricted version of the landlord shell.",
      },
      {
        title: "Stronger trust with real boundaries",
        body: "The current tenant portal is useful today precisely because it is scoped tightly to the tenancy and its related workflow.",
      },
    ],
    imageSrc: "/screenshots/payment-setup.png",
    imageAlt: "OASIS finance page showing tenant payment setup that feeds the tenant portal payment experience.",
  },
  finalCta: {
    title: "Turn tenant confusion into a clearer self-service experience",
    body:
      "If the current pain is repeated payment questions, vague maintenance follow-up, or document chaos, OASIS gives you a stronger tenant-facing experience without losing control of the operation.",
    primaryCta: { label: "Get Early Access", href: siteConfig.appUrl },
    secondaryCta: { label: "Explore The Full Tenant Portal", href: "/features/tenant-portal" },
  },
};
