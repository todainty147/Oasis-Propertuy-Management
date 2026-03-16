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
      "OASIS gives landlords finance views built around rental operations, helping you understand income status, overdue balances, and where action is needed across the portfolio.",
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
  },
  solution: {
    eyebrow: "How OASIS helps",
    title: "Finance visibility designed around rental operations, not generic bookkeeping",
    body:
      "OASIS helps landlords see the rental numbers that matter most day to day, with finance views connected to tenants, properties, and payment status.",
    items: [
      {
        title: "See payment status clearly",
        body: "Track paid, due, and overdue income in a format that matches how rental portfolios are actually managed.",
      },
      {
        title: "Follow issues faster",
        body: "Identify overdue balances and focus follow-up where it will have the most operational impact.",
      },
      {
        title: "Connect finance to the wider workflow",
        body: "Keep rent visibility tied to tenant and property context instead of isolated from the rest of the system.",
      },
    ],
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
        body: "Know where overdue balances sit and where action is needed most urgently.",
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
      "See how OASIS helps landlords track rental income, overdue balances, and payment status in one place.",
    primaryCta: { label: "View Pricing", href: "/pricing" },
    secondaryCta: { label: "Open the App", href: siteConfig.appUrl },
  },
};
