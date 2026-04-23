import { siteConfig } from "./site";

export const pricingContent = {
  seo: {
    title: "OASIS Rental Pricing | Plans for Landlords",
    description:
      "Choose the OASIS plan that matches your portfolio maturity, operating complexity, and need for stronger follow-through.",
    canonical: "https://oasisrental.com/pricing",
  },
  hero: {
    eyebrow: "Pricing",
    title: "Choose the plan that matches how your portfolio runs",
    body:
      "Start by moving off spreadsheets. Upgrade when arrears, repairs, and missed follow-up start costing more than the software ever will.",
    imageSrc: "/screenshots/command-center.png",
    imageAlt: "OASIS Command Center showing urgent queues, overdue balance, and action items across the portfolio.",
  },
  intro: {
    title: "Pricing is based on operating maturity, not vague feature bundles",
    body:
      "Starter is for getting the rental operation organized. Growth is for landlords who need stronger operational control across a busier portfolio. Pro is for operators who want deeper review surfaces, playbooks, and more deliberate follow-through.",
    imageSrc: "/screenshots/portfolio-health.png",
    imageAlt: "OASIS Portfolio Health dashboard showing occupancy, arrears aging, and maintenance pressure.",
  },
  plans: [
    {
      name: "Starter",
      price: "Move off spreadsheets",
      description:
        "For landlords who want the essential rental workflow in one place before admin, arrears follow-up, and repair tracking spread across folders and message threads.",
      bullets: [
        "bring tenants, properties, and core records into one place",
        "see paid, due, and overdue rent",
        "capture maintenance requests and work orders",
        "reduce the weekly spreadsheet rebuild and missed follow-up",
      ],
    },
    {
      name: "Growth",
      price: "Control a busier portfolio",
      description:
        "For landlords whose work has moved from basic record-keeping to active follow-up across rent, repairs, and property pressure.",
      bullets: [
        "everything in Starter",
        "command-centre queues for urgent work",
        "portfolio health, arrears, and maintenance pressure views",
        "faster prioritization when multiple issues compete",
        "better protection against missed follow-up",
      ],
      highlight: true,
      tag: "Best fit for busy landlords",
    },
    {
      name: "Pro",
      price: "Operate with deeper follow-through",
      description:
        "For serious operators who want stronger oversight, review routines, and operating discipline as the portfolio becomes harder to manage casually.",
      bullets: [
        "full OASIS operating access",
        "security audit and operational trust surfaces",
        "playbook and root telemetry views",
        "deeper review for demanding landlord workflows",
      ],
    },
  ],
  included: {
    title: "Every plan helps landlords reduce avoidable admin",
    bullets: [
      "A clearer place to stay on top of tenants, properties, and rental context",
      "Rent status views for paid, due, and overdue balances",
      "Maintenance request and work order workflows",
      "Document storage tied to the rental work it supports",
      "Landlord dashboards that make arrears and follow-up easier to prioritize",
    ],
  },
  faqs: [
    {
      question: "Which plan should I start with?",
      answer:
        "Start with Starter if the main goal is getting off spreadsheets and disconnected trackers. Choose Growth if you already have enough rent, repair, and property activity that deciding what to do first is the harder problem. Choose Pro when you want deeper review, operational trust, and more disciplined follow-through.",
    },
    {
      question: "Why would I move from Starter to Growth?",
      answer:
        "Growth is for the moment when basic organization is not enough. It adds stronger portfolio attention through command-centre style queues, portfolio health, arrears pressure, and maintenance pressure views so missed follow-up is easier to catch.",
    },
    {
      question: "What makes Pro different?",
      answer:
        "Pro is for landlords who want more than day-to-day tracking. It is aimed at deeper oversight through security audit, operational trust, playbook, and telemetry surfaces where stronger review matters.",
    },
    {
      question: "Does every plan still cover the core rental workflow?",
      answer:
        "Yes. OASIS keeps the core workflow focused on tenants, properties, rent status, maintenance, and records. The higher tiers add more control and review depth as operating complexity grows.",
    },
    {
      question: "Does OASIS process tenant rent payments online today?",
      answer:
        "Not as a native OASIS tenant payment rail. Today OASIS supports landlord-configured payment setup in the tenant portal, including accepted methods, external payment portal links, support details, and autopay guidance. The finance workflow is still centered on rent visibility, arrears pressure, and follow-up rather than an in-app pay-now checkout flow.",
    },
    {
      question: "Is OASIS priced for landlords rather than agencies?",
      answer:
        "Yes. The plans are framed around small to growing landlords who need practical control without adopting a bloated agency platform.",
    },
  ],
  finalCta: {
    title: "Try OASIS before we launch publicly",
    body:
      "Get early access, test the workflows, and help shape how OASIS supports landlords as it evolves.",
    primaryCta: { label: "Get Early Access", href: siteConfig.appUrl },
  },
};
