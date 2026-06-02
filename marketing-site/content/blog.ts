import { siteConfig } from "./site";

export type BlogSection = {
  heading?: string;           // optional — heading not rendered if absent/empty
  headingLevel?: "h2" | "h3"; // default "h2"
  paragraphs?: string[];      // rendered before items / boldPairs / note
  items?: string[];           // renders as ul > li bullet list
  boldPairs?: Array<{ term: string; definition: string }>; // **Term:** definition
  note?: { lines: string[] }; // styled example/flow block (code-like callout)
  paragraphs2?: string[];     // rendered after items / boldPairs / note
  sectionLinks?: Array<{ label: string; href: string }>; // inline nav links after content
};

export type BlogArticle = {
  slug: string;
  category: string;
  date?: string;        // ISO date e.g. "2026-05-13"
  readingTime?: string; // e.g. "5 min read"
  title: string;
  pageTitle?: string;   // overrides <title> when set; default: "${title} | Tenaqo Blog"
  summary: string;
  metaDescription: string;
  disclaimer?: string;  // legal/compliance disclaimer shown prominently above article body
  cta: string;          // soft CTA heading when ctaOverride is absent
  ctaOverride?: {       // article-specific in-body CTA
    heading: string;
    body: string;
    primaryCta: { label: string; href: string };
    secondaryCta?: { label: string; href: string };
  };
  sections: BlogSection[];
};

