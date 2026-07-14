import { siteConfig } from "../site";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ComparisonStatus =
  | "available"
  | "available-with-limits"
  | "pilot"
  | "planned"
  | "not-offered";

export const comparisonStatusLabels: Record<ComparisonStatus, string> = {
  available: "Available",
  "available-with-limits": "Available with limits",
  pilot: "Pilot — not generally available",
  planned: "Planned — not currently available",
  "not-offered": "Not offered",
};

// NOT rendered publicly — internal evidence audit only.
type MarketEvidence = {
  provider: string;
  sourceTitle: string;
  sourceUrl: string;
  reviewedAt: string; // ISO date
};

export type ComparisonRow = {
  dimension: string;
  group?: string; // visual section grouping header
  tenaqoStatus: ComparisonStatus;
  tenaqoSummary: string;
  categorySummary: string;
  tenaqoEvidence: string[]; // NOT rendered publicly — internal audit only
  marketEvidence: MarketEvidence[]; // NOT rendered publicly — internal audit only
};

// ── Build-time validation ─────────────────────────────────────────────────────
//
// Called at module load time so violations surface during build rather than at
// runtime. Export allows test suites to call it directly.

export function validateComparisonRows(rows: ComparisonRow[]): void {
  for (const row of rows) {
    if (row.tenaqoEvidence.length === 0) {
      throw new Error(`Missing Tenaqo evidence: ${row.dimension}`);
    }
    if (row.marketEvidence.length === 0) {
      throw new Error(`Missing market evidence: ${row.dimension}`);
    }
    if (row.marketEvidence.some((source) => !source.reviewedAt)) {
      throw new Error(`Missing market review date: ${row.dimension}`);
    }
    if (
      ["pilot", "planned", "not-offered"].includes(row.tenaqoStatus) &&
      row.tenaqoSummary.startsWith("Available")
    ) {
      throw new Error(`Unavailable feature uses availability copy: ${row.dimension}`);
    }
  }
}

// ── Comparison rows ───────────────────────────────────────────────────────────
//
// Reviewed: 14 July 2026
// Providers in market-evidence set: August (augustapp.com), Landlord Studio
// (landlordstudio.com), Arthur Online (arthuronline.co.uk), Landlord Vision
// (landlordvision.co.uk), LandlordOS (landlord-os.com).
// Market-evidence arrays are internal only and must not be rendered publicly.

