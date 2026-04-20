import { siteConfig } from "../site";

export const maintenanceManagementContent = {
  seo: {
    title: "Maintenance Management Software for Landlords | OASIS Rental",
    description:
      "Move repair requests into tracked work orders, clear ownership, and cleaner follow-through with OASIS.",
    canonical: "https://oasisrental.com/features/maintenance-management",
  },
  hero: {
    eyebrow: "Maintenance management",
    title: "Keep repair requests moving after the first message",
    body:
      "OASIS helps landlords turn repair messages into tracked requests, work orders, contractor updates, and status signals that are easier to act on.",
    imageSrc: "/screenshots/maintenance-inbox.png",
    imageAlt: "OASIS Maintenance Inbox showing request status columns, SLA age, and linked work orders.",
  },
  painPoints: {
    eyebrow: "Landlord pain points",
    title: "Maintenance gets expensive when the next step is unclear",
    body:
      "Repairs create noise fast when every update lives in a different thread and no one has a reliable path from request to completion.",
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
    imageSrc: "/screenshots/property-requests.png",
    imageAlt: "OASIS property request view showing service requests and linked work-order actions.",
  },
  solution: {
    eyebrow: "How OASIS helps",
    title: "A maintenance workflow built for ownership and follow-through",
    body:
      "OASIS keeps requests, work orders, contractor activity, and status changes tied to the same repair story.",
    items: [
      {
        title: "Track requests from intake to resolution",
        body: "Follow maintenance requests from the first report through assignment, progress, and completion.",
      },
      {
        title: "Manage work orders in one flow",
        body: "Turn requests into structured work orders and keep contractor activity tied to the same record.",
      },
      {
        title: "See bottlenecks early",
        body: "Spot overdue actions, unassigned work, stalled repairs, and slow response loops before they become bigger tenant issues.",
      },
    ],
    imageSrc: "/screenshots/command-center.png",
    imageAlt: "OASIS Command Center showing urgent maintenance and action queues.",
    imageAlign: "left" as const,
  },
  benefits: {
    title: "What landlords gain when repairs have a workflow",
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
        body: "Surface stalled requests before they turn into repeated complaints, contractor churn, or bigger costs.",
      },
      {
        title: "More confidence in operations",
        body: "Run maintenance with a process that is easier to monitor, improve, and stay ahead of over time.",
      },
    ],
  },
  finalCta: {
    title: "Put every repair into a clearer workflow",
    body:
      "Explore how OASIS helps landlords move from request to work order to completion with fewer blind spots.",
    primaryCta: { label: "View Pricing", href: "/pricing" },
    secondaryCta: { label: "Open the App", href: siteConfig.appUrl },
  },
};
