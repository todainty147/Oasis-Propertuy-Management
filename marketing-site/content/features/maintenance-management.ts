import { siteConfig } from "../site";

export const maintenanceManagementContent = {
  seo: {
    title: "Maintenance Management Software for Landlords | OASIS Rental",
    description:
      "Track maintenance requests, work orders, and repair progress in one place with OASIS maintenance management software for landlords.",
    canonical: "https://oasisrental.com/features/maintenance-management",
  },
  hero: {
    eyebrow: "Maintenance management",
    title: "Track maintenance requests and work orders without losing visibility",
    body:
      "OASIS helps landlords move maintenance from scattered messages and ad hoc follow-up into a clearer workflow for requests, work orders, contractors, and status tracking.",
  },
  painPoints: {
    eyebrow: "Landlord pain points",
    title: "Maintenance becomes chaotic when updates live in too many places",
    body:
      "Repairs are one of the fastest ways for rental operations to feel disorganized, especially when requests, assignments, and follow-ups are handled manually.",
    items: [
      {
        title: "Missed updates",
        body: "Requests can stall when there is no single workflow showing what has been raised, assigned, or completed.",
      },
      {
        title: "Slow response loops",
        body: "Landlords often lose time chasing tenants, contractors, and internal notes just to understand what is happening.",
      },
      {
        title: "Weak accountability",
        body: "Without clear statuses and ownership, it is harder to see which repairs are blocked, overdue, or waiting on action.",
      },
    ],
  },
  solution: {
    eyebrow: "How OASIS helps",
    title: "A maintenance workflow built for visibility and follow-through",
    body:
      "OASIS connects requests, work orders, and operational status so landlords can manage repairs with less guesswork and more control.",
    items: [
      {
        title: "Track requests from intake to resolution",
        body: "Keep maintenance requests visible from the first report through assignment, progress, and completion.",
      },
      {
        title: "Manage work orders in one flow",
        body: "Turn requests into structured work orders and keep contractor activity tied to the same record.",
      },
      {
        title: "See bottlenecks early",
        body: "Spot overdue actions, unassigned work, and stalled repairs before they become bigger tenant issues.",
      },
    ],
  },
  benefits: {
    title: "What landlords gain with better maintenance visibility",
    items: [
      {
        title: "Faster response times",
        body: "Reduce delays caused by fragmented communication and missing status context.",
      },
      {
        title: "Clearer contractor coordination",
        body: "Keep assignments, timelines, and updates easier to follow across each repair.",
      },
      {
        title: "Fewer overlooked issues",
        body: "Surface stalled requests before they turn into repeated complaints or bigger costs.",
      },
      {
        title: "More confidence in operations",
        body: "Run maintenance with a process that is easier to monitor and improve over time.",
      },
    ],
  },
  finalCta: {
    title: "See maintenance in one connected workflow",
    body:
      "Explore how OASIS helps landlords manage requests, work orders, and repair progress with more visibility.",
    primaryCta: { label: "View Pricing", href: "/pricing" },
    secondaryCta: { label: "Open the App", href: siteConfig.appUrl },
  },
};
