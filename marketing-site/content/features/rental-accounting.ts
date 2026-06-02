import { siteConfig } from "../site";

export const rentalAccountingContent = {
  seo: {
    title: "Rental Accounting Software for Landlords | Tenaqo",
    description:
      "Track rent status, overdue balances, arrears pressure, and follow-up priority without rebuilding spreadsheets.",
    canonical: "https://marketing.oasisrentalmgt.app/features/rental-accounting",
  },
  hero: {
    eyebrow: "Rental accounting",
    title: "See paid, due, and overdue rent before follow-up slips",
    body:
      "Tenaqo gives landlords finance views built around follow-up: what is paid, what is due, what is overdue, and which properties are starting to show pressure. It does not collect rent, move money, or operate as a payment rail, and is designed for future Open Banking rent matching.",
    imageSrc: "/screenshots/portfolio-health.png",
    imageAlt: "Tenaqo Portfolio Health dashboard showing arrears aging, finance mix, and maintenance pressure.",
  },
  painPoints: {
    eyebrow: "Landlord pain points",
    title: "Rental finance gets harder when every number has to be rebuilt",
    body:
      "Many landlords can see the numbers eventually, but only after too much checking, reconciling, and digging through separate records.",
    items: [
      {
        title: "Hard-to-read cash position",
        body: "It takes too long to confirm what has been paid, what is due soon, and what is already overdue.",
      },
      {
        title: "Unclear follow-up priority",
        body: "Without a clean payment picture, it is harder to see which tenants or properties need attention first.",
      },
      {
        title: "Too much manual rebuilding",
        body: "Landlords often rely on spreadsheets and notes to build the same arrears and cash-position summary over and over again.",
      },
    ],
    imageSrc: "/screenshots/property-performance.png",
    imageAlt: "Tenaqo property performance view showing rent, remaining balance, and operational health.",
  },
  solution: {
    eyebrow: "How Tenaqo helps",
    title: "Rent tracking shaped around arrears visibility and earlier intervention",
    body:
      "Tenaqo helps landlords see the rental numbers that matter day to day, with payment status tied to tenant context, property context, and the wider portfolio pressure building around them.",
    items: [
      {
        title: "See payment status clearly",
        body: "Track paid, due, and overdue income in a format that matches daily landlord decisions.",
      },
      {
        title: "Publish payment setup to the tenant portal",
        body: "Show accepted methods, external portal links, support contact details, and autopay guidance without pretending Tenaqo is already the processor.",
      },
      {
        title: "Prioritize follow-up faster",
        body: "Identify overdue balances, due-soon pressure, and focus follow-up where it will have the most operational impact.",
      },
      {
        title: "Keep rent tied to property pressure",
        body: "Keep payment status close to tenant and property details instead of isolating the numbers from the wider operational picture.",
      },
      {
        title: "Prepare deposit settlement evidence",
        body: "Create itemised deposit deduction statements linked to inspection evidence, maintenance records, invoices, and landlord review notes.",
      },
      {
        title: "Catch arrears pressure earlier",
        body: "Use portfolio and property health views to see when overdue balances are starting to drag on the rest of the portfolio.",
      },
    ],
    imageSrc: "/screenshots/payment-setup.png",
    imageAlt: "Tenaqo Finance page showing tenant payment setup readiness, accepted methods, and external portal guidance.",
    imageAlign: "left" as const,
  },
  benefits: {
    title: "What landlords gain when arrears are easier to read",
    items: [
      {
        title: "Cleaner oversight",
        body: "Understand portfolio income status faster without rebuilding the same reports manually.",
      },
      {
        title: "Better follow-up decisions",
        body: "Know where overdue balances sit and where action is needed most urgently before those issues spread into the rest of the portfolio.",
      },
      {
        title: "Less spreadsheet dependency",
        body: "Move away from disconnected trackers toward a more usable operating view.",
      },
      {
        title: "Clearer tenant payment guidance",
        body: "Give tenants a consistent payment setup view with methods, support, and portal instructions tied to the account.",
      },
      {
        title: "Stronger confidence in the risk picture",
        body: "Review rental income with the context landlords need to act early, stay organized, and understand which properties need attention.",
      },
    ],
  },
  finalCta: {
    title: "Get a clearer rent picture across your portfolio",
    body:
      "See how Tenaqo helps landlords track income, overdue balances, payment status, and arrears pressure from one operating view.",
    primaryCta: { label: "Get Early Access", href: siteConfig.appUrl },
    secondaryCta: { label: "View Pricing", href: "/pricing" },
  },
};