export const blogArticles: BlogArticle[] = [
  {
    slug: "why-most-landlord-apps-fail-small-landlords",
    category: "Productivity",
    title: "Why Most Landlord Apps Fail Small Landlords",
    summary:
      "Most landlord software asks small landlords to work like agencies. The better answer is simpler: fewer places to check, clearer next actions, and less mental tracking.",
    metaDescription:
      "Why many landlord apps miss the needs of small landlords, and what a better rental operating system should do instead.",
    cta: "Try Tenaqo before we launch publicly",
    sections: [
      {
        heading: "The real problem is not you",
        paragraphs: [
          "A lot of small landlords start with a setup that looks perfectly reasonable. A rent spreadsheet. A WhatsApp thread with tenants. A folder for leases. A few emails from contractors. A mental list of what still needs checking.",
          "For a while, it works. Then one payment needs chasing, one repair needs a second follow-up, one document gets buried, and the whole system starts depending on memory.",
          "That does not mean you are disorganized. It means the tools around you are not built for how small landlords actually operate.",
        ],
      },
      {
        heading: "What small landlords actually need",
        paragraphs: [
          "Small landlords do not need a bloated agency platform. They need to know what needs attention today.",
          "They need rent status that is easy to read. Maintenance that does not disappear into messages. Tenant and property context that is available when a decision has to be made. Records that are close to the work they support.",
          "Most of all, they need a system that reduces mental tracking instead of adding another place to manage.",
        ],
      },
      {
        heading: "Where apps go wrong",
        paragraphs: [
          "Many landlord apps are built around feature lists rather than landlord routines. They can store information, but they do not always make the next action obvious.",
          "Other tools are designed for agencies, so the workflow assumes more people, more process, and more administrative capacity than a small landlord usually has.",
          "The result is software that looks powerful, but still leaves the landlord piecing together the story from spreadsheets, messages, emails, and memory.",
        ],
      },
      {
        heading: "The hidden cost of making it work",
        paragraphs: [
          "When a system almost works, landlords often fill the gaps themselves. They check the spreadsheet twice. Search messages. Reopen old emails. Keep reminders in their head.",
          "That invisible admin has a cost. It slows follow-up, increases missed details, and makes the portfolio feel more stressful than it needs to be.",
          "The more properties you add, the more expensive that hidden work becomes.",
        ],
      },
      {
        heading: "What a better system looks like",
        paragraphs: [
          "A better system starts with the way landlords actually work. It brings rent, repairs, records, tenant context, and action queues into one place without forcing an agency-style workflow.",
          "It helps you see what needs attention before it becomes a problem. It gives maintenance a path from request to work order. It keeps records attached to the right property or tenant.",
          "It does not try to make landlords look busy. It helps them stay in control.",
        ],
      },
      {
        heading: "Why Tenaqo exists",
        paragraphs: [
          "Tenaqo exists for landlords managing real portfolios who want more control and less chaos.",
          "It is built with real landlord workflows in mind: rent follow-up, maintenance progress, tenant records, documents, and the operating signals that tell you what needs action next.",
          "If you are tired of making five disconnected tools behave like one system, Tenaqo is being built for you.",
        ],
      },
    ],
  },
  {
    slug: "hidden-cost-of-missed-rent-tracking",
    category: "Rent",
    title: "The Hidden Cost of Missed Rent Tracking",
    summary:
      "Missing one payment can feel small until it creates follow-up delays, awkward conversations, and weaker confidence in your portfolio cash position.",
    metaDescription:
      "Missed rent tracking creates more than a finance issue. Learn how clearer rent visibility changes landlord behavior.",
    cta: "See your payments clearly with Tenaqo",
    sections: [
      {
        heading: "Missing one payment does not feel big",
        paragraphs: [
          "At first, missed rent tracking feels like a small admin issue. One tenant is late. One payment needs checking. One spreadsheet row has not been updated.",
          "Then the month moves on. Another payment comes in. A repair needs attention. A tenant sends a message. Suddenly you are not completely sure what is paid, what is overdue, and what needs chasing.",
        ],
      },
      {
        heading: "Why missed rent happens",
        paragraphs: [
          "Most missed rent follow-up is not caused by laziness. It happens because the rent picture is split across too many places.",
          "Payments may be checked in one place, tracked in another, and followed up through messages or email. If the system depends on manual checking, something will eventually slip.",
        ],
      },
      {
        heading: "The snowball effect",
        paragraphs: [
          "A late payment is easier to handle early. The longer it sits, the more awkward and time-consuming the follow-up becomes.",
          "Missed rent tracking also affects confidence. You cannot make good decisions about maintenance spend, cash flow, or portfolio health if the payment picture is unclear.",
          "One missed update can create a week of unnecessary checking.",
        ],
      },
      {
        heading: "Why spreadsheets fail",
        paragraphs: [
          "Spreadsheets are flexible, but they are not an operating system. They do not tell you what changed. They do not surface what needs action. They do not keep tenant and property context close to the payment status.",
          "They also depend on perfect habits. The problem is that rental management rarely gives landlords perfect conditions.",
        ],
      },
      {
        heading: "What good rent tracking looks like",
        paragraphs: [
          "Good rent tracking makes the payment picture easy to read quickly. Paid, due, and overdue balances should be visible without rebuilding a tracker.",
          "It should also connect payment status to the property and tenant context, because follow-up is not just a number. It is a decision that needs the right background.",
        ],
      },
      {
        heading: "How visibility changes behavior",
        paragraphs: [
          "When landlords can see rent status clearly, follow-up gets faster and calmer. You know what to chase, what to review, and what is already handled.",
          "That clarity changes the way the whole portfolio feels. Rent becomes something you stay on top of, not something you reconstruct after the fact.",
        ],
      },
    ],
  },
  {
    slug: "how-organised-landlords-stay-on-top-of-everything",
    category: "Operations",
    title: "How Organised Landlords Actually Stay on Top of Everything",
    summary:
      "Organised landlords are not relying on memory. They use simple systems that make rent, repairs, records, and follow-up easier to see.",
    metaDescription:
      "How organized landlords use simple systems to stay on top of rent, maintenance, records, and follow-up.",
    cta: "Run your properties with clarity using Tenaqo",
    sections: [
      {
        heading: "It is not about working harder",
        paragraphs: [
          "The most organized landlords are not magically better at remembering everything. They are better at reducing what they have to remember.",
          "They build simple systems around the work that repeats: rent, maintenance, tenant details, documents, and follow-up.",
        ],
      },
      {
        heading: "The myth of I will remember",
        paragraphs: [
          "I will remember is not a system. It works until the week gets busy, a tenant sends a second message, or a contractor update lands in the wrong thread.",
          "Landlords carry a surprising amount of operational detail in their heads. That creates stress and makes missed follow-up more likely.",
        ],
      },
      {
        heading: "What organized landlords actually do",
        paragraphs: [
          "Organized landlords create one reliable place to check what is happening. They keep rent status readable. They give repairs a clear path. They keep records attached to the right property or tenant.",
          "They also review the portfolio before pressure turns into a problem. That does not require a complicated process. It requires a clear operating rhythm.",
        ],
      },
      {
        heading: "One place versus five tools",
        paragraphs: [
          "Five tools can look manageable when the portfolio is small. A spreadsheet here, a folder there, a few messages, a calendar reminder, and a notebook.",
          "The issue is not each tool on its own. The issue is the gap between them. Every gap becomes a place where context can get lost.",
        ],
      },
      {
        heading: "The power of visibility",
        paragraphs: [
          "Visibility is not about having more dashboards. It is about seeing the work that needs action early enough to do something about it.",
          "When overdue rent, repair status, and missing records are easier to spot, landlords can act with less friction.",
        ],
      },
      {
        heading: "Simple systems that work",
        paragraphs: [
          "A useful system should answer basic questions quickly. Who owes what? Which repair is stuck? Where is the record? Which property needs attention?",
          "Tenaqo is built around those practical questions, so landlords can spend less time searching and more time running the portfolio with clarity.",
        ],
      },
    ],
  },
  {
    slug: "maintenance-chaos-why-it-spirals-and-how-to-fix-it",
    category: "Maintenance",
    title: "Maintenance Chaos: Why It Spirals And How To Fix It",
    summary:
      "Maintenance usually fails because the process is unclear, not because the repair is difficult. Ownership, status, and follow-up make the difference.",
    metaDescription:
      "Why rental maintenance spirals into chaos and how landlords can create a simpler process for repair follow-up.",
    cta: "Track and resolve issues without chaos",
    sections: [
      {
        heading: "Maintenance does not fail because of the repair",
        paragraphs: [
          "Most maintenance problems do not spiral because the repair itself is impossible. They spiral because the process around the repair is unclear.",
          "A tenant reports an issue. The landlord forwards it. A contractor asks a question. The tenant follows up. Somewhere in the middle, nobody is completely sure what happened next.",
        ],
      },
      {
        heading: "How maintenance breaks down",
        paragraphs: [
          "Maintenance breaks down when requests arrive through different channels and never become structured work.",
          "One issue might start in WhatsApp. Another comes by email. A third is mentioned during a call. Unless those requests become trackable, the landlord is left managing repairs from memory.",
        ],
      },
      {
        heading: "Communication gaps",
        paragraphs: [
          "Tenants care about progress. Contractors need clear instructions. Landlords need to know whether something is assigned, waiting, blocked, or completed.",
          "When those updates live in separate conversations, the repair becomes harder to manage than it should be.",
        ],
      },
      {
        heading: "No ownership means no resolution",
        paragraphs: [
          "If nobody owns the next step, the issue stalls. The landlord thinks the contractor is handling it. The contractor is waiting for access. The tenant thinks nobody has responded.",
          "Clear ownership does not make every repair easy, but it makes progress easier to see.",
        ],
      },
      {
        heading: "Why it escalates",
        paragraphs: [
          "Small delays can quickly become bigger problems. A minor repair becomes a complaint. A complaint becomes a strained tenant relationship. A missed update becomes a repeat chase.",
          "The cost is not just the repair. It is the time and trust lost around it.",
        ],
      },
      {
        heading: "A simple structure that works",
        paragraphs: [
          "A better maintenance process starts with a clear request, a work order, an owner, a status, and a way to review progress.",
          "Tenaqo is built to help landlords move from repair messages to tracked work, so issues can be handled with less chaos and fewer blind spots.",
        ],
      },
    ],
  },
  {
    slug: "from-2-properties-to-20-what-breaks-first",
    category: "Growth",
    title: "From 2 Properties To 20: What Breaks First",
    summary:
      "Managing two properties can be easy. Scaling exposes the weak points: payments, communication, maintenance, records, and manual follow-up.",
    metaDescription:
      "What starts breaking as landlords scale from a few properties to a larger portfolio, and how to prepare operations earlier.",
    cta: "Prepare your portfolio to scale with Tenaqo",
    sections: [
      {
        heading: "Managing two properties is easy. Scaling is not.",
        paragraphs: [
          "Two properties can often be managed with a spreadsheet, a few reminders, and a decent memory.",
          "Twenty properties is different. The work does not just multiply. It changes shape. More tenants, more payments, more repairs, more records, and more chances for something to slip.",
        ],
      },
      {
        heading: "The tipping point",
        paragraphs: [
          "The tipping point usually arrives before landlords expect it. It is the moment when checking everything manually starts taking more time than the work itself.",
          "At that point, the portfolio needs more than effort. It needs structure.",
        ],
      },
      {
        heading: "Payments start breaking",
        paragraphs: [
          "With a small portfolio, you may know payment status by memory. As the portfolio grows, that becomes risky.",
          "Paid, due, and overdue rent needs to be visible quickly, because late follow-up compounds fast.",
        ],
      },
      {
        heading: "Communication starts spreading",
        paragraphs: [
          "More properties means more conversations. Tenant updates, contractor messages, document requests, and payment questions start arriving from every direction.",
          "If those conversations are not connected to the work, landlords spend too much time reconstructing context.",
        ],
      },
      {
        heading: "Maintenance starts competing for attention",
        paragraphs: [
          "Repairs become harder when multiple issues are open at once. The landlord needs to know what is new, what is assigned, what is blocked, and what has gone quiet.",
          "Without a workflow, maintenance becomes a rolling list of half-remembered follow-ups.",
        ],
      },
      {
        heading: "Why manual systems collapse",
        paragraphs: [
          "Manual systems rely on perfect discipline. Growing portfolios create imperfect weeks.",
          "A spreadsheet, inbox, and memory can handle a lot until they cannot. When they fail, they usually fail quietly: a missed update, a late chase, a document nobody can find.",
        ],
      },
      {
        heading: "What scaling landlords do differently",
        paragraphs: [
          "Scaling landlords bring the operating work into one place earlier. They build routines around rent status, maintenance progress, tenant context, records, and portfolio review.",
          "Tenaqo helps landlords prepare for that shift, so growth does not turn every week into catch-up.",
        ],
      },
    ],
  },

  // ── New article ────────────────────────────────────────────────────────────
  {
    slug: "why-rent-should-be-a-workflow-not-just-a-number",
    category: "Rent & Finance",
    date: "2026-05-13",
    readingTime: "5 min read",
    pageTitle: "Why Rent Should Be a Workflow, Not Just a Number | Tenaqo",
    title: "Why Rent Should Be a Workflow, Not Just a Number",
    summary:
      "Rent is rarely just one monthly amount. Expected charges, proration, deposits, utilities, arrears, and safe posting all need a workflow.",
    metaDescription:
      "Rent is rarely just one number. Learn why landlords need expected charges, proration, utilities, arrears visibility, and safe finance posting in one rent workflow.",
    cta: "Want rent to stop living in spreadsheets?",
    ctaOverride: {
      heading: "Want rent to stop living in spreadsheets?",
      body: "Tenaqo helps landlords create rent plans, preview expected charges, track balances, and keep finance actions under landlord control.",
      primaryCta: { label: "Claim Founder Access", href: siteConfig.appUrl },
      secondaryCta: { label: "See how Tenaqo works", href: "/features/rental-accounting" },
    },
    sections: [
      {
        // Intro — no heading
        paragraphs: [
          "Most landlords start with rent as a simple number.",
          "A tenant pays £1,200 per month. The amount goes into a spreadsheet. The landlord checks the bank. If the money arrives, everything is fine.",
          "That works until the real world gets involved.",
          "A tenant moves in halfway through the month. A rent increase starts from a future date. Utilities are included for one property but separate for another. A shared tenancy needs rent split between two people. A deposit needs checking against the relevant market rules. A payment arrives, but the amount does not match what was expected.",
          "At that point, rent is no longer just a number. It becomes a workflow.",
        ],
      },
      {
        heading: "The problem with treating rent as one field",
        paragraphs: [
          "Many landlords track rent in one of three ways:",
        ],
        items: ["a spreadsheet", "bank statements", "memory"],
        paragraphs2: [
          "That creates a problem: none of those tools explain what should have happened.",
          "A bank statement can show that £900 arrived. It does not always show whether £900 was the full rent, a partial payment, a utility payment, a deposit, an adjustment, or a payment for a different period.",
          "A spreadsheet can track rent manually, but it relies on the landlord remembering every rule, date, exception, and change.",
          "That is where mistakes creep in.",
        ],
      },
      {
        heading: "Expected charges come before payments",
        paragraphs: [
          "A better rent workflow starts with this distinction:",
        ],
        boldPairs: [
          { term: "Expected charge:", definition: "what should be due." },
          { term: "Payment:", definition: "what was actually received." },
        ],
        paragraphs2: [
          "Those are not the same thing.",
          "A landlord needs to know both.",
          "If June rent is expected at £1,200 and the tenant pays £1,000, the issue is not just \"a payment came in.\" The issue is that £200 still needs attention.",
          "If a tenant moves in on the 10th, the first rent may need prorating. That expected charge should be calculated before the landlord starts chasing money.",
          "If a landlord applies a discount or rent holiday, the original charge should not disappear. The adjustment should be visible, explained, and auditable.",
        ],
      },
      {
        heading: "Why calculation previews matter",
        paragraphs: [
          "A rent workflow should show the calculation before anything touches the finance record.",
          "Example:",
        ],
        note: {
          lines: [
            "Monthly rent: £1,200",
            "Proration method: actual days in month",
            "Move-in date: 10 April",
            "Days occupied: 21",
            "Expected charge: £840",
          ],
        },
        paragraphs2: [
          "That preview gives the landlord confidence.",
          "It also helps avoid the common problem of posting incorrect finance records and then trying to reverse or explain them later.",
        ],
      },
      {
        heading: "Rent rules protect the ledger",
        paragraphs: [
          "A clean finance system should not let calculations silently mutate the ledger.",
          "The safer flow is:",
        ],
        note: {
          lines: [
            "Rent rules",
            "→ calculation preview",
            "→ expected charge",
            "→ landlord review",
            "→ approved finance posting",
          ],
        },
        paragraphs2: [
          "That gives the landlord control and preserves a better audit trail.",
        ],
      },
      {
        heading: "What this means in Tenaqo",
        paragraphs: [
          "Tenaqo treats rent as part of the operating workflow, not just a static amount.",
          "That means landlords can work with:",
        ],
        items: [
          "rent plans",
          "expected charges",
          "proration",
          "utilities",
          "deposits",
          "arrears visibility",
          "rent plan history",
          "safe posting into Finance",
        ],
        paragraphs2: [
          "The aim is simple: make the expected rent clear before the landlord has to chase it.",
        ],
      },
      {
        heading: "Final thought",
        paragraphs: [
          "Rent problems do not usually start with the payment. They start earlier, when the expected charge was unclear.",
          "A better rent system helps landlords answer three questions quickly:",
        ],
        items: [
          "What should have been paid?",
          "What actually happened?",
          "What needs action next?",
        ],
        paragraphs2: [
          "That is the difference between rent tracking and rent control.",
        ],
      },
    ],
  },

  // ── Compliance article ────────────────────────────────────────────────────
  {
    slug: "the-2026-uk-landlord-survival-guide-5-rules-that-changed-on-may-1st",
    category: "Compliance Readiness",
    date: "2026-05-13",
    readingTime: "7 min read",
    pageTitle: "The 2026 UK Landlord Survival Guide | Renters' Rights Act Changes",
    title: "The 2026 UK Landlord Survival Guide: 5 Rules That Changed on May 1st",
    summary:
      "Section 21, bidding wars, rent increases, pets, discrimination rules, and the new Information Sheet have changed the operating rhythm for landlords. Here are five rules every UK landlord should understand in 2026.",
    metaDescription:
      "Understand five major Renters' Rights Act changes for UK landlords in 2026, including Section 21, rent increases, bidding wars, pets, discrimination rules, and the Information Sheet deadline.",
    disclaimer:
      "This article is for general information only and is not legal advice. Landlords should check the latest GOV.UK guidance or speak to a qualified adviser before taking action.",
    cta: "Ready for the new landlord operating reality?",
    ctaOverride: {
      heading: "Ready for the new landlord operating reality?",
      body: "Tenaqo helps landlords track rent, documents, notices, maintenance, compliance readiness, and audit trails from one operating dashboard.",
      primaryCta: { label: "See how Tenaqo works", href: siteConfig.appUrl },
      secondaryCta: { label: "Explore Renters' Rights readiness", href: "/features/compliance" },
    },
    sections: [
      {
        // No heading — intro section
        paragraphs: [
          "The \"standard\" way of renting in England has changed.",
          "As of 1 May 2026, the Renters' Rights Act moved from future reform to day-to-day operating reality for private landlords. For many landlords, this is not just a policy update. It changes how tenancies are structured, how rent increases are handled, how tenants are selected, and how compliance evidence needs to be tracked.",
          "The key lesson is simple: compliance is no longer something landlords can check once and forget. It is now an ongoing workflow.",
        ],
      },
      {
        heading: "1. The £7,000 paperwork trap",
        paragraphs: [
          "One of the most immediate requirements is the new Renters' Rights Act Information Sheet.",
          "By 31 May 2026, landlords or their managing agents are expected to provide the official government Information Sheet to all named tenants, including tenants on existing qualifying private tenancies.",
          "This matters because the Information Sheet is not just another PDF. It is part of the landlord's compliance trail.",
        ],
      },
      {
        heading: "The risk",
        headingLevel: "h3",
        paragraphs: [
          "Failing to provide the required Information Sheet may expose landlords to enforcement action and civil penalties, based on current guidance.",
          "That is why landlords should not treat this as a casual email attachment with no follow-up.",
          "The operational question is not only: \"Did I send it?\" It is: \"Can I prove when it was sent, who it was sent to, and which tenancy it relates to?\"",
        ],
      },
      {
        heading: "The Tenaqo angle",
        headingLevel: "h3",
        paragraphs: [
          "Tenaqo is built around evidence and workflow.",
          "Instead of manually emailing PDFs and hoping the record is easy to find later, landlords can use Tenaqo-style workflows to track:",
        ],
        items: [
          "which tenants need the Information Sheet",
          "which tenants have received it",
          "the delivery method and date sent",
          "linked evidence or document records",
          "follow-up actions",
        ],
        paragraphs2: [
          "Tenaqo does not replace legal advice, but it helps landlords keep the operational trail organised.",
        ],
        sectionLinks: [
          { label: "Track compliance with Tenaqo →", href: "/features/compliance" },
        ],
      },
      {
        heading: "2. Section 21 is gone",
        paragraphs: [
          "The biggest headline change is the abolition of Section 21 \"no-fault\" evictions for affected private tenancies.",
          "Landlords can no longer rely on the old route of ending an assured shorthold tenancy simply because a fixed term has ended.",
          "The tenancy structure has also changed. Assured shorthold tenancies are replaced by assured periodic tenancies for affected private rented sector tenancies.",
          "In plain English, landlords need to think less in terms of \"fixed term ending\" and more in terms of ongoing tenancy management.",
        ],
      },
      {
        heading: "The new reality",
        headingLevel: "h3",
        paragraphs: [
          "If a landlord needs possession, they must use the relevant possession grounds — such as selling the property, moving back in, or other permitted grounds under current legislation.",
          "Some grounds may have restrictions, notice requirements, or time limits. Landlords should verify the current rules before acting.",
        ],
      },
      {
        heading: "Why this changes operations",
        headingLevel: "h3",
        paragraphs: [
          "This change makes record-keeping more important than ever.",
          "If possession depends on a specific ground, the landlord needs clear records that support the action being taken. That could include:",
        ],
        items: [
          "tenancy dates and agreement history",
          "notices served and delivery evidence",
          "tenant communication records",
          "rent records and arrears history",
          "maintenance records",
          "document history",
          "property status and reason for possession",
        ],
        paragraphs2: [
          "Tenaqo helps by keeping tenancy, document, finance, maintenance, and communication evidence closer to the workflow.",
        ],
      },
      {
        heading: "3. The bidding war ban",
        paragraphs: [
          "Rental bidding has also changed.",
          "Landlords and agents must not invite, encourage, or accept offers above the advertised rent where the new rules apply.",
          "That means the advertised rent matters more than ever.",
        ],
      },
      {
        heading: "The risk",
        headingLevel: "h3",
        paragraphs: [
          "If a property is advertised at £1,500 per month, the landlord should not treat higher offers as a way to test demand or push the price upward.",
          "The practical lesson: your initial rent valuation needs to be more accurate. Underpricing and then relying on competitive bidding is no longer a safe strategy.",
        ],
      },
      {
        heading: "The Tenaqo angle",
        headingLevel: "h3",
        paragraphs: [
          "This is where better rent visibility matters.",
          "Tenaqo helps landlords think more clearly about the financial picture before they advertise:",
        ],
        items: [
          "current rent levels",
          "expected charges",
          "property costs and maintenance pressure",
          "arrears history",
          "occupancy status and yield pressure",
        ],
        paragraphs2: [
          "That does not replace a professional valuation, but it gives landlords a better operating picture before they set a rent figure.",
        ],
      },
      {
        heading: "4. Rent increases: one shot only",
        paragraphs: [
          "Rent increases are now more tightly controlled.",
          "Under the new approach, landlords generally need to use the formal Section 13 process for rent increases, and rent can only be increased once per year.",
          "The notice period is also important. Current guidance points to at least two months' notice for a Section 13 rent increase, but landlords should verify the latest requirements before acting.",
        ],
      },
      {
        heading: "What changed",
        headingLevel: "h3",
        paragraphs: [
          "Old-style rent review clauses may no longer work in the way landlords expected.",
          "Landlords need to treat rent increases as a controlled process, not just a line in a tenancy agreement. That process should include:",
        ],
        items: [
          "proposed new rent and current rent",
          "effective date and notice date",
          "method of service",
          "tenant response and any Tribunal reference",
          "supporting market reasoning",
          "updated expected charge records",
        ],
      },
      {
        heading: "The Tenaqo angle",
        headingLevel: "h3",
        paragraphs: [
          "Tenaqo is designed around rent rules and expected charges. A safer rent increase workflow looks like this:",
        ],
        note: {
          lines: [
            "Rent increase proposed",
            "→ notice tracked",
            "→ effective date recorded",
            "→ expected charges updated",
            "→ Finance posting remains controlled",
            "→ audit trail preserved",
          ],
        },
        paragraphs2: [
          "That matters because rent increases are no longer just a spreadsheet edit. They are part of the compliance record.",
        ],
        sectionLinks: [
          { label: "Explore rent rules and expected charges →", href: "/features/rental-accounting" },
        ],
      },
      {
        heading: "5. Pets, benefits, and families: blanket refusals are risky",
        paragraphs: [
          "The Renters' Rights Act also strengthens tenant protections around pets and discrimination.",
          "Landlords should be careful with blanket policies such as:",
        ],
        items: [
          "\"No pets\"",
          "\"No DSS\" or \"No benefits\"",
          "\"No children\"",
        ],
        paragraphs2: [
          "The new rules move landlords toward individual assessment rather than broad category-based refusal.",
        ],
      },
      {
        heading: "Pets",
        headingLevel: "h3",
        paragraphs: [
          "Tenants have stronger rights to request a pet.",
          "Landlords may still have reasons to decline in some circumstances, but a blanket refusal without individual assessment is unlikely to be the right approach. In some cases, landlords may be able to require appropriate insurance or protection against pet-related damage. Landlords should check current guidance or take advice before setting pet policies.",
        ],
      },
      {
        heading: "Benefits and families",
        headingLevel: "h3",
        paragraphs: [
          "Landlords and agents should not reject applicants simply because they receive benefits or have children.",
          "Referencing should focus on individual affordability, suitability, and lawful criteria rather than broad exclusions.",
        ],
      },
      {
        heading: "The Tenaqo angle",
        headingLevel: "h3",
        paragraphs: [
          "This is another reason why audit trails matter.",
          "Landlords should be able to show that tenancy decisions were based on individual assessment rather than blanket exclusion.",
          "Tenaqo helps landlords keep structured records around:",
        ],
        items: [
          "tenant applications and affordability review notes",
          "communication records",
          "document requests and responses",
          "decision history",
          "compliance evidence",
        ],
        paragraphs2: [
          "Tenaqo does not make decisions for the landlord. It helps keep the process visible and accountable.",
        ],
      },
      {
        heading: "The bottom line: compliance is now a workflow",
        paragraphs: [
          "In 2026, wanting less day-to-day chasing without reliable systems carries real operational risk.",
          "The new rules increase the importance of:",
        ],
        items: [
          "notices and deadlines",
          "tenant communication records",
          "document delivery and evidence",
          "rent increase records",
          "application and decision history",
          "maintenance evidence",
          "audit trails",
        ],
        paragraphs2: [
          "With the Private Rented Sector Database and the Landlord Ombudsman expected to shape the next phase of landlord accountability, record-keeping will matter even more.",
          "The landlords who adapt best will not be the ones who memorise every rule. They will be the ones who build a reliable operating rhythm.",
          "That is the shift Tenaqo was built for.",
          "From Information Sheet tracking to rent increase workflows, document evidence, tenant records, and audit trails, Tenaqo helps landlords keep compliance close to the work — not buried in inboxes and folders.",
        ],
        sectionLinks: [
          { label: "Explore Renters' Rights readiness →", href: "/features/compliance" },
          { label: "See how Tenaqo works →", href: "/features" },
        ],
      },
    ],
  },
  {
    slug: "documents-landlords-should-keep-before-tenancy-starts",
    category: "Compliance",
    title: "What Documents Should Landlords Keep Before a Tenancy Starts?",
    summary: "A practical overview of tenancy records landlords may want to organise before move-in.",
    metaDescription: "Learn what tenancy documents landlords should organise before a tenancy starts, from agreements and safety records to deposit evidence.",
    disclaimer: "This article is general information only and is not legal advice.",
    cta: "Organise tenancy records with Tenaqo",
    sections: [{ paragraphs: ["Before move-in, landlords benefit from keeping tenancy agreements, safety certificates, deposit evidence, onboarding acknowledgements and inventory records close to the property and tenant timeline. Tenaqo helps organise those records for review."] }],
  },
  {
    slug: "check-in-inventory-protects-deposit-claim",
    category: "Evidence",
    title: "How to Create a Check-in Inventory That Supports Deposit Review",
    summary: "How structured photos, room notes and signatures can make move-in evidence easier to review.",
    metaDescription: "Create a clearer check-in inventory with room-by-room notes, photos and acknowledgements to support deposit review.",
    disclaimer: "This article is general information only and is not legal advice.",
    cta: "Build better inspection records with Tenaqo",
    sections: [{ paragraphs: ["A useful check-in inventory records room condition, fixtures, meters, keys, appliances, photos and acknowledgement notes. The goal is not to determine an outcome, but to make evidence easier to find and review."] }],
  },
  {
    slug: "reduce-unnecessary-maintenance-call-outs",
    category: "Maintenance",
    title: "How Landlords Can Reduce Unnecessary Maintenance Call-outs",
    summary: "Use structured issue questions to understand tenant maintenance requests before dispatching a contractor.",
    metaDescription: "Learn how landlords can collect better maintenance information before approving a contractor call-out.",
    cta: "Triage maintenance requests with Tenaqo",
    sections: [{ paragraphs: ["Basic diagnostics can collect issue type, urgency, photos and key answers before a request reaches the landlord. They should not replace emergency handling, professional advice or qualified repair work."] }],
  },
  {
    slug: "pre-screen-tenants-without-drowning-in-messages",
    category: "Tenant onboarding",
    title: "How to Pre-screen Tenants Without Drowning in Messages",
    summary: "Application links can keep enquiries structured while helping landlords review applicants consistently.",
    metaDescription: "Use tenant application links to collect consistent rental enquiry information without relying on message threads.",
    cta: "Create tenant application workflows with Tenaqo",
    sections: [{ paragraphs: ["A structured application link can collect move-in date, occupants, contact details, consent and landlord preferences in one place. Landlords should use this information consistently and fairly."] }],
  },
  {
    slug: "najem-okazjonalny-checklist-polish-landlords",
    category: "Poland",
    title: "Najem Okazjonalny Checklist for Polish Landlords",
    summary: "A record-keeping checklist for landlords organising Najem Okazjonalny evidence.",
    metaDescription: "A practical Najem Okazjonalny checklist for organising tenancy security documents and evidence records.",
    disclaimer: "This article is general information only and is not legal advice.",
    cta: "Track Poland compliance records with Tenaqo",
    sections: [{ paragraphs: ["Polish landlords using Najem Okazjonalny often need to keep related tenancy security evidence organised, including the agreement, notarial act evidence, alternative address declaration, owner consent and kaucja record. Always review with a qualified adviser."] }],
  },
  {
    slug: "kaucja-deductions-poland-evidence",
    category: "Poland",
    title: "Kaucja Deductions in Poland: What Evidence Should Landlords Keep?",
    summary: "A practical look at records that can support kaucja deduction review.",
    metaDescription: "Understand what evidence Polish landlords may want to keep when reviewing kaucja deductions.",
    disclaimer: "This article is general information only and is not legal advice.",
    cta: "Organise deposit evidence with Tenaqo",
    sections: [{ paragraphs: ["Kaucja deduction review is easier when check-in records, check-out records, photos, invoices, notes and tenant acknowledgements are stored alongside the tenancy. Tenaqo helps keep that evidence organised."] }],
  },
];

export const getBlogArticle = (slug: string) =>
  blogArticles.find((article) => article.slug === slug);

export const blogCta = {
  title: "Try Tenaqo before we launch publicly",
  body: "Get early access, test the product with real rental work, and help shape how Tenaqo evolves for landlords.",
  primaryCta: { label: "Get Early Access", href: siteConfig.appUrl },
  secondaryCta: { label: "Compare Plans", href: "/pricing" },
};
