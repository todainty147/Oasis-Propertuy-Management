import { siteConfig } from "../site";

export const tenantPortalContent = {
  seo: {
    title: "Tenant Portal Software for Landlords | OASIS Rental",
    description:
      "Give tenants a clearer way to follow payments, maintenance activity, documents, and agreement review through a modern portal experience.",
    canonical: "https://oasisrental.com/features/tenant-portal",
  },
  hero: {
    eyebrow: "Tenant portal",
    title: "Give tenants a clearer self-service lane without loosening control",
    body:
      "OASIS gives landlords a tenant-safe portal for payments, maintenance visibility, documents, agreement review, and signature handoff so fewer updates fall back into email chains and memory.",
    imageSrc: "/screenshots/tenant-home.png",
    imageAlt: "OASIS tenant portal dashboard showing payment visibility, maintenance activity, and action items.",
  },
  visibilitySection: {
    eyebrow: "Better visibility",
    title: "Tenants see what matters without seeing the whole portfolio",
    body:
      "A useful portal is not about exposing more data. It is about giving the tenant a clean view of their home, their requests, their documents, and their payment setup so routine questions do not turn into repeated chasing.",
    items: [
      {
        title: "Action-focused dashboard",
        body: "Surface the items that need attention first, including payment review, active issues, and new updates tied to the tenancy.",
      },
      {
        title: "Maintenance status clarity",
        body: "Let tenants track active requests and work orders without asking the landlord team for every progress update.",
      },
      {
        title: "Document access that feels trustworthy",
        body: "Keep shared files and tenant-prioritized records in one tenant-safe place instead of scattered attachments and old messages.",
      },
    ],
    imageSrc: "/screenshots/tenant-home.png",
    imageAlt: "OASIS tenant portal dashboard showing summary cards, attention items, and recent updates.",
  },
  documentsSection: {
    eyebrow: "Documents and review",
    title: "Requests, uploads, and agreement packets stay in one lane",
    body:
      "The tenant portal is not just a file cabinet. OASIS lets landlords request evidence, tenants upload what is needed, and both sides track agreement packets in the same workflow.",
    items: [
      {
        title: "Tenant document requests",
        body: "Ask for ID files, receipts, signed agreements, or other evidence with a visible request state instead of informal back-and-forth.",
      },
      {
        title: "Agreement packet review",
        body: "Tenants can review pre-signature packets, mark them viewed, and follow the current review or signing step from their portal.",
      },
      {
        title: "Prioritized document view",
        body: "Landlords can surface which records are current or need attention so tenants know what matters now.",
      },
    ],
    imageSrc: "/screenshots/tenant-documents.png",
    imageAlt: "OASIS tenant documents page showing document requests and agreement packet review.",
    imageAlign: "left" as const,
  },
  paymentsSection: {
    eyebrow: "Payment clarity",
    title: "Payment setup is clearer even when OASIS is not the payment rail",
    body:
      "Today OASIS supports landlord-configured payment setup in the tenant portal: accepted methods, external payment portal links, support contacts, and autopay guidance. That keeps the experience honest while reducing payment confusion.",
    items: [
      {
        title: "Accepted methods in one view",
        body: "Show whether tenants should pay by bank transfer, external card portal, standing order, or another approved route.",
      },
      {
        title: "External portal guidance",
        body: "Link out to the right collection portal when that is how the account collects, without pretending payment execution is native.",
      },
      {
        title: "Support and autopay instructions",
        body: "Keep support contacts and autopay guidance visible inside the payment experience so tenants know the next step.",
      },
    ],
    imageSrc: "/screenshots/payment-setup.png",
    imageAlt: "OASIS finance page showing tenant payment setup with accepted methods, support contact, and external portal guidance.",
  },
  trustLayer: {
    eyebrow: "Trust layer",
    title: "A better tenant experience should still stay tightly scoped",
    body:
      "The tenant portal only works as a trust layer if it is coherent and correctly limited. OASIS keeps tenant views account-scoped, route-hardened, and aligned with the same permission and document controls used across the product.",
    items: [
      {
        title: "Tenant-safe routes",
        body: "Dashboard shortcuts, shared routes, and empty states stay aligned with tenant visibility rather than dropping users into landlord workflows.",
      },
      {
        title: "Role isolation stays intact",
        body: "Tenants see their own payment, maintenance, and document context without role leakage into staff, owner, or contractor surfaces.",
      },
      {
        title: "Workflow history remains reviewable",
        body: "Document requests, packet progress, signature handoff, and related actions still sit inside the same audit-aware operating model.",
      },
    ],
    imageSrc: "/screenshots/security-audit.png",
    imageAlt: "OASIS Security Audit page showing account-scoped review and workflow accountability.",
    imageAlign: "left" as const,
  },
  benefits: {
    title: "What landlords gain from a stronger tenant portal",
    items: [
      {
        title: "Fewer repeated questions",
        body: "Give tenants a cleaner place to check payment setup, maintenance progress, and documents before they need to call or email.",
      },
      {
        title: "More professional follow-through",
        body: "Turn tenant communication into a structured workflow instead of a series of disconnected reminders and attachments.",
      },
      {
        title: "Better tenant trust",
        body: "A portal that feels clear and current helps tenants believe the landlord team actually has control of the work.",
      },
      {
        title: "A stronger base for future premium depth",
        body: "The current portal is already credible today and creates a cleaner foundation for richer signing, timeline depth, and payment execution later.",
      },
    ],
  },
  finalCta: {
    title: "Show tenants a more complete experience without adding communication chaos",
    body:
      "See how OASIS helps landlords give tenants clearer payments, maintenance visibility, document review, and agreement follow-through inside a tenant-safe portal.",
    primaryCta: { label: "Get Early Access", href: siteConfig.appUrl },
    secondaryCta: { label: "Explore Features", href: "/features" },
  },
};
