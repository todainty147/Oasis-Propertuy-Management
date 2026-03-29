import { siteConfig } from "../site";

export const rentalAccountingContent = {
  seo: {
    title: "Rental Accounting Software for Landlords | OASIS Rental",
    description:
      "Track rental income, overdue payments, and portfolio finance visibility with OASIS rental accounting software for landlords.",
    canonical: "https://oasisrental.com/features/rental-accounting",
  },
  hero: {
    eyebrow: "Rental accounting",
    title: "Track paid, due, and overdue rent with clearer portfolio visibility",
    body:
      "OASIS gives landlords finance views built around rental operations, helping you understand income status, overdue balances, and where action is needed across the portfolio before follow-up starts slipping.",
    imageSrc: "/screenshots/portfolio-health.png",
    imageAlt: "OASIS Portfolio Health dashboard showing arrears aging, finance mix, and maintenance pressure.",
  },
  painPoints: {
    eyebrow: "Landlord pain points",
    title: "Rental finance gets harder when records are spread across manual trackers",
    body:
      "Many landlords can see the numbers eventually, but only after too much checking, reconciling, and digging through separate records.",
    items: [
      {
        title: "Unclear cash position",
        body: "It takes too long to confirm what has been paid, what is due soon, and what is already overdue.",
      },
      {
        title: "Weak portfolio visibility",
        body: "Without one financial view, it is harder to see which tenants or properties need immediate attention.",
      },
      {
        title: "Too much manual reporting",
        body: "Landlords often rely on spreadsheets and notes to build the same summary over and over again.",
      },
    ],
    imageSrc: "/screenshots/property-performance.png",
    imageAlt: "OASIS property performance view showing rent, remaining balance, and operational health.",
  },
  solution: {
    eyebrow: "How OASIS helps",
    title: "Finance visibility designed around rental operations, not generic bookkeeping",
    body:
      "OASIS helps landlords see the rental numbers that matter most day to day, with finance views connected to tenants, properties, payment status, and operational follow-up.",
    items: [
      {
        title: "See payment status clearly",
        body: "Track paid, due, and overdue income in a format that matches how rental portfolios are actually managed.",
      },
      {
        title: "Follow issues faster",
        body: "Identify overdue balances, due-soon pressure, and focus follow-up where it will have the most operational impact.",
      },
      {
        title: "Connect finance to the wider workflow",
        body: "Keep rent visibility tied to tenant and property context instead of isolated from the rest of the system.",
      },
    ],
    imageSrc: "/screenshots/command-center.png",
    imageAlt: "OASIS Command Center showing overdue balance and finance-driven action queues.",
    imageAlign: "left" as const,
  },
  benefits: {
    title: "What landlords gain with better rental accounting visibility",
    items: [
      {
        title: "Cleaner oversight",
        body: "Understand portfolio income status faster without rebuilding the same reports manually.",
      },
      {
        title: "Better follow-up decisions",
        body: "Know where overdue balances sit and where action is needed most urgently, before those issues spread into the rest of the portfolio.",
      },
      {
        title: "Less spreadsheet dependency",
        body: "Move away from disconnected trackers toward a more usable operating view.",
      },
      {
        title: "Stronger confidence in the numbers",
        body: "Review rental income with the context landlords need to act quickly and stay organized.",
      },
    ],
  },
  finalCta: {
    title: "Get clearer rental finance visibility across your portfolio",
    body:
      "See how OASIS helps landlords track rental income, overdue balances, payment status, and finance pressure in one place.",
    primaryCta: { label: "View Pricing", href: "/pricing" },
    secondaryCta: { label: "Open the App", href: siteConfig.appUrl },
  },
};
