import { siteConfig } from "./site";

// ── Types ─────────────────────────────────────────────────────────────────────

export type HelpSection = {
  heading?: string;
  headingLevel?: "h2" | "h3";
  paragraphs?: string[];
  items?: string[];
  boldPairs?: Array<{ term: string; definition: string }>;
  note?: { lines: string[] };
  paragraphs2?: string[];
  sectionLinks?: Array<{ label: string; href: string }>;
};

export type HelpArticle = {
  slug: string;
  category: HelpCategory;
  title: string;
  summary: string;
  metaDescription: string;
  lastUpdated: string; // ISO date
  readingTime?: string;
  relatedSlugs?: string[];
  sections: HelpSection[];
};

export type HelpCategory =
  | "Getting started"
  | "Compliance and imported data"
  | "Operational workflows"
  | "Account and support";

export type HelpCategoryMeta = {
  name: HelpCategory;
  description: string;
  slug: string;
};

// ── Hub page copy ─────────────────────────────────────────────────────────────

export const helpHubCopy = {
  seo: {
    title: "Help Centre | Tenaqo",
    description:
      "Guides for getting started, spreadsheet import, compliance records, evidence packs, maintenance and plans.",
    canonicalPath: "/help",
  },
  hero: {
    eyebrow: "Help Centre",
    title: "How can we help?",
    body: "Guides for landlords setting up Tenaqo, importing existing records and managing day-to-day operations.",
  },
  polishNote:
    "This Help Centre is currently available in English. Polish-language support will be available through the contact details published here.",
  categories: [
    {
      name: "Getting started" as HelpCategory,
      description: "Set up your first property, invite a tenant and import your existing records.",
    },
    {
      name: "Compliance and imported data" as HelpCategory,
      description:
        "Understand attested imports, how imported records differ from native ones, and how Portfolio Health uses them.",
    },
    {
      name: "Operational workflows" as HelpCategory,
      description: "Work through maintenance requests, use Command Centre and understand evidence packs.",
    },
    {
      name: "Account and support" as HelpCategory,
      description: "Plan limits, feature access and how to reach Tenaqo.",
    },
  ] satisfies Array<{ name: HelpCategory; description: string }>,
  readMoreLabel: "Read article",
  backToHelp: "Back to Help Centre",
  contactCta: {
    heading: "Still have a question?",
    body: "If you cannot find the answer here, email us directly and we'll get back to you as soon as we can.",
    primaryCta: { label: "Email support", href: "mailto:support@tenaqo.com" },
    secondaryCta: { label: "View all articles", href: "/help" },
  },
};

// ── Helper ────────────────────────────────────────────────────────────────────

export function getHelpArticle(slug: string): HelpArticle | undefined {
  return helpArticles.find((a) => a.slug === slug);
}

export function getHelpArticlesByCategory(category: HelpCategory): HelpArticle[] {
  return helpArticles.filter((a) => a.category === category);
}

// ── Articles ──────────────────────────────────────────────────────────────────

