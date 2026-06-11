import { siteConfig } from "../site";

export const securityAuditContent = {
  seo: {
    title: "Security Audit Trail for Landlords | Tenaqo",
    description:
      "Review permissions, workflow-sensitive actions, and account-scoped audit trails in Tenaqo.",
    canonical: `${siteConfig.url}/features/security-audit`,
  },
  hero: {
    eyebrow: "Security and audit",
    title: "Move fast without losing accountability",
    body:
      "Tenaqo gives landlords an audit-aware operating model with role boundaries, workflow-sensitive review, and account-scoped visibility into what changed and why.",
    imageSrc: "/screenshots/security-audit.png",
    imageAlt: "Tenaqo Security Audit page showing policy settings and hosted event review.",
  },
  problemSection: {
    eyebrow: "Why it matters",
    title: "Operational speed breaks trust when nobody can explain what changed",
    body:
      "As portfolios grow, more people touch documents, permissions, work orders, and account settings. If the trail is weak, every mistake takes longer to untangle.",
    items: [
      {
        title: "Role leakage creates risk",
        body: "Owners, staff, tenants, and contractors should not see or do the same things.",
      },
      {
        title: "Workflow changes need context",
        body: "When approvals, updates, or access changes happen, the important question is who changed what and where.",
      },
      {
        title: "Review surfaces get bolted on too late",
        body: "Many tools treat accountability as an afterthought rather than part of the day-to-day operating model.",
      },
    ],
  },
  solutionSection: {
    eyebrow: "What Tenaqo does",
    title: "Audit-ready operations without turning the app into a compliance maze",
    body:
      "Tenaqo keeps permissions, security-sensitive actions, and workflow review inside the same product rhythm so operators can move quickly and still explain what happened.",
    items: [
      {
        title: "Role-based access control",
        body: "Keep each role in the right lane while preserving the real work each one needs to do.",
      },
      {
        title: "Workflow-aware review",
        body: "Track the actions behind documents, packets, access changes, and related operational decisions.",
      },
      {
        title: "Account-scoped visibility",
        body: "Review relevant events in the right account context instead of stitching together a story from logs and memory.",
      },
    ],
    imageSrc: "/screenshots/security-audit.png",
    imageAlt: "Tenaqo Security Audit page reinforcing operational trust and review.",
    imageAlign: "left" as const,
  },
  benefits: {
    title: "What landlords gain from a stronger audit trail",
    items: [
      {
        title: "More confidence in delegation",
        body: "You can move work across staff and contractors without losing sight of who touched what.",
      },
      {
        title: "Faster issue diagnosis",
        body: "Review surfaces make it easier to understand the path behind sensitive changes.",
      },
      {
        title: "Cleaner role boundaries",
        body: "Operational trust improves when each user sees the right context and nothing extra.",
      },
      {
        title: "Professional-grade accountability",
        body: "The system feels more credible when important actions already have a trail behind them.",
      },
    ],
  },
  finalCta: {
    title: "Run faster without losing the trail",
    body:
      "See how Tenaqo gives landlords stronger accountability across permissions, document workflows, and daily operations.",
    primaryCta: { label: "Get Early Access", href: siteConfig.appUrl },
    secondaryCta: { label: "Explore Features", href: "/features" },
  },
};
