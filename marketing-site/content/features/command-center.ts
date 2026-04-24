import { siteConfig } from "../site";

export const commandCenterContent = {
  seo: {
    title: "Command Center for Landlords | OASIS Rental",
    description:
      "See urgent queues, overdue balances, and operational priorities in one command center built for landlords.",
    canonical: "https://oasisrental.com/features/command-center",
  },
  hero: {
    eyebrow: "Command center",
    title: "Start with the work that actually needs attention",
    body:
      "OASIS gives landlords a command center for urgent queues, overdue balances, and next actions so the week does not begin with reconstruction work.",
    imageSrc: "/screenshots/command-center.png",
    imageAlt: "OASIS Command Center showing urgent items, overdue balance, and action queues.",
  },
  problemSection: {
    eyebrow: "Why it matters",
    title: "Portfolio work gets slower when every morning starts with catch-up",
    body:
      "If the next action depends on memory, inbox triage, and separate trackers, important work gets delayed before the day even starts.",
    items: [
      {
        title: "Too many signals",
        body: "Overdue balances, stalled work, and tenant follow-up compete for attention without a clear starting point.",
      },
      {
        title: "Priority gets rebuilt manually",
        body: "Teams waste time deciding what matters first instead of acting on a visible queue.",
      },
      {
        title: "Important items get quietly missed",
        body: "Without a command view, operational risk hides in the gaps between pages and people.",
      },
    ],
  },
  solutionSection: {
    eyebrow: "What OASIS does",
    title: "One operating view for what should move next",
    body:
      "The Command Center keeps urgent actions, arrears pressure, maintenance drag, and broader portfolio priorities close enough to act on immediately.",
    items: [
      {
        title: "Urgent queues",
        body: "Surface the actions that need attention now instead of relying on ad hoc triage.",
      },
      {
        title: "Finance pressure in context",
        body: "See overdue balances and related follow-up as operating work, not just accounting afterthoughts.",
      },
      {
        title: "Maintenance follow-through",
        body: "Keep stalled work and maintenance pressure visible alongside the rest of the week's priorities.",
      },
    ],
    imageSrc: "/screenshots/command-center.png",
    imageAlt: "OASIS Command Center with urgent and needs-action queues.",
    imageAlign: "left" as const,
  },
  benefits: {
    title: "What landlords gain from a real command center",
    items: [
      {
        title: "Faster prioritization",
        body: "Know what to do first without rebuilding the same mental queue every day.",
      },
      {
        title: "Less dropped follow-up",
        body: "Keep overdue, stalled, and urgent work visible before it disappears into the noise.",
      },
      {
        title: "Calmer operating rhythm",
        body: "Start from one clear control surface instead of hopping between tools and memory.",
      },
      {
        title: "Stronger operator confidence",
        body: "The team can see the same priorities and act from the same operating picture.",
      },
    ],
  },
  finalCta: {
    title: "Make the next action obvious",
    body:
      "See how OASIS gives landlords a clearer command surface for urgent work, overdue balances, and follow-through.",
    primaryCta: { label: "Get Early Access", href: siteConfig.appUrl },
    secondaryCta: { label: "Explore Features", href: "/features" },
  },
};
