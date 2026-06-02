import type { Locale } from "../lib/i18n";

import { siteConfig } from "./site";

type PricingPageContent = {
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
  intro: {
    title: string;
    body: string;
    imageSrc: string;
    imageAlt: string;
  };
  plans: Array<{
    name: string;
    price: string;
    description: string;
    bullets: string[];
    highlight?: boolean;
    tag?: string;
  }>;
  planCtaLabel: string;
  included: {
    title: string;
    bullets: string[];
  };
  faqTitle: string;
  faqs: Array<{ question: string; answer: string }>;
  finalCta: {
    title: string;
    body: string;
    primaryCta: { label: string; href: string };
  };
};

export const pricingContentByLocale: Record<Locale, PricingPageContent> = {
  en: {
    seo: {
      title: "Tenaqo Pricing | Plans for Landlords, Portfolios and Property Operators",
      description:
        "Start simple and add control as your portfolio grows. Starter, Growth, Pro, and Operator / Agency plans for landlords, compliance-heavy operators, and property management companies.",
      canonicalPath: "/pricing",
    },
    hero: {
      eyebrow: "Pricing",
      title: "Start simple. Add control as your portfolio grows.",
      body:
        "Start with the core rental workflow. Upgrade when you need stronger attention queues, compliance evidence, audit control, automation, or agency-level finance intelligence.",
      imageSrc: "/screenshots/command-center.png",
      imageAlt: "Tenaqo Command Center showing urgent queues, overdue balance, and action items across the portfolio.",
    },
    intro: {
      title: "Pricing is aligned to operational maturity",
      body:
        "Starter helps solo landlords bring the basics into one place. Growth adds Command Center, portfolio health, compliance evidence tools, and AI assistance. Pro adds security audit, playbooks, AI-assisted clause flagging for landlord review, and deeper landlord-controlled governance. Operator / Agency adds bulk rent automation, designed for future Open Banking rent matching, planned portfolio pressure forecasting, and roadmap advanced AI for multi-client operations. Founder offer: the first 20 landlords get Pro at Starter price for 12 months.",
      imageSrc: "/screenshots/portfolio-health.png",
      imageAlt: "Tenaqo Portfolio Health dashboard showing occupancy, arrears aging, and maintenance pressure.",
    },
    plans: [
      {
        name: "Starter",
        price: "Move off spreadsheets",
        description:
          "For solo landlords with 1–10 properties who need rent, tenants, documents, and maintenance in one place before admin, arrears, and repairs spread across folders and message threads.",
        bullets: [
          "up to 10 properties",
          "rent plans engine and expected charges",
          "advanced rent models — split rent, room rent, STR nightly, discounts, utilities, rent increases",
          "tenants, properties, and core records in one place",
          "paid, due, and overdue rent visibility",
          "maintenance requests and work orders",
          "documents, tenant portal, contractor management",
          "multi-currency and multi-language",
        ],
      },
      {
        name: "Growth",
        price: "Control a busier portfolio",
        description:
          "For landlords with 10–50 properties where deciding what to do next is becoming the harder problem.",
        bullets: [
          "up to 50 properties",
          "everything in Starter",
          "Command Center — urgent, action, and upcoming queues",
          "portfolio health and maintenance KPI dashboards",
          "Renters' Rights readiness, Tax Readiness, Rent Shield",
          "Poland compliance toolkit (Najem Okazjonalny)",
          "AI maintenance triage, attention insights, property health explainer, message drafts",
          "500 AI calls / month",
        ],
        highlight: true,
        tag: "Best fit for active landlords",
      },
      {
        name: "Pro",
        price: "Operate with audit, compliance, and review depth",
        description:
          "For large or compliance-heavy landlords who need stronger governance, lease review, audit trails, and automation.",
        bullets: [
          "unlimited properties",
          "everything in Growth",
          "security audit — event ledger, anomaly detection, investigation panel",
          "playbooks — if-then automation for routine operations",
          "AI-assisted clause flagging for landlord review",
          "AI contractor recommendation and weekly portfolio summary",
          "advanced audit summaries and Poland advanced features",
          "3,000 AI calls / month",
        ],
      },
      {
        name: "Operator / Agency",
        price: "Run multi-client portfolios with automation and intelligence",
        description:
          "For property management companies and agency operators managing large portfolios or multiple landlord accounts.",
        bullets: [
          "unlimited properties",
          "everything in Pro",
          "bulk rent automation across tenants and periods",
          "roadmap AI finance insights and planned portfolio finance forecasting",
          "designed for future Open Banking rent matching",
          "planned security copilot and planned natural language portfolio query",
          "cross-account anomaly detection",
          "unlimited AI usage",
        ],
      },
    ],
    planCtaLabel: "See how Tenaqo works",
    included: {
      title: "Every plan includes the core rental workflow",
      bullets: [
        "Rent Plans Engine — rules-based expected charges, proration, deposit warnings, calculation previews, and finance posting with approval before the ledger is touched",
        "Advanced Rent Models — split rent, room rent, variable utilities, rent adjustments, rent increase workflow, and STR nightly charges",
        "Maintenance request and work order workflows",
        "Document storage, tenant portal, and contractor management",
        "Multi-currency (GBP, PLN, EUR, USD) and multi-language (EN, PL, DE)",
        "Append-only finance patterns with full rent plan history and audit trail",
      ],
    },
    faqTitle: "Frequently asked questions",
    faqs: [
      {
        question: "Which plan should I start with?",
        answer:
          "Start with Starter if the main goal is getting off spreadsheets and disconnected trackers. Choose Growth if you already have enough rent, repair, and property activity that deciding what to do first is the harder problem. Choose Pro when you want deeper review, security audit, playbooks, and AI-assisted clause flagging for landlord review. Choose Operator / Agency for multi-client portfolios, bulk rent automation, designed for future Open Banking rent matching, and roadmap AI.",
      },
      {
        question: "Why is the Rent Plans Engine included in every plan?",
        answer:
          "Rent calculation is part of the financial backbone of a rental operation. Every landlord needs accurate expected charges, proration, utilities, deposits, and safe Finance posting before advanced automation becomes useful. The Rent Plans Engine — including all six advanced rent models — is included on every plan.",
      },
      {
        question: "What is the difference between Growth and Pro?",
        answer:
          "Growth adds operational attention: Command Center, portfolio health, compliance evidence tools (Renters' Rights, Tax Readiness, Rent Shield, Poland), maintenance KPIs, preventive maintenance, and AI assistance. Pro adds deeper control: security audit, playbooks, AI-assisted clause flagging for landlord review, advanced audit summaries, and evidence-heavy compliance workflows.",
      },
      {
        question: "What is Operator / Agency for?",
        answer:
          "Operator / Agency is for property managers and multi-client operators who need bulk rent automation across tenants and periods, planned portfolio finance forecasting, designed for future Open Banking rent matching, cross-account anomaly detection, and roadmap AI including planned security copilot and planned natural language portfolio query.",
      },
      {
        question: "Does Tenaqo collect rent payments directly?",
        answer:
          "Today Tenaqo is focused on rent visibility, expected charges, reconciliation, balances, arrears pressure, and landlord-configured payment instructions. Native tenant payment collection and Open Banking automation are handled separately from the core ledger flow and should only be described where implemented. Tenaqo does not collect rent, move money, or operate as a payment rail today.",
      },
      {
        question: "Does every plan cover the core rental workflow?",
        answer:
          "Yes. The Rent Plans Engine, Advanced Rent Models, maintenance workflows, documents, and tenant portal are all included on every plan. Higher tiers add attention queues, compliance tools, audit depth, playbooks, and agency-level automation as the portfolio grows.",
      },
      {
        question: "Is there a Founder Launch Offer?",
        answer:
          "Yes. The first 20 landlords can access Pro at Starter pricing for 12 months. Reach out via the early-access link to claim your place.",
      },
      {
        question: "Is Tenaqo priced for landlords rather than agencies?",
        answer:
          "Plans are designed for the full range: solo landlords on Starter through to property management companies on Operator / Agency. Every tier is built around practical control without unnecessary complexity for the landlords who do not need it.",
      },
    ],
    finalCta: {
      title: "Try Tenaqo before we launch publicly",
      body:
        "Get early access, test the workflows, and help shape how Tenaqo supports landlords as it evolves.",
      primaryCta: { label: "See how Tenaqo works", href: siteConfig.appUrl },
    },
  },
  pl: {
    seo: {
      title: "Cennik Tenaqo | Plany dla właścicieli z operacyjną kontrolą",
      description:
        "Wybierz plan Tenaqo dopasowany do skali portfela, presji operacyjnej i potrzeby lepszego follow-upu.",
      canonicalPath: "/pl/pricing",
    },
    hero: {
      eyebrow: "Cennik",
      title: "Wybierz plan dopasowany do tego, jak naprawdę działa Twój najem",
      body:
        "Zacznij od wyjścia ze spreadsheetów. Rozszerz plan wtedy, gdy zgłoszenia, zaległości i presja na nieruchomościach zaczynają kosztować więcej niż samo narzędzie.",
      imageSrc: "/screenshots/command-center.png",
      imageAlt: "Command Center Tenaqo z pilnymi kolejkami, zaległościami i działaniami w całym portfelu.",
    },
    intro: {
      title: "Cennik jest oparty na dojrzałości operacyjnej",
      body:
        "Starter pomaga uporządkować podstawy. Growth jest dla bardziej zajętych portfeli, które potrzebują mocniejszej kontroli działań. Pro jest dla operatorów oczekujących głębszego przeglądu, większego zaufania audytowego i bardziej zdyscyplinowanego rytmu pracy. Operator / Agency jest dla zarządców nieruchomości obsługujących wiele kont lub dużych portfeli. Oferta dla pierwszych 20 właścicieli: Pro w cenie Starter przez 12 miesięcy.",
      imageSrc: "/screenshots/portfolio-health.png",
      imageAlt: "Panel Portfolio Health Tenaqo z obłożeniem, zaległościami i presją zgłoszeń.",
    },
    plans: [
      {
        name: "Starter",
        price: "Wyjdź ze spreadsheetów",
        description:
          "Dla właścicieli, którzy chcą zebrać podstawowy workflow najmu w jednym miejscu, zanim administracja, zaległości i naprawy rozjadą się po folderach i wiadomościach.",
        bullets: [
          "zbierz najemców, nieruchomości i podstawowe rekordy w jednym miejscu",
          "widzisz płatności opłacone, należne i zaległe",
          "obsługujesz zgłoszenia i zlecenia",
          "ograniczasz cotygodniowe odtwarzanie arkuszy i zgubione follow-upy",
        ],
      },
      {
        name: "Growth",
        price: "Przejmij kontrolę nad bardziej zajętym portfelem",
        description:
          "Dla właścicieli, których praca wyszła już poza zwykłą ewidencję i wymaga aktywnego follow-upu wokół płatności, napraw i presji na nieruchomościach.",
        bullets: [
          "wszystko ze Starter",
          "kolejki działań w stylu Command Center",
          "briefing AI i wsparcie triage zgłoszeń",
          "widoki kondycji portfela, zaległości i presji utrzymaniowej",
          "szybsze ustalanie priorytetów, gdy kilka spraw konkuruje naraz",
          "lepsza ochrona przed pominiętym follow-upem",
        ],
        highlight: true,
        tag: "Najlepszy wybór dla aktywnych właścicieli",
      },
      {
        name: "Pro",
        price: "Prowadź operacje z głębszym nadzorem",
        description:
          "Dla poważnych operatorów, którzy chcą mocniejszego nadzoru, cykli przeglądu i większej dyscypliny wraz ze wzrostem portfela.",
        bullets: [
          "nieograniczona liczba nieruchomości",
          "wszystko z Growth",
          "security audit i powierzchnie zaufania operacyjnego",
          "rekomendacje wykonawców AI i tygodniowe podsumowania portfela",
          "Wspierane przez AI flagowanie klauzul do przeglądu właściciela",
          "playbooki — automatyzacja rutynowych operacji",
          "3 000 wywołań AI / miesiąc",
        ],
      },
      {
        name: "Operator / Agency",
        price: "Zarządzaj portfelami wielu klientów z automatyzacją i inteligencją",
        description:
          "Dla firm zarządzających nieruchomościami obsługujących duże portfele lub wiele kont właścicielskich.",
        bullets: [
          "nieograniczona liczba nieruchomości",
          "wszystko z Pro",
          "masowa automatyzacja czynszów dla wielu najemców i okresów",
          "planowane prognozowanie finansów portfela i roadmapowe wglądy AI",
          "projektowane pod przyszłe dopasowywanie czynszu przez Open Banking",
          "planowany security copilot i planowane zapytania portfelowe w języku naturalnym",
          "nieograniczone użycie AI",
        ],
      },
    ],
    planCtaLabel: "Zobacz, jak działa Tenaqo",
    included: {
      title: "Każdy plan obejmuje podstawowy workflow najmu",
      bullets: [
        "Silnik planów czynszu — reguły naliczania, oczekiwane opłaty, naliczanie proporcjonalne, ostrzeżenia kaucyjne, podgląd obliczeń i bezpieczne księgowanie z zatwierdzeniem",
        "Zaawansowane modele czynszu — split rent, czynsz pokojowy, media, korekty, podwyżki czynszów, STR nightly",
        "Workflow zgłoszeń i zleceń",
        "Dokumenty, portal najemcy i zarządzanie wykonawcami",
        "Wielowalutowość (GBP, PLN, EUR, USD) i wielojęzyczność (EN, PL, DE)",
        "Niezmienialny rejestr finansów z historią planów czynszu i śladem audytowym",
      ],
    },
    faqTitle: "Najczęstsze pytania",
    faqs: [
      {
        question: "Dlaczego Silnik planów czynszu jest dostępny w każdym planie?",
        answer:
          "Obliczanie czynszu to rdzeń finansowy każdego najmu. Każdy właściciel potrzebuje dokładnych oczekiwanych opłat, naliczania proporcjonalnego, mediów, kaucji i bezpiecznego księgowania zanim automatyzacja zaawansowana stanie się potrzebna. Silnik planów czynszu — z wszystkimi sześcioma zaawansowanymi modelami — jest dostępny w każdym planie.",
      },
      {
        question: "Od którego planu najlepiej zacząć?",
        answer:
          "Zacznij od Starter, jeśli głównym celem jest wyjście ze spreadsheetów i rozłączonych trackerów. Wybierz Growth, jeśli liczba płatności, zgłoszeń i problemów z nieruchomościami sprawia, że najtrudniejsza staje się decyzja, co zrobić najpierw. Pro jest dla właścicieli, którzy chcą głębszego przeglądu i silniejszej kontroli operacyjnej.",
      },
      {
        question: "Kiedy warto przejść ze Starter na Growth?",
        answer:
          "Growth jest na moment, w którym samo uporządkowanie podstaw już nie wystarcza. Dodaje mocniejsze powierzchnie uwagi: kolejki Command Center, kondycję portfela, presję zaległości i presję zgłoszeń, dzięki czemu łatwiej wychwycić pominięty follow-up.",
      },
      {
        question: "Co wyróżnia plan Pro?",
        answer:
          "Pro jest dla właścicieli, którzy chcą czegoś więcej niż codziennego śledzenia. Daje głębszy nadzór dzięki security audit, powierzchniom zaufania operacyjnego, playbookom i telemetryce.",
      },
      {
        question: "Czy każdy plan obejmuje podstawowy workflow najmu?",
        answer:
          "Tak. Tenaqo pozostaje skupiony na najemcach, nieruchomościach, płatnościach, zgłoszeniach i dokumentach. Wyższe poziomy dodają więcej kontroli i głębi przeglądu wraz ze wzrostem złożoności pracy.",
      },
      {
        question: "Czy Tenaqo obsługuje dziś natywne płatności czynszu online?",
        answer:
          "Nie jako natywną bramkę płatniczą Tenaqo. Dziś Tenaqo wspiera konfigurację płatności po stronie właściciela w portalu najemcy: akceptowane metody, linki do zewnętrznych portali płatności, dane kontaktowe i wskazówki dotyczące autopay. Rdzeń finansowy nadal skupia się bardziej na widoczności płatności, presji zaległości i follow-upie niż na wbudowanym przycisku pay now.",
      },
      {
        question: "Czy Tenaqo jest wyceniony bardziej pod właścicieli niż pod agencje?",
        answer:
          "Tak. Plany są budowane dla małych i rosnących właścicieli, którzy potrzebują praktycznej kontroli bez wdrażania ciężkiej platformy agencyjnej.",
      },
    ],
    finalCta: {
      title: "Wypróbuj Tenaqo przed publicznym startem",
      body:
        "Uzyskaj wcześniejszy dostęp, przetestuj workflow i pomóż kształtować to, jak Tenaqo wspiera właścicieli mieszkań.",
      primaryCta: { label: "Zobacz, jak działa Tenaqo", href: siteConfig.appUrl },
    },
  },
  de: {
    seo: {
      title: "Tenaqo Preise | Pläne für Vermieter mit operativer Kontrolle",
      description:
        "Wählen Sie den Tenaqo Plan passend zu Portfoliodruck, Komplexität und Bedarf an klarerer Nachverfolgung.",
      canonicalPath: "/de/pricing",
    },
    hero: {
      eyebrow: "Preise",
      title: "Wählen Sie den Plan, der zu Ihrem operativen Alltag passt",
      body:
        "Starten Sie mit dem Schritt weg von Tabellen. Wechseln Sie auf mehr Kontrolle, wenn Instandhaltungsdruck, Rückstände und verpasste Nachverfolgung teurer werden als die Software.",
      imageSrc: "/screenshots/command-center.png",
      imageAlt: "Tenaqo Command Center mit dringenden Listen, Rückständen und Aufgaben im Portfolio.",
    },
    intro: {
      title: "Die Preisstruktur folgt der operativen Reife",
      body:
        "Starter hilft, die Grundlagen in ein System zu bringen. Growth ist für aktivere Portfolios mit höherem Steuerungsbedarf. Pro ist für Betreiber, die tiefere Prüfflächen, mehr Audit-Sicherheit und einen disziplinierteren Betriebsrhythmus wollen.",
      imageSrc: "/screenshots/portfolio-health.png",
      imageAlt: "Tenaqo Portfolio Health Dashboard mit Belegung, Rückständen und Instandhaltungsdruck.",
    },
    plans: [
      {
        name: "Starter",
        price: "Raus aus Tabellen",
        description:
          "Für Vermieter, die den grundlegenden Mietworkflow an einem Ort bündeln wollen, bevor Verwaltung, Rückstände und Reparaturen sich über Ordner und Nachrichten verteilen.",
        bullets: [
          "Mieter, Objekte und Kerndaten an einem Ort bündeln",
          "bezahlte, fällige und überfällige Zahlungen sehen",
          "Anfragen und Arbeitsaufträge erfassen",
          "wöchentliche Tabellen-Neubauten und verpasste Nachverfolgung reduzieren",
        ],
      },
      {
        name: "Growth",
        price: "Ein aktiveres Portfolio im Griff behalten",
        description:
          "Für Vermieter, deren Arbeit über reine Datenerfassung hinausgeht und aktive Nachverfolgung rund um Zahlungen, Reparaturen und Objektdruck braucht.",
        bullets: [
          "alles aus Starter",
          "Command-Center-Warteschlangen für dringende Arbeit",
          "Operative Kurzanalyse und Instandhaltungs-Triage",
          "Ansichten für Portfolio Health, Rückstands- und Instandhaltungsdruck",
          "schnellere Priorisierung bei konkurrierenden Themen",
          "besserer Schutz vor verpasstem Follow-up",
        ],
        highlight: true,
        tag: "Ideal für aktive Vermieter",
      },
      {
        name: "Pro",
        price: "Mit tieferer Nachverfolgung operieren",
        description:
          "Für ernsthafte Betreiber, die mit wachsender Portfoliokomplexität stärkere Übersicht, Review-Routinen und operative Disziplin wollen.",
        bullets: [
          "unbegrenzte Objekte",
          "alles aus Growth",
          "Security Audit und operative Trust-Oberflächen",
          "AI-Handwerkerempfehlungen und wöchentliche Portfolio-Zusammenfassungen",
          "AI-unterstütztes Klausel-Flagging zur Vermieterprüfung",
          "Playbooks — Automatisierung routinemäßiger Abläufe",
          "3.000 AI-Aufrufe / Monat",
        ],
      },
      {
        name: "Operator / Agency",
        price: "Mehrere Kundoportfolios mit Automatisierung und Intelligenz steuern",
        description:
          "Für Immobilienverwaltungen und Agenturen, die große Portfolios oder mehrere Vermieterkonten betreuen.",
        bullets: [
          "unbegrenzte Objekte",
          "alles aus Pro",
          "Massenautomatisierung von Mieten über Mieter und Abrechnungszeiträume hinweg",
          "geplante Portfolio-Finanzprognose und roadmap AI-Finanzeinblicke",
          "für künftigen Open-Banking-Mietabgleich konzipiert",
          "geplanter Sicherheits-Copilot und geplante natürlichsprachliche Portfolio-Abfragen",
          "unbegrenzte AI-Nutzung",
        ],
      },
    ],
    planCtaLabel: "Tenaqo im Einsatz sehen",
    included: {
      title: "Jeder Plan enthält den Kern-Mietworkflow",
      bullets: [
        "Mietplan-Engine — regelbasierte Sollmieten, Proration, Kautionswarnungen, Berechnungsvorschauen und Finanzbuchung mit Freigabe",
        "Erweiterte Mietmodelle — Split-Miete, Zimmermiete, Nebenkosten, Anpassungen, Mieterhöhungen, STR-Nächte",
        "Workflows für Anfragen und Arbeitsaufträge",
        "Dokumente, Mieterportal und Handwerkerverwaltung",
        "Mehrwährung (GBP, PLN, EUR, USD) und Mehrsprachigkeit (EN, PL, DE)",
        "Unveränderliches Finanzmuster mit Mietplanhistorie und Audit Trail",
      ],
    },
    faqTitle: "Häufige Fragen",
    faqs: [
      {
        question: "Mit welchem Plan sollte ich starten?",
        answer:
          "Starten Sie mit Starter, wenn das Hauptziel der Weg aus Tabellen und getrennten Trackern ist. Growth ist sinnvoll, wenn Zahlungs-, Reparatur- und Objektaktivität so zunehmen, dass die Priorisierung selbst zum Problem wird. Pro passt, wenn tiefere Reviews und stärkere operative Kontrolle gefragt sind.",
      },
      {
        question: "Wann lohnt sich der Wechsel von Starter zu Growth?",
        answer:
          "Growth ist für den Moment gedacht, in dem reine Grundordnung nicht mehr reicht. Es ergänzt stärkere Aufmerksamkeitsoberflächen wie Command-Center-Queues, Portfolio Health sowie Rückstands- und Instandhaltungsdruck, damit verpasste Nachverfolgung schneller auffällt.",
      },
      {
        question: "Was unterscheidet Pro?",
        answer:
          "Pro richtet sich an Vermieter, die mehr als tägliches Tracking brauchen. Der Plan zielt auf tiefere Übersicht über Security Audit, operative Trust-Oberflächen, Playbooks und Telemetrie.",
      },
      {
        question: "Deckt jeder Plan den Kernworkflow ab?",
        answer:
          "Ja. Tenaqo bleibt im Kern auf Mieter, Objekte, Zahlungsstatus, Instandhaltung und Dokumente fokussiert. Höhere Stufen ergänzen mehr Kontrolle und Review-Tiefe mit wachsender Komplexität.",
      },
      {
        question: "Verarbeitet Tenaqo heute Mietzahlungen nativ online?",
        answer:
          "Nicht als native Tenaqo-Zahlungsschiene. Heute unterstützt Tenaqo die vermieterseitige Zahlungseinrichtung im Mieterportal, einschließlich akzeptierter Methoden, externer Zahlungslinks, Supportkontakt und Autopay-Hinweisen. Der Finanzteil fokussiert weiterhin stärker auf Sichtbarkeit, Rückstandsdruck und Follow-up als auf einen eingebauten Pay-now-Checkout.",
      },
      {
        question: "Ist Tenaqo eher für Vermieter als für Agenturen bepreist?",
        answer:
          "Ja. Die Pläne sind auf kleine bis wachsende Vermieter ausgerichtet, die praktische Kontrolle wollen, ohne eine aufgeblähte Agenturplattform einzuführen.",
      },
    ],
    finalCta: {
      title: "Testen Sie Tenaqo vor dem öffentlichen Start",
      body:
        "Sichern Sie sich Frühzugang, testen Sie die Workflows und helfen Sie mit, wie Tenaqo Vermieter weiter unterstützt.",
      primaryCta: { label: "Tenaqo im Einsatz sehen", href: siteConfig.appUrl },
    },
  },
};
