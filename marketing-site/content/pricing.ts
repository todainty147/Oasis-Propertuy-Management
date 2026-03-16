import { siteConfig } from "./site";

export const pricingContent = {
  seo: {
    title: "OASIS Rental Pricing | Plans for Landlords",
    description:
      "Choose an OASIS Rental plan based on your portfolio size and manage tenants, maintenance, finances, and documents in one platform.",
    canonical: "https://oasisrental.com/pricing",
  },
  hero: {
    eyebrow: "Pricing",
    title: "Pricing That Scales with Your Portfolio",
    body:
      "Start with the plan that fits your current rental portfolio and move up as your operations grow. OASIS is built to help landlords stay organized without paying for bloated enterprise software.",
  },
  intro: {
    title: "Choose the plan that matches how you manage rentals today",
    body:
      "Whether you are running a smaller portfolio or growing into a more operational setup, OASIS gives you the same core platform for tenants, maintenance, finances, and documents.",
  },
  plans: [
    {
      name: "Starter",
      price: "Simple start",
      description:
        "Best for landlords managing a smaller portfolio who want a more structured system without unnecessary complexity.",
      bullets: [
        "manage tenants and properties",
        "track rent and overdue payments",
        "organize documents",
        "handle maintenance in one workflow",
      ],
    },
    {
      name: "Growth",
      price: "Built to grow",
      description:
        "Best for growing landlords who need stronger operational visibility across more properties, tenants, and maintenance activity.",
      bullets: [
        "everything in Starter",
        "better portfolio oversight",
        "more active operational workflows",
        "built for scaling rental admin",
      ],
      highlight: true,
      tag: "Best fit for growing portfolios",
    },
    {
      name: "Pro",
      price: "For serious operators",
      description:
        "Best for larger or fast-growing portfolios that need OASIS as the operational system for day-to-day rental management.",
      bullets: [
        "full platform access",
        "unlimited operational visibility",
        "designed for serious portfolio growth",
        "ideal for more demanding landlord workflows",
      ],
    },
  ],
  included: {
    title: "What every plan includes",
    bullets: [
      "tenant and property management",
      "maintenance request and work order workflows",
      "rental finance visibility",
      "document storage and organization",
      "landlord-focused dashboards",
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
        "Yes. The platform is built around connected rental operations, so tenants, maintenance, finances, and documents remain part of the core experience.",
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
      "Choose the plan that fits your portfolio now and move up when your operations need more scale.",
    primaryCta: { label: "Start with OASIS", href: siteConfig.appUrl },
  },
};
