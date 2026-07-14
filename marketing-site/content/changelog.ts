import { siteConfig } from "./site";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ChangelogCategory =
  | "new"
  | "improved"
  | "fixed"
  | "security-trust"
  | "early-access";

export const changelogCategoryLabels: Record<ChangelogCategory, string> = {
  "new": "New",
  "improved": "Improved",
  "fixed": "Fixed",
  "security-trust": "Security & trust",
  "early-access": "Early access",
};

export type ChangelogSection = {
  heading?: string;
  headingLevel?: "h2" | "h3";
  paragraphs?: string[];
  items?: string[];
  boldPairs?: Array<{ term: string; definition: string }>;
  note?: { lines: string[] };
  paragraphs2?: string[];
  sectionLinks?: Array<{ label: string; href: string }>;
};

export type ChangelogEntry = {
  slug: string;
  title: string;
  summary: string;
  category: ChangelogCategory;
  publishedAt: string; // ISO date
  body: ChangelogSection[];
  customerImpact?: string;
  relatedHelpSlugs?: string[];
  appUrl?: string;
  featured?: boolean;
};

// ── Hub copy ──────────────────────────────────────────────────────────────────

export const changelogHubCopy = {
  seo: {
    title: "Changelog | Tenaqo",
    description:
      "Recent improvements, new features and fixes in Tenaqo rental operations software.",
    canonicalPath: "/changelog",
  },
  hero: {
    eyebrow: "Changelog",
    title: "What's new in Tenaqo",
    body: "Meaningful improvements to the product, explained for landlords. No raw engineering log.",
  },
  readMoreLabel: "Read more",
  backToChangelog: "Back to Changelog",
  contactCta: {
    heading: "Something not working as expected?",
    body: "Contact the Tenaqo support team at support@tenaqo.com.",
    primaryCta: { label: "Email support", href: "mailto:support@tenaqo.com" },
    secondaryCta: { label: "Visit the Help Centre", href: "/help" },
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

export function getChangelogEntry(slug: string): ChangelogEntry | undefined {
  return changelogEntries.find((e) => e.slug === slug);
}

// ── Entries (newest first) ────────────────────────────────────────────────────

export const changelogEntries: ChangelogEntry[] = [
  // ── 2026-07-14 ────────────────────────────────────────────────────────────

  {
    slug: "help-centre-launched",
    category: "new",
    title: "A new Help Centre for getting started",
    summary:
      "Tenaqo now has a Help Centre with practical guidance for every stage of setting up and running your portfolio.",
    publishedAt: "2026-07-14",
    featured: true,
    relatedHelpSlugs: [
      "getting-started",
      "spreadsheet-import",
      "attested-imports",
      "evidence-packs",
      "plans-and-limits",
      "contact-support",
    ],
    body: [
      {
        heading: "What launched",
        paragraphs: [
          "The Tenaqo Help Centre is now live at /help. It covers the main areas of the product with articles written for landlords, not engineers.",
        ],
        items: [
          "Getting started: account setup, adding your first property, creating tenancies.",
          "Spreadsheet import: preparing files, understanding per-row results, handling rows that need review.",
          "Attested records: what the 'attested import' label means and why it exists.",
          "Compliance review: how imported and native records differ, and how Portfolio Health uses each.",
          "Maintenance workflow: from tenant report to contractor completion.",
          "Evidence packs: what they contain and where their boundaries are.",
          "Plans and support: how to reach the support team and where to find plan information.",
        ],
      },
      {
        heading: "Language",
        paragraphs: [
          "The Help Centre is in English. Polish-language support is being established and will be communicated here when available.",
        ],
      },
    ],
    customerImpact:
      "If you have a question about how Tenaqo works, start at /help. If you cannot find the answer there, contact support@tenaqo.com.",
    appUrl: "/help",
  },

  {
    slug: "imported-compliance-custody",
    category: "security-trust",
    title: "Imported compliance records now preserve their source label",
    summary:
      "Compliance records imported from a spreadsheet retain their imported-data custody throughout the workflow. A row that cannot be fully recorded is rejected rather than stored without its source marker.",
    publishedAt: "2026-07-14",
    featured: true,
    relatedHelpSlugs: ["attested-imports", "imported-vs-native", "reviewing-imported-records"],
    body: [
      {
        heading: "What changed",
        paragraphs: [
          "When a landlord imports compliance dates from a spreadsheet, Tenaqo records the source of those dates alongside the compliance row. Previously, a failure during that recording step could leave a compliance row stored without its source marker, making it appear indistinguishable from a record entered natively in the product.",
          "That gap has been closed. If the source-recording step cannot complete, the compliance row is now rejected and reported as an error rather than being stored in an ambiguous state. Valid rows in the same file are unaffected.",
        ],
      },
      {
        heading: "What this did not change",
        paragraphs: [
          "Attested-import records were already kept separate from native records in Compliance Safe and Command Centre. Portfolio Health has always excluded imported compliance from its scoring. Those boundaries are unchanged.",
          "The improvement affects how reliably the custody marker is applied when it should be, not the definitions of what the marker means.",
        ],
      },
    ],
    customerImpact:
      "Imported compliance records remain visibly distinct from records created natively in Tenaqo. Their review counts stay separate and they do not affect Portfolio Health scoring. You do not need to take any action.",
  },

  {
    slug: "safer-spreadsheet-import",
    category: "improved",
    title: "Safer spreadsheet matching and row-level review",
    summary:
      "Spreadsheet imports now handle a wider range of real-world file conditions: ambiguous property matches, duplicate rows, re-imports and inconsistent date formats are all processed with clearer per-row outcomes.",
    publishedAt: "2026-07-14",
    relatedHelpSlugs: ["spreadsheet-import", "reviewing-imported-records"],
    body: [
      {
        heading: "What improved",
        boldPairs: [
          {
            term: "Row-level processing.",
            definition:
              "A problem with one row does not block the rest of the file. Valid rows continue; rows with issues are separated for review.",
          },
          {
            term: "Ambiguous property matching.",
            definition:
              "When a row's property reference matches more than one property in your account, that row is placed in the needs-review state with a clear reason rather than being rejected without explanation.",
          },
          {
            term: "Duplicate and re-import handling.",
            definition:
              "Rows that duplicate existing records are skipped rather than overwriting the existing data. Re-importing the same file does not create duplicate entries.",
          },
          {
            term: "Inconsistent compliance date formats.",
            definition:
              "A wider range of date formats in compliance columns are recognised and normalised during import. Dates that cannot be parsed are flagged for review rather than silently dropped.",
          },
          {
            term: "Account isolation.",
            definition:
              "Property references in an imported file are matched only against properties in the importing account. References that could match a property in a different account are treated as not found.",
          },
        ],
      },
      {
        heading: "File format",
        paragraphs: [
          "The import feature accepts CSV files. The column headers and templates are available from the import page. XLSX files are not currently supported.",
        ],
        sectionLinks: [
          { label: "Help: Import your existing spreadsheet data", href: "/help/spreadsheet-import" },
        ],
      },
    ],
    customerImpact:
      "Partial imports now complete with a row-level summary of what was imported, skipped or flagged for review. You can fix flagged rows in your original file and re-import just those rows.",
  },

  // ── 2026-07-13 ────────────────────────────────────────────────────────────

  {
    slug: "imported-compliance-review-surfaces",
    category: "improved",
    title: "Clearer imported compliance review across the product",
    summary:
      "Imported compliance records are now visibly labelled in every part of the product that shows compliance status. Separate review counts make it easy to see how many imported records are waiting for your verification.",
    publishedAt: "2026-07-13",
    relatedHelpSlugs: [
      "attested-imports",
      "imported-vs-native",
      "portfolio-health-and-imports",
      "reviewing-imported-records",
    ],
    body: [
      {
        heading: "Where the label now appears",
        items: [
          "Compliance Safe — each imported record shows an 'Attested import' badge alongside its status.",
          "Command Centre — imported compliance items that are due or overdue include the attested-import label.",
          "Operating Calendar — compliance events from imported records carry the label.",
          "Property compliance tab — the property-level compliance card distinguishes imported from native records.",
          "Dashboard, Attention Centre and Portfolio Health — separate imported-review counts appear alongside native compliance figures.",
        ],
      },
      {
        heading: "Portfolio Health",
        paragraphs: [
          "Portfolio Health scoring uses native compliance inputs only. Imported compliance records are excluded from the score calculation.",
          "The separate imported-review count is shown alongside your score so you can see how many records are waiting for verification. As you verify imported records and update them to native status, the score improves.",
        ],
        sectionLinks: [
          { label: "Help: How Portfolio Health treats imported records", href: "/help/portfolio-health-and-imports" },
        ],
      },
      {
        note: {
          lines: [
            "Imported compliance dates come from the landlord's spreadsheet. Tenaqo has not checked the underlying certificate or document.",
          ],
        },
      },
    ],
    customerImpact:
      "You can now see at a glance which compliance records came from an import and which were entered natively. The review count tells you how many imported records still need your verification before they contribute to Portfolio Health.",
  },

  {
    slug: "branding-navigation-update",
    category: "improved",
    title: "Tenaqo domain and navigation updated",
    summary:
      "Marketing links, signup routes and comparison page URLs now point to the current Tenaqo experience consistently. German marketing routes remain withdrawn.",
    publishedAt: "2026-07-13",
    body: [
      {
        heading: "What changed",
        items: [
          "Signup links across the marketing site now route to the same destination regardless of which page you start from.",
          "Comparison pages that previously redirected are now consolidated.",
          "German marketing routes remain withdrawn. English and Polish marketing surfaces are active.",
        ],
      },
    ],
    customerImpact:
      "If you bookmarked a specific marketing or comparison page, update it to point to tenaqo.com directly.",
  },
];

// ── Article CTA ───────────────────────────────────────────────────────────────

export const changelogArticleCta = {
  title: "Try Tenaqo",
  body: "Tenaqo is built for landlords managing real portfolios. Add your first property and see the workflows in action.",
  primaryCta: { label: "Claim Founder Access", href: siteConfig.signupUrl },
  secondaryCta: { label: "Visit the Help Centre", href: "/help" },
};