const _rows: ComparisonRow[] = [
  // ── 1 ──────────────────────────────────────────────────────────────────────

  {
    dimension: "Daily operating queue",
    tenaqoStatus: "available",
    tenaqoSummary:
      "The Command Centre surfaces the highest-priority actions across all properties in one view, ranked by urgency and compliance deadline.",
    categorySummary:
      "Varies by provider and plan. Notification panels and reminder lists are common. A unified, priority-ranked action queue covering compliance, maintenance and payment in one view is less standardised.",
    tenaqoEvidence: [
      "src/pages/CommandCenterPage.jsx",
      "marketing-site/content/features/command-center.ts",
      "supabase/command_center_items.sql",
    ],
    marketEvidence: [
      {
        provider: "August",
        sourceTitle: "August — features overview",
        sourceUrl: "https://www.augustapp.com/features",
        reviewedAt: "2026-07-14",
      },
      {
        provider: "Landlord Studio",
        sourceTitle: "Landlord Studio — features",
        sourceUrl: "https://www.landlordstudio.com/features",
        reviewedAt: "2026-07-14",
      },
      {
        provider: "Arthur Online",
        sourceTitle: "Arthur Online — property management",
        sourceUrl: "https://www.arthuronline.co.uk",
        reviewedAt: "2026-07-14",
      },
    ],
  },

  // ── 2 ──────────────────────────────────────────────────────────────────────

  {
    dimension: "Spreadsheet onboarding",
    tenaqoStatus: "available",
    tenaqoSummary:
      "Properties, tenancies and compliance records can be imported via spreadsheet. Imported rows are held for landlord review before being accepted into active records.",
    categorySummary:
      "Common in established platforms. Most accept CSV or spreadsheet uploads for property and tenancy data. A staged review step before records become active is not universal.",
    tenaqoEvidence: [
      "src/pages/DataImportPage.jsx",
      "src/lib/spreadsheetParser.js",
      "src/services/spreadsheetImportService.js",
      "supabase/spreadsheet_import_v1.sql",
      "tests/unit/spreadsheetParser.test.js",
      "tests/integration/spreadsheetImportPipeline.test.js",
    ],
    marketEvidence: [
      {
        provider: "Landlord Studio",
        sourceTitle: "Landlord Studio — data import and document storage",
        sourceUrl: "https://www.landlordstudio.com/features",
        reviewedAt: "2026-07-14",
      },
      {
        provider: "LandlordOS",
        sourceTitle: "Best landlord software UK 2026",
        sourceUrl: "https://landlord-os.com/best-landlord-software-uk",
        reviewedAt: "2026-07-14",
      },
      {
        provider: "August",
        sourceTitle: "August — property management",
        sourceUrl: "https://www.augustapp.com",
        reviewedAt: "2026-07-14",
      },
    ],
  },

  // ── 3 ──────────────────────────────────────────────────────────────────────

  {
    dimension: "Compliance source distinction",
    tenaqoStatus: "available",
    tenaqoSummary:
      "Imported compliance records keep a visible source label across Tenaqo's supported review surfaces. The dates come from the landlord's spreadsheet and Tenaqo has not checked the underlying record.",
    categorySummary:
      "Source labelling for imported versus natively recorded compliance was not commonly presented as a distinct feature among the providers reviewed.",
    tenaqoEvidence: [
      "src/utils/complianceSafe.js",
      "src/lib/complianceSafeStatus.js",
      "src/pages/compliance/ComplianceSafePage.jsx",
      "marketing-site/content/help.ts (articles: attested-imports, imported-vs-native, reviewing-imported-records)",
    ],
    marketEvidence: [
      {
        provider: "August",
        sourceTitle: "August — compliance features",
        sourceUrl: "https://www.augustapp.com/features",
        reviewedAt: "2026-07-14",
      },
      {
        provider: "Landlord Studio",
        sourceTitle: "Landlord Studio — document storage",
        sourceUrl: "https://www.landlordstudio.com/features",
        reviewedAt: "2026-07-14",
      },
      {
        provider: "Landlord Vision",
        sourceTitle: "Landlord Vision — compliance management (primary; no import-source distinction feature found)",
        sourceUrl: "https://www.landlordvision.co.uk",
        reviewedAt: "2026-07-14",
      },
    ],
  },

  // ── 4 ──────────────────────────────────────────────────────────────────────

  {
    dimension: "Maintenance follow-through",
    tenaqoStatus: "available",
    tenaqoSummary:
      "Work orders move from reported to resolved with documented hand-offs. Contractors can receive and update work orders through the contractor portal. Job updates, status history and supporting evidence can be recorded through the workflow.",
    categorySummary:
      "Varies significantly by platform and plan. Maintenance request tracking is common. A full work-order system with structured contractor access and photo evidence at each stage is more common in agency-grade platforms.",
    tenaqoEvidence: [
      "src/pages/MaintenanceInboxPage.jsx",
      "src/services/workOrderService.js",
      "src/pages/ContractorPortal.jsx",
      "supabase/work_order_assignment_authorization.sql",
      "supabase/evidence_vault_phase2.sql (photo attachment evidence)",
    ],
    marketEvidence: [
      {
        provider: "Arthur Online",
        sourceTitle: "Arthur Online — contractor and tenant apps",
        sourceUrl: "https://www.arthuronline.co.uk",
        reviewedAt: "2026-07-14",
      },
      {
        provider: "August",
        sourceTitle: "August — maintenance features",
        sourceUrl: "https://www.augustapp.com/features",
        reviewedAt: "2026-07-14",
      },
      {
        provider: "Landlord Studio",
        sourceTitle: "Landlord Studio — maintenance and tenant requests",
        sourceUrl: "https://www.landlordstudio.com/features",
        reviewedAt: "2026-07-14",
      },
    ],
  },

  // ── 5 ──────────────────────────────────────────────────────────────────────

  {
    dimension: "Evidence continuity and packs",
    tenaqoStatus: "available-with-limits",
    tenaqoSummary:
      "Tenaqo can generate inspection and compliance evidence packs. These are operational records useful for dispute preparation. They are not independently reviewed or legally verified.",
    categorySummary:
      "Document storage and timestamped audit trails are common across the category. Compiled evidence packs bundled for dispute preparation are less standardised.",
    tenaqoEvidence: [
      "src/services/evidencePackService.js",
      "supabase/evidence_vault_phase2.sql",
      "src/lib/depositDisputePack.js",
      "src/pages/documents/EvidenceVaultPage.jsx",
    ],
    marketEvidence: [
      {
        provider: "August",
        sourceTitle: "August — compliance and document management",
        sourceUrl: "https://www.augustapp.com/features",
        reviewedAt: "2026-07-14",
      },
      {
        provider: "Landlord Studio",
        sourceTitle: "Landlord Studio — document storage by plan",
        sourceUrl: "https://www.landlordstudio.com/features",
        reviewedAt: "2026-07-14",
      },
      {
        provider: "LLCR",
        sourceTitle: "Compliance audit trail for landlords explained 2026",
        sourceUrl: "https://www.llcr.uk/articles/what-is-compliance-audit-trail-landlord.html",
        reviewedAt: "2026-07-14",
      },
    ],
  },

  // ── 6 ──────────────────────────────────────────────────────────────────────

  {
    dimension: "Tenant and contractor collaboration",
    tenaqoStatus: "available",
    tenaqoSummary:
      "Tenants can submit maintenance requests and view documents through the tenant portal. Contractors can receive and update work orders through the contractor portal.",
    categorySummary:
      "Tenant portals are common in modern platforms. Dedicated contractor portals with structured work-order access are more common in agency-grade or larger-portfolio platforms.",
    tenaqoEvidence: [
      "src/routes/TenantRoutes.jsx",
      "src/layout/TenantPortalLayout.jsx",
      "src/pages/ContractorPortal.jsx",
      "src/pages/ContractorsPage.jsx",
    ],
    marketEvidence: [
      {
        provider: "Arthur Online",
        sourceTitle: "Arthur Online — tenant and contractor apps",
        sourceUrl: "https://www.arthuronline.co.uk",
        reviewedAt: "2026-07-14",
      },
      {
        provider: "Landlord Studio",
        sourceTitle: "Landlord Studio — tenant portal and app",
        sourceUrl: "https://www.landlordstudio.com/features",
        reviewedAt: "2026-07-14",
      },
      {
        provider: "August",
        sourceTitle: "August — tenant document sharing",
        sourceUrl: "https://www.augustapp.com/features",
        reviewedAt: "2026-07-14",
      },
    ],
  },

  // ── 7 ──────────────────────────────────────────────────────────────────────

  {
    dimension: "Portfolio pressure visibility",
    tenaqoStatus: "available",
    tenaqoSummary:
      "Portfolio Health shows compliance pressure and activity across all properties. Scoring is based on records created within Tenaqo. Imported compliance data is not included in these scores.",
    categorySummary:
      "Financial dashboards and property overviews are common. Compliance pressure scoring that separates data by record origin is less commonly a distinct feature.",
    tenaqoEvidence: [
      "src/pages/PortfolioHealthDashboardPage.jsx",
      "src/services/propertyHealthScoreService.js",
      "marketing-site/content/features/portfolio-health.ts",
    ],
    marketEvidence: [
      {
        provider: "August",
        sourceTitle: "August — property insights dashboard",
        sourceUrl: "https://www.augustapp.com/features",
        reviewedAt: "2026-07-14",
      },
      {
        provider: "Landlord Vision",
        sourceTitle: "Landlord Vision — reporting suite (primary; portfolio overview confirmed; no compliance-pressure-by-origin feature found)",
        sourceUrl: "https://www.landlordvision.co.uk",
        reviewedAt: "2026-07-14",
      },
      {
        provider: "Landlord Studio",
        sourceTitle: "Landlord Studio — financial reporting",
        sourceUrl: "https://www.landlordstudio.com/features",
        reviewedAt: "2026-07-14",
      },
    ],
  },

  // ── 8 · group: HMRC / MTD support ──────────────────────────────────────────

  {
    dimension: "HMRC connection and readiness",
    group: "HMRC / MTD support",
    tenaqoStatus: "available-with-limits",
    tenaqoSummary:
      "Tenaqo can connect to HMRC, retrieve obligations and confirm business registration details. Requires a Government Gateway connection. Available to qualifying accounts.",
    categorySummary:
      "Varies significantly. Some platforms offer direct HMRC integration; others connect through accounting software or do not provide HMRC connectivity.",
    tenaqoEvidence: [
      "supabase/hmrc_mtd_phase1.sql",
      "supabase/hmrc_mtd_phase2_readonly.sql",
      "src/pages/compliance/HmrcConnectionPage.jsx",
      "supabase/functions/hmrc-get-connection-status/index.ts",
    ],
    marketEvidence: [
      {
        provider: "Landlord Studio",
        sourceTitle:
          "Landlord Studio — Using Landlord Studio for MTD (webinar, March 2026)",
        sourceUrl: "https://www.landlordstudio.com/uk/webinar/using-landlord-studio-for-mtd",
        reviewedAt: "2026-07-14",
      },
      {
        provider: "August",
        sourceTitle: "August — MTD-ready for income tax and VAT",
        sourceUrl: "https://www.augustapp.com/features",
        reviewedAt: "2026-07-14",
      },
      {
        provider: "Arthur Online",
        sourceTitle: "Arthur Online — features overview (primary; no MTD/HMRC submission found; Xero listed as financial integration)",
        sourceUrl: "https://www.arthuronline.co.uk",
        reviewedAt: "2026-07-14",
      },
    ],
  },

  // ── 9 ──────────────────────────────────────────────────────────────────────

  {
    dimension: "Quarterly record preparation",
    group: "HMRC / MTD support",
    tenaqoStatus: "available-with-limits",
    tenaqoSummary:
      "Tenaqo supports quarterly MTD record preparation and draft review, mapping income and expenses to HMRC categories for landlord review before submission.",
    categorySummary:
      "Platforms that offer MTD connectivity typically include quarterly record preparation. Not all platforms offer quarterly record management or HMRC category mapping.",
    tenaqoEvidence: [
      "supabase/hmrc_mtd_phase3_quarterly_drafts.sql",
      "src/components/compliance/QuarterlyDraftsTab.jsx",
      "src/services/mtdQuarterlyDraftService.js",
    ],
    marketEvidence: [
      {
        provider: "Landlord Studio",
        sourceTitle: "Landlord Studio MTD wizard — transaction mapping to SA105 categories",
        sourceUrl: "https://www.landlordstudio.com/uk/webinar/using-landlord-studio-for-mtd",
        reviewedAt: "2026-07-14",
      },
      {
        provider: "August",
        sourceTitle: "August — quarterly HMRC report generation",
        sourceUrl: "https://www.augustapp.com/features",
        reviewedAt: "2026-07-14",
      },
      {
        provider: "Landlord Vision",
        sourceTitle: "Landlord Vision — full MTD functionality at no additional cost on all plans (primary)",
        sourceUrl: "https://www.landlordvision.co.uk",
        reviewedAt: "2026-07-14",
      },
    ],
  },

  // ── 10 ─────────────────────────────────────────────────────────────────────

  {
    dimension: "Live HMRC submission",
    group: "HMRC / MTD support",
    tenaqoStatus: "pilot",
    tenaqoSummary:
      "Pilot access only. Not open to all customers.",
    categorySummary:
      "Some platforms offer direct live HMRC submission. Available on qualifying plans for platforms that support MTD filing.",
    tenaqoEvidence: [
      "supabase/hmrc_mtd_phase5d_one_account_live_pilot.sql",
      "supabase/hmrc_mtd_phase5b_live_pilot.sql",
      "src/lib/mtd/hmrcLivePilotGuard.js",
    ],
    marketEvidence: [
      {
        provider: "Landlord Studio",
        sourceTitle: "Landlord Studio — MTD submission launched 30 March 2026",
        sourceUrl: "https://www.landlordstudio.com/uk/webinar/using-landlord-studio-for-mtd",
        reviewedAt: "2026-07-14",
      },
      {
        provider: "August",
        sourceTitle: "August — direct HMRC submission MTD-ready",
        sourceUrl: "https://www.augustapp.com/features",
        reviewedAt: "2026-07-14",
      },
      {
        provider: "Arthur Online",
        sourceTitle: "Arthur Online — features overview (primary; no MTD/HMRC submission found; Xero listed as financial integration)",
        sourceUrl: "https://www.arthuronline.co.uk",
        reviewedAt: "2026-07-14",
      },
    ],
  },

  // ── 11 · group: Mobile and banking ─────────────────────────────────────────

  {
    dimension: "Responsive web access",
    group: "Mobile and banking",
    tenaqoStatus: "available",
    tenaqoSummary:
      "Tenaqo is a responsive web application. Core workflows are accessible on mobile browsers without a separate download.",
    categorySummary:
      "Responsive web access is broadly standard across modern property management platforms.",
    tenaqoEvidence: [
      "src/layout/AppLayout.jsx",
      "src/index.css (responsive layout styles)",
    ],
    marketEvidence: [
      {
        provider: "August",
        sourceTitle: "August — web.augustapp.com",
        sourceUrl: "https://www.augustapp.com",
        reviewedAt: "2026-07-14",
      },
      {
        provider: "Landlord Studio",
        sourceTitle: "Landlord Studio — web platform",
        sourceUrl: "https://www.landlordstudio.com/features",
        reviewedAt: "2026-07-14",
      },
      {
        provider: "Landlord Vision",
        sourceTitle: "Landlord Vision — responsive web access confirmed; iOS and Android apps also available (primary)",
        sourceUrl: "https://www.landlordvision.co.uk",
        reviewedAt: "2026-07-14",
      },
    ],
  },

  // ── 12 ─────────────────────────────────────────────────────────────────────

  {
    dimension: "Native mobile application",
    group: "Mobile and banking",
    tenaqoStatus: "not-offered",
    tenaqoSummary: "Tenaqo does not currently offer a native iOS or Android application.",
    categorySummary:
      "Native mobile apps are available on some platforms, particularly consumer-focused UK landlord tools. Coverage and feature depth on mobile varies by provider.",
    tenaqoEvidence: [
      "src/App.jsx — web-only React SPA; no React Native or native mobile build exists in the repository",
    ],
    marketEvidence: [
      {
        provider: "August",
        sourceTitle: "August — iOS and Android native apps",
        sourceUrl: "https://www.augustapp.com/features",
        reviewedAt: "2026-07-14",
      },
      {
        provider: "Landlord Studio",
        sourceTitle: "The 5 best property management apps for UK landlords 2026",
        sourceUrl: "https://www.landlordstudio.com/uk-blog/property-management-apps-uk",
        reviewedAt: "2026-07-14",
      },
      {
        provider: "Landlord Vision",
        sourceTitle: "Landlord Vision — iOS and Android native apps confirmed on primary page ('NOW ON iOS & ANDROID')",
        sourceUrl: "https://www.landlordvision.co.uk",
        reviewedAt: "2026-07-14",
      },
    ],
  },

  // ── 13 ─────────────────────────────────────────────────────────────────────

  {
    dimension: "Live UK Open Banking connection",
    group: "Mobile and banking",
    tenaqoStatus: "planned",
    tenaqoSummary:
      "A live UK Open Banking bank-feed connection with automatic rent matching is not currently available in Tenaqo.",
    categorySummary:
      "Open Banking bank feeds with automatic rent matching are available on some UK-focused platforms, particularly those targeting self-managing landlords.",
    tenaqoEvidence: [
      "No Open Banking integration exists in the repository — no banking credential management, feed service or matching engine is implemented",
    ],
    marketEvidence: [
      {
        provider: "August",
        sourceTitle: "August — Open Banking via Plaid, FCA-regulated, automatic rent matching",
        sourceUrl: "https://www.augustapp.com/features",
        reviewedAt: "2026-07-14",
      },
      {
        provider: "Finexer",
        sourceTitle: "Property management software UK 2026 — Open Banking analysis",
        sourceUrl: "https://blog.finexer.com/property-management-software-uk/",
        reviewedAt: "2026-07-14",
      },
      {
        provider: "Landlord Studio",
        sourceTitle: "Landlord Studio — bank feeds",
        sourceUrl: "https://www.landlordstudio.com/features",
        reviewedAt: "2026-07-14",
      },
    ],
  },
];

