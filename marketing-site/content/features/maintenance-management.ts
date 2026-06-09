import { siteConfig } from "../site";

export const maintenanceManagementContent = {
  seo: {
    title: "Maintenance Management Software for Landlords | Tenaqo",
    description:
      "Move repair requests into tracked work orders, clear ownership, and cleaner follow-through with Tenaqo.",
    canonical: "https://marketing.oasisrentalmgt.app/features/maintenance-management",
  },
  hero: {
    eyebrow: "Maintenance management",
    title: "Move every repair from report to quote to completion",
    body:
      "Tenaqo helps landlords turn repair messages into tracked requests, work orders, contractor updates, quote decisions, AI triage guidance, and completion trails that are easier to run.",
    imageSrc: "/screenshots/maintenance-inbox.png",
    imageAlt: "Tenaqo Maintenance Inbox showing request status columns, AI triage guidance, SLA age, and linked work orders.",
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
    imageAlt: "Tenaqo property request view showing service requests and linked work-order actions.",
  },
  solution: {
    eyebrow: "How Tenaqo helps",
    title: "A maintenance workflow built for ownership, handoff, and follow-through",
    body:
      "Tenaqo keeps requests, work orders, contractor activity, quote decisions, AI triage recommendations, and status changes tied to the same repair story.",
    items: [
      {
        title: "Track requests from intake to completion",
        body: "Follow the repair from the first tenant report through assignment, contractor progress, and resolution.",
      },
      {
        title: "Use AI for the first read, not the final decision",
        body: "Triage suggestions recommend urgency, likely trade, tenant acknowledgement, and a manager note, while the landlord still confirms the action.",
      },
      {
        title: "Keep the handoff in one flow",
        body: "Turn requests into structured work orders and keep contractor activity tied to the same record instead of splitting the story across calls and messages.",
      },
      {
        title: "Make quote approval easier",
        body: "When a contractor submits the next step, landlords can review and approve it with the job context already in front of them.",
      },
      {
        title: "Build your trusted contractor list",
        body: "Invite your own contractors, request quotes, track work orders, and rate completed jobs. Tenaqo helps you surface preferred suppliers when new maintenance issues come in, so you can act faster with people you already trust.",
      },
      {
        title: "See bottlenecks early",
        body: "Spot overdue actions, unassigned work, stalled repairs, and slow response loops before they become bigger tenant issues.",
      },
    ],
    imageSrc: "/screenshots/maintenance-inbox.png",
    imageAlt: "Tenaqo maintenance workflow showing requests, AI triage, work orders, and contractor coordination in one place.",
    imageAlign: "left" as const,
  },
  workflowLoop: {
    eyebrow: "The coordination loop",
    title: "The handoff is where maintenance usually breaks",
    body:
      "Most tools can record a repair. The harder part is keeping the handoff clear between tenant, landlord, contractor, and completion. Tenaqo is built around that loop.",
    items: [
      {
        title: "Tenant reports the issue",
        body: "The repair starts with the right property context instead of a message you have to translate into a task later.",
      },
      {
        title: "Landlord triages and assigns",
        body: "The request gets an AI-assisted first pass, then becomes a work order with clear ownership, timing, and the right contractor attached to the same record.",
      },
      {
        title: "Contractor updates progress and submits the next step",
        body: "Progress, notes, and quote activity stay tied to the job so nobody needs a separate thread to understand what changed.",
      },
      {
        title: "Approval and completion stay traceable",
        body: "The next decision is visible in context, contractor recommendations can be surfaced in the workflow, and the completion trail is already there when the work is done.",
      },
    ],
    imageSrc: "/screenshots/property-requests.png",
    imageAlt: "Tenaqo property request workflow showing tenant-reported issues and linked operational follow-up.",
  },
  benefits: {
    title: "What landlords gain when repairs have a real workflow",
    items: [
      {
        title: "Faster response times",
        body: "Reduce delays caused by fragmented communication and missing status context.",
      },
      {
        title: "Clearer contractor coordination",
        body: "Keep assignments, timelines, updates, quote decisions, and preferred suppliers easier to follow across each repair.",
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
    title: "Put every repair into a clearer coordination loop",
    body:
      "Explore how Tenaqo helps landlords move from request to work order to quote decision to completion with fewer blind spots.",
    primaryCta: { label: "Get Early Access", href: siteConfig.appUrl },
    secondaryCta: { label: "View Pricing", href: "/pricing" },
  },
};
