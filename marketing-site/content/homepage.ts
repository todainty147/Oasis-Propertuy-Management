import type { Locale } from "../lib/i18n";

import { siteConfig } from "./site";

type TrustBadge = { label: string };
type TestimonialItem = { quote: string; name: string; context: string };
type FeatureItem = { title: string; body: string };
type ComparisonRow = { feature: string; oasis: string; agent: string };

type HomePageContent = {
  seo: {
    title: string;
    description: string;
    canonicalPath: string;
  };
  hero: {
    eyebrow: string;
    title: string;
    body: string;
    emphasis: string;
    support: string;
    highlights: Array<{ label: string; href?: string }>;
    microcopy: string[];
    imageSrc: string;
    imageAlt: string;
    primaryCta: { label: string; href: string };
    secondaryCta: { label: string; href: string };
  };
  // Conversion sections — optional so PL/DE can omit until translated
  trustBar?: {
    title: string;
    body: string;
    badges: TrustBadge[];
    disclaimer: string;
  };
  testimonials?: {
    title: string;
    disclaimer: string;
    items: TestimonialItem[];
  };
  seoFeatureSection?: {
    title: string;
    body: string;
    features: FeatureItem[];
  };
  rentalYieldSection?: {
    title: string;
    body: string;
    bullets: string[];
  };
  passiveLandlordSection?: {
    title: string;
    body: string;
    cta: { label: string; href: string };
  };
  agentComparison?: {
    title: string;
    body: string;
    rows: ComparisonRow[];
    disclaimer: string;
    cta: { label: string; href: string };
  };
  appTease?: {
    eyebrow: string;
    title: string;
    body: string;
  };
  problemSection: {
    eyebrow: string;
    title: string;
    body: string;
    items: Array<{ title: string; body: string }>;
  };
  solutionSection: {
    title: string;
    body: string;
    items: Array<{ title: string; body: string }>;
  };
  productPreview: {
    title: string;
    body: string;
    items: Array<{
      label: string;
      title: string;
      body: string;
      points: string[];
      imageSrc: string;
      imageAlt: string;
    }>;
    featuresHref?: string;
  };
  healthSection: {
    eyebrow: string;
    title: string;
    body: string;
    items: Array<{ title: string; body: string }>;
    imageSrc: string;
    imageAlt: string;
    imageAlign: "left" | "right";
  };
  tenantPortalSection: {
    eyebrow: string;
    title: string;
    body: string;
    items: Array<{ title: string; body: string }>;
    imageSrc: string;
    imageAlt: string;
    primaryCta: { label: string; href: string };
    secondaryCta: { label: string; href: string };
  };
  workflowSection: {
    title: string;
    body: string;
    itemCtaLabel: string;
    items: Array<{
      label: string;
      title: string;
      body: string;
      href: string;
      points: string[];
      imageSrc: string;
      imageAlt: string;
    }>;
  };
  securitySection: {
    eyebrow: string;
    title: string;
    body: string;
    items: Array<{ title: string; body: string }>;
    imageSrc: string;
    imageAlt: string;
  };
  finalCta: {
    title: string;
    body: string;
    primaryCta: { label: string; href: string };
    secondaryCta: { label: string; href: string };
  };
};

