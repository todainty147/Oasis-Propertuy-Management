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
      title: "OASIS pricing | Plans for landlords who run the operation",
      description:
        "Choose the OASIS plan that matches your portfolio pressure, operating complexity, and need for clearer follow-through.",
      canonicalPath: "/pricing",
    },
    hero: {
      eyebrow: "Pricing",
      title: "Choose the plan that matches how your portfolio actually runs",
      body:
        "Start by getting the work out of spreadsheets. Upgrade when maintenance drag, missed follow-up, and property pressure cost more than the software ever will.",
      imageSrc: "/screenshots/command-center.png",
      imageAlt: "OASIS Command Center showing urgent queues, overdue balance, and action items across the portfolio.",
    },
    intro: {
      title: "Pricing is aligned to operational maturity",
      body:
        "Starter helps landlords bring the basics into one place. Growth is for busier portfolios that need stronger action control. Pro is for operators who want deeper review, audit confidence, and a more disciplined operating rhythm.",
      imageSrc: "/screenshots/portfolio-health.png",
      imageAlt: "OASIS Portfolio Health dashboard showing occupancy, arrears aging, and maintenance pressure.",
    },
    plans: [
      {
        name: "Starter",
        price: "Move off spreadsheets",
        description:
          "For landlords who want the essential rental workflow in one place before admin, arrears follow-up, and repair tracking spread across folders and message threads.",
        bullets: [
          "bring tenants, properties, and core records into one place",
          "see paid, due, and overdue rent",
          "capture maintenance requests and work orders",
          "reduce the weekly spreadsheet rebuild and missed follow-up",
        ],
      },
      {
        name: "Growth",
        price: "Control a busier portfolio",
        description:
          "For landlords whose work has moved from basic record-keeping to active follow-up across rent, repairs, and property pressure.",
        bullets: [
          "everything in Starter",
          "command-centre queues for urgent work",
          "AI operator briefing and maintenance triage support",
          "portfolio health, arrears, and maintenance pressure views",
          "faster prioritization when multiple issues compete",
          "better protection against missed follow-up",
        ],
        highlight: true,
        tag: "Best fit for busy landlords",
      },
      {
        name: "Pro",
        price: "Operate with deeper follow-through",
        description:
          "For serious operators who want stronger oversight, review routines, and operating discipline as the portfolio becomes harder to manage casually.",
        bullets: [
          "full OASIS operating access",
          "security audit and operational trust surfaces",
          "AI contractor recommendations and weekly portfolio summaries",
          "playbook and root telemetry views",
          "deeper review for demanding landlord workflows",
        ],
      },
    ],
    planCtaLabel: "See how OASIS works",
    included: {
      title: "Every plan helps landlords reduce avoidable admin",
      bullets: [
        "A clearer place to stay on top of tenants, properties, and rental context",
        "Rent status views for paid, due, and overdue balances",
        "Maintenance request and work order workflows",
        "Document storage tied to the rental work it supports",
        "Landlord dashboards that make arrears and follow-up easier to prioritize",
      ],
    },
    faqTitle: "Frequently asked questions",
    faqs: [
      {
        question: "Which plan should I start with?",
        answer:
          "Start with Starter if the main goal is getting off spreadsheets and disconnected trackers. Choose Growth if you already have enough rent, repair, and property activity that deciding what to do first is the harder problem. Choose Pro when you want deeper review, operational trust, and more disciplined follow-through.",
      },
      {
        question: "Why would I move from Starter to Growth?",
        answer:
          "Growth is for the moment when basic organization is not enough. It adds stronger portfolio attention through command-centre queues, portfolio health, arrears pressure, and maintenance pressure views so missed follow-up is easier to catch.",
      },
      {
        question: "What makes Pro different?",
        answer:
          "Pro is for landlords who want more than day-to-day tracking. It is aimed at deeper oversight through security audit, operational trust, playbook, and telemetry surfaces where stronger review matters.",
      },
      {
        question: "Does every plan still cover the core rental workflow?",
        answer:
          "Yes. OASIS keeps the core workflow focused on tenants, properties, rent status, maintenance, and records. The higher tiers add more control and review depth as operating complexity grows.",
      },
      {
        question: "Does OASIS process tenant rent payments online today?",
        answer:
          "Not as a native OASIS tenant payment rail. Today OASIS supports landlord-configured payment setup in the tenant portal, including accepted methods, external payment portal links, support details, and autopay guidance. The finance workflow is still centered on rent visibility, arrears pressure, and follow-up rather than an in-app pay-now checkout flow.",
      },
      {
        question: "Is OASIS priced for landlords rather than agencies?",
        answer:
          "Yes. The plans are framed around small to growing landlords who need practical control without adopting a bloated agency platform.",
      },
    ],
    finalCta: {
      title: "Try OASIS before we launch publicly",
      body:
        "Get early access, test the workflows, and help shape how OASIS supports landlords as it evolves.",
      primaryCta: { label: "See how OASIS works", href: siteConfig.appUrl },
    },
  },
  pl: {
    seo: {
      title: "Cennik OASIS | Plany dla właścicieli z operacyjną kontrolą",
      description:
        "Wybierz plan OASIS dopasowany do skali portfela, presji operacyjnej i potrzeby lepszego follow-upu.",
      canonicalPath: "/pl/pricing",
    },
    hero: {
      eyebrow: "Cennik",
      title: "Wybierz plan dopasowany do tego, jak naprawdę działa Twój najem",
      body:
        "Zacznij od wyjścia ze spreadsheetów. Rozszerz plan wtedy, gdy zgłoszenia, zaległości i presja na nieruchomościach zaczynają kosztować więcej niż samo narzędzie.",
      imageSrc: "/screenshots/command-center.png",
      imageAlt: "Command Center OASIS z pilnymi kolejkami, zaległościami i działaniami w całym portfelu.",
    },
    intro: {
      title: "Cennik jest oparty na dojrzałości operacyjnej",
      body:
        "Starter pomaga uporządkować podstawy. Growth jest dla bardziej zajętych portfeli, które potrzebują mocniejszej kontroli działań. Pro jest dla operatorów oczekujących głębszego przeglądu, większego zaufania audytowego i bardziej zdyscyplinowanego rytmu pracy.",
      imageSrc: "/screenshots/portfolio-health.png",
      imageAlt: "Panel Portfolio Health OASIS z obłożeniem, zaległościami i presją zgłoszeń.",
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
          "pełny dostęp do operacyjnego rdzenia OASIS",
          "security audit i powierzchnie zaufania operacyjnego",
          "rekomendacje wykonawców AI i tygodniowe podsumowania portfela",
          "playbooki i widoki telemetryczne root",
          "głębszy przegląd dla wymagających workflow właściciela",
        ],
      },
    ],
    planCtaLabel: "Zobacz, jak działa OASIS",
    included: {
      title: "Każdy plan pomaga ograniczyć zbędną administrację",
      bullets: [
        "Czytelniejsze miejsce do pracy z najemcami, nieruchomościami i kontekstem najmu",
        "Widoki płatności opłaconych, należnych i zaległych",
        "Workflow zgłoszeń i zleceń",
        "Przechowywanie dokumentów powiązane z realną pracą najmu",
        "Dashboardy właściciela ułatwiające priorytetyzację zaległości i follow-upu",
      ],
    },
    faqTitle: "Najczęstsze pytania",
    faqs: [
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
          "Tak. OASIS pozostaje skupiony na najemcach, nieruchomościach, płatnościach, zgłoszeniach i dokumentach. Wyższe poziomy dodają więcej kontroli i głębi przeglądu wraz ze wzrostem złożoności pracy.",
      },
      {
        question: "Czy OASIS obsługuje dziś natywne płatności czynszu online?",
        answer:
          "Nie jako natywną bramkę płatniczą OASIS. Dziś OASIS wspiera konfigurację płatności po stronie właściciela w portalu najemcy: akceptowane metody, linki do zewnętrznych portali płatności, dane kontaktowe i wskazówki dotyczące autopay. Rdzeń finansowy nadal skupia się bardziej na widoczności płatności, presji zaległości i follow-upie niż na wbudowanym przycisku pay now.",
      },
      {
        question: "Czy OASIS jest wyceniony bardziej pod właścicieli niż pod agencje?",
        answer:
          "Tak. Plany są budowane dla małych i rosnących właścicieli, którzy potrzebują praktycznej kontroli bez wdrażania ciężkiej platformy agencyjnej.",
      },
    ],
    finalCta: {
      title: "Wypróbuj OASIS przed publicznym startem",
      body:
        "Uzyskaj wcześniejszy dostęp, przetestuj workflow i pomóż kształtować to, jak OASIS wspiera właścicieli mieszkań.",
      primaryCta: { label: "Zobacz, jak działa OASIS", href: siteConfig.appUrl },
    },
  },
  de: {
    seo: {
      title: "OASIS Preise | Pläne für Vermieter mit operativer Kontrolle",
      description:
        "Wählen Sie den OASIS Plan passend zu Portfoliodruck, Komplexität und Bedarf an klarerer Nachverfolgung.",
      canonicalPath: "/de/pricing",
    },
    hero: {
      eyebrow: "Preise",
      title: "Wählen Sie den Plan, der zu Ihrem operativen Alltag passt",
      body:
        "Starten Sie mit dem Schritt weg von Tabellen. Wechseln Sie auf mehr Kontrolle, wenn Instandhaltungsdruck, Rückstände und verpasste Nachverfolgung teurer werden als die Software.",
      imageSrc: "/screenshots/command-center.png",
      imageAlt: "OASIS Command Center mit dringenden Listen, Rückständen und Aufgaben im Portfolio.",
    },
    intro: {
      title: "Die Preisstruktur folgt der operativen Reife",
      body:
        "Starter hilft, die Grundlagen in ein System zu bringen. Growth ist für aktivere Portfolios mit höherem Steuerungsbedarf. Pro ist für Betreiber, die tiefere Prüfflächen, mehr Audit-Sicherheit und einen disziplinierteren Betriebsrhythmus wollen.",
      imageSrc: "/screenshots/portfolio-health.png",
      imageAlt: "OASIS Portfolio Health Dashboard mit Belegung, Rückständen und Instandhaltungsdruck.",
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
          "AI-Briefing und Instandhaltungs-Triage",
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
          "voller Zugriff auf den operativen OASIS-Kern",
          "Security Audit und operative Trust-Oberflächen",
          "AI-Handwerkerempfehlungen und wöchentliche Portfolio-Zusammenfassungen",
          "Playbooks und Root-Telemetrieansichten",
          "tiefere Review-Ebene für anspruchsvolle Vermieterabläufe",
        ],
      },
    ],
    planCtaLabel: "OASIS ansehen",
    included: {
      title: "Jeder Plan reduziert vermeidbaren Verwaltungsaufwand",
      bullets: [
        "Ein klarerer Ort für Mieter, Objekte und den gesamten Mietkontext",
        "Zahlungsansichten für bezahlt, fällig und überfällig",
        "Workflows für Anfragen und Arbeitsaufträge",
        "Dokumentenablage direkt am unterstützten Vorgang",
        "Vermieter-Dashboards zur besseren Priorisierung von Rückständen und Follow-up",
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
          "Ja. OASIS bleibt im Kern auf Mieter, Objekte, Zahlungsstatus, Instandhaltung und Dokumente fokussiert. Höhere Stufen ergänzen mehr Kontrolle und Review-Tiefe mit wachsender Komplexität.",
      },
      {
        question: "Verarbeitet OASIS heute Mietzahlungen nativ online?",
        answer:
          "Nicht als native OASIS-Zahlungsschiene. Heute unterstützt OASIS die vermieterseitige Zahlungseinrichtung im Mieterportal, einschließlich akzeptierter Methoden, externer Zahlungslinks, Supportkontakt und Autopay-Hinweisen. Der Finanzteil fokussiert weiterhin stärker auf Sichtbarkeit, Rückstandsdruck und Follow-up als auf einen eingebauten Pay-now-Checkout.",
      },
      {
        question: "Ist OASIS eher für Vermieter als für Agenturen bepreist?",
        answer:
          "Ja. Die Pläne sind auf kleine bis wachsende Vermieter ausgerichtet, die praktische Kontrolle wollen, ohne eine aufgeblähte Agenturplattform einzuführen.",
      },
    ],
    finalCta: {
      title: "Testen Sie OASIS vor dem öffentlichen Start",
      body:
        "Sichern Sie sich Frühzugang, testen Sie die Workflows und helfen Sie mit, wie OASIS Vermieter weiter unterstützt.",
      primaryCta: { label: "OASIS ansehen", href: siteConfig.appUrl },
    },
  },
};
