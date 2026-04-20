import { siteConfig } from "./site";

export type BlogArticle = {
  slug: string;
  category: string;
  title: string;
  summary: string;
  metaDescription: string;
  cta: string;
  sections: Array<{
    heading: string;
    paragraphs: string[];
  }>;
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
    cta: "Try OASIS before we launch publicly",
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
        heading: "Why OASIS exists",
        paragraphs: [
          "OASIS exists for landlords managing real portfolios who want more control and less chaos.",
          "It is built with real landlord workflows in mind: rent follow-up, maintenance progress, tenant records, documents, and the operating signals that tell you what needs action next.",
          "If you are tired of making five disconnected tools behave like one system, OASIS is being built for you.",
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
    cta: "See your payments clearly with OASIS",
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
    cta: "Run your properties with clarity using OASIS",
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
          "OASIS is built around those practical questions, so landlords can spend less time searching and more time running the portfolio with clarity.",
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
          "OASIS is built to help landlords move from repair messages to tracked work, so issues can be handled with less chaos and fewer blind spots.",
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
    cta: "Prepare your portfolio to scale with OASIS",
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
          "OASIS helps landlords prepare for that shift, so growth does not turn every week into catch-up.",
        ],
      },
    ],
  },
];

export const getBlogArticle = (slug: string) =>
  blogArticles.find((article) => article.slug === slug);

export const blogCta = {
  title: "Try OASIS before we launch publicly",
  body: "Get early access, test the product with real rental work, and help shape how OASIS evolves for landlords.",
  primaryCta: { label: "Get Early Access", href: siteConfig.appUrl },
  secondaryCta: { label: "Compare Plans", href: "/pricing" },
};
