import type { Locale } from "../lib/i18n";

import { siteConfig } from "./site";

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
      title: "OASIS Rental Management | Property operations platform for landlords",
      description:
        "Run rent, maintenance, documents, compliance, contractors, AI-assisted action queues, and audit-ready rental operations in one platform. Rent Plans Engine included on every plan.",
      canonicalPath: "/",
    },
    hero: {
      eyebrow: "For landlords who run the operation",
      title: "Run the rental operation, not just the records.",
      body:
        "OASIS brings rent rules, expected charges, tenant records, maintenance workflows, documents, compliance readiness, AI-assisted action queues, and audit trails into one platform built for active landlords.",
      emphasis:
        "Stop running your portfolio from spreadsheets, WhatsApp, email, folders, and memory. OASIS shows what needs action, keeps every workflow moving, and protects the operational trail.",
      support:
        "Built for landlords who need ownership, follow-through, and a clearer operational picture than a record system can give them.",
      highlights: [
        { label: "Rent and expected charges", href: "/features/rental-accounting" },
        { label: "Command Center", href: "/features/command-center" },
        { label: "Maintenance and work orders", href: "/features/maintenance-management" },
        { label: "Compliance readiness", href: "/features/compliance" },
        { label: "Security and audit trail", href: "/features/security-audit" },
      ],
      microcopy: [
        "Know what needs action before it becomes expensive.",
        "Keep rent, maintenance, documents, and contractors in one workflow.",
        "Use AI to triage, explain, and prioritise — without taking control away from you.",
      ],
      imageSrc: "/screenshots/command-center.png",
      imageAlt:
        "OASIS Command Center showing AI operator briefing, urgent queues, and action items across the portfolio.",
      primaryCta: { label: "See how OASIS works", href: siteConfig.appUrl },
      secondaryCta: { label: "See the tenant portal", href: "/features/tenant-portal" },
    },
    problemSection: {
      eyebrow: "Why operators switch",
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
        "OASIS helps landlords run property operations, not just store records. It keeps attention queues, work execution, tenant updates, and audit history in one place.",
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
      title: "Built for the operational surfaces landlords check every day",
      body:
        "Each surface is designed to answer a practical question quickly: what needs action, who owns it, what is getting riskier, and what should move next.",
      items: [
        {
          label: "Rent & Finance",
          title: "Know what the charge is before Finance sees it",
          body: "Rent is rarely one number. OASIS lets you see the calculation, review the result, and post only when you are ready — keeping the Finance ledger clean.",
          points: ["preview before posting", "rent plan history", "arrears visibility"],
          imageSrc: "/screenshots/command-center.png",
          imageAlt: "OASIS Rent Plans page showing draft plan and calculation preview panel.",
        },
        {
          label: "Command Center",
          title: "AI-assisted action queues",
          body: "The Command Center brings together urgent signals, follow-up pressure, and an operator briefing so the next move is obvious.",
          points: ["portfolio-wide briefing", "attention queues", "next review targets"],
          imageSrc: "/screenshots/command-center.png",
          imageAlt: "OASIS Command Center with AI operator briefing and account-wide action queues.",
        },
        {
          label: "Maintenance",
          title: "Maintenance and work orders in one lane",
          body: "Requests, triage, work orders, contractor recommendations, and status movement all stay inside one operational flow.",
          points: ["AI triage", "work-order control", "contractor coordination"],
          imageSrc: "/screenshots/maintenance-inbox.png",
          imageAlt: "OASIS Maintenance Inbox showing AI triage, request columns, and linked work orders.",
        },
        {
          label: "Tenant Portal",
          title: "A tenant-safe portal that reduces chasing",
          body: "Tenants can track documents, payments visibility, maintenance updates, and agreement steps without falling back to scattered reminders.",
          points: ["maintenance visibility", "documents", "agreement review"],
          imageSrc: "/screenshots/tenant-home.png",
          imageAlt: "OASIS tenant portal dashboard showing actions, payments visibility, and maintenance progress.",
        },
        {
          label: "Documents",
          title: "Agreements and evidence tied to the workflow",
          body: "Template libraries, document requests, agreement packets, and signature readiness stay connected to the account and the work they support.",
          points: ["document requests", "agreement packets", "signature workflow"],
          imageSrc: "/screenshots/documents-workflow.png",
          imageAlt: "OASIS Documents view showing document requests, agreement packets, and signature readiness controls.",
        },
        {
          label: "Property Health",
          title: "See property pressure before it spreads",
          body: "Property health scoring turns arrears, maintenance strain, vacancy pressure, and compliance gaps into an action-ready view with AI explanation.",
          points: ["risk scoring", "AI explainer", "earlier intervention"],
          imageSrc: "/screenshots/portfolio-health.png",
          imageAlt: "OASIS Portfolio Health page showing scoring, property risk, and an AI explanation card.",
        },
        {
          label: "Compliance",
          title: "Lease risk, rent exposure, and tax deadlines in one view",
          body: "The Compliance suite flags risky lease clauses with AI analysis, scores portfolio-wide rent exposure with Rent Shield, and tracks tax obligations so nothing builds quietly in the background.",
          points: ["lease clause audit", "rent shield scoring", "tax readiness"],
          imageSrc: "/screenshots/compliance-suite.png",
          imageAlt: "OASIS Compliance suite showing Lease Auditor findings, Rent Shield scores, and Tax Readiness dashboard.",
        },
        {
          label: "Security",
          title: "Audit-ready by design",
          body: "Role-based access, operational review, and security audit trails help teams move fast without losing accountability.",
          points: ["audit trail", "permissions", "review surfaces"],
          imageSrc: "/screenshots/security-audit.png",
          imageAlt: "OASIS Security Audit page showing security events and policy review.",
        },
      ],
    },
    healthSection: {
      eyebrow: "Property health",
      title: "Know which property needs intervention before the pressure gets expensive",
      body:
        "OASIS combines maintenance strain, arrears, contractor drag, compliance gaps, and occupancy pressure into one health score so landlords can intervene earlier.",
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
        "OASIS Portfolio Health dashboard showing property risk, occupancy mix, and action-ready explanation.",
      imageAlign: "left",
    },
    tenantPortalSection: {
      eyebrow: "Tenant and contractor workflow",
      title: "Keep tenants informed and contractors aligned without losing control",
      body:
        "OASIS gives tenants a clear self-service lane while keeping the landlord and contractor workflow tightly connected behind the scenes.",
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
      imageAlt: "OASIS tenant portal documents page showing document requests, uploads, and agreement review.",
      primaryCta: { label: "See the tenant portal", href: "/features/tenant-portal" },
      secondaryCta: { label: "Explore tenant workflows", href: "/features/tenant-management" },
    },
    workflowSection: {
      title: "How the workflow moves forward",
      body:
        "OASIS is built around the real path from tenant request to landlord decision to contractor execution and completed follow-up.",
      itemCtaLabel: "Explore this workflow",
      items: [
        {
          label: "Step 1",
          title: "A tenant reports an issue with the right context attached",
          body: "The request lands with property context, timing, and a clear record instead of becoming another message to reconstruct later.",
          href: "/features/maintenance-management",
          points: ["clear intake", "property context", "trackable request"],
          imageSrc: "/screenshots/property-requests.png",
          imageAlt: "OASIS request view showing tenant-reported issues and linked operational follow-up.",
        },
        {
          label: "Step 2",
          title: "The landlord assigns and the contractor lane opens cleanly",
          body: "The next owner is obvious, the work order starts in the same system, and everyone sees the same live context.",
          href: "/features/maintenance-management",
          points: ["assign fast", "keep ownership visible", "reduce chasing"],
          imageSrc: "/screenshots/maintenance-inbox.png",
          imageAlt: "OASIS Maintenance Inbox showing active requests, linked work orders, and status flow.",
        },
        {
          label: "Step 3",
          title: "Quotes, decisions, and completion stay tied together",
          body: "The contractor update, landlord approval, and completion trail all stay in one place, with AI support where faster decisions help.",
          href: "/features/maintenance-management",
          points: ["review the quote", "approve with context", "keep the audit trail"],
          imageSrc: "/screenshots/maintenance-inbox.png",
          imageAlt: "OASIS maintenance workflow showing request context, work-order progress, and the next decision.",
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
      imageAlt: "OASIS Security Audit page showing policy settings and account-scoped review trails.",
    },
    finalCta: {
      title: "See OASIS before public launch",
      body:
        "If your real problem is keeping maintenance, documents, payments visibility, and follow-up moving together, OASIS is built for that stage.",
      primaryCta: { label: "See how OASIS works", href: siteConfig.appUrl },
      secondaryCta: { label: "See the tenant portal", href: "/features/tenant-portal" },
    },
  },
  pl: {
    seo: {
      title: "OASIS dla właścicieli mieszkań | Pełna kontrola nad najmem",
      description:
        "OASIS pomaga właścicielom mieszkań zarządzać najmem z pełną kontrolą: zgłoszenia, wykonawcy, dokumenty, widoczność płatności, kondycja nieruchomości, compliance i kolejki działań wspierane przez AI.",
      canonicalPath: "/pl",
    },
    hero: {
      eyebrow: "Dla właścicieli, którzy naprawdę prowadzą najem",
      title: "Miej pełną kontrolę nad najmem.",
      body:
        "OASIS pokazuje, co wymaga działania — od zgłoszeń najemców i zleceń dla wykonawców po płatności, dokumenty i kondycję nieruchomości.",
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
        "Panel Command Center w OASIS z briefingiem AI, pilnymi kolejkami i działaniami w całym portfelu.",
      primaryCta: { label: "Zobacz, jak działa OASIS", href: siteConfig.appUrl },
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
        "OASIS pomaga właścicielom mieszkań prowadzić najem z pełną kontrolą — nie tylko przechowywać dane. Łączy kolejki działań, wykonanie pracy, komunikację i historię zmian.",
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
          imageAlt: "Command Center w OASIS z briefingiem AI i kolejkami działań dla całego konta.",
        },
        {
          label: "Utrzymanie",
          title: "Zgłoszenia i zlecenia w jednym obiegu",
          body: "Zgłoszenia, triage, zlecenia, rekomendacje wykonawców i zmiana statusów pozostają w jednym przepływie operacyjnym.",
          points: ["triage AI", "kontrola zleceń", "koordynacja wykonawców"],
          imageSrc: "/screenshots/maintenance-inbox.png",
          imageAlt: "Skrzynka zgłoszeń OASIS z triage AI, kolumnami zgłoszeń i powiązanymi zleceniami.",
        },
        {
          label: "Portal najemcy",
          title: "Portal, który ogranicza dopytywanie",
          body: "Najemca widzi dokumenty, płatności, postęp zgłoszeń i kroki związane z umową bez ciągłego przypominania.",
          points: ["widoczność zgłoszeń", "dokumenty", "obsługa umów"],
          imageSrc: "/screenshots/tenant-home.png",
          imageAlt: "Panel najemcy OASIS z działaniami, płatnościami i postępem zgłoszeń.",
        },
        {
          label: "Dokumenty",
          title: "Umowy i dowody powiązane z konkretną pracą",
          body: "Biblioteka szablonów, prośby o dokumenty, pakiety umów i gotowość do podpisu pozostają spięte z tym samym kontem i procesem.",
          points: ["prośby o dokumenty", "pakiety umów", "workflow podpisów"],
          imageSrc: "/screenshots/documents-workflow.png",
          imageAlt: "Widok dokumentów OASIS z prośbami o dokumenty, pakietami umów i kontrolkami podpisu.",
        },
        {
          label: "Kondycja",
          title: "Zobacz presję na nieruchomości zanim się rozleje",
          body: "Scoring kondycji łączy zaległości, obciążenie zgłoszeniami, pustostany i braki compliance w jeden obraz z objaśnieniem AI.",
          points: ["scoring ryzyka", "objaśnienie AI", "wcześniejsza reakcja"],
          imageSrc: "/screenshots/portfolio-health.png",
          imageAlt: "Widok Portfolio Health OASIS ze scoringiem, ryzykiem nieruchomości i kartą objaśnienia AI.",
        },
        {
          label: "Compliance",
          title: "Ryzyko umów, ekspozycja czynszowa i terminy podatkowe w jednym miejscu",
          body: "Pakiet compliance wykrywa ryzykowne klauzule w umowach najmu dzięki AI, ocenia ekspozycję czynszową portfela za pomocą Rent Shield i śledzi zobowiązania podatkowe, zanim cokolwiek urośnie w cieniu codziennej pracy.",
          points: ["audyt klauzul umownych", "scoring Rent Shield", "gotowość podatkowa"],
          imageSrc: "/screenshots/compliance-suite.png",
          imageAlt: "Pakiet compliance OASIS z Audytorem umów, wynikami Rent Shield i panelem gotowości podatkowej.",
        },
        {
          label: "Bezpieczeństwo",
          title: "Ślad audytowy w standardzie",
          body: "Role, przegląd zmian i audyt bezpieczeństwa pomagają działać szybko bez utraty odpowiedzialności.",
          points: ["ślad audytowy", "uprawnienia", "ekrany przeglądu"],
          imageSrc: "/screenshots/security-audit.png",
          imageAlt: "Strona Security Audit OASIS z przeglądem zdarzeń i polityk bezpieczeństwa.",
        },
      ],
    },
    healthSection: {
      eyebrow: "Kondycja nieruchomości",
      title: "Wiedz, która nieruchomość wymaga reakcji, zanim problem zrobi się drogi",
      body:
        "OASIS łączy obciążenie zgłoszeniami, zaległości, opóźnienia wykonawców, braki compliance i presję pustostanów w jeden wynik kondycji.",
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
        "Panel Portfolio Health OASIS pokazujący ryzyko nieruchomości, miks obłożenia i gotowe sygnały do działania.",
      imageAlign: "left",
    },
    tenantPortalSection: {
      eyebrow: "Przepływ najemca i wykonawca",
      title: "Utrzymuj jasność dla najemców i wykonawców bez utraty kontroli",
      body:
        "OASIS daje najemcom bezpieczny kanał samoobsługi, a jednocześnie spina pracę właściciela i wykonawcy w jeden proces.",
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
      imageAlt: "Strona dokumentów w portalu najemcy OASIS z prośbami, uploadem i przeglądem umów.",
      primaryCta: { label: "Zobacz portal najemcy", href: "/features/tenant-portal" },
      secondaryCta: { label: "Poznaj workflow najemcy", href: "/features/tenant-management" },
    },
    workflowSection: {
      title: "Jak praca idzie do przodu",
      body:
        "OASIS jest zbudowany wokół realnego przepływu: od zgłoszenia najemcy, przez decyzję właściciela, po wykonanie i zamknięcie sprawy.",
      itemCtaLabel: "Poznaj ten workflow",
      items: [
        {
          label: "Krok 1",
          title: "Najemca zgłasza problem z właściwym kontekstem",
          body: "Zgłoszenie trafia od razu z kontekstem nieruchomości i czytelnym zapisem, zamiast stawać się kolejną wiadomością do odtworzenia.",
          href: "/features/maintenance-management",
          points: ["czytelny intake", "kontekst nieruchomości", "śledzone zgłoszenie"],
          imageSrc: "/screenshots/property-requests.png",
          imageAlt: "Widok zgłoszeń OASIS z problemami od najemców i dalszą operacyjną obsługą.",
        },
        {
          label: "Krok 2",
          title: "Właściciel przypisuje wykonanie i otwiera ścieżkę dla wykonawcy",
          body: "Następny właściciel sprawy jest jasny, zlecenie powstaje w tym samym systemie, a wszyscy widzą ten sam kontekst.",
          href: "/features/maintenance-management",
          points: ["szybkie przypisanie", "widoczna odpowiedzialność", "mniej dopytywania"],
          imageSrc: "/screenshots/maintenance-inbox.png",
          imageAlt: "Skrzynka zgłoszeń OASIS z aktywnymi sprawami, zleceniami i przebiegiem statusów.",
        },
        {
          label: "Krok 3",
          title: "Wyceny, decyzje i zamknięcie sprawy pozostają razem",
          body: "Aktualizacja wykonawcy, akceptacja właściciela i ślad zakończenia pozostają w jednym miejscu, z pomocą AI tam, gdzie przyspiesza decyzję.",
          href: "/features/maintenance-management",
          points: ["przegląd wyceny", "decyzja z kontekstem", "spójny ślad działań"],
          imageSrc: "/screenshots/maintenance-inbox.png",
          imageAlt: "Workflow zgłoszeń OASIS z kontekstem sprawy, postępem zlecenia i decyzją.",
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
      imageAlt: "Strona Security Audit OASIS z ustawieniami polityk i śladem działań w koncie.",
    },
    finalCta: {
      title: "Zobacz OASIS przed publicznym startem",
      body:
        "Jeśli Twoim realnym problemem jest utrzymanie zgłoszeń, dokumentów, płatności i follow-upu w jednym rytmie pracy, OASIS powstał właśnie dla tego etapu.",
      primaryCta: { label: "Zobacz, jak działa OASIS", href: siteConfig.appUrl },
      secondaryCta: { label: "Zobacz portal najemcy", href: "/features/tenant-portal" },
    },
  },
  de: {
    seo: {
      title: "OASIS für Vermieter | Immobilienabläufe aktiv steuern",
      description:
        "OASIS hilft Vermietern, Immobilienabläufe aktiv zu steuern: Mieteranfragen, Instandhaltung, Dokumente, Zahlungsübersicht, Immobilienzustand, Compliance-Risiken und AI-gestützte Aufgabenlisten in einer klaren Plattform.",
      canonicalPath: "/de",
    },
    hero: {
      eyebrow: "Für Vermieter mit operativem Anspruch",
      title: "Behalten Sie Ihre Immobilien im Griff.",
      body:
        "OASIS zeigt, was Aufmerksamkeit braucht — von Mieteranfragen und Arbeitsaufträgen bis zu Zahlungsübersicht, Dokumenten und Immobilienzustand.",
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
        "OASIS Command Center mit AI-Briefing, dringenden Aufgaben und operativen Warteschlangen im Portfolio.",
      primaryCta: { label: "OASIS im Einsatz sehen", href: siteConfig.appUrl },
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
        "OASIS hilft Vermietern, Immobilienabläufe aktiv zu steuern — nicht nur Daten zu verwalten. Aufgaben, Ausführung, Kommunikation und Audit-Historie bleiben zusammen.",
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
          imageAlt: "OASIS Command Center mit AI-Briefing und portfolioweiten Aufgabenlisten.",
        },
        {
          label: "Instandhaltung",
          title: "Instandhaltung und Arbeitsaufträge in einem Ablauf",
          body: "Anfragen, Triage, Arbeitsaufträge, Handwerkerempfehlungen und Statuswechsel bleiben in einem einzigen operativen Fluss.",
          points: ["AI-Triage", "Arbeitsauftragssteuerung", "Handwerkerkoordination"],
          imageSrc: "/screenshots/maintenance-inbox.png",
          imageAlt: "OASIS Maintenance Inbox mit AI-Triage, Anfrage-Spalten und verknüpften Arbeitsaufträgen.",
        },
        {
          label: "Mieterportal",
          title: "Ein klarer Self-Service-Kanal für Mieter",
          body: "Mieter sehen Dokumente, Zahlungsübersicht, Wartungsupdates und Vertragsschritte an einem Ort statt in verstreuten Erinnerungen.",
          points: ["Wartungsstatus", "Dokumente", "Vertragsabläufe"],
          imageSrc: "/screenshots/tenant-home.png",
          imageAlt: "OASIS Mieterportal mit Aktionen, Zahlungsübersicht und Wartungsfortschritt.",
        },
        {
          label: "Dokumente",
          title: "Verträge und Nachweise bleiben am Vorgang",
          body: "Vorlagen, Dokumentenanfragen, Vertragspakete und Signaturbereitschaft bleiben mit demselben Konto und derselben Arbeit verknüpft.",
          points: ["Dokumentenanfragen", "Vertragspakete", "Signaturablauf"],
          imageSrc: "/screenshots/documents-workflow.png",
          imageAlt: "OASIS Dokumentenansicht mit Anfragen, Vertragspaketen und Signatursteuerung.",
        },
        {
          label: "Immobilienzustand",
          title: "Risiko erkennen, bevor es eskaliert",
          body: "Immobilien-Scores machen Rückstände, Instandhaltungsdruck, Leerstandsrisiko und Compliance-Lücken früh sichtbar, ergänzt durch eine AI-Erklärung.",
          points: ["Risikobewertung", "AI-Erklärung", "früheres Eingreifen"],
          imageSrc: "/screenshots/portfolio-health.png",
          imageAlt: "OASIS Portfolio Health mit Risikoscore, Immobilienlage und AI-Erklärung.",
        },
        {
          label: "Compliance",
          title: "Vertragsrisiken, Mietexposition und Steuerfristen auf einen Blick",
          body: "Die Compliance-Suite erkennt riskante Mietvertragsklauseln per AI, bewertet das portfolioweite Mietrisiko mit Rent Shield und verfolgt steuerliche Fristen — damit nichts still im Hintergrund wächst.",
          points: ["Mietvertrag-Klausel-Audit", "Rent Shield Bewertung", "Steuerbereitschaft"],
          imageSrc: "/screenshots/compliance-suite.png",
          imageAlt: "OASIS Compliance-Suite mit Mietvertrags-Auditor, Rent Shield Scores und Steuerbereitschafts-Dashboard.",
        },
        {
          label: "Sicherheit",
          title: "Nachvollziehbarkeit standardmäßig eingebaut",
          body: "Rollen, Prüfpfade und Security-Audit-Oberflächen helfen Teams, schnell zu handeln, ohne die Nachvollziehbarkeit zu verlieren.",
          points: ["Audit Trail", "Berechtigungen", "Prüfoberflächen"],
          imageSrc: "/screenshots/security-audit.png",
          imageAlt: "OASIS Security Audit Seite mit Sicherheitsereignissen und Richtlinienprüfung.",
        },
      ],
    },
    healthSection: {
      eyebrow: "Immobilienzustand",
      title: "Wissen, welche Adresse Eingreifen braucht, bevor der Druck teuer wird",
      body:
        "OASIS fasst Instandhaltungsdruck, Rückstände, Handwerkerverzug, Compliance-Lücken und Leerstandsrisiko in einem Gesundheitswert zusammen.",
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
        "OASIS Portfolio Health Dashboard mit Immobilienrisiko, Belegungsmix und erklärbaren Handlungsimpulsen.",
      imageAlign: "left",
    },
    tenantPortalSection: {
      eyebrow: "Mieter- und Handwerkerablauf",
      title: "Mieter klar führen und Handwerker ausrichten, ohne Kontrolle zu verlieren",
      body:
        "OASIS gibt Mietern einen sauberen Self-Service-Weg und hält gleichzeitig die Vermieter- und Handwerkerarbeit im selben Ablauf zusammen.",
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
      imageAlt: "OASIS Dokumentenseite im Mieterportal mit Anfragen, Uploads und Vertragsansicht.",
      primaryCta: { label: "Mieterportal ansehen", href: "/features/tenant-portal" },
      secondaryCta: { label: "Mieterabläufe ansehen", href: "/features/tenant-management" },
    },
    workflowSection: {
      title: "Wie der Ablauf vorankommt",
      body:
        "OASIS orientiert sich am realen Weg von der Mieteranfrage über die Vermieterentscheidung bis zur Ausführung und sauberen Nachverfolgung.",
      itemCtaLabel: "Diesen Ablauf ansehen",
      items: [
        {
          label: "Schritt 1",
          title: "Der Mieter meldet ein Thema mit dem richtigen Kontext",
          body: "Die Anfrage landet direkt mit Objektbezug und sauberem Verlauf statt als weitere Nachricht, die später rekonstruiert werden muss.",
          href: "/features/maintenance-management",
          points: ["saubere Erfassung", "Objektkontext", "nachverfolgbare Anfrage"],
          imageSrc: "/screenshots/property-requests.png",
          imageAlt: "OASIS Anfrageansicht mit gemeldeten Themen und operativer Weiterverfolgung.",
        },
        {
          label: "Schritt 2",
          title: "Der Vermieter weist zu und öffnet die Spur für den Handwerker",
          body: "Die nächste Verantwortung ist klar, der Arbeitsauftrag entsteht im selben System und alle sehen denselben Kontext.",
          href: "/features/maintenance-management",
          points: ["schnell zuweisen", "Verantwortung sichtbar halten", "Nachfragen reduzieren"],
          imageSrc: "/screenshots/maintenance-inbox.png",
          imageAlt: "OASIS Maintenance Inbox mit aktiven Vorgängen, Arbeitsaufträgen und Statusfluss.",
        },
        {
          label: "Schritt 3",
          title: "Angebot, Entscheidung und Abschluss bleiben zusammen",
          body: "Das Handwerkerupdate, die Freigabe des Vermieters und der Abschlussverlauf bleiben an einer Stelle, mit AI-Hilfe dort, wo sie die Entscheidung beschleunigt.",
          href: "/features/maintenance-management",
          points: ["Angebot prüfen", "mit Kontext freigeben", "Audit Trail sauber halten"],
          imageSrc: "/screenshots/maintenance-inbox.png",
          imageAlt: "OASIS Wartungsablauf mit Vorgangskontext, Arbeitsfortschritt und nächster Entscheidung.",
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
      imageAlt: "OASIS Security Audit Seite mit Richtlinien, Ereignissen und kontobezogener Nachverfolgung.",
    },
    finalCta: {
      title: "OASIS vor dem öffentlichen Start ansehen",
      body:
        "Wenn Ihr echtes Problem darin liegt, Instandhaltung, Dokumente, Zahlungsübersicht und Nachverfolgung zusammenzuhalten, ist OASIS genau für diese Phase gebaut.",
      primaryCta: { label: "OASIS im Einsatz sehen", href: siteConfig.appUrl },
      secondaryCta: { label: "Mieterportal ansehen", href: "/features/tenant-portal" },
    },
  },
};
