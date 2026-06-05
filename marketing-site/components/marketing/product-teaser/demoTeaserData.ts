export type TeaserMetric = {
  label: string;
  value: string;
  tone?: "neutral" | "good" | "warn" | "danger";
  detail?: string;
};

export type TeaserQueueItem = {
  title: string;
  meta: string;
  status: string;
  tone?: "neutral" | "good" | "warn" | "danger";
};

export type WalkthroughScene = {
  key: string;
  eyebrow: string;
  title: string;
  body: string;
  metrics: TeaserMetric[];
  queue: TeaserQueueItem[];
};

export const commandCenterMetrics: TeaserMetric[] = [
  { label: "Rent visible", value: "£7.8k", tone: "good", detail: "tracked this month" },
  { label: "Needs review", value: "5", tone: "warn", detail: "landlord approval" },
  { label: "Overdue", value: "£650", tone: "danger", detail: "follow-up queue" },
];

export const commandCenterQueue: TeaserQueueItem[] = [
  {
    title: "Approve contractor quote",
    meta: "Bishopston House - bathroom repair - evidence attached",
    status: "Approval",
    tone: "warn",
  },
  {
    title: "Rent follow-up ready",
    meta: "12 days overdue - tenant note and ledger visible",
    status: "Review",
    tone: "danger",
  },
  {
    title: "Tenant document received",
    meta: "Right-to-rent file added to the evidence trail",
    status: "Stored",
    tone: "good",
  },
  {
    title: "EPC certificate due",
    meta: "Portfolio Health has queued a renewal task",
    status: "Next",
    tone: "neutral",
  },
];

export const portfolioHealthMetrics: TeaserMetric[] = [
  { label: "Portfolio health", value: "82", tone: "good", detail: "stable" },
  { label: "Maintenance pressure", value: "Medium", tone: "warn", detail: "2 open jobs" },
  { label: "Compliance gaps", value: "1", tone: "danger", detail: "certificate due" },
  { label: "Rent visibility", value: "96%", tone: "good", detail: "expected charges mapped" },
];

export const portfolioHealthQueue: TeaserQueueItem[] = [
  {
    title: "Bishopston House",
    meta: "Arrears follow-up and bathroom repair need owner review",
    status: "Action",
    tone: "warn",
  },
  {
    title: "Harbourside Apartment",
    meta: "Documents complete, no maintenance pressure this week",
    status: "Healthy",
    tone: "good",
  },
  {
    title: "Flat 4, Clifton",
    meta: "Insurance renewal evidence due in 14 days",
    status: "Upcoming",
    tone: "neutral",
  },
];

export const tenantPortalMetrics: TeaserMetric[] = [
  { label: "Rent status", value: "Up to date", tone: "good", detail: "next due 1 July" },
  { label: "Open issue", value: "1", tone: "warn", detail: "contractor update" },
  { label: "Shared docs", value: "6", tone: "neutral", detail: "available to view" },
];

export const tenantPortalQueue: TeaserQueueItem[] = [
  {
    title: "Boiler repair update",
    meta: "Contractor visit booked for Tuesday morning",
    status: "Scheduled",
    tone: "warn",
  },
  {
    title: "Rent payment visible",
    meta: "June rent marked received by the property team",
    status: "Seen",
    tone: "good",
  },
  {
    title: "Gas safety certificate",
    meta: "Shared document available in the tenant portal",
    status: "Document",
    tone: "neutral",
  },
];

export const walkthroughScenes: WalkthroughScene[] = [
  {
    key: "command-center",
    eyebrow: "Command Center",
    title: "One operating queue for the day",
    body:
      "Rent visibility, maintenance follow-through, documents, tenants, contractors, and approvals sit in one landlord-controlled queue.",
    metrics: commandCenterMetrics,
    queue: commandCenterQueue.slice(0, 3),
  },
  {
    key: "portfolio-health",
    eyebrow: "Portfolio Health",
    title: "See pressure before it spreads",
    body:
      "Portfolio Health brings arrears, maintenance load, compliance gaps, and document readiness into a calmer review surface.",
    metrics: portfolioHealthMetrics,
    queue: portfolioHealthQueue,
  },
  {
    key: "tenant-portal",
    eyebrow: "Tenant Portal",
    title: "A calmer tenant-facing space",
    body:
      "Tenants can follow repairs, check payment visibility, and access shared documents in a simpler property-facing view.",
    metrics: tenantPortalMetrics,
    queue: tenantPortalQueue,
  },
  {
    key: "documents",
    eyebrow: "Documents and compliance",
    title: "Keep the evidence trail close",
    body:
      "Document requests, agreement packets, deposit evidence, and compliance records stay visible for landlord review and audit trails.",
    metrics: [
      { label: "Files organised", value: "48", tone: "good", detail: "across portfolio" },
      { label: "Tenant requests", value: "2", tone: "warn", detail: "awaiting upload" },
      { label: "Evidence packs", value: "3", tone: "neutral", detail: "prepared" },
    ],
    queue: [
      {
        title: "Deposit evidence pack",
        meta: "Photos, deductions, and settlement notes connected",
        status: "Ready",
        tone: "good",
      },
      {
        title: "Agreement packet review",
        meta: "Clause flagging prepared for landlord review",
        status: "Review",
        tone: "warn",
      },
    ],
  },
];
