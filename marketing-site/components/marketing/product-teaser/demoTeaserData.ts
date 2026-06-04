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
    meta: "36 Ashton Rd - bathroom repair - evidence attached",
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
    title: "36 Ashton Rd",
    meta: "Arrears follow-up and bathroom repair need owner review",
    status: "Action",
    tone: "warn",
  },
  {
    title: "18 Brook Lane",
    meta: "Documents complete, no maintenance pressure this week",
    status: "Healthy",
    tone: "good",
  },
  {
    title: "9 Maple Court",
    meta: "Insurance renewal evidence due in 14 days",
    status: "Upcoming",
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
    key: "maintenance",
    eyebrow: "Maintenance",
    title: "Requests move with evidence",
    body:
      "Tenant reports, contractor updates, photos, quotes, and work-order notes stay connected so follow-up is easier to review.",
    metrics: [
      { label: "Open requests", value: "4", tone: "warn", detail: "2 assigned" },
      { label: "Contractor updates", value: "3", tone: "good", detail: "this week" },
      { label: "Evidence attached", value: "9", tone: "neutral", detail: "photos and files" },
    ],
    queue: [
      {
        title: "Leak under kitchen sink",
        meta: "Tenant photos attached - plumber quote awaiting review",
        status: "Quote",
        tone: "warn",
      },
      {
        title: "Boiler service complete",
        meta: "Contractor invoice and certificate stored",
        status: "Done",
        tone: "good",
      },
    ],
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