export const helpArticles: HelpArticle[] = [
  // ── 1. Getting started ────────────────────────────────────────────────────

  {
    slug: "getting-started",
    category: "Getting started",
    title: "Getting started with Tenaqo",
    summary:
      "A short walkthrough of the first steps after you sign up: creating your account, adding a property and understanding the main areas of the product.",
    metaDescription:
      "How to get started with Tenaqo after signing up: add a property, create a tenancy and understand the main product areas.",
    lastUpdated: "2026-07-14",
    readingTime: "4 min read",
    relatedSlugs: ["your-first-property", "spreadsheet-import", "command-centre"],
    sections: [
      {
        heading: "Sign up and account setup",
        paragraphs: [
          "After you sign up, Tenaqo creates your landlord account and lands you on the main dashboard. Your account starts empty — no properties, tenancies or records until you add them.",
          "Before you add your first property, take a minute to check your profile settings (name, contact email and notification preferences) so that any automated alerts reach you correctly.",
        ],
      },
      {
        heading: "The three things to do first",
        items: [
          "Add at least one property — even a basic entry with address and type is enough to get started.",
          "Create a tenancy on that property and add your tenant's details.",
          "Decide whether to enter compliance dates manually or import them from a spreadsheet.",
        ],
      },
      {
        heading: "Main areas of the product",
        paragraphs: [
          "Command Centre is your daily action queue. It surfaces rent chases, maintenance follow-ups, compliance items that are due and anything else requiring attention. Check it each time you open Tenaqo.",
          "Portfolio Health gives you a snapshot of how well your portfolio is performing across compliance, finance and maintenance. It uses native records, not imported ones.",
          "Compliance Safe lists every compliance requirement across your properties — gas safety, EPC, EICR, How to Rent and others — along with their current status and expiry dates.",
          "Maintenance Inbox is where tenant reports arrive, where you create work orders and where you track repair progress from first report to contractor completion.",
          "Finance records rent payments, tracks arrears and gives you the income data you need for quarterly MTD reporting.",
        ],
      },
      {
        heading: "If you have existing records in a spreadsheet",
        paragraphs: [
          "You do not need to re-enter everything manually. Tenaqo has a spreadsheet import feature that brings in properties, tenancies, compliance dates and maintenance records in one step.",
          "Imported compliance records are clearly marked as attested imports — meaning the dates came from your spreadsheet, not from independent verification. Read the import guide before you start.",
        ],
        sectionLinks: [
          { label: "Read: Import your existing spreadsheet data", href: "/help/spreadsheet-import" },
          { label: "Read: What does 'Attested import' mean?", href: "/help/attested-imports" },
        ],
      },
    ],
  },

  {
    slug: "your-first-property",
    category: "Getting started",
    title: "Create your first property, tenancy and tenant",
    summary:
      "Step-by-step instructions for adding a property, creating a tenancy and inviting your first tenant to the portal.",
    metaDescription:
      "How to add a property, create a tenancy and set up a tenant in Tenaqo, including what each field means and what is optional.",
    lastUpdated: "2026-07-14",
    readingTime: "5 min read",
    relatedSlugs: ["getting-started", "spreadsheet-import"],
    sections: [
      {
        heading: "Add a property",
        paragraphs: [
          "Go to Properties and click Add property. The minimum you need is an address and property type (flat, house, HMO, commercial). Everything else — number of bedrooms, EPC rating, external reference — is optional but useful.",
          "External property reference is the identifier you use in your own records. If you have a spreadsheet with a property code such as 'PROP-001', entering it here means the spreadsheet import can match rows to the right property without relying on address matching alone.",
        ],
      },
      {
        heading: "Create a tenancy",
        paragraphs: [
          "Once a property exists, go into it and add a tenancy. You will need: the tenancy start date, the rent amount and frequency, and the payment day of the month.",
          "A tenancy does not have to be active to record it. You can create ended or upcoming tenancies to build a full history.",
        ],
      },
      {
        heading: "Add a tenant",
        paragraphs: [
          "When you create or edit a tenancy, you can add one or more tenants. Enter each tenant's name and email address. Tenaqo will send them an invitation to the tenant portal if you choose to activate it.",
          "Tenants added this way can view their rent status, submit maintenance requests and access any documents you have shared with them, via a separate portal. They cannot see your landlord records or other tenants.",
        ],
      },
      {
        heading: "Compliance requirements",
        paragraphs: [
          "After adding a property, go to Compliance Safe and review the requirements shown for it. Tenaqo tracks standard requirements — gas safety certificate, electrical installation condition report (EICR), energy performance certificate (EPC), How to Rent, fire risk assessment, and others — and shows which are due or missing.",
          "You can enter dates manually or use the compliance import if you have them in a spreadsheet. Either way, dates you enter yourself are treated as native records. Dates imported from a spreadsheet are treated as attested imports.",
        ],
      },
      {
        heading: "What to do after setup",
        items: [
          "Check Command Centre — it will already show any compliance items that are due or overdue.",
          "Set up rent collection if you use Tenaqo to track payments.",
          "Add any maintenance records that are already in progress.",
          "Consider sharing the tenant portal link with your tenant.",
        ],
      },
    ],
  },

  {
    slug: "spreadsheet-import",
    category: "Getting started",
    title: "Import your existing spreadsheet data",
    summary:
      "How the Tenaqo spreadsheet import works, what each tab covers, how to prepare your file and what to do with rows that need review.",
    metaDescription:
      "Guide to importing properties, tenancies, compliance records and maintenance from a CSV spreadsheet into Tenaqo.",
    lastUpdated: "2026-07-14",
    readingTime: "6 min read",
    relatedSlugs: ["attested-imports", "reviewing-imported-records", "getting-started"],
    sections: [
      {
        heading: "What you can import",
        paragraphs: [
          "The import feature accepts CSV files and supports four data types via separate tabs: Properties, Tenancies, Compliance records and Maintenance records. You can import one tab at a time.",
        ],
        items: [
          "Properties — address, type, external reference, number of bedrooms.",
          "Tenancies — linked to a property, start date, rent amount, tenant name and email.",
          "Compliance — linked to a property, requirement type, expiry or completion date.",
          "Maintenance — linked to a property, description, status, reported date.",
        ],
      },
      {
        heading: "Preparing your file",
        paragraphs: [
          "Download the template for the tab you are importing. The template shows exactly which column headers are expected and includes example rows.",
          "Your file must be saved as CSV, not .xlsx. If your records are in Excel, export the relevant sheet as CSV before uploading.",
          "Make sure the first row contains column headers that match the template. Title rows above the headers — for example a sheet name at the top — will be treated as headers and cause all rows beneath to fail. Remove any title rows before uploading.",
        ],
      },
      {
        heading: "The import steps",
        boldPairs: [
          {
            term: "Upload.",
            definition:
              "Select your CSV file. Tenaqo reads the file in your browser and shows a row count before anything is sent to the database.",
          },
          {
            term: "Review.",
            definition:
              "The preview shows how many rows were parsed. Rows with missing required fields are flagged as parse errors and will not be imported.",
          },
          {
            term: "Commit.",
            definition:
              "Click Import to send the valid rows. Each row is processed individually — if one row fails, others can still succeed. You will see a summary of imported, skipped, needs-review and error counts.",
          },
        ],
      },
      {
        heading: "No silent overwrites",
        paragraphs: [
          "Tenaqo does not silently overwrite existing records. If a property with the same external reference already exists in your account, the import row is skipped rather than overwriting the existing data. You will see it in the Skipped count.",
          "The same applies to tenancies and compliance records. Import is additive: it adds new records, it does not replace existing ones.",
        ],
      },
      {
        heading: "Compliance imports are marked as attested",
        paragraphs: [
          "Compliance records imported from a spreadsheet are marked as attested imports. This means Tenaqo records that these dates came from your spreadsheet and has not independently checked the underlying certificate or document.",
          "The attested-import label is visible in Compliance Safe, Command Centre and the Attention Centre. Portfolio Health scores use native compliance records, not attested imports. The separate review counts show how many attested-import rows are waiting for your verification.",
        ],
        sectionLinks: [
          { label: "Read: What does 'Attested import' mean?", href: "/help/attested-imports" },
          { label: "Read: Reviewing imported records that need attention", href: "/help/reviewing-imported-records" },
        ],
      },
      {
        heading: "Rows that need review",
        paragraphs: [
          "A row is marked as needs review when Tenaqo can process it but something prevents a clean match — for example, a compliance row whose property cannot be found, or a tenancy row where the tenant email already exists on a different property.",
          "Rows marked needs review are not imported. Open the import results, read the reason for each row, correct the issue in your spreadsheet and re-import just those rows.",
        ],
      },
      {
        heading: "Recent imports",
        paragraphs: [
          "After an import completes, the import page shows a Recent imports section listing all previous batches with their filename, date and row counts. You can expand each entry to see the per-row results.",
        ],
      },
    ],
  },

  // ── 2. Compliance and imported data ───────────────────────────────────────

  {
    slug: "attested-imports",
    category: "Compliance and imported data",
    title: "What does 'Attested import' mean?",
    summary:
      "Tenaqo marks compliance records imported from a spreadsheet as attested imports. This article explains what that label means, what Tenaqo does and does not verify, and why the distinction matters.",
    metaDescription:
      "What the 'attested import' label means on compliance records imported into Tenaqo from a spreadsheet, and how it differs from native records.",
    lastUpdated: "2026-07-14",
    readingTime: "4 min read",
    relatedSlugs: ["imported-vs-native", "reviewing-imported-records", "portfolio-health-and-imports"],
    sections: [
      {
        heading: "The short answer",
        paragraphs: [
          "An attested import is a compliance record whose dates came from a landlord-supplied spreadsheet. Tenaqo has stored those dates and made them visible in the product, but has not checked whether the underlying certificate or document actually exists, is correctly dated or is legally valid.",
          "The landlord is attesting — confirming — that the dates are accurate. Tenaqo records that attestation and labels the record accordingly.",
        ],
      },
      {
        heading: "Why the label exists",
        paragraphs: [
          "When a landlord enters a compliance date directly in Tenaqo — for example, by uploading a certificate and entering the issue and expiry dates — that record is native. Tenaqo knows where the data came from.",
          "When dates are imported from a spreadsheet, the source is different. The landlord may have copied them from a certificate, from an email or from memory. Tenaqo has no way to check independently. Presenting imported dates as if they were the same as native records would give a false impression of what Tenaqo has verified.",
          "The attested-import label preserves that distinction. It tells you and any reader of your records exactly how that data arrived.",
        ],
      },
      {
        heading: "What Tenaqo does and does not verify",
        boldPairs: [
          {
            term: "Tenaqo does:",
            definition:
              "Record the dates you supply, display them in Compliance Safe and Command Centre, flag them as attested imports, and track expiry and renewal dates so you get alerts.",
          },
          {
            term: "Tenaqo does not:",
            definition:
              "Check that a certificate exists, verify that the date matches the physical document, confirm regulatory compliance, or make any determination about whether your property meets legal requirements.",
          },
        ],
        paragraphs2: [
          "This is the same limitation that applies to dates you enter manually. Tenaqo is an operational record-keeping tool, not a compliance inspector or legal adviser.",
        ],
      },
      {
        heading: "Where the label appears",
        items: [
          "Compliance Safe — each imported record shows an 'Attested import' badge next to the status.",
          "Command Centre — action items for imported records that are due or overdue include the attested label.",
          "Attention Centre — the review count for attested imports is shown separately from native compliance items.",
          "Operating Calendar — compliance events from attested imports carry the label.",
          "Property compliance tab — the property-level compliance card distinguishes attested from native.",
        ],
      },
      {
        heading: "How to change an attested record to a native one",
        paragraphs: [
          "Once you have located and verified the underlying certificate, open the compliance record in Compliance Safe and update it with the correct details. If you upload a document and confirm the dates there, the record transitions from attested to native.",
          "There is no bulk conversion. Records become native when you verify and update them individually.",
        ],
      },
    ],
  },

  {
    slug: "imported-vs-native",
    category: "Compliance and imported data",
    title: "Why imported compliance records are kept separate",
    summary:
      "Imported compliance records and native records are treated differently by Tenaqo. This article explains why, and what it means for Portfolio Health, counts and alerts.",
    metaDescription:
      "Why Tenaqo keeps imported compliance records separate from native records, and what effect this has on Portfolio Health and reporting.",
    lastUpdated: "2026-07-14",
    readingTime: "4 min read",
    relatedSlugs: ["attested-imports", "portfolio-health-and-imports", "reviewing-imported-records"],
    sections: [
      {
        heading: "Two types of compliance record",
        paragraphs: [
          "A native record is one where the data was entered directly into Tenaqo — either manually or via a document upload. Tenaqo knows the source.",
          "An attested import is a record whose dates came from a landlord-supplied spreadsheet. Tenaqo has stored the dates but has not independently verified the underlying document.",
        ],
      },
      {
        heading: "Why they are separated",
        paragraphs: [
          "Mixing the two types without distinction would allow unverified spreadsheet data to influence Portfolio Health scores, compliance pass rates and action queue counts in the same way as records Tenaqo has actually processed.",
          "This matters because the quality of the two sources is different. A native record has a traceable, recorded entry path. An imported record is self-reported data that has not been cross-checked.",
          "Keeping them separate means your dashboard and scores reflect the records Tenaqo can stand behind, while imported records are visible and actionable but clearly flagged.",
        ],
      },
      {
        heading: "Effect on Portfolio Health",
        paragraphs: [
          "Portfolio Health scores are calculated using native compliance inputs only. Attested imports do not improve a property's compliance score.",
          "The separate imported-review count is shown alongside the score so you can see how many attested records are waiting for your verification. As you verify and update imported records to native ones, the score will improve.",
        ],
        sectionLinks: [
          { label: "Read: How Portfolio Health treats imported compliance records", href: "/help/portfolio-health-and-imports" },
        ],
      },
      {
        heading: "Effect on alerts and action queues",
        paragraphs: [
          "Command Centre and Attention Centre show imported records that are due, overdue or need review alongside native items. They carry the attested-import label so you know which they are.",
          "You will still get renewal reminders for imported records. The expiry tracking works the same regardless of source — the label tells you the verification status of the underlying document.",
        ],
      },
      {
        heading: "The path to full compliance confidence",
        items: [
          "Import existing records to get them into the system quickly.",
          "Review the needs-review count in Attention Centre — these are rows that could not be fully processed.",
          "Verify each attested-import record by locating the actual certificate and confirming the dates.",
          "Update the record in Compliance Safe to mark it as verified.",
          "Once updated, it becomes a native record and contributes to Portfolio Health.",
        ],
      },
    ],
  },

  {
    slug: "reviewing-imported-records",
    category: "Compliance and imported data",
    title: "Reviewing imported records that need attention",
    summary:
      "After a compliance import, some rows may be marked as attested imports awaiting review. This article explains how to find them, what each status means and how to clear them.",
    metaDescription:
      "How to review and clear compliance records marked as attested imports or needs-review after a spreadsheet import in Tenaqo.",
    lastUpdated: "2026-07-14",
    readingTime: "4 min read",
    relatedSlugs: ["attested-imports", "imported-vs-native", "spreadsheet-import"],
    sections: [
      {
        heading: "Where to find records that need attention",
        paragraphs: [
          "After an import, go to Compliance Safe and look for records with the Attested import badge. The Attention Centre (the bell icon or /attention-center) also shows a separate count of imported records that are pending your review.",
          "Command Centre may surface them as action items if any imported records are due or overdue.",
        ],
      },
      {
        heading: "Import statuses explained",
        boldPairs: [
          {
            term: "Imported (attested).",
            definition:
              "The row was processed and stored. The dates are from your spreadsheet and are clearly labelled. No error occurred, but the record has not been independently verified.",
          },
          {
            term: "Needs review.",
            definition:
              "The row could not be cleanly processed — for example, the property reference did not match any property in your account, or a required field was missing. The record was not imported. Fix the issue and re-import the row.",
          },
          {
            term: "Skipped.",
            definition:
              "A matching record already exists in Tenaqo for this property and requirement type. The import did not overwrite it.",
          },
          {
            term: "Error.",
            definition:
              "A technical problem prevented the row from being processed. The error reason is shown in the import results. Correct the row data and try again.",
          },
        ],
      },
      {
        heading: "How to clear a needs-review record",
        items: [
          "Go to the import results (Recent imports on the import page) and read the reason for each needs-review row.",
          "Correct the issue in your original spreadsheet — typically a missing or mismatched property reference.",
          "Re-import just those rows (remove the correctly processed rows from your file first).",
          "If the property does not exist yet, create it first, then re-import the compliance row.",
        ],
      },
      {
        heading: "How to verify an attested-import record",
        paragraphs: [
          "Attested-import records are stored and visible, but they are not verified. To verify one, locate the physical or digital certificate and then update the record in Compliance Safe with confirmed dates.",
          "There is no dedicated 'verify' button. Updating the record with the correct details is the verification step. Once updated, the attested-import label is replaced with the standard compliance status.",
        ],
      },
      {
        heading: "Bulk actions",
        paragraphs: [
          "Currently, there is no bulk-verify feature. Each record must be confirmed individually. If you have a large number of imported records and need to verify many at once, contact support and we can discuss options.",
        ],
      },
    ],
  },

  {
    slug: "portfolio-health-and-imports",
    category: "Compliance and imported data",
    title: "How Portfolio Health treats imported compliance records",
    summary:
      "Portfolio Health scores use native compliance inputs. This article explains what that means for landlords who have imported records from a spreadsheet.",
    metaDescription:
      "Why Portfolio Health scores in Tenaqo use native compliance records and not attested imports, and how to improve your score by verifying imported records.",
    lastUpdated: "2026-07-14",
    readingTime: "3 min read",
    relatedSlugs: ["attested-imports", "imported-vs-native", "reviewing-imported-records"],
    sections: [
      {
        heading: "Portfolio Health scores and native records",
        paragraphs: [
          "The Portfolio Health dashboard calculates a compliance score for each property using only native records — records entered directly into Tenaqo or verified by you after import.",
          "Attested imports do not improve a property's score. A property whose compliance records were all imported from a spreadsheet will score lower than one whose records are all native, even if the underlying dates are identical.",
          "This is intentional. The score should reflect records Tenaqo can stand behind, not self-reported data that has not been cross-checked.",
        ],
      },
      {
        heading: "What you will see",
        paragraphs: [
          "Properties with imported compliance records show a separate attested-import count below the compliance score. This count tells you how many records are waiting for your verification.",
          "The score and the import count are shown side by side so you can see both the current verified position and the volume of unverified records in one view.",
        ],
      },
      {
        heading: "How to improve your score after an import",
        items: [
          "Review the attested-import records in Compliance Safe.",
          "Locate the actual certificate or document for each.",
          "Update the record in Compliance Safe with the confirmed dates.",
          "Once updated, the record transitions from attested to native.",
          "Portfolio Health recalculates the next time you view the dashboard.",
        ],
      },
      {
        heading: "What Portfolio Health does not tell you",
        paragraphs: [
          "Portfolio Health is an operational overview tool. A high score means your records in Tenaqo are in good shape. It is not a legal compliance assessment and does not confirm that your properties meet regulatory requirements.",
          "Always verify compliance with qualified professionals, particularly for gas safety, electrical testing and fire risk.",
        ],
      },
    ],
  },

  // ── 3. Operational workflows ──────────────────────────────────────────────

  {
    slug: "command-centre",
    category: "Operational workflows",
    title: "Using Command Centre",
    summary:
      "Command Centre is Tenaqo's daily action queue. This article explains what appears there, how to use it to prioritise your day and what each bucket contains.",
    metaDescription:
      "How to use Tenaqo's Command Centre to manage your daily landlord action queue across rent, compliance, maintenance and documents.",
    lastUpdated: "2026-07-14",
    readingTime: "4 min read",
    relatedSlugs: ["maintenance-workflow", "getting-started"],
    sections: [
      {
        heading: "What Command Centre does",
        paragraphs: [
          "Command Centre surfaces every item in your portfolio that needs action today. It replaces the need to check multiple sections of the product to find out what is overdue, late or waiting for follow-up.",
          "Open it each day as your starting point. Items move out of Command Centre when you complete the action they represent.",
        ],
      },
      {
        heading: "What appears in Command Centre",
        boldPairs: [
          {
            term: "Rent.",
            definition:
              "Tenancies where rent is overdue, where a payment is due today or where a rent chase is in progress.",
          },
          {
            term: "Compliance.",
            definition:
              "Compliance items that are due within 30 days, overdue or missing. Both native records and attested imports appear here, labelled accordingly.",
          },
          {
            term: "Maintenance.",
            definition:
              "Maintenance requests that are open and waiting for a response, work orders that are stalled or overdue, and requests that require a landlord decision.",
          },
          {
            term: "Documents.",
            definition:
              "Document requests that are outstanding, shared documents awaiting signature or acknowledgement, and evidence pack items that are incomplete.",
          },
          {
            term: "Attention.",
            definition:
              "A general bucket for other items: imported records awaiting review, invitation links that have not been accepted and account-level actions.",
          },
        ],
      },
      {
        heading: "Prioritising the queue",
        paragraphs: [
          "Command Centre surfaces items in urgency order — overdue items appear before items due today, which appear before items due this week. Within each group, items are sorted by property so you can work through a single address at a time.",
          "You do not need to clear every item in a single session. Items persist until the underlying action is completed. Closing a work order removes it from the maintenance bucket. Recording a payment removes the rent item.",
        ],
      },
      {
        heading: "Attested imports in Command Centre",
        paragraphs: [
          "If you have imported compliance records, Command Centre will show them in the Compliance bucket with the attested-import label. They follow the same urgency rules as native compliance items — if an imported record is overdue, it appears at the top.",
          "Acting on an attested-import item means verifying the underlying certificate and updating the record in Compliance Safe. The item clears from Command Centre once the record is updated or renewed.",
        ],
      },
    ],
  },

  {
    slug: "maintenance-workflow",
    category: "Operational workflows",
    title: "Managing a maintenance request from report to completion",
    summary:
      "How a maintenance request flows through Tenaqo from the first tenant report through diagnosis, contractor assignment, work order and completion.",
    metaDescription:
      "Step-by-step guide to the maintenance workflow in Tenaqo: tenant report, triage, work order, contractor assignment and completion.",
    lastUpdated: "2026-07-14",
    readingTime: "5 min read",
    relatedSlugs: ["command-centre", "evidence-packs"],
    sections: [
      {
        heading: "How a request starts",
        paragraphs: [
          "A maintenance request can start in two ways: a tenant submits it through the tenant portal, or you create it directly in the Maintenance Inbox.",
          "When a tenant submits a request, it arrives in your Maintenance Inbox with the tenant's description, any photos they attached and the date and time of submission. It also appears in Command Centre under the Maintenance bucket.",
        ],
      },
      {
        heading: "Diagnosis and triage",
        paragraphs: [
          "Open the request in the Maintenance Inbox to see the full description. Tenaqo's AI triage suggests a likely fault category, estimated severity and a first-response priority. This is a suggestion — you make the final decision on how to proceed.",
          "You can ask Tenaqo's maintenance diagnostics to analyse the request further. It can propose likely causes and recommended next steps based on the description.",
          "Once you have read the request, set a priority and decide whether to create a work order, close it as no action required or ask the tenant for more information.",
        ],
      },
      {
        heading: "Creating a work order",
        paragraphs: [
          "Create a work order from the request to move it into your contractors' workflow. A work order captures: the fault description, the property and tenancy, the required access arrangements, the target completion date and the assigned contractor.",
          "You can assign a contractor from your preferred suppliers list, or leave the work order unassigned if you are still getting quotes.",
        ],
      },
      {
        heading: "Contractor involvement",
        paragraphs: [
          "If the contractor has a portal account, they can update the work order directly — mark it as in progress, add notes, attach completion photos and mark it as done.",
          "If the contractor is not a portal user, you update the work order on their behalf as progress happens.",
        ],
      },
      {
        heading: "Completion and evidence",
        paragraphs: [
          "When a work order is marked complete, Tenaqo records the completion date, any photos uploaded by the contractor and the full activity trail from first report to completion.",
          "This trail is available in the Maintenance Evidence Pack for the property. It includes the original tenant report, all status changes, contractor notes, photos and the completion timestamp. The pack is an operational record. It is not a warranty, a building compliance certificate or a legal determination.",
        ],
        sectionLinks: [
          { label: "Read: What Evidence Packs contain — and what they do not prove", href: "/help/evidence-packs" },
        ],
      },
      {
        heading: "After completion",
        paragraphs: [
          "Once the work order is closed, the maintenance request is resolved and drops out of Command Centre. The record remains in the property's maintenance history for future reference.",
          "If the same fault recurs, you can create a new request and link it to the original for context.",
        ],
      },
    ],
  },

  {
    slug: "evidence-packs",
    category: "Operational workflows",
    title: "What Evidence Packs contain — and what they do not prove",
    summary:
      "Evidence Packs are structured operational records that compile your activity trail for a deposit dispute, maintenance job or compliance period. This article explains what they contain and what they are not.",
    metaDescription:
      "What Tenaqo Evidence Packs contain for deposit disputes, maintenance jobs and compliance records, and their limitations as legal documents.",
    lastUpdated: "2026-07-14",
    readingTime: "5 min read",
    relatedSlugs: ["maintenance-workflow", "attested-imports", "command-centre"],
    sections: [
      {
        heading: "Three types of Evidence Pack",
        paragraphs: [
          "Tenaqo produces three types of Evidence Pack, each covering a different part of your operational record.",
        ],
        boldPairs: [
          {
            term: "Deposit Dispute Pack.",
            definition:
              "Compiled when a tenancy ends with an unresolved deposit dispute. Includes: move-in and move-out inspection records, photos, maintenance requests raised during the tenancy, rent payment history and any written communications recorded in Tenaqo.",
          },
          {
            term: "Maintenance Evidence Pack.",
            definition:
              "A complete record of a single maintenance job from first report to completion. Includes: the original request, tenant and landlord notes, work order history, contractor activity, photos and completion timestamp.",
          },
          {
            term: "Compliance Evidence Pack.",
            definition:
              "A record of compliance status for a property over a period. Includes: each requirement tracked, its recorded dates, source (native or attested import) and expiry history.",
          },
        ],
      },
      {
        heading: "What Evidence Packs do",
        paragraphs: [
          "An Evidence Pack gives you a single, structured document that shows what happened, in what order, with timestamps and, where available, photos and notes.",
          "In a deposit dispute, the pack helps you present your case to a scheme or adjudicator in an organised form. In a maintenance dispute, it shows the sequence of events and the remedial action taken.",
          "Packs are generated from your Tenaqo records. Their quality depends on the completeness of those records — a pack based on thorough documentation will be more useful than one based on sparse notes.",
        ],
      },
      {
        heading: "What Evidence Packs are not",
        paragraphs: [
          "Evidence Packs are operational records, not legal documents. Tenaqo does not assess their legal admissibility. Whether a pack is accepted by a deposit scheme adjudicator, a court or any other body is a matter for that body.",
          "Packs do not verify the accuracy of the underlying records. If a compliance date in the pack came from a spreadsheet import, the pack will show it with the attested-import notation — it does not confirm the certificate exists.",
          "Tenaqo makes no representation that an Evidence Pack will succeed in any dispute. We help you organise the records you have. The strength of those records is determined by the quality and completeness of your documentation.",
        ],
      },
      {
        heading: "Compliance Evidence Pack and attested imports",
        paragraphs: [
          "If your Compliance Evidence Pack contains attested-import records, those records will be shown with their attestation status clearly noted. A reader will be able to see which compliance dates came from your spreadsheet and which came from direct entry.",
          "If you are assembling a compliance pack for a serious matter, verify attested-import records first by updating them to native status in Compliance Safe.",
        ],
      },
      {
        heading: "Accessing your packs",
        paragraphs: [
          "Evidence-pack availability depends on the pack type, your account plan and the relevant workflow.",
          "Maintenance Evidence Packs are generated from completed maintenance jobs and are available through supported maintenance workflows.",
          "Compliance Proof Packs are available through eligible Renters' Rights workflows.",
          "Deposit Dispute Pack workspaces require a Growth or Pro plan. Eligible users can prepare a pack from the Documents section using the records available for the relevant tenancy. Production print availability also depends on the feature's current release status.",
        ],
      },
    ],
  },

  // ── 4. Account and support ────────────────────────────────────────────────

  {
    slug: "plans-and-limits",
    category: "Account and support",
    title: "Plans, limits and feature access",
    summary:
      "A plain summary of what each Tenaqo plan includes and which features are available only on higher tiers. For current property limits, see the Pricing page.",
    metaDescription:
      "Tenaqo plan comparison: Starter, Growth and Pro, property limits, AI feature access and HMRC MTD availability.",
    lastUpdated: "2026-07-14",
    readingTime: "4 min read",
    relatedSlugs: ["contact-support", "getting-started"],
    sections: [
      {
        heading: "The three plans",
        boldPairs: [
          {
            term: "Starter.",
            definition:
              "Covers core operations: property and tenancy records, compliance tracking, maintenance inbox, tenant portal, spreadsheet import, maintenance evidence packs and compliance evidence packs.",
          },
          {
            term: "Growth.",
            definition:
              "Includes everything in Starter plus AI maintenance triage, AI compliance health suggestions, portfolio health dashboard, Poland compliance (Najem Okazjonalny and STR), attested-import labelling across all surfaces and HMRC connection and quarterly draft preparation.",
          },
          {
            term: "Pro.",
            definition:
              "Includes everything in Growth plus unlimited AI usage, full operational analytics, advanced contractor management and Poland advanced features (legal template library, partner directory).",
          },
        ],
        paragraphs2: [
          "An Operator Access tier is available for agencies and portfolio operators managing properties on behalf of others. Contact us for details.",
        ],
      },
      {
        heading: "Property limits",
        paragraphs: [
          "Your property and feature limits depend on your current plan. Check the Pricing page or your account settings for the limits that apply to your account.",
          "If you reach your plan limit, you can upgrade at any time from the billing section of your account. Properties you have already created are not affected when you upgrade.",
        ],
        sectionLinks: [
          { label: "View Pricing", href: "/pricing" },
        ],
      },
      {
        heading: "AI features",
        paragraphs: [
          "AI features — maintenance triage, property health analysis, compliance recommendations and AI summary drafts — require Growth or higher.",
          "Growth plans include 500 AI credits per month with a 50-credit daily cap. Pro plans include 3,000 credits per month with a 200-credit daily cap. AI suggestions are advisory only. You make all final decisions.",
        ],
      },
      {
        heading: "HMRC MTD",
        paragraphs: [
          "Tenaqo can connect to HMRC, show supported readiness information and help prepare quarterly records for review. Live HMRC submission is not generally available. Check your account for feature availability.",
        ],
      },
      {
        heading: "Founder Access",
        paragraphs: [
          "The first 20 landlords get Pro at Starter pricing for 12 months. One-time claim.",
        ],
      },
      {
        heading: "Upgrading or downgrading",
        paragraphs: [
          "You can change your plan at any time from the billing section of your account. Downgrading to a plan with a lower property limit does not remove your existing properties, but you will not be able to add new ones above the limit until you upgrade again.",
        ],
      },
    ],
  },

  {
    slug: "contact-support",
    category: "Account and support",
    title: "Contact Tenaqo support",
    summary:
      "How to reach Tenaqo, what to include in a support request and what falls within and outside support scope.",
    metaDescription:
      "How to contact Tenaqo support, what to include in a request and what support covers.",
    lastUpdated: "2026-07-14",
    readingTime: "3 min read",
    relatedSlugs: ["plans-and-limits", "getting-started"],
    sections: [
      {
        heading: "How to reach us",
        paragraphs: [
          "Contact the Tenaqo support team at support@tenaqo.com.",
          "There is no live chat or phone support at this stage. Email is the only current support channel.",
        ],
        note: {
          lines: ["support@tenaqo.com"],
        },
      },
      {
        heading: "What to include",
        paragraphs: [
          "A clear support request helps us respond faster. Include:",
        ],
        items: [
          "Your account email address.",
          "A description of the problem or question.",
          "The specific page or feature where the issue occurred.",
          "Any error messages you saw, copied in full.",
          "Steps you already tried.",
          "A screenshot if the issue is visual.",
        ],
      },
      {
        heading: "What support covers",
        items: [
          "Questions about how to use any Tenaqo feature.",
          "Errors or unexpected behaviour in the product.",
          "Import problems — rows not processing, mismatched records, needs-review explanations.",
          "Account and billing queries.",
          "Questions about the HMRC MTD connection.",
          "General questions about plans and feature access.",
        ],
      },
      {
        heading: "What support does not cover",
        items: [
          "Legal advice — we cannot advise on compliance obligations, tenancy law or dispute outcomes.",
          "Accounting advice — we can explain how Tenaqo calculates figures, but not how you should treat them for tax purposes.",
          "Contractor or tradesperson recommendations — we can help with the Tenaqo contractor directory, not with finding contractors directly.",
          "Dispute adjudication — Evidence Packs are records, not legal opinions.",
        ],
      },
      {
        heading: "Polish-language support",
        paragraphs: [
          "Polish-language support is being established. You can still contact the team at support@tenaqo.com.",
        ],
      },
      {
        heading: "Feature requests",
        paragraphs: [
          "If you have a suggestion for a new feature or an improvement to an existing one, email us at support@tenaqo.com with the subject line 'Feature request'. We read every one, even when we cannot respond individually.",
        ],
      },
    ],
  },
];

// ── Signup CTA used at the foot of articles ───────────────────────────────────

export const helpArticleCta = {
  title: "Try Tenaqo",
  body: "Tenaqo is built for landlords managing real portfolios. Add your first property and see the workflows in action.",
  primaryCta: { label: "Claim Founder Access", href: siteConfig.signupUrl },
  secondaryCta: { label: "Back to Help Centre", href: "/help" },
};
