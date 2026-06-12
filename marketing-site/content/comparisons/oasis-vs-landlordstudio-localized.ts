import type { Locale } from "../../lib/i18n";

import { siteConfig } from "../site";

type ComparisonContent = {
  seo: {
    title: string;
    description: string;
    canonicalPath: string;
  };
  hero: {
    eyebrow: string;
    title: string;
    body: string;
    imageSrc: string;
    imageAlt: string;
  };
  summary: {
    eyebrow: string;
    title: string;
    body: string;
    imageSrc: string;
    imageAlt: string;
  };
  comparisonTable: {
    title: string;
    intro: string;
    competitorName: string;
    categoryLabel: string;
    oasisLabel: string;
    rows: Array<{
      category: string;
      oasis: string;
      competitor: string;
    }>;
  };
  differences: {
    eyebrow: string;
    title: string;
    body: string;
    imageSrc: string;
    imageAlt: string;
    imageAlign: "left" | "right";
    items: Array<{ title: string; body: string }>;
  };
  fit: {
    title: string;
    items: Array<{ title: string; body: string }>;
  };
  finalCta: {
    title: string;
    body: string;
    primaryCta: { label: string; href: string };
    secondaryCta: { label: string; href: string };
  };
};

export const oasisVsLandlordStudioContentByLocale: Record<Locale, ComparisonContent> = {
  en: {
    seo: {
      title: "Tenaqo vs Landlord Studio | Which is better for landlords?",
      description:
        "Compare Tenaqo and Landlord Studio when the choice is between accounting-led landlord software and deeper property operations control.",
      canonicalPath: "/compare/oasis-vs-landlordstudio",
    },
    hero: {
      eyebrow: "Comparison",
      title: "Tenaqo vs Landlord Studio",
      body:
        "Landlord Studio is strongest when accounting, bank feeds, online rent collection, and financial reporting lead the decision. Tenaqo is stronger when the daily challenge is operational control: rent rules, expected charges, maintenance movement, document evidence, compliance evidence, contractors, audit, and what needs action next.",
      imageSrc: "/screenshots/command-center.png",
      imageAlt: "Tenaqo Command Center showing urgent items and connected portfolio actions.",
    },
    summary: {
      eyebrow: "High-level comparison",
      title: "The real split appears when accounting stops being the whole job",
      body:
        "Landlord Studio is appealing when the goal is accounting clarity and lighter landlord tracking. Tenaqo becomes more compelling when the week is shaped by overdue balances, maintenance progress, contractor coordination, tenant context, document handoffs, and the need to stay ahead of pressure across the portfolio.",
      imageSrc: "/screenshots/documents-workflow.png",
      imageAlt: "Tenaqo Documents page showing document requests, agreement packets, and account-scoped workflow controls.",
    },
    comparisonTable: {
      title: "Side-by-side comparison",
      intro:
        "This is a fair comparison between two different strengths: Landlord Studio's accounting-oriented toolkit and Tenaqo' property operations workflow.",
      competitorName: "Landlord Studio",
      categoryLabel: "Category",
      oasisLabel: "Tenaqo",
      rows: [
        {
          category: "Primary emphasis",
          oasis:
            "Landlord operating layer: rent rules, expected charges, maintenance movement, compliance evidence, contractors, audit, and what needs action next",
          competitor:
            "Landlord accounting, reporting, rent collection, and mobile-friendly portfolio tracking",
        },
        {
          category: "Rent calculation logic",
          oasis:
            "Rules-based Rent Plans Engine: base rent, proration (6 methods), utilities, deposits, charge rules, calculation previews, and safe Finance posting with approval before ledger write",
          competitor:
            "Rent tracking and accounting with strong financial reporting; less emphasis on rules-based expected charge generation",
        },
        {
          category: "Expected charges",
          oasis:
            "Generate scheduled expected charges from approved calculations; post to Finance via approved RPC only; append-only ledger preserved",
          competitor:
            "Rent recording through accounting flow; expected charge generation not prominently featured",
        },
        {
          category: "Advanced rent models",
          oasis:
            "Split rent, room-based rent, variable utilities, rent adjustments, rent increase workflow, and STR nightly charges — included on every plan",
          competitor:
            "Accounting-led rent tracking; advanced rent model depth not prominently featured",
        },
        {
          category: "Finance and rent collection",
          oasis:
            "Rent visibility, arrears pressure, expected charges, reconciliation, and landlord-configured tenant payment setup. No native payment rail today; Tenaqo does not collect rent, move money, or operate as a payment rail.",
          competitor:
            "Stronger publicly advertised accounting stack with bank feeds, reporting, and online rent collection",
        },
        {
          category: "Maintenance workflow",
          oasis:
            "Request intake, work orders, status tracking, ownership, contractor coordination, action queues, and AI triage",
          competitor:
            "Maintenance request tracking with less emphasis on command-centre style operational follow-through",
        },
        {
          category: "Compliance evidence",
          oasis:
            "Renters' Rights readiness, Tax Readiness, Rent Shield, AI-assisted clause flagging for landlord review, Poland Najem Okazjonalny — integrated into the weekly workflow",
          competitor:
            "Compliance tracking useful for accounting; less emphasis on integrated workflow-level compliance evidence and evidence trails",
        },
        {
          category: "AI action queues",
          oasis:
            "Command Center with AI-assisted briefing, maintenance triage, property health explainer, attention insights, and message drafts across Growth, Pro, and Operator tiers",
          competitor:
            "Useful landlord task tracking with less emphasis on AI-assisted action prioritization",
        },
        {
          category: "Audit and security",
          oasis:
            "Security audit event ledger, anomaly detection, investigation panel, role-based access, and export jobs on Pro and Operator tiers",
          competitor:
            "Account security and permission management; dedicated security audit ledger not prominently featured",
        },
        {
          category: "Contractor workflow",
          oasis:
            "Contractor directory, ratings, contractor portal (view jobs, upload photos, mark completion), contractor marketplace integrations planned, with Checkatrade under discussion, acknowledgement workflow",
          competitor:
            "Contractor management tools for work orders; dedicated contractor portal depth varies",
        },
        {
          category: "Agency / operator depth",
          oasis:
            "Operator / Agency plan: bulk rent automation, planned portfolio forecasting, designed for future Open Banking rent matching, cross-account anomaly detection, planned security copilot, planned natural language query",
          competitor:
            "Portfolio management for growing landlords; multi-client agency operator tooling not the primary emphasis",
        },
        {
          category: "Daily visibility",
          oasis:
            "Command Center, AI-assisted briefing, portfolio health scoring, and pressure signals make prioritization easier",
          competitor:
            "Useful tracking across key landlord tasks with less emphasis on action queues and operational triage",
        },
        {
          category: "Documents and agreements",
          oasis:
            "Template library, document requests, agreement packets, and signature readiness in one account-scoped lane",
          competitor:
            "Tenant and document support with less emphasis on document handoff and pre-signature workflow depth",
        },
      ],
    },
    differences: {
      eyebrow: "Where Tenaqo stands out",
      title: "Most rental tools store what happened. Tenaqo helps move what happens next.",
      body:
        "This is not a claim that Landlord Studio lacks useful landlord tooling. Tenaqo stands out when the harder problem is operational control: rent rules and expected charges, maintenance movement, compliance evidence inside the workflow, and reducing dropped follow-up across the portfolio.",
      imageSrc: "/screenshots/maintenance-inbox.png",
      imageAlt: "Tenaqo Maintenance Inbox showing structured request workflow and linked work orders.",
      imageAlign: "left",
      items: [
        {
          title: "Rent Plans Engine handles the calculation layer",
          body:
            "Tenaqo builds rent as a rules engine: expected charges, proration, utilities, deposits, advanced models, and safe Finance posting with approval before the ledger is touched. Preview before you post.",
        },
        {
          title: "Maintenance has a clearer path",
          body:
            "Tenaqo gives repair work a path from request to work order to progress review, helping landlords catch stalled items, blocked jobs, and missed ownership sooner.",
        },
        {
          title: "Compliance sits inside the working week",
          body:
            "Renters' Rights readiness, Rent Shield, AI-assisted clause flagging, Tax Readiness, and Poland compliance are part of the operational workflow — not a separate seasonal scramble.",
        },
        {
          title: "Action is easier to prioritize",
          body:
            "Command Center queues, AI-assisted briefings, and portfolio health signals make it easier to decide what deserves attention first instead of manually reconstructing the week.",
        },
      ],
    },
    fit: {
      title: "Which fit sounds more like your portfolio?",
      items: [
        {
          title: "Choose Tenaqo if",
          body:
            "You need rent rules and expected charges, maintenance workflows, compliance evidence, contractor coordination, document evidence, audit trails, and a clear view of what needs action — all connected.",
        },
        {
          title: "Choose Landlord Studio if",
          body:
            "You mainly want mobile-friendly accounting, bank feeds, online rent collection, financial reporting, and a lighter landlord toolkit built around financial admin.",
        },
        {
          title: "You may be outgrowing simpler tools when",
          body:
            "The question is no longer where to store information, but how to keep rent, repairs, documents, compliance, and follow-up moving together without dropped handoffs.",
        },
      ],
    },
    finalCta: {
      title: "Need more operational control than an accounting-first landlord tool gives you?",
      body:
        "If your portfolio has moved beyond accounting clarity into day-to-day coordination pressure, Tenaqo gives rent, repairs, records, and action queues a clearer operating rhythm.",
      primaryCta: { label: "Get early access", href: siteConfig.appUrl },
      secondaryCta: { label: "See the tenant portal", href: "/tenant-portal-software" },
    },
  },
  pl: {
    seo: {
      title: "Tenaqo vs Landlord Studio | Porównanie dla właścicieli",
      description:
        "Porównaj Tenaqo i Landlord Studio, jeśli wybierasz między oprogramowaniem skupionym na księgowości a głębszą kontrolą nad operacyjnym zarządzaniem nieruchomościami.",
      canonicalPath: "/pl/compare/oasis-vs-landlordstudio",
    },
    hero: {
      eyebrow: "Porównanie",
      title: "Tenaqo vs Landlord Studio",
      body:
        "Landlord Studio sprawdza się najlepiej, gdy priorytetem jest księgowość najmu, integracja z bankiem, pobieranie czynszu online i raportowanie finansowe. Tenaqo wygrywa tam, gdzie codziennym wyzwaniem jest kontrola operacyjna: reguły czynszowe, oczekiwane opłaty, płynna obsługa napraw, zbieranie dokumentacji i dowodów zgodności z przepisami, współpraca z wykonawcami, audyty oraz ustalanie kolejnych kroków.",
      imageSrc: "/screenshots/command-center.png",
      imageAlt: "Centrum dowodzenia Tenaqo z pilnymi zadaniami i połączonymi działaniami w portfelu.",
    },
    summary: {
      eyebrow: "Porównanie w skrócie",
      title: "Prawdziwa różnica zaczyna się wtedy, gdy księgowość przestaje być jedyną pracą",
      body:
        "Landlord Studio przyciąga uwagę, gdy celem jest przejrzystość księgowa i prostsze śledzenie najmu. Tenaqo staje się kluczowe, gdy Twój tydzień definiują zaległości w opłatach, postępy napraw, koordynacja wykonawców, pełny kontekst najemcy, przekazywanie dokumentów oraz potrzeba zapobiegania kryzysom w portfelu.",
      imageSrc: "/screenshots/documents-workflow.png",
      imageAlt: "Strona Dokumenty w Tenaqo przedstawiająca prośby o dokumenty, pakiety umów oraz procesy kontroli na poziomie konta.",
    },
    comparisonTable: {
      title: "Porównanie obok siebie",
      intro:
        "To uczciwe porównanie dwóch różnych mocnych stron: bardziej finansowego podejścia Landlord Studio i operacyjnego workflow Tenaqo.",
      competitorName: "Landlord Studio",
      categoryLabel: "Obszar",
      oasisLabel: "Tenaqo",
      rows: [
        {
          category: "Główne nastawienie",
          oasis:
            "Operacje i koordynacja najmu: co wymaga działania, co utknęło i co powinno ruszyć dalej",
          competitor:
            "Księgowość najmu, raportowanie, pobór czynszu i mobilne śledzenie portfela",
        },
        {
          category: "Finanse i pobór czynszu",
          oasis:
            "Czytelna widoczność płatności, presja zaległości i konfiguracja płatności najemcy w szerszym workflow operacyjnym",
          competitor:
            "Mocniej komunikowany stack finansowy z bank feeds, raportowaniem i poborem czynszu online",
        },
        {
          category: "Workflow zgłoszeń",
          oasis:
            "Intake zgłoszeń, zlecenia, statusy, odpowiedzialność, koordynacja wykonawców i kolejki działań",
          competitor:
            "Śledzenie zgłoszeń dostępne, ale z mniejszym naciskiem na operacyjne doprowadzanie spraw do końca",
        },
        {
          category: "Codzienna widoczność",
          oasis:
            "Command Center, briefing AI, kondycja portfela i sygnały presji ułatwiają priorytetyzację",
          competitor:
            "Przydatne śledzenie kluczowych obszarów najmu, ale z mniejszym naciskiem na kolejki działań i triage",
        },
        {
          category: "Dokumenty i umowy",
          oasis:
            "Biblioteka szablonów, prośby o dokumenty, pakiety umów i gotowość do podpisu w jednej ścieżce",
          competitor:
            "Przydatne wsparcie dokumentowe i portalowe, ale mniejsza głębokość obiegu dokumentów i pre-signature workflow",
        },
      ],
    },
    differences: {
      eyebrow: "Gdzie Tenaqo się wyróżnia",
      title: "Większość narzędzi do najmu zapisuje to, co już się wydarzyło. Tenaqo pomaga pchnąć do przodu to, co ma wydarzyć się dalej.",
      body:
        "To nie oznacza, że Landlord Studio brakuje przydatnych narzędzi. Tenaqo wyróżnia się jednak tam, gdzie największym wyzwaniem jest kontrola operacyjna: reguły czynszowe i oczekiwane opłaty, płynność obsługi napraw, zbieranie dowodów zgodności z przepisami wewnątrz procesów oraz eliminacja niedokończonych spraw w całym portfelu.",
      imageSrc: "/screenshots/maintenance-inbox.png",
      imageAlt: "Skrzynka zgłoszeń Tenaqo ze strukturalnym procesem obsługi i powiązanymi zleceniami.",
      imageAlign: "left",
      items: [
        {
          title: "Silnik planów czynszowych zarządza warstwą obliczeniową",
          body:
            "Tenaqo opiera czynsze na silniku reguł: obsługuje oczekiwane opłaty, proporcjonalne rozliczenia, media, kaucje, zaawansowane modele oraz bezpieczne księgowanie finansów z zatwierdzaniem przed wprowadzeniem zmian w księdze. Podgląd przed zaksięgowaniem.",
        },
        {
          title: "Jaśniejsza ścieżka obsługi napraw",
          body:
            "Tenaqo wyznacza jasną ścieżkę dla napraw — od zgłoszenia, przez zlecenie, aż po przegląd postępów — pomagając właścicielom szybciej wyłapać zastoje, zablokowane zadania i brak osoby odpowiedzialnej.",
        },
        {
          title: "Zgodność z przepisami wpisana w roboczy tydzień",
          body:
            "Gotowość na zmiany prawne (Renters' Rights), ochrona czynszu (Rent Shield), wspierane przez AI flagowanie klauzul, rozliczenia podatkowe i zgodność z polskimi przepisami są częścią codziennej pracy — a nie osobnym, sezonowym zrywem.",
        },
      ],
    },
    fit: {
      title: "Które dopasowanie bardziej przypomina Twój portfel?",
      items: [
        {
          title: "Wybierz Tenaqo, jeśli",
          body:
            "Potrzebujesz reguł czynszowych, obsługi napraw, dowodów zgodności z przepisami, koordynacji wykonawców, dokumentacji, ścieżek audytu i jasnego wglądu w pilne zadania — a wszystko to w jednym, połączonym systemie.",
        },
        {
          title: "Wybierz Landlord Studio, jeśli",
          body:
            "Zależy Ci głównie na wygodnej księgowości mobilnej, automatycznej synchronizacji z bankiem, pobieraniu czynszu online, raportowaniu finansowym i lżejszym zestawie narzędzi skupionym na administracji finansowej.",
        },
        {
          title: "Prawdopodobnie wyrastasz z prostszych narzędzi, gdy",
          body:
            "Kluczowym pytaniem nie jest już to, gdzie przechowywać informacje, ale jak sprawnie zarządzać czynszami, naprawami, dokumentami, zgodnością z przepisami i bieżącymi sprawami bez gubienia wątków.",
        },
      ],
    },
    finalCta: {
      title: "Potrzebujesz większej kontroli operacyjnej, niż oferują programy skupione wyłącznie na księgowości?",
      body:
        "Jeśli wyzwania w Twoim portfelu wykraczają już poza samą przejrzystość księgową i wymagają codziennej koordynacji, Tenaqo nadaje czynszom, naprawom, dokumentom i kolejkom zadań wyraźny rytm operacyjny.",
      primaryCta: { label: "Zyskaj wcześniejszy dostęp", href: siteConfig.appUrl },
      secondaryCta: { label: "Zobacz portal najemcy", href: "/tenant-portal-software" },
    },
  },
  de: {
    seo: {
      title: "Tenaqo vs Landlord Studio | Was passt besser zu Vermietern?",
      description:
        "Vergleich von Tenaqo und Landlord Studio für Vermieter, die zwischen buchhaltungsorientierter Software und stärkerer operativer Kontrolle wählen.",
      canonicalPath: "/de/compare/oasis-vs-landlordstudio",
    },
    hero: {
      eyebrow: "Vergleich",
      title: "Tenaqo vs Landlord Studio",
      body:
        "Landlord Studio ist besonders stark, wenn Buchhaltung, Bankanbindung, Online-Mieteinzug und Reporting im Vordergrund stehen. Tenaqo ist stärker, wenn der tägliche Engpass operative Kontrolle ist: Zahlungsverfolgung, Instandhaltung, Dokumente, Unterschriften und die Frage, was zuerst bewegt werden muss.",
      imageSrc: "/screenshots/command-center.png",
      imageAlt: "Tenaqo Command Center mit dringenden Themen und verbundenen Portfolio-Aktionen.",
    },
    summary: {
      eyebrow: "Kurzvergleich",
      title: "Der eigentliche Unterschied beginnt, wenn Buchhaltung nicht mehr die ganze Arbeit ist",
      body:
        "Landlord Studio wirkt überzeugend, wenn finanzielle Übersicht und leichtere Vermieterverwaltung im Mittelpunkt stehen. Tenaqo wird stärker, wenn die Woche von Rückständen, Reparaturfortschritt, Handwerkerkoordination, Mieterkontext, Dokumentenübergaben und wachsendem Handlungsdruck im Portfolio geprägt ist.",
      imageSrc: "/screenshots/documents-workflow.png",
      imageAlt: "Tenaqo Documents Ansicht mit Dokumentenanfragen, Vertragspaketen und kontobezogenem Workflow.",
    },
    comparisonTable: {
      title: "Direkter Vergleich",
      intro:
        "Das ist ein fairer Vergleich zweier unterschiedlicher Stärken: Landlord Studios buchhaltungsorientiertes Vermieter-Toolkit und der operative Workflow von Tenaqo.",
      competitorName: "Landlord Studio",
      categoryLabel: "Bereich",
      oasisLabel: "Tenaqo",
      rows: [
        {
          category: "Hauptfokus",
          oasis:
            "Immobilienabläufe und Koordination: was Aufmerksamkeit braucht, wo Arbeit feststeckt und was als Nächstes bewegt werden sollte",
          competitor:
            "Vermieter-Buchhaltung, Reporting, Mieteinzug und mobilfreundliche Portfolioübersicht",
        },
        {
          category: "Finanzen und Mieteinzug",
          oasis:
            "Klare Mietübersicht, Rückstandsdruck und vom Vermieter konfiguriertes Zahlungssetup im größeren operativen Ablauf",
          competitor:
            "Stärker beworbener Finanz-Stack mit Bank-Feeds, Reporting und Online-Mieteinzug",
        },
        {
          category: "Instandhaltungsworkflow",
          oasis:
            "Anfrageeingang, Arbeitsaufträge, Status, Verantwortung, Handwerkerkoordination und Aktionswarteschlangen",
          competitor:
            "Verfolgung von Wartungsanfragen, aber mit weniger Fokus auf operatives Nachhalten bis zum Abschluss",
        },
        {
          category: "Tägliche Übersicht",
          oasis:
            "Command Center, KI-Briefing, Immobilienzustand und Drucksignale erleichtern die Priorisierung",
          competitor:
            "Nützliche Verfolgung zentraler Vermieterthemen, aber mit weniger Fokus auf Aktionswarteschlangen und Triage",
        },
        {
          category: "Dokumente und Verträge",
          oasis:
            "Vorlagenbibliothek, Dokumentenanfragen, Vertragspakete und Signaturbereitschaft in einer kontobezogenen Spur",
          competitor:
            "Sinnvolle Unterstützung für Dokumente und Mieterportal, aber weniger Tiefe bei Dokumentenübergaben und vorvertraglichem Signatur-Workflow",
        },
      ],
    },
    differences: {
      eyebrow: "Wo Tenaqo stärker ist",
      title: "Warum Vermieter nach einem buchhaltungsorientierten Tool zu Tenaqo wechseln könnten",
      body:
        "Das ist keine Behauptung, dass Landlord Studio keine nützlichen Funktionen bietet. Tenaqo sticht hervor, wenn das schwierigere Problem operative Geschwindigkeit ist: sehen, was Aufmerksamkeit braucht, Arbeit voranbringen und verlorene Nachverfolgung über das Portfolio hinweg reduzieren.",
      imageSrc: "/screenshots/maintenance-inbox.png",
      imageAlt: "Tenaqo Maintenance Inbox mit strukturiertem Anfrage-Workflow und verbundenen Arbeitsaufträgen.",
      imageAlign: "left",
      items: [
        {
          title: "Instandhaltung hat einen klareren Verlauf",
          body:
            "Tenaqo führt Arbeit von der Anfrage über den Arbeitsauftrag bis zur Fortschrittsprüfung, sodass Stau, Blockaden und fehlende Zuständigkeit früher sichtbar werden.",
        },
        {
          title: "Prioritäten lassen sich leichter setzen",
          body:
            "Command-Center-Warteschlangen, KI-Briefings und Portfoliosignale helfen dabei, schneller zu entscheiden, was zuerst Aufmerksamkeit verdient.",
        },
        {
          title: "Kontrolle geht über Datenspeicherung hinaus",
          body:
            "Tenaqo hält Mieterkontext, Dokumente, Zahlungsdruck, Reparaturstatus und Auditierbarkeit näher an der operativen Entscheidung.",
        },
      ],
    },
    fit: {
      title: "Welche Beschreibung passt eher zu Ihrem Portfolio?",
      items: [
        {
          title: "Wählen Sie Tenaqo, wenn",
          body:
            "Sie mehr Zeit mit Zahlungsverfolgung, Reparaturstatus, Dokumentensuche und Priorisierung verbringen als mit dem bloßen Erfassen von Vorgängen.",
        },
        {
          title: "Wählen Sie Landlord Studio, wenn",
          body:
            "Sie vor allem mobilfreundliche Buchhaltung, Reporting, Mieteinzug, Mieterportalzugang und ein leichteres Toolkit rund um Finanzverwaltung suchen.",
        },
        {
          title: "Sie wachsen aus einfacheren Tools heraus, wenn",
          body:
            "es nicht mehr um die Frage geht, wo Informationen gespeichert werden, sondern wie Zahlungen, Reparaturen, Dokumente und Nachverfolgung gemeinsam in Bewegung bleiben.",
        },
      ],
    },
    finalCta: {
      title: "Brauchen Sie mehr operative Kontrolle als ein buchhaltungsorientiertes Vermieter-Tool bietet?",
      body:
        "Wenn Ihr Portfolio über reine Finanzübersicht hinausgewachsen ist und heute tägliche Koordination verlangt, gibt Tenaqo Zahlungen, Reparaturen, Dokumenten und Aktionswarteschlangen einen klareren operativen Rhythmus.",
      primaryCta: { label: "Frühzugang sichern", href: siteConfig.appUrl },
      secondaryCta: { label: "Mieterportal ansehen", href: "/tenant-portal-software" },
    },
  },
};
