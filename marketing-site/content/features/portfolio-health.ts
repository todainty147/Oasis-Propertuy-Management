import { siteConfig } from "../site";

export const portfolioHealthContent = {
  seo: {
    title: "Portfolio Health Scoring for Landlords | Tenaqo",
    description:
      "Spot arrears pressure, maintenance strain, and property risk earlier with portfolio health scoring in Tenaqo.",
    canonical: "https://marketing.oasisrentalmgt.app/features/portfolio-health",
  },
  hero: {
    eyebrow: "Portfolio health",
    title: "See which properties are building pressure before they become expensive",
    body:
      "Tenaqo turns property health into a landlord decision tool, combining arrears pressure, maintenance strain, stalled work, risk signals, and an AI explainer into one operating view.",
    imageSrc: "/screenshots/portfolio-health.png",
    imageAlt: "Tenaqo Portfolio Health dashboard showing finance pressure, maintenance risk, and an AI property explainer.",
  },
  problemSection: {
    eyebrow: "Why it matters",
    title: "Properties rarely become risky all at once",
    body:
      "The warning signs usually appear earlier: overdue balances, repair drag, contractor delays, and operational strain that are easy to miss when they live on separate pages.",
    items: [
      {
        title: "Risk hides across modules",
        body: "Arrears, vacancies, and repair pressure do not look dangerous until somebody connects them.",
      },
      {
        title: "Intervention comes too late",
        body: "Without a health view, teams wait for the complaint, the missed payment, or the vacancy surprise.",
      },
      {
        title: "Review becomes reactive",
        body: "Landlords end up reading history after the damage instead of acting on live signals.",
      },
    ],
  },
  solutionSection: {
    eyebrow: "What Tenaqo does",
    title: "Health scoring that points back to the work",
    body:
      "Portfolio health in Tenaqo is not just reporting. It helps landlords see which properties are building pressure, explains why the weakest address is slipping, and then points back into the queues, requests, and records behind that score.",
    items: [
      {
        title: "Finance and arrears pressure",
        body: "See when overdue balances are starting to drag on the wider portfolio.",
      },
      {
        title: "Maintenance strain",
        body: "Spot properties where open work, stalled repairs, or slow follow-through are building operational drag.",
      },
      {
        title: "AI explanation with facts attached",
        body: "Explain why a property is under pressure while still showing the non-AI facts behind the score.",
      },
      {
        title: "Actionable next steps",
        body: "Stay connected to the same workflows needed to respond instead of reviewing a score in isolation.",
      },
    ],
    imageSrc: "/screenshots/portfolio-health.png",
    imageAlt: "Tenaqo Portfolio Health dashboard showing pressure signals, risk visibility, and an AI explanation card.",
    imageAlign: "left" as const,
  },
  benefits: {
    title: "What landlords gain from earlier risk visibility",
    items: [
      {
        title: "Earlier intervention",
        body: "Catch deterioration before it spreads into bigger cost and tenant disruption.",
      },
      {
        title: "Clearer property prioritization",
        body: "Know which addresses deserve attention this week, and why, instead of treating every issue the same.",
      },
      {
        title: "Stronger portfolio oversight",
        body: "Read the portfolio as a living operation, not just a set of isolated screens.",
      },
      {
        title: "More confident decisions",
        body: "Act with a clearer picture of where operational pressure is really building.",
      },
    ],
  },
  finalCta: {
    title: "Know which property needs attention before the next complaint lands",
    body:
      "See how Tenaqo turns portfolio health scoring into earlier, calmer intervention across the portfolio.",
    primaryCta: { label: "Get Early Access", href: siteConfig.appUrl },
    secondaryCta: { label: "Explore Features", href: "/features" },
  },
};
