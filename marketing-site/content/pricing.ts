import { siteConfig } from "./site";

export const pricingContent = {
  seo: {
    title: "OASIS Rental Pricing | Plans for Landlords",
    description:
      "Choose the OASIS plan that matches how much control your rental portfolio needs today.",
    canonical: "https://oasisrental.com/pricing",
  },
  hero: {
    eyebrow: "Pricing",
    title: "Start with the level of control your portfolio needs",
    body:
      "Every plan is built for landlords moving away from scattered admin. The difference is how much portfolio oversight, automation, and operational depth you need as the work grows.",
    imageSrc: "/screenshots/command-center.png",
    imageAlt: "OASIS Command Center showing urgent queues, overdue balance, and action items across the portfolio.",
  },
  intro: {
    title: "Plans are shaped around operating complexity, not vanity feature counts",
    body:
      "Starter helps you get organized. Growth adds stronger oversight for busier portfolios. Pro is for landlords who want the full control layer for audits, playbooks, and root-level operating signals.",
    imageSrc: "/screenshots/portfolio-health.png",
    imageAlt: "OASIS Portfolio Health dashboard showing occupancy, arrears aging, and maintenance pressure.",
  },
  plans: [
    {
      name: "Starter",
      price: "Simple start",
      description:
        "For landlords who need the essentials organized before admin spreads across spreadsheets and inboxes.",
      bullets: [
        "organize tenants and properties",
        "track rent status and overdue payments",
        "store the records each property needs",
        "manage maintenance requests and work orders",
      ],
    },
    {
      name: "Growth",
      price: "Built to grow",
      description:
        "For growing portfolios where the question becomes what needs attention first.",
      bullets: [
        "everything in Starter",
        "portfolio health and command-centre views",
        "clearer attention queues",
        "stronger maintenance and arrears oversight",
        "built for more active follow-up",
      ],
      highlight: true,
      tag: "Best fit for growing portfolios",
    },
    {
      name: "Pro",
      price: "For serious operators",
      description:
        "For landlords who want deeper controls around operations, security review, playbooks, and growth.",
      bullets: [
        "full platform access",
        "security audit and operational trust tools",
        "playbook and root telemetry surfaces",
        "built for demanding landlord workflows",
      ],
    },
  ],
  included: {
    title: "What every plan includes",
    bullets: [
      "tenant and property organization",
      "maintenance request and work order tracking",
      "rent status and overdue payment tracking",
      "document storage tied to rental context",
      "landlord dashboards for day-to-day control",
    ],
  },
  faqs: [
    {
      question: "Can I start small and upgrade later?",
      answer:
        "Yes. OASIS is designed so landlords can start with the plan that fits today and move up as the portfolio grows.",
    },
    {
      question: "Does every plan include maintenance and finance workflows?",
      answer:
        "Yes. Rent tracking, maintenance workflow, tenant records, and documents are part of the core OASIS experience. Higher plans add more oversight and control.",
    },
    {
      question: "Is OASIS built for landlords rather than generic property admin?",
      answer:
        "Yes. OASIS is positioned around practical landlord operations, not bloated enterprise workflows.",
    },
  ],
  finalCta: {
    title: "Start with OASIS and upgrade as you grow",
    body:
      "Pick the plan that matches today. Move up when the portfolio needs more oversight, stronger queues, and deeper control.",
    primaryCta: { label: "Start with OASIS", href: siteConfig.appUrl },
  },
};
