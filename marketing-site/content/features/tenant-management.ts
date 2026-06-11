import { siteConfig } from "../site";

export const tenantManagementContent = {
  seo: {
    title: "Tenant Management and Tenant Portal Software | Tenaqo",
    description:
      "Keep tenant records, tenant portal activity, documents, and rent context organized with Tenaqo tenant management software for landlords.",
    canonical: `${siteConfig.url}/features/tenant-management`,
  },
  hero: {
    eyebrow: "Tenant management",
    title: "Give landlords and tenants one clearer operating context",
    body:
      "Tenaqo helps landlords keep tenant details, property links, document workflows, and tenant portal activity close enough to act on without rebuilding the story from scattered tools.",
    imageSrc: "/screenshots/tenant-home.png",
    imageAlt: "Tenaqo tenant portal dashboard showing payment visibility, maintenance activity, and document follow-up.",
  },
  painPoints: {
    eyebrow: "Landlord pain points",
    title: "Tenant admin slows down when the landlord view and tenant view drift apart",
    body:
      "When tenant information, payment guidance, agreement follow-up, and document requests live in different places, simple tasks start taking longer than they should.",
    items: [
      {
        title: "Fragmented records",
        body: "Contact details, lease context, uploaded evidence, and occupancy information often end up spread across too many places.",
      },
      {
        title: "Tenant uncertainty",
        body: "If tenants cannot see their document tasks, payment setup, or maintenance status clearly, routine questions come back through email and calls.",
      },
      {
        title: "Reactive operations",
        body: "Without a structured workflow, landlords spend more time chasing agreement status, uploaded evidence, and missing context than making decisions.",
      },
    ],
    imageSrc: "/screenshots/documents-workflow.png",
    imageAlt: "Tenaqo Documents page showing document requests, agreement packets, and tenant-facing workflow handoff.",
  },
  solution: {
    eyebrow: "How Tenaqo helps",
    title: "A tenant workflow built around clarity, requests, and review",
    body:
      "Tenaqo keeps tenant details, property links, rent context, document requests, agreement packets, and signature readiness close enough to support daily decisions.",
    items: [
      {
        title: "Centralized tenant profiles",
        body: "Keep the tenant record tied to the right property and connected to relevant documents and payments.",
      },
      {
        title: "Tenant portal that reduces repeat questions",
        body: "Give tenants a clearer self-service place for payment setup, maintenance visibility, document access, and packet review.",
      },
      {
        title: "Structured document handoff",
        body: "Request ID files, receipts, signed agreements, and other evidence from tenants or contractors without losing the review trail.",
      },
      {
        title: "Pre-signature agreement workflow",
        body: "Create template-based agreement packets, send them to the right participant, and track draft, sent, viewed, prepared, and completed status in one place.",
      },
    ],
    imageSrc: "/screenshots/tenant-documents.png",
    imageAlt: "Tenaqo tenant documents portal showing prioritized records, document requests, and agreement packets.",
    imageAlign: "left" as const,
  },
  trustLayer: {
    eyebrow: "Trust layer",
    title: "Tenant workflows should stay usable without getting loose",
    body:
      "As more people touch tenant-related work, control matters. Tenaqo keeps tenant context practical for day-to-day operations while preserving role boundaries, account-scoped review, packet history, and document audit trails.",
    items: [
      {
        title: "Keep access scoped by role",
        body: "Owners, staff, tenants, and contractors do not need the same visibility. Tenaqo keeps those lanes clearer.",
      },
      {
        title: "Review document and packet history",
        body: "When files are uploaded, packets are sent, or the wrong context is used, the audit trail is easier to review.",
      },
      {
        title: "Prepare for signing without pretending the provider work is done",
        body: "Signature readiness keeps provider metadata, packet state, and hosted signing handoff organized while the signed-document return path stays inside the same document workflow.",
      },
    ],
    imageSrc: "/screenshots/security-audit.png",
    imageAlt: "Tenaqo Security Audit page showing account-scoped review of security and workflow events.",
  },
  benefits: {
    title: "What landlords gain with a better tenant and portal workflow",
    items: [
      {
        title: "Less manual admin",
        body: "Reduce the time spent searching for details and checking whether records, requests, and packet status still match reality.",
      },
      {
        title: "Clearer tenant communication",
        body: "Give tenants a cleaner place to review what is due, what is available, and what still needs their attention.",
      },
      {
        title: "More professional document handling",
        body: "Run templates, evidence requests, uploads, agreement packets, and signature handoff with structure that holds up as portfolios grow.",
      },
      {
        title: "Stronger day-to-day control",
        body: "Stay organized across payment setup, maintenance context, updates, and linked records with less friction.",
      },
    ],
  },
  finalCta: {
    title: "Make tenant admin and tenant self-service easier to act on",
    body:
      "See how Tenaqo helps landlords manage tenant information, payment setup, documents, agreement packets, and property links without rebuilding context from separate trackers.",
    primaryCta: { label: "Get Early Access", href: siteConfig.appUrl },
    secondaryCta: { label: "View Pricing", href: "/pricing" },
  },
};