validateComparisonRows(_rows);
export const comparisonRows: ComparisonRow[] = _rows;

// ── Page copy ─────────────────────────────────────────────────────────────────

export const comparisonPageCopy = {
  seo: {
    title: "Tenaqo vs Landlord Management Apps | Rental Operations with Evidence Continuity",
    description:
      "How Tenaqo compares to general landlord management software. Compliance source labelling, maintenance follow-through, evidence continuity and clear verification boundaries — reviewed July 2026.",
  },
  hero: {
    eyebrow: "How Tenaqo compares",
    title: "Tenaqo vs landlord management apps",
    body: "A category-level comparison reviewed on 14 July 2026. Tenaqo's statuses reflect what is currently customer-facing. We have noted where we are not yet the strongest option.",
  },
  tableHeaders: {
    dimension: "What landlords may need",
    tenaqo: "Tenaqo today",
    category: "Typical category pattern",
  },
  methodology:
    "This comparison was reviewed on 14 July 2026. Tenaqo's statuses are based on its current customer-facing product. Category observations are based on publicly available provider information and may vary by provider, plan and jurisdiction. Check each provider's current documentation before making a purchasing decision.",
  finalCta: {
    title: "See Tenaqo in your context",
    body: "Explore the features that are live today, then try the app with your own portfolio.",
    primaryCta: { label: "Claim Founder Access", href: siteConfig.signupUrl },
    secondaryCta: { label: "Explore features", href: "/features" },
  },
};
