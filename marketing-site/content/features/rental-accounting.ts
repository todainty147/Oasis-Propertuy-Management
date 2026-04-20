import { siteConfig } from "../site";

export const rentalAccountingContent = {
  seo: {
    title: "Rental Accounting Software for Landlords | OASIS Rental",
    description:
      "Track rent status, overdue balances, and portfolio payment pressure without rebuilding spreadsheets.",
    canonical: "https://oasisrental.com/features/rental-accounting",
  },
  hero: {
    eyebrow: "Rental accounting",
    title: "See paid, due, and overdue rent without rebuilding spreadsheets",
    body:
      "OASIS gives landlords finance views built around follow-up: what is paid, what is due, what is overdue, and where pressure is building.",
    imageSrc: "/screenshots/portfolio-health.png",
    imageAlt: "OASIS Portfolio Health dashboard showing arrears aging, finance mix, and maintenance pressure.",
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
        title: "Too much manual reporting",
        body: "Landlords often rely on spreadsheets and notes to build the same summary over and over again.",
      },
    ],
    imageSrc: "/screenshots/property-performance.png",
    imageAlt: "OASIS property performance view showing rent, remaining balance, and operational health.",
  },
  solution: {
    eyebrow: "How OASIS helps",
    title: "Rent tracking shaped around landlord follow-up",
    body:
      "OASIS helps landlords see the rental numbers that matter day to day, with payment status tied to tenant and property context.",
    items: [
      {
        title: "See payment status clearly",
        body: "Track paid, due, and overdue income in a format that matches daily landlord decisions.",
      },
      {
        title: "Follow issues faster",
        body: "Identify overdue balances, due-soon pressure, and focus follow-up where it will have the most operational impact.",
      },
      {
        title: "Keep rent tied to context",
        body: "Keep payment status close to tenant and property details instead of isolated in a separate tracker.",
      },
    ],
    imageSrc: "/screenshots/command-center.png",
    imageAlt: "OASIS Command Center showing overdue balance and finance-driven action queues.",
    imageAlign: "left" as const,
  },
  benefits: {
    title: "What landlords gain when rent status is easier to read",
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
    title: "Get a clearer rent picture across your portfolio",
    body:
      "See how OASIS helps landlords track income, overdue balances, payment status, and rent pressure from one operating view.",
    primaryCta: { label: "View Pricing", href: "/pricing" },
    secondaryCta: { label: "Get Early Access", href: siteConfig.appUrl },
  },
};