export const homepageContentByLocale: Record<Locale, HomePageContent> = {
  en: {
    seo: {
      title: "Tenaqo | Rental Operations Software for Landlords",
      description:
        "Tenaqo helps landlords manage rent, maintenance, tenants, documents, compliance readiness, and AI-assisted action queues from one rental operations dashboard.",
      canonicalPath: "/",
    },
    hero: {
      eyebrow: "Automated property management software for landlords",
      title: "Less landlord stress. More control over every rental.",
      body:
        "Tenaqo brings rent, repairs, documents, contractors, compliance readiness, and AI-assisted action queues into one operating layer — so landlords know what needs action next.",
      emphasis:
        "Rent, repairs, documents, and compliance in one action queue.",
      support:
        "No guaranteed income claims. No payment collection rail today. Just visibility, workflows, and the operational clarity that keeps a rental portfolio running without constant intervention.",
      highlights: [
        { label: "Rent and expected charges", href: "/features/rental-accounting" },
        { label: "Command Center", href: "/features/command-center" },
        { label: "Maintenance and work orders", href: "/features/maintenance-management" },
        { label: "Compliance readiness", href: "/features/compliance" },
        { label: "Security and audit trail", href: "/features/security-audit" },
      ],
      microcopy: [
        "See rent, arrears, maintenance, and documents in one dashboard.",
        "Let tenants report issues without endless WhatsApp threads.",
        "Know what needs action before small problems become expensive.",
      ],
      imageSrc: "/screenshots/command-center.png",
      imageAlt:
        "Tenaqo landlord dashboard showing rent status, maintenance workflows, and portfolio action queue",
      primaryCta: { label: "Claim Founder Access", href: siteConfig.appUrl },
      secondaryCta: { label: "Compare with Traditional Agents", href: "#agent-comparison" },
    },
    trustBar: {
      title: "Built for landlords who want clarity, control, and fewer surprises",
      body: "Tenaqo gives landlords the operating layer usually missing between spreadsheets, inboxes, tenants, contractors, and finance records.",
      badges: [
        { label: "Professional Standards" },
        { label: "Compliance-Ready Workflows" },
        { label: "Secure Landlord Records" },
        { label: "Tenant & Contractor Portals" },
        { label: "Audit-Ready Operations" },
      ],
      disclaimer: "Verified partner and industry badges can be added here once approved.",
    },
    testimonials: {
      title: "Less chasing. More control.",
      disclaimer: "These are illustrative examples of how landlords describe their experience with Tenaqo. They are not verified published reviews.",
      items: [
        {
          quote: "Tenaqo gave me one place to see rent, repairs, documents, and what needed action next. It feels like the admin finally has a system.",
          name: "Private landlord",
          context: "8-property portfolio",
        },
        {
          quote: "The biggest win is visibility. I no longer have to search through messages, folders, and spreadsheets to understand what is happening.",
          name: "Portfolio landlord",
          context: "Multi-property operator",
        },
        {
          quote: "Seeing maintenance pressure, overdue rent, and document gaps in one dashboard helps me protect income and make better decisions faster.",
          name: "Growth landlord",
          context: "Scaling portfolio",
        },
      ],
    },
    seoFeatureSection: {
      title: "Automated Property Management Software for Landlords",
      body: "Tenaqo helps landlords reduce manual admin, track rental income, manage maintenance, organise documents, and keep portfolio actions visible from one dashboard.",
      features: [
        {
          title: "Rent and expected charge tracking",
          body: "Preview expected charges, track balances, and review arrears — with approval required before the ledger is touched.",
        },
        {
          title: "Maintenance without message chaos",
          body: "Tenants report issues, landlords assign contractors, and every job moves from request to resolution inside one operational flow.",
        },
        {
          title: "Document readiness and compliance evidence",
          body: "Store tenancy documents, request missing files, and track Renters' Rights obligations, tax deadlines, and lease risks in one place — with an evidence trail, not inbox memory.",
        },
        {
          title: "AI-assisted action queues",
          body: "Tenaqo surfaces what needs attention and supports maintenance triage — with landlord review before any action is taken.",
        },
        {
          title: "Tenant and contractor portals",
          body: "Tenants see their portal. Contractors work through a defined lane. Landlords keep oversight of both without chasing either.",
        },
        {
          title: "Portfolio health scoring",
          body: "Maintenance strain, arrears, compliance gaps, and vacancy pressure become an action-ready view before they get expensive.",
        },
      ],
    },
    rentalYieldSection: {
      title: "Rental Yield Optimization Starts With Better Visibility",
      body: "Higher yield is not only about charging more rent. It is about reducing missed charges, preventing avoidable maintenance drag, and spotting overdue balances before they compound. Tenaqo brings rent status, expected charges, maintenance costs, and compliance evidence into one operating view.",
      bullets: [
        "Spot overdue and due-soon rent before it becomes a follow-up problem",
        "Track maintenance costs against each property to protect margins",
        "Use rent rules and expected charges to reduce manual calculation errors",
        "Keep compliance and document readiness visible throughout the year",
      ],
    },
    passiveLandlordSection: {
      title: "A More Passive Landlord Workflow — Without Losing Control",
      body: "Tenaqo supports a more passive landlord workflow by automating reminders, surfacing action queues, and giving tenants and contractors structured portals. You still control approvals, finance posting, documents, and every decision. Tenaqo is rental management software — it does not replace regulated advice or letting agency services where those are required.",
      cta: { label: "See how Tenaqo works", href: siteConfig.appUrl },
    },
    appTease: {
      eyebrow: "What Tenaqo looks like in practice",
      title: "The dashboard you check instead of chasing messages",
      body: "Every morning you open Tenaqo and see exactly what happened overnight, what needs a decision today, and what is already resolved. No spreadsheet rebuild. No message archaeology. Just the operating picture.",
    },
    agentComparison: {
      title: "Tenaqo vs. High-Street Agents",
      body: "High-street agents suit landlords who want to fully hand off management. Tenaqo suits landlords who want the visibility, speed, and record-keeping without the fee structure — while staying in control.",
      rows: [
        {
          feature: "Management fees",
          oasis: "Software subscription — no percentage cut of your rent",
          agent: "Typically 8–15% of monthly rent, reducing your yield directly",
        },
        {
          feature: "Maintenance speed",
          oasis: "Tenant reports in the portal, landlord assigns contractor, status visible in real time",
          agent: "Reports go to the agent, who contacts contractors — each handoff adds time",
        },
        {
          feature: "Transparency",
          oasis: "24/7 dashboard — rent status, maintenance progress, documents, and action queue always visible",
          agent: "Updates typically by email, call, or monthly statement — on the agent's schedule",
        },
        {
          feature: "Tenant vetting",
          oasis: "Structured records for vetting documents, ID, references, and evidence in one place",
          agent: "Agent-managed vetting process — visibility depends on the agent's reporting",
        },
        {
          feature: "Rent visibility",
          oasis: "Expected charges, overdue balances, arrears flags, and rent rules in the landlord dashboard",
          agent: "Monthly statement after the fact — operational detail may not be visible",
        },
        {
          feature: "Document control",
          oasis: "Store, request, tag, and audit documents yourself — all under your account",
          agent: "Documents held by the agent — retrieval may require requests and time",
        },
        {
          feature: "Compliance evidence",
          oasis: "Renters' Rights, tax deadlines, Lease Auditor, and an evidence trail tracked in the workflow",
          agent: "Some agents cover compliance, others charge extra or leave it to the landlord",
        },
        {
          feature: "Best for",
          oasis: "Landlords who want control, visibility, and lower running costs",
          agent: "Landlords who want to fully delegate day-to-day management",
        },
      ],
      disclaimer: "Tenaqo is rental management software. It does not replace regulated letting, legal, tax, or property management services where those are required.",
      cta: { label: "See how Tenaqo works", href: siteConfig.appUrl },
    },
    problemSection: {
      eyebrow: "Why landlords switch",
      title: "The records are not the hard part. The handoffs are.",
      body:
        "The work breaks when rent follow-up, maintenance decisions, documents, and contractor coordination all live in different places.",
      items: [
        {
          title: "Action disappears into inboxes",
          body: "What needs attention gets buried across email, chats, spreadsheets, and memory before anyone can move it properly.",
        },
        {
          title: "Repairs lose momentum",
          body: "A tenant report turns into a contractor note, then a delayed work order, then a repair nobody fully owns.",
        },
        {
          title: "Documents drift away from the work",
          body: "Agreements, requested evidence, compliance items, and signatures become harder to trust when they sit outside the workflow.",
        },
        {
          title: "Portfolio pressure arrives late",
          body: "Without a single operational view, arrears, stalled jobs, and risky properties show up after they have already become expensive.",
        },
      ],
    },
    solutionSection: {
      title: "One platform for the work after the message comes in",
      body:
        "Tenaqo helps landlords run residential rental operations, not just store records. It keeps attention queues, work execution, tenant updates, and audit history in one place.",
      items: [
        {
          title: "See what needs action",
          body: "Start from urgent queues, overdue items, and blocked work instead of rebuilding the day from separate tools.",
        },
        {
          title: "Stay in control",
          body: "Keep the tenant, landlord, and contractor workflow visible from first report to finished work order.",
        },
        {
          title: "Use AI where it helps",
          body: "Command Center briefings, maintenance triage, contractor recommendations, and property explainers speed the next decision without taking it away from you.",
        },
        {
          title: "Keep the trail intact",
          body: "Documents, payments visibility, compliance review, notifications, and security audit stay tied to the same operational history.",
        },
      ],
    },
    productPreview: {
      title: "The daily landlord checks, finally in one place",
      body:
        "Rent, repairs, documents, and follow-up — each view answers a practical question quickly: what needs action, who owns it, what is getting riskier, and what should move next.",
      featuresHref: "/features",
      items: [
        {
          label: "Rent & Finance",
          title: "Know the charge before Finance sees it",
          body: "Preview rent rules, expected charges, arrears, and balances before anything touches the ledger.",
          points: ["preview before posting", "rent plan history", "arrears visibility"],
          imageSrc: "/screenshots/command-center.png",
          imageAlt: "Tenaqo Rent Plans page showing draft plan and calculation preview panel.",
        },
        {
          label: "Command Center",
          title: "Urgent signals, briefed and ready",
          body: "The Command Center brings together overdue items, follow-up pressure, and an AI operator briefing so the next move is obvious.",
          points: ["portfolio-wide briefing", "attention queues", "next review targets"],
          imageSrc: "/screenshots/command-center.png",
          imageAlt: "Tenaqo Command Center with AI operator briefing and account-wide action queues.",
        },
        {
          label: "Maintenance",
          title: "From report to resolved — in one lane",
          body: "Requests, triage, work orders, contractor coordination, and status updates all stay inside one operational flow.",
          points: ["AI triage", "work-order control", "contractor coordination"],
          imageSrc: "/screenshots/maintenance-inbox.png",
          imageAlt: "Tenaqo Maintenance Inbox showing AI triage, request columns, and linked work orders.",
        },
        {
          label: "Property Health",
          title: "See property pressure before it spreads",
          body: "Health scoring turns arrears, maintenance strain, vacancy pressure, and compliance gaps into an action-ready view — with AI explanation.",
          points: ["risk scoring", "AI explainer", "earlier intervention"],
          imageSrc: "/screenshots/portfolio-health.png",
          imageAlt: "Tenaqo Portfolio Health page showing scoring, property risk, and an AI explanation card.",
        },
      ],
    },
    healthSection: {
      eyebrow: "Property health",
      title: "Know which property needs intervention before the pressure gets expensive",
      body:
        "Tenaqo combines maintenance strain, arrears, contractor drag, compliance gaps, and occupancy pressure into one health score so landlords can intervene earlier.",
      items: [
        {
          title: "See which addresses are slipping",
          body: "Review the weakest properties first instead of relying on instinct and scattered spreadsheets.",
        },
        {
          title: "Understand why the score moved",
          body: "The AI explainer shows whether maintenance, compliance, payments, or vacancy pressure is driving risk.",
        },
        {
          title: "Tie the signal to the workflow",
          body: "The same view points back to the request, work-order, or document pressure behind the score.",
        },
        {
          title: "Protect the whole portfolio",
          body: "Property-level pressure becomes portfolio-level clarity instead of a surprise after the damage spreads.",
        },
      ],
      imageSrc: "/screenshots/portfolio-health.png",
      imageAlt:
        "Tenaqo Portfolio Health dashboard showing property risk, occupancy mix, and action-ready explanation.",
      imageAlign: "left",
    },
    tenantPortalSection: {
      eyebrow: "Tenant and contractor workflow",
      title: "Keep tenants informed and contractors aligned without losing control",
      body:
        "Tenaqo gives tenants a clear self-service lane while keeping the landlord and contractor workflow tightly connected behind the scenes.",
      items: [
        {
          title: "Tenants see what matters",
          body: "Maintenance updates, requested documents, payments visibility, and agreement steps stay visible in one safe portal.",
        },
        {
          title: "Contractors move through a defined lane",
          body: "Quotes, updates, work-order status, and acknowledgements stay tied to the request instead of drifting into side channels.",
        },
        {
          title: "Landlords stay in control",
          body: "Every update still lands inside the same audit trail, approval path, and property context.",
        },
      ],
      imageSrc: "/screenshots/tenant-documents.png",
      imageAlt: "Tenaqo tenant portal documents page showing document requests, uploads, and agreement review.",
      primaryCta: { label: "See the tenant portal", href: "/features/tenant-portal" },
      secondaryCta: { label: "Explore tenant workflows", href: "/features/tenant-management" },
    },
    workflowSection: {
      title: "How the workflow moves forward",
      body:
        "Tenaqo is built around the real path from tenant request to landlord decision to contractor execution and completed follow-up.",
      itemCtaLabel: "Explore this workflow",
      items: [
        {
          label: "Step 1",
          title: "A tenant reports an issue with the right context attached",
          body: "The request lands with property context, timing, and a clear record instead of becoming another message to reconstruct later.",
          href: "/features/maintenance-management",
          points: ["clear intake", "property context", "trackable request"],
          imageSrc: "/screenshots/property-requests.png",
          imageAlt: "Tenaqo request view showing tenant-reported issues and linked operational follow-up.",
        },
        {
          label: "Step 2",
          title: "The landlord assigns and the contractor lane opens cleanly",
          body: "The next owner is obvious, the work order starts in the same system, and everyone sees the same live context.",
          href: "/features/maintenance-management",
          points: ["assign fast", "keep ownership visible", "reduce chasing"],
          imageSrc: "/screenshots/maintenance-inbox.png",
          imageAlt: "Tenaqo Maintenance Inbox showing active requests, linked work orders, and status flow.",
        },
        {
          label: "Step 3",
          title: "Quotes, decisions, and completion stay tied together",
          body: "The contractor update, landlord approval, and completion trail all stay in one place, with AI support where faster decisions help.",
          href: "/features/maintenance-management",
          points: ["review the quote", "approve with context", "keep the audit trail"],
          imageSrc: "/screenshots/maintenance-inbox.png",
          imageAlt: "Tenaqo maintenance workflow showing request context, work-order progress, and the next decision.",
        },
      ],
    },
    securitySection: {
      eyebrow: "Security and audit trail",
      title: "Move quickly without losing accountability",
      body:
        "Permissions, review surfaces, and security trails help landlords understand who changed what, what was approved, and what deserves attention next.",
      items: [
        {
          title: "Role-based access",
          body: "Owners, staff, tenants, and contractors stay in the right lane instead of seeing everything.",
        },
        {
          title: "A real audit trail",
          body: "Document actions, work-order updates, approvals, and sensitive changes are already there when you need to review them.",
        },
        {
          title: "Operational accountability",
          body: "When something changes, you know where it happened, who touched it, and what it affected.",
        },
        {
          title: "Security review that fits operations",
          body: "Security and audit pages are built for real operators, not just compliance theatre.",
        },
      ],
      imageSrc: "/screenshots/security-audit.png",
      imageAlt: "Tenaqo Security Audit page showing policy settings and account-scoped review trails.",
    },
    finalCta: {
      title: "See Tenaqo before public launch",
      body:
        "If your real problem is keeping maintenance, documents, payments visibility, and follow-up moving together, Tenaqo is built for that stage.",
      primaryCta: { label: "Claim Founder Access", href: siteConfig.appUrl },
      secondaryCta: { label: "See how Tenaqo works", href: "/features" },
    },
  },
  pl: {
    seo: {
      title: "Tenaqo dla właścicieli mieszkań | Pełna kontrola nad najmem",
      description:
        "Tenaqo pomaga właścicielom mieszkań zarządzać najmem z pełną kontrolą: zgłoszenia, wykonawcy, dokumenty, widoczność płatności, kondycja nieruchomości, compliance i kolejki działań wspierane przez AI.",
      canonicalPath: "/pl",
    },
    hero: {
      eyebrow: "Dla właścicieli, którzy naprawdę prowadzą najem",
      title: "Miej pełną kontrolę nad najmem.",
      body:
        "Tenaqo pokazuje, co wymaga działania — od zgłoszeń najemców i zleceń dla wykonawców po płatności, dokumenty i kondycję nieruchomości.",
      emphasis:
        "Jedno miejsce, w którym widzisz następny krok, prowadzisz pracę dalej i utrzymujesz kontrolę nad całym przepływem: najemca → właściciel → wykonawca.",
      support:
        "To platforma dla właścicieli, którzy chcą działać sprawnie, utrzymać porządek operacyjny i szybciej wychwytywać ryzyko.",
      highlights: [
        { label: "Command Center z AI", href: "/features/command-center" },
        { label: "Zgłoszenia i zlecenia", href: "/features/maintenance-management" },
        { label: "Kondycja nieruchomości", href: "/features/portfolio-health" },
        { label: "Pakiet compliance", href: "/features/compliance" },
        { label: "Bezpieczeństwo i audyt", href: "/features/security-audit" },
      ],
      microcopy: [
        "Dla właścicieli prowadzących realne portfele, nie tylko ewidencję.",
        "Zobacz przepływ pracy, kontrolę i portal najemcy w kilka minut.",
        "Stworzone po to, by najemca, właściciel i wykonawca działali w jednym obiegu.",
      ],
      imageSrc: "/screenshots/command-center.png",
      imageAlt:
        "Panel Command Center w Tenaqo z briefingiem AI, pilnymi kolejkami i działaniami w całym portfelu.",
      primaryCta: { label: "Zobacz, jak działa Tenaqo", href: siteConfig.appUrl },
      secondaryCta: { label: "Zobacz portal najemcy", href: "/features/tenant-portal" },
    },
    problemSection: {
      eyebrow: "Dlaczego właściciele zmieniają narzędzia",
      title: "Problemem nie są dane. Problemem są przekazania pracy.",
      body:
        "Najem zaczyna się psuć wtedy, gdy zgłoszenia, wykonawcy, dokumenty i płatności żyją w różnych miejscach.",
      items: [
        {
          title: "Działania giną w wiadomościach",
          body: "To, co wymaga reakcji, znika między e-mailami, komunikatorami i arkuszami zanim ktokolwiek zrobi następny krok.",
        },
        {
          title: "Zgłoszenia tracą tempo",
          body: "Wiadomość od najemcy staje się notatką dla wykonawcy, potem opóźnionym zleceniem, a na końcu sprawą bez właściciela.",
        },
        {
          title: "Dokumenty odpadają od pracy",
          body: "Umowy, prośby o dokumenty, załączniki i podpisy stają się trudne do zaufania, gdy nie są związane z właściwym procesem.",
        },
        {
          title: "Ryzyko widać za późno",
          body: "Bez jednego obrazu operacyjnego zaległości, przestoje i słabsze nieruchomości wychodzą na jaw dopiero, gdy kosztują więcej.",
        },
      ],
    },
    solutionSection: {
      title: "Jedna platforma do pracy po tym, gdy wpływa zgłoszenie",
      body:
        "Tenaqo pomaga właścicielom mieszkań prowadzić najem z pełną kontrolą — nie tylko przechowywać dane. Łączy kolejki działań, wykonanie pracy, komunikację i historię zmian.",
      items: [
        {
          title: "Widzisz, co wymaga działania",
          body: "Zaczynasz od pilnych kolejek, zaległości i zablokowanych spraw zamiast odtwarzać dzień z wielu narzędzi.",
        },
        {
          title: "Trzymasz kontrolę nad przepływem",
          body: "Cały proces najemca → właściciel → wykonawca pozostaje widoczny od pierwszego zgłoszenia do zakończonego zlecenia.",
        },
        {
          title: "AI wspiera decyzję, nie zgaduje",
          body: "Briefing Command Center, triage zgłoszeń, rekomendacje wykonawców i objaśnienia ryzyka przyspieszają pracę bez odbierania właścicielowi kontroli.",
        },
        {
          title: "Historia pozostaje spójna",
          body: "Dokumenty, płatności, przegląd compliance, powiadomienia i audyt bezpieczeństwa pozostają częścią tego samego śladu operacyjnego.",
        },
      ],
    },
    productPreview: {
      title: "Zaprojektowane wokół ekranów, które właściciel sprawdza codziennie",
      body:
        "Każda powierzchnia odpowiada na praktyczne pytanie: co wymaga działania, kto odpowiada, gdzie rośnie ryzyko i jaki powinien być następny krok.",
      items: [
        {
          label: "Command Center",
          title: "Kolejki działań wspierane przez AI",
          body: "Command Center zbiera pilne sygnały, presję follow-upu i briefing operacyjny, aby kolejny ruch był jasny.",
          points: ["briefing całego portfela", "kolejki uwagi", "następne cele przeglądu"],
          imageSrc: "/screenshots/command-center.png",
          imageAlt: "Command Center w Tenaqo z briefingiem AI i kolejkami działań dla całego konta.",
        },
        {
          label: "Utrzymanie",
          title: "Zgłoszenia i zlecenia w jednym obiegu",
          body: "Zgłoszenia, triage, zlecenia, rekomendacje wykonawców i zmiana statusów pozostają w jednym przepływie operacyjnym.",
          points: ["triage AI", "kontrola zleceń", "koordynacja wykonawców"],
          imageSrc: "/screenshots/maintenance-inbox.png",
          imageAlt: "Skrzynka zgłoszeń Tenaqo z triage AI, kolumnami zgłoszeń i powiązanymi zleceniami.",
        },
        {
          label: "Portal najemcy",
          title: "Portal, który ogranicza dopytywanie",
          body: "Najemca widzi dokumenty, płatności, postęp zgłoszeń i kroki związane z umową bez ciągłego przypominania.",
          points: ["widoczność zgłoszeń", "dokumenty", "obsługa umów"],
          imageSrc: "/screenshots/tenant-home.png",
          imageAlt: "Panel najemcy Tenaqo z działaniami, płatnościami i postępem zgłoszeń.",
        },
        {
          label: "Dokumenty",
          title: "Umowy i dowody powiązane z konkretną pracą",
          body: "Biblioteka szablonów, prośby o dokumenty, pakiety umów i gotowość do podpisu pozostają spięte z tym samym kontem i procesem.",
          points: ["prośby o dokumenty", "pakiety umów", "workflow podpisów"],
          imageSrc: "/screenshots/documents-workflow.png",
          imageAlt: "Widok dokumentów Tenaqo z prośbami o dokumenty, pakietami umów i kontrolkami podpisu.",
        },
        {
          label: "Kondycja",
          title: "Zobacz presję na nieruchomości zanim się rozleje",
          body: "Scoring kondycji łączy zaległości, obciążenie zgłoszeniami, pustostany i braki compliance w jeden obraz z objaśnieniem AI.",
          points: ["scoring ryzyka", "objaśnienie AI", "wcześniejsza reakcja"],
          imageSrc: "/screenshots/portfolio-health.png",
          imageAlt: "Widok Portfolio Health Tenaqo ze scoringiem, ryzykiem nieruchomości i kartą objaśnienia AI.",
        },
        {
          label: "Compliance",
          title: "Ryzyko umów, ekspozycja czynszowa i terminy podatkowe w jednym miejscu",
          body: "Pakiet compliance wykrywa ryzykowne klauzule w umowach najmu dzięki AI, ocenia ekspozycję czynszową portfela za pomocą Rent Shield i śledzi zobowiązania podatkowe, zanim cokolwiek urośnie w cieniu codziennej pracy.",
          points: ["audyt klauzul umownych", "scoring Rent Shield", "gotowość podatkowa"],
          imageSrc: "/screenshots/compliance-suite.png",
          imageAlt: "Pakiet compliance Tenaqo z Audytorem umów, wynikami Rent Shield i panelem gotowości podatkowej.",
        },
        {
          label: "Bezpieczeństwo",
          title: "Ślad audytowy w standardzie",
          body: "Role, przegląd zmian i audyt bezpieczeństwa pomagają działać szybko bez utraty odpowiedzialności.",
          points: ["ślad audytowy", "uprawnienia", "ekrany przeglądu"],
          imageSrc: "/screenshots/security-audit.png",
          imageAlt: "Strona Security Audit Tenaqo z przeglądem zdarzeń i polityk bezpieczeństwa.",
        },
      ],
    },
    healthSection: {
      eyebrow: "Kondycja nieruchomości",
      title: "Wiedz, która nieruchomość wymaga reakcji, zanim problem zrobi się drogi",
      body:
        "Tenaqo łączy obciążenie zgłoszeniami, zaległości, opóźnienia wykonawców, braki compliance i presję pustostanów w jeden wynik kondycji.",
      items: [
        {
          title: "Widzisz, które adresy słabną",
          body: "Najpierw przeglądasz najsłabsze nieruchomości, zamiast polegać na intuicji i wielu arkuszach.",
        },
        {
          title: "Rozumiesz, dlaczego wynik się zmienił",
          body: "Objaśnienie AI pokazuje, czy ryzyko bierze się ze zgłoszeń, compliance, płatności czy pustostanów.",
        },
        {
          title: "Łączysz sygnał z pracą",
          body: "Ten sam widok wskazuje zgłoszenie, zlecenie lub problem dokumentowy, który stoi za wynikiem.",
        },
        {
          title: "Chronisz cały portfel",
          body: "Presja na pojedynczej nieruchomości staje się czytelnym obrazem portfela, a nie niespodzianką po fakcie.",
        },
      ],
      imageSrc: "/screenshots/portfolio-health.png",
      imageAlt:
        "Panel Portfolio Health Tenaqo pokazujący ryzyko nieruchomości, miks obłożenia i gotowe sygnały do działania.",
      imageAlign: "left",
    },
    tenantPortalSection: {
      eyebrow: "Przepływ najemca i wykonawca",
      title: "Utrzymuj jasność dla najemców i wykonawców bez utraty kontroli",
      body:
        "Tenaqo daje najemcom bezpieczny kanał samoobsługi, a jednocześnie spina pracę właściciela i wykonawcy w jeden proces.",
      items: [
        {
          title: "Najemca widzi to, co ważne",
          body: "Postęp zgłoszeń, prośby o dokumenty, widoczność płatności i kroki związane z umową są dostępne w jednym portalu.",
        },
        {
          title: "Wykonawca pracuje w uporządkowanym obiegu",
          body: "Wyceny, aktualizacje, status zlecenia i potwierdzenia pozostają związane z konkretną sprawą.",
        },
        {
          title: "Właściciel zachowuje pełną kontrolę",
          body: "Każda zmiana trafia do tego samego śladu audytowego, procesu akceptacji i kontekstu nieruchomości.",
        },
      ],
      imageSrc: "/screenshots/tenant-documents.png",
      imageAlt: "Strona dokumentów w portalu najemcy Tenaqo z prośbami, uploadem i przeglądem umów.",
      primaryCta: { label: "Zobacz portal najemcy", href: "/features/tenant-portal" },
      secondaryCta: { label: "Poznaj workflow najemcy", href: "/features/tenant-management" },
    },
    workflowSection: {
      title: "Jak praca idzie do przodu",
      body:
        "Tenaqo jest zbudowany wokół realnego przepływu: od zgłoszenia najemcy, przez decyzję właściciela, po wykonanie i zamknięcie sprawy.",
      itemCtaLabel: "Poznaj ten workflow",
      items: [
        {
          label: "Krok 1",
          title: "Najemca zgłasza problem z właściwym kontekstem",
          body: "Zgłoszenie trafia od razu z kontekstem nieruchomości i czytelnym zapisem, zamiast stawać się kolejną wiadomością do odtworzenia.",
          href: "/features/maintenance-management",
          points: ["czytelny intake", "kontekst nieruchomości", "śledzone zgłoszenie"],
          imageSrc: "/screenshots/property-requests.png",
          imageAlt: "Widok zgłoszeń Tenaqo z problemami od najemców i dalszą operacyjną obsługą.",
        },
        {
          label: "Krok 2",
          title: "Właściciel przypisuje wykonanie i otwiera ścieżkę dla wykonawcy",
          body: "Następny właściciel sprawy jest jasny, zlecenie powstaje w tym samym systemie, a wszyscy widzą ten sam kontekst.",
          href: "/features/maintenance-management",
          points: ["szybkie przypisanie", "widoczna odpowiedzialność", "mniej dopytywania"],
          imageSrc: "/screenshots/maintenance-inbox.png",
          imageAlt: "Skrzynka zgłoszeń Tenaqo z aktywnymi sprawami, zleceniami i przebiegiem statusów.",
        },
        {
          label: "Krok 3",
          title: "Wyceny, decyzje i zamknięcie sprawy pozostają razem",
          body: "Aktualizacja wykonawcy, akceptacja właściciela i ślad zakończenia pozostają w jednym miejscu, z pomocą AI tam, gdzie przyspiesza decyzję.",
          href: "/features/maintenance-management",
          points: ["przegląd wyceny", "decyzja z kontekstem", "spójny ślad działań"],
          imageSrc: "/screenshots/maintenance-inbox.png",
          imageAlt: "Workflow zgłoszeń Tenaqo z kontekstem sprawy, postępem zlecenia i decyzją.",
        },
      ],
    },
    securitySection: {
      eyebrow: "Bezpieczeństwo i audyt",
      title: "Działaj szybko bez utraty odpowiedzialności",
      body:
        "Uprawnienia, ekrany przeglądu i ślad bezpieczeństwa pomagają zrozumieć, kto co zmienił, co zostało zatwierdzone i co wymaga kolejnej uwagi.",
      items: [
        {
          title: "Dostęp zależny od roli",
          body: "Właściciele, pracownicy, najemcy i wykonawcy widzą tylko to, co należy do ich roli.",
        },
        {
          title: "Prawdziwy ślad audytowy",
          body: "Działania na dokumentach, aktualizacje zleceń, akceptacje i wrażliwe zmiany są już zapisane, gdy trzeba je sprawdzić.",
        },
        {
          title: "Odpowiedzialność operacyjna",
          body: "Gdy coś się zmienia, wiadomo gdzie, kto to zrobił i jaką część pracy to dotknęło.",
        },
        {
          title: "Przegląd bezpieczeństwa dla operatorów",
          body: "Ekrany Security Audit są stworzone do realnej pracy operacyjnej, a nie tylko do formalności.",
        },
      ],
      imageSrc: "/screenshots/security-audit.png",
      imageAlt: "Strona Security Audit Tenaqo z ustawieniami polityk i śladem działań w koncie.",
    },
    finalCta: {
      title: "Zobacz Tenaqo przed publicznym startem",
      body:
        "Jeśli Twoim realnym problemem jest utrzymanie zgłoszeń, dokumentów, płatności i follow-upu w jednym rytmie pracy, Tenaqo powstał właśnie dla tego etapu.",
      primaryCta: { label: "Zobacz, jak działa Tenaqo", href: siteConfig.appUrl },
      secondaryCta: { label: "Zobacz portal najemcy", href: "/features/tenant-portal" },
    },
  },
  de: {
    seo: {
      title: "Tenaqo für Vermieter | Immobilienabläufe aktiv steuern",
      description:
        "Tenaqo hilft Vermietern, Immobilienabläufe aktiv zu steuern: Mieteranfragen, Instandhaltung, Dokumente, Zahlungsübersicht, Immobilienzustand, Compliance-Risiken und AI-gestützte Aufgabenlisten in einer klaren Plattform.",
      canonicalPath: "/de",
    },
    hero: {
      eyebrow: "Für Vermieter mit operativem Anspruch",
      title: "Behalten Sie Ihre Immobilien im Griff.",
      body:
        "Tenaqo zeigt, was Aufmerksamkeit braucht — von Mieteranfragen und Arbeitsaufträgen bis zu Zahlungsübersicht, Dokumenten und Immobilienzustand.",
      emphasis:
        "Eine Plattform, auf der Sie Handlungsbedarf sehen, Arbeit voranbringen und den Ablauf Mieter → Vermieter → Handwerker unter Kontrolle halten.",
      support:
        "Entwickelt für Vermieter, die nicht nur verwalten, sondern Zuständigkeiten, Nachverfolgung und operative Klarheit sauber steuern wollen.",
      highlights: [
        { label: "Operatives Priorisierungs-Dashboard", href: "/features/command-center" },
        { label: "Instandhaltung und Arbeitsaufträge", href: "/features/maintenance-management" },
        { label: "Immobilienzustand", href: "/features/portfolio-health" },
        { label: "Compliance-Suite", href: "/features/compliance" },
        { label: "Sicherheit und Audit Trail", href: "/features/security-audit" },
      ],
      microcopy: [
        "Für aktive Vermieter, nicht für passive Datenspeicherung.",
        "Ablauf, Kontrolle und Mietererlebnis in wenigen Minuten erfassen.",
        "Entwickelt, damit Mieter, Vermieter und Handwerker in einem sauberen Ablauf arbeiten.",
      ],
      imageSrc: "/screenshots/command-center.png",
      imageAlt:
        "Tenaqo Command Center mit AI-Briefing, dringenden Aufgaben und operativen Warteschlangen im Portfolio.",
      primaryCta: { label: "Tenaqo im Einsatz sehen", href: siteConfig.appUrl },
      secondaryCta: { label: "Mieterportal ansehen", href: "/features/tenant-portal" },
    },
    problemSection: {
      eyebrow: "Warum operative Vermieter wechseln",
      title: "Nicht die Daten sind das Problem. Sondern die Übergaben.",
      body:
        "Abläufe brechen dann, wenn Anfragen, Handwerker, Dokumente und Zahlungsübersicht in getrennten Werkzeugen leben.",
      items: [
        {
          title: "Handlungsbedarf verschwindet in Nachrichten",
          body: "Was Aufmerksamkeit braucht, geht in E-Mails, Chats und Tabellen verloren, bevor der nächste Schritt sauber angestoßen wird.",
        },
        {
          title: "Instandhaltung verliert Tempo",
          body: "Aus einer Mieteranfrage wird eine Handwerkernotiz, dann ein verzögerter Arbeitsauftrag und am Ende ein Vorgang ohne klare Zuständigkeit.",
        },
        {
          title: "Dokumente lösen sich vom Vorgang",
          body: "Verträge, Nachweise, Signaturen und Compliance-Unterlagen werden schwer vertrauenswürdig, wenn sie außerhalb des eigentlichen Workflows liegen.",
        },
        {
          title: "Portfoliodruck wird zu spät sichtbar",
          body: "Ohne ein gemeinsames operatives Bild zeigen sich Rückstände, stockende Aufträge und Risikoadressen erst, wenn sie bereits teuer geworden sind.",
        },
      ],
    },
    solutionSection: {
      title: "Eine Plattform für die Arbeit nach der eingehenden Nachricht",
      body:
        "Tenaqo hilft Vermietern, Immobilienabläufe aktiv zu steuern — nicht nur Daten zu verwalten. Aufgaben, Ausführung, Kommunikation und Audit-Historie bleiben zusammen.",
      items: [
        {
          title: "Sehen, was Handlungsbedarf hat",
          body: "Sie starten mit dringenden Listen, Rückständen und blockierter Arbeit statt den Tag erst aus mehreren Tools zusammensetzen zu müssen.",
        },
        {
          title: "Die Kontrolle behalten",
          body: "Der Ablauf Mieter → Vermieter → Handwerker bleibt vom ersten Hinweis bis zum erledigten Arbeitsauftrag sichtbar.",
        },
        {
          title: "KI gezielt und nachvollziehbar einsetzen",
          body: "Command-Center-Briefings, Instandhaltungs-Triage, Handwerkerempfehlungen und Risiko-Analysen beschleunigen die nächste Entscheidung, ohne sie zu automatisieren.",
        },
        {
          title: "Den Verlauf sauber halten",
          body: "Dokumente, Zahlungsübersicht, Compliance-Prüfung, Benachrichtigungen und Sicherheitsaudit bleiben Teil derselben operativen Geschichte.",
        },
      ],
    },
    productPreview: {
      title: "Für die operativen Oberflächen gebaut, die Vermieter täglich brauchen",
      body:
        "Jede Oberfläche beantwortet eine praktische Frage: Was braucht Aufmerksamkeit, wer ist verantwortlich, wo steigt das Risiko und was sollte als Nächstes passieren?",
      items: [
        {
          label: "Command Center",
          title: "Nachvollziehbare Aufgabenpriorisierung",
          body: "Das Command Center bündelt dringende Signale, Nachverfolgungsdruck und eine operative Kurzanalyse, damit der nächste Schritt sofort klar ist.",
          points: ["portfolioweite Zusammenfassung", "Aufmerksamkeitslisten", "nächste Prüfpunkte"],
          imageSrc: "/screenshots/command-center.png",
          imageAlt: "Tenaqo Command Center mit AI-Briefing und portfolioweiten Aufgabenlisten.",
        },
        {
          label: "Instandhaltung",
          title: "Instandhaltung und Arbeitsaufträge in einem Ablauf",
          body: "Anfragen, Triage, Arbeitsaufträge, Handwerkerempfehlungen und Statuswechsel bleiben in einem einzigen operativen Fluss.",
          points: ["AI-Triage", "Arbeitsauftragssteuerung", "Handwerkerkoordination"],
          imageSrc: "/screenshots/maintenance-inbox.png",
          imageAlt: "Tenaqo Maintenance Inbox mit AI-Triage, Anfrage-Spalten und verknüpften Arbeitsaufträgen.",
        },
        {
          label: "Mieterportal",
          title: "Ein klarer Self-Service-Kanal für Mieter",
          body: "Mieter sehen Dokumente, Zahlungsübersicht, Wartungsupdates und Vertragsschritte an einem Ort statt in verstreuten Erinnerungen.",
          points: ["Wartungsstatus", "Dokumente", "Vertragsabläufe"],
          imageSrc: "/screenshots/tenant-home.png",
          imageAlt: "Tenaqo Mieterportal mit Aktionen, Zahlungsübersicht und Wartungsfortschritt.",
        },
        {
          label: "Dokumente",
          title: "Verträge und Nachweise bleiben am Vorgang",
          body: "Vorlagen, Dokumentenanfragen, Vertragspakete und Signaturbereitschaft bleiben mit demselben Konto und derselben Arbeit verknüpft.",
          points: ["Dokumentenanfragen", "Vertragspakete", "Signaturablauf"],
          imageSrc: "/screenshots/documents-workflow.png",
          imageAlt: "Tenaqo Dokumentenansicht mit Anfragen, Vertragspaketen und Signatursteuerung.",
        },
        {
          label: "Immobilienzustand",
          title: "Risiko erkennen, bevor es eskaliert",
          body: "Immobilien-Scores machen Rückstände, Instandhaltungsdruck, Leerstandsrisiko und Compliance-Lücken früh sichtbar, ergänzt durch eine AI-Erklärung.",
          points: ["Risikobewertung", "AI-Erklärung", "früheres Eingreifen"],
          imageSrc: "/screenshots/portfolio-health.png",
          imageAlt: "Tenaqo Portfolio Health mit Risikoscore, Immobilienlage und AI-Erklärung.",
        },
        {
          label: "Compliance",
          title: "Vertragsrisiken, Mietexposition und Steuerfristen auf einen Blick",
          body: "Die Compliance-Suite erkennt riskante Mietvertragsklauseln per AI, bewertet das portfolioweite Mietrisiko mit Rent Shield und verfolgt steuerliche Fristen — damit nichts still im Hintergrund wächst.",
          points: ["Mietvertrag-Klausel-Audit", "Rent Shield Bewertung", "Steuerbereitschaft"],
          imageSrc: "/screenshots/compliance-suite.png",
          imageAlt: "Tenaqo Compliance-Suite mit Mietvertrags-Auditor, Rent Shield Scores und Steuerbereitschafts-Dashboard.",
        },
        {
          label: "Sicherheit",
          title: "Nachvollziehbarkeit standardmäßig eingebaut",
          body: "Rollen, Prüfpfade und Security-Audit-Oberflächen helfen Teams, schnell zu handeln, ohne die Nachvollziehbarkeit zu verlieren.",
          points: ["Audit Trail", "Berechtigungen", "Prüfoberflächen"],
          imageSrc: "/screenshots/security-audit.png",
          imageAlt: "Tenaqo Security Audit Seite mit Sicherheitsereignissen und Richtlinienprüfung.",
        },
      ],
    },
    healthSection: {
      eyebrow: "Immobilienzustand",
      title: "Wissen, welche Adresse Eingreifen braucht, bevor der Druck teuer wird",
      body:
        "Tenaqo fasst Instandhaltungsdruck, Rückstände, Handwerkerverzug, Compliance-Lücken und Leerstandsrisiko in einem Gesundheitswert zusammen.",
      items: [
        {
          title: "Erkennen, welche Adressen abrutschen",
          body: "Sie beginnen bei den schwächsten Objekten statt mit Bauchgefühl und verteilten Tabellen.",
        },
        {
          title: "Verstehen, warum der Wert sich bewegt hat",
          body: "Die AI-Erklärung zeigt, ob Instandhaltung, Compliance, Zahlungen oder Leerstand den Ausschlag geben.",
        },
        {
          title: "Das Signal direkt mit der Arbeit verbinden",
          body: "Dieselbe Ansicht verweist auf den Vorgang, Arbeitsauftrag oder Dokumentendruck hinter dem Wert.",
        },
        {
          title: "Das ganze Portfolio schützen",
          body: "Druck auf Objektebene wird zu operativer Klarheit auf Portfolioebene statt zu einer teuren Überraschung.",
        },
      ],
      imageSrc: "/screenshots/portfolio-health.png",
      imageAlt:
        "Tenaqo Portfolio Health Dashboard mit Immobilienrisiko, Belegungsmix und erklärbaren Handlungsimpulsen.",
      imageAlign: "left",
    },
    tenantPortalSection: {
      eyebrow: "Mieter- und Handwerkerablauf",
      title: "Mieter klar führen und Handwerker ausrichten, ohne Kontrolle zu verlieren",
      body:
        "Tenaqo gibt Mietern einen sauberen Self-Service-Weg und hält gleichzeitig die Vermieter- und Handwerkerarbeit im selben Ablauf zusammen.",
      items: [
        {
          title: "Mieter sehen, was für sie relevant ist",
          body: "Wartungsstatus, Dokumentenanfragen, Zahlungsübersicht und Vertragsschritte bleiben in einem sicheren Portal sichtbar.",
        },
        {
          title: "Handwerker arbeiten in einer definierten Spur",
          body: "Angebote, Updates, Arbeitsauftragsstatus und Bestätigungen bleiben am Vorgang statt in Nebenkanälen.",
        },
        {
          title: "Vermieter behalten die Oberhand",
          body: "Jede Änderung bleibt Teil desselben Audit Trails, derselben Freigabelogik und desselben Objektkontexts.",
        },
      ],
      imageSrc: "/screenshots/tenant-documents.png",
      imageAlt: "Tenaqo Dokumentenseite im Mieterportal mit Anfragen, Uploads und Vertragsansicht.",
      primaryCta: { label: "Mieterportal ansehen", href: "/features/tenant-portal" },
      secondaryCta: { label: "Mieterabläufe ansehen", href: "/features/tenant-management" },
    },
    workflowSection: {
      title: "Wie der Ablauf vorankommt",
      body:
        "Tenaqo orientiert sich am realen Weg von der Mieteranfrage über die Vermieterentscheidung bis zur Ausführung und sauberen Nachverfolgung.",
      itemCtaLabel: "Diesen Ablauf ansehen",
      items: [
        {
          label: "Schritt 1",
          title: "Der Mieter meldet ein Thema mit dem richtigen Kontext",
          body: "Die Anfrage landet direkt mit Objektbezug und sauberem Verlauf statt als weitere Nachricht, die später rekonstruiert werden muss.",
          href: "/features/maintenance-management",
          points: ["saubere Erfassung", "Objektkontext", "nachverfolgbare Anfrage"],
          imageSrc: "/screenshots/property-requests.png",
          imageAlt: "Tenaqo Anfrageansicht mit gemeldeten Themen und operativer Weiterverfolgung.",
        },
        {
          label: "Schritt 2",
          title: "Der Vermieter weist zu und öffnet die Spur für den Handwerker",
          body: "Die nächste Verantwortung ist klar, der Arbeitsauftrag entsteht im selben System und alle sehen denselben Kontext.",
          href: "/features/maintenance-management",
          points: ["schnell zuweisen", "Verantwortung sichtbar halten", "Nachfragen reduzieren"],
          imageSrc: "/screenshots/maintenance-inbox.png",
          imageAlt: "Tenaqo Maintenance Inbox mit aktiven Vorgängen, Arbeitsaufträgen und Statusfluss.",
        },
        {
          label: "Schritt 3",
          title: "Angebot, Entscheidung und Abschluss bleiben zusammen",
          body: "Das Handwerkerupdate, die Freigabe des Vermieters und der Abschlussverlauf bleiben an einer Stelle, mit AI-Hilfe dort, wo sie die Entscheidung beschleunigt.",
          href: "/features/maintenance-management",
          points: ["Angebot prüfen", "mit Kontext freigeben", "Audit Trail sauber halten"],
          imageSrc: "/screenshots/maintenance-inbox.png",
          imageAlt: "Tenaqo Wartungsablauf mit Vorgangskontext, Arbeitsfortschritt und nächster Entscheidung.",
        },
      ],
    },
    securitySection: {
      eyebrow: "Sicherheit und Audit Trail",
      title: "Schnell handeln, ohne Nachvollziehbarkeit zu verlieren",
      body:
        "Berechtigungen, Prüfoberflächen und Sicherheitsverläufe helfen Vermietern zu verstehen, wer was geändert hat, was freigegeben wurde und was als Nächstes Aufmerksamkeit braucht.",
      items: [
        {
          title: "Rollenbasierter Zugriff",
          body: "Eigentümer, Team, Mieter und Handwerker bleiben in ihren jeweiligen Zuständigkeitsbereichen.",
        },
        {
          title: "Ein belastbarer Audit Trail",
          body: "Dokumentenaktionen, Arbeitsauftragsupdates, Freigaben und sensible Änderungen sind bereits nachvollziehbar, wenn Sie sie prüfen müssen.",
        },
        {
          title: "Operative Verantwortung",
          body: "Wenn sich etwas ändert, sehen Sie, wo es passiert ist, wer es ausgelöst hat und was davon betroffen war.",
        },
        {
          title: "Sicherheitsprüfung für reale Betreiber",
          body: "Security Audit und verwandte Ansichten sind für operative Teams gebaut, nicht nur für formale Compliance.",
        },
      ],
      imageSrc: "/screenshots/security-audit.png",
      imageAlt: "Tenaqo Security Audit Seite mit Richtlinien, Ereignissen und kontobezogener Nachverfolgung.",
    },
    finalCta: {
      title: "Tenaqo vor dem öffentlichen Start ansehen",
      body:
        "Wenn Ihr echtes Problem darin liegt, Instandhaltung, Dokumente, Zahlungsübersicht und Nachverfolgung zusammenzuhalten, ist Tenaqo genau für diese Phase gebaut.",
      primaryCta: { label: "Tenaqo im Einsatz sehen", href: siteConfig.appUrl },
      secondaryCta: { label: "Mieterportal ansehen", href: "/features/tenant-portal" },
    },
  },
};
