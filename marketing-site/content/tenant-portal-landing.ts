import type { Locale } from "../lib/i18n";

import { siteConfig } from "./site";

type TenantPortalLandingContent = {
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
    highlights: string[];
    microcopy: string[];
    imageSrc: string;
    imageAlt: string;
    primaryCta: { label: string; href: string };
    secondaryCta: { label: string; href: string };
  };
  problemSection: {
    title: string;
    body: string;
    items: Array<{ title: string; body: string }>;
  };
  portalSection: {
    eyebrow: string;
    title: string;
    body: string;
    items: Array<{ title: string; body: string }>;
    imageSrc: string;
    imageAlt: string;
    imageAlign: "left" | "right";
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
  proofSection: {
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

export const tenantPortalLandingContentByLocale: Record<Locale, TenantPortalLandingContent> = {
  en: {
    seo: {
      title: "Tenant Portal Software for Landlords | Tenaqo",
      description:
        "Reduce tenant confusion with a clearer portal for payments visibility, maintenance updates, document handoff, and agreement review.",
      canonicalPath: "/tenant-portal-software",
    },
    hero: {
      eyebrow: "Tenant portal software",
      title: "Stop answering the same tenant questions over and over",
      body:
        "Tenaqo gives landlords a tenant-safe portal for payments visibility, maintenance updates, documents, and agreement review so tenants can self-serve the basics without losing trust in the process.",
      emphasis:
        "Tenants see what matters. Landlords keep control. Contractors stay in the right lane.",
      support:
        "Built for real landlord workflows. Strong enough to reduce tenant uncertainty today without pretending the portal is already a separate premium product line.",
      highlights: [
        "Tenant-safe dashboard",
        "Maintenance status visibility",
        "Document requests and uploads",
        "Agreement packet review",
      ],
      microcopy: [
        "Grounded in the current Tenaqo product.",
        "No fake pay-now claims.",
        "Clearer communication without role leakage.",
      ],
      imageSrc: "/screenshots/tenant-home.png",
      imageAlt: "Tenaqo tenant portal dashboard showing summary cards, maintenance items, and payment visibility.",
      primaryCta: { label: "Open the Tenaqo app", href: siteConfig.appUrl },
      secondaryCta: { label: "See the tenant portal", href: "/features/tenant-portal" },
    },
    problemSection: {
      title: "Why tenant communication gets noisy",
      body:
        "The problem is rarely that tenants ask too much. The problem is that routine answers are scattered across inboxes, attachments, payment instructions, and repair updates that never stay in one place.",
      items: [
        {
          title: "Payment questions repeat",
          body: "Tenants ask how to pay, where to pay, and who to contact because the setup is not visible where they expect it.",
        },
        {
          title: "Maintenance updates feel vague",
          body: "A request may be active, assigned, or in progress, but the tenant still feels left in the dark.",
        },
        {
          title: "Documents drift into old threads",
          body: "Receipts, ID files, and agreements disappear into attachments and screenshot history when they should stay tied to the tenancy.",
        },
      ],
    },
    portalSection: {
      eyebrow: "What tenants can do today",
      title: "A cleaner tenant experience without handing over the landlord console",
      body:
        "The current Tenaqo tenant portal already gives tenants a clear view of the things they care about most, while keeping the operational controls on the landlord side.",
      items: [
        {
          title: "Review payments visibility",
          body: "Show outstanding balances, payment history, accepted methods, external payment links, support details, and autopay guidance.",
        },
        {
          title: "Track maintenance progress",
          body: "Let tenants follow active issues and work orders from a tenant-safe dashboard instead of asking for every update manually.",
        },
        {
          title: "Open documents and respond to requests",
          body: "Tenants can review available records, upload requested evidence, and keep document handoffs inside the same portal.",
        },
        {
          title: "Complete agreement review steps",
          body: "Agreement packets already support sent, viewed, and completed review states before external signing takes over.",
        },
      ],
      imageSrc: "/screenshots/tenant-documents.png",
      imageAlt: "Tenaqo tenant documents page showing document requests and agreement packet review.",
      imageAlign: "left",
    },
    workflowSection: {
      title: "What the tenant-facing workflow feels like",
      body:
        "This is the win: tenants get a calmer, clearer path while the landlord team keeps the operational controls.",
      itemCtaLabel: "Explore the tenant portal workflow",
      items: [
        {
          label: "Step 1",
          title: "Tenant sees what needs attention right away",
          body: "The dashboard highlights payment review, active issues, new updates, and available documents in one tenant-safe view.",
          href: "/features/tenant-portal",
          points: ["one tenant-safe home base", "fewer routine emails", "clearer next step"],
          imageSrc: "/screenshots/tenant-home.png",
          imageAlt: "Tenaqo tenant portal dashboard with summary cards and action items.",
        },
        {
          label: "Step 2",
          title: "Tenant responds inside the same portal",
          body: "If the landlord team requests a receipt, ID file, or agreement review, the tenant can handle it from the documents area instead of digging through old messages.",
          href: "/features/tenant-portal",
          points: ["upload requested evidence", "review agreement packets", "keep the trail intact"],
          imageSrc: "/screenshots/tenant-documents.png",
          imageAlt: "Tenaqo tenant documents page showing a requested upload and agreement packet review.",
        },
        {
          label: "Step 3",
          title: "Landlord keeps control while the communication load drops",
          body: "The portal reduces confusion without exposing the broader landlord workflow, keeping the experience professional and tightly scoped.",
          href: "/features/tenant-management",
          points: ["account-scoped access", "role isolation", "same workflow spine as the main app"],
          imageSrc: "/screenshots/security-audit.png",
          imageAlt: "Tenaqo Security Audit view supporting the controlled, account-scoped trust model behind the tenant portal.",
        },
      ],
    },
    proofSection: {
      eyebrow: "Why this matters",
      title: "The tenant portal is part of operational trust",
      body:
        "A landlord platform feels more complete when tenants can see the right information without leaking into the wrong surfaces. That lowers communication drag and makes the operation feel more credible on both sides.",
      items: [
        {
          title: "Fewer repeated questions",
          body: "Routine payment, document, and maintenance questions have somewhere better to land than the landlord inbox.",
        },
        {
          title: "More professional tenant experience",
          body: "Tenants see a cleaner, purpose-built interface rather than a restricted version of the landlord shell.",
        },
        {
          title: "Stronger trust with real boundaries",
          body: "The current tenant portal is useful today precisely because it is scoped tightly to the tenancy and its related workflow.",
        },
      ],
      imageSrc: "/screenshots/payment-setup.png",
      imageAlt: "Tenaqo finance page showing tenant payment setup that feeds the tenant portal payment experience.",
    },
    finalCta: {
      title: "Turn tenant confusion into a clearer self-service experience",
      body:
        "If the current pain is repeated payment questions, vague maintenance follow-up, or document chaos, Tenaqo gives you a stronger tenant-facing experience without losing control of the operation.",
      primaryCta: { label: "Open the Tenaqo app", href: siteConfig.appUrl },
      secondaryCta: { label: "Explore the tenant portal", href: "/features/tenant-portal" },
    },
  },
  pl: {
    seo: {
      title: "Portal najemcy dla właścicieli | Jaśniejsza samoobsługa w Tenaqo",
      description:
        "Ogranicz chaos w relacjach z najemcą dzięki portalowi zapewniającemu przejrzystość płatności, aktualizacje zgłoszeń, obieg dokumentów i przegląd umów.",
      canonicalPath: "/pl/tenant-portal-software",
    },
    hero: {
      eyebrow: "Portal najemcy",
      title: "Przestań odpowiadać na te same pytania najemców w kółko",
      body:
        "Tenaqo daje właścicielom bezpieczny portal najemcy dla płatności, zgłoszeń, dokumentów i przeglądu umów, dzięki czemu podstawowe sprawy można załatwić bez chaosu i bez utraty zaufania.",
      emphasis:
        "Najemca widzi to, co ważne. Właściciel zachowuje kontrolę. Wykonawca pozostaje w swojej roli.",
      support:
        "Zbudowane na realnych workflow właścicieli. Wystarczająco mocne, by już dziś ograniczyć niepewność najemcy, bez udawania osobnej premium linii produktowej.",
      highlights: [
        "Bezpieczny dashboard najemcy",
        "Widoczność statusu zgłoszeń",
        "Prośby o dokumenty i upload",
        "Przegląd pakietów umów",
      ],
      microcopy: [
        "Oparte na realnym zakresie dzisiejszego Tenaqo.",
        "Bez fikcyjnych obietnic pay now.",
        "Jaśniejsza komunikacja bez mieszania ról.",
      ],
      imageSrc: "/screenshots/tenant-home.png",
      imageAlt: "Dashboard portalu najemcy Tenaqo z kartami podsumowania, zgłoszeniami i płatnościami.",
      primaryCta: { label: "Zobacz Tenaqo", href: siteConfig.appUrl },
      secondaryCta: { label: "Zobacz portal najemcy", href: "/features/tenant-portal" },
    },
    problemSection: {
      title: "Skąd bierze się chaos w komunikacji z najemcą",
      body:
        "Problemem zwykle nie jest to, że najemcy pytają za dużo. Problemem jest to, że odpowiedzi są rozrzucone po skrzynkach, załącznikach, instrukcjach płatności i aktualizacjach napraw.",
      items: [
        {
          title: "Pytania o płatności wracają bez końca",
          body: "Najemcy pytają, jak i gdzie zapłacić oraz z kim się skontaktować, ponieważ te informacje nie są widoczne tam, gdzie ich oczekują.",
        },
        {
          title: "Aktualizacje zgłoszeń są zbyt mgliste",
          body: "Zgłoszenie może być aktywne, przypisane lub w toku, ale najemca wciąż ma poczucie braku informacji.",
        },
        {
          title: "Dokumenty giną w starych wątkach",
          body: "Potwierdzenia, pliki ID i umowy znikają w załącznikach i zrzutach ekranu zamiast pozostać częścią najmu.",
        },
      ],
    },
    portalSection: {
      eyebrow: "Co najemca może zrobić już dziś",
      title: "Czytelniejsze doświadczenie najemcy bez oddawania konsoli właściciela",
      body:
        "Obecny portal najemcy w Tenaqo już dziś daje przejrzysty widok najważniejszych spraw, pozostawiając pełną kontrolę operacyjną po stronie właściciela.",
      items: [
        {
          title: "Podgląd przejrzystości płatności",
          body: "Pokazywanie sald, historii płatności, akceptowanych metod, zewnętrznych linków do płatności, danych kontaktowych wsparcia i wskazówek dotyczących płatności automatycznych.",
        },
        {
          title: "Śledzić postęp zgłoszeń",
          body: "Najemca widzi aktywne sprawy i zlecenia w bezpiecznym panelu zamiast dopytywać o każdą aktualizację ręcznie.",
        },
        {
          title: "Otwierać dokumenty i odpowiadać na prośby",
          body: "Najemcy mogą przeglądać dostępne rejestry, przesyłać wymagane dowody i zarządzać obiegiem dokumentów w ramach tego samego portalu.",
        },
        {
          title: "Przechodzić przez przegląd umowy",
          body: "Pakiety umów już dziś wspierają statusy wysłane, obejrzane i zakończone przed zewnętrznym podpisem.",
        },
      ],
      imageSrc: "/screenshots/tenant-documents.png",
      imageAlt: "Widok dokumentów najemcy Tenaqo z prośbami o dokumenty i przeglądem pakietu umowy.",
      imageAlign: "left",
    },
    workflowSection: {
      title: "Jak to wygląda z perspektywy najemcy",
      body:
        "To jest prawdziwa korzyść: najemca ma spokojniejszą i bardziej czytelną ścieżkę, a zespół właściciela zachowuje operacyjną kontrolę.",
      itemCtaLabel: "Poznaj ten workflow",
      items: [
        {
          label: "Krok 1",
          title: "Najemca od razu widzi, co wymaga uwagi",
          body: "Dashboard podkreśla przegląd płatności, aktywne sprawy, nowe aktualizacje i dostępne dokumenty w jednym bezpiecznym widoku.",
          href: "/features/tenant-portal",
          points: ["jedno bezpieczne miejsce", "mniej rutynowych maili", "czytelny następny krok"],
          imageSrc: "/screenshots/tenant-home.png",
          imageAlt: "Dashboard najemcy Tenaqo z kartami podsumowania i działaniami.",
        },
        {
          label: "Krok 2",
          title: "Najemca reaguje w tym samym portalu",
          body: "Jeśli zespół właściciela prosi o rachunek, plik ID albo przegląd umowy, najemca załatwia to w obszarze dokumentów bez szukania w starych wiadomościach.",
          href: "/features/tenant-portal",
          points: ["przesyłanie wymaganych dowodów", "przegląd pakietów umów", "spójny ślad działań"],
          imageSrc: "/screenshots/tenant-documents.png",
          imageAlt: "Widok dokumentów najemcy Tenaqo z przesyłaniem plików i przeglądem pakietu umowy.",
        },
        {
          label: "Krok 3",
          title: "Właściciel zachowuje kontrolę, a obciążenie komunikacją spada",
          body: "Portal ogranicza chaos bez odsłaniania szerszego workflow właściciela, dzięki czemu doświadczenie pozostaje profesjonalne i ściśle ograniczone do właściwego zakresu.",
          href: "/features/tenant-management",
          points: ["dostęp ograniczony do konta", "izolacja ról", "ten sam rdzeń workflow co w głównej aplikacji"],
          imageSrc: "/screenshots/security-audit.png",
          imageAlt: "Widok Security Audit w Tenaqo, wspierający kontrolowany, przypisany do konta model zaufania, na którym opiera się portal najemcy.",
        },
      ],
    },
    proofSection: {
      eyebrow: "Dlaczego to ważne",
      title: "Portal najemcy to część zaufania operacyjnego",
      body:
        "Platforma dla właściciela wygląda pełniej wtedy, gdy najemca widzi właściwe informacje bez wyciekania do niewłaściwych ekranów. To zmniejsza obciążenie komunikacją i wzmacnia wiarygodność po obu stronach.",
      items: [
        {
          title: "Mniej powtarzających się pytań",
          body: "Rutynowe pytania o płatności, dokumenty i zgłoszenia mają lepsze miejsce niż skrzynka właściciela.",
        },
        {
          title: "Bardziej profesjonalne doświadczenie najemcy",
          body: "Najemca widzi czytelny, celowy interfejs zamiast ograniczonej wersji panelu właściciela.",
        },
        {
          title: "Silniejsze zaufanie z prawdziwymi granicami",
          body: "Dzisiejszy portal najemcy jest użyteczny właśnie dlatego, że pozostaje ściśle związany z najmem i jego workflow.",
        },
      ],
      imageSrc: "/screenshots/payment-setup.png",
      imageAlt: "Widok finansów Tenaqo pokazujący konfigurację płatności zasilającą doświadczenie najemcy.",
    },
    finalCta: {
      title: "Zamień chaos pytań najemcy w czytelniejszą samoobsługę",
      body:
        "Jeśli realnym problemem są powtarzające się pytania o płatności, mgliste zgłoszenia albo chaos dokumentów, Tenaqo daje mocniejszy kanał dla najemcy bez utraty kontroli nad operacją.",
      primaryCta: { label: "Zobacz Tenaqo", href: siteConfig.appUrl },
      secondaryCta: { label: "Poznaj portal najemcy", href: "/features/tenant-portal" },
    },
  },
  de: {
    seo: {
      title: "Mieterportal-Software für Vermieter | Tenaqo",
      description:
        "Weniger Verwirrung für Mieter durch ein klares Portal für Zahlungsübersicht, Instandhaltungsstatus, Dokumente und Vertragsprüfung.",
      canonicalPath: "/de/tenant-portal-software",
    },
    hero: {
      eyebrow: "Mieterportal",
      title: "Hören Sie auf, dieselben Mieterfragen immer wieder zu beantworten",
      body:
        "Tenaqo gibt Vermietern ein sicheres Mieterportal für Zahlungsübersicht, Wartungsstatus, Dokumente und Vertragsprüfung, damit Mieter die Grundlagen selbst erledigen können, ohne Vertrauen in den Ablauf zu verlieren.",
      emphasis:
        "Mieter sehen, was wichtig ist. Vermieter behalten die Kontrolle. Handwerker bleiben in ihrer Spur.",
      support:
        "Gebaut für reale Vermieterabläufe. Stark genug, um Unsicherheit heute zu senken, ohne so zu tun, als wäre das Portal schon eine eigene Premium-Produktlinie.",
      highlights: [
        "Sicheres Mieter-Dashboard",
        "Sichtbarer Wartungsstatus",
        "Dokumentenanfragen und Uploads",
        "Prüfung von Vertragspaketen",
      ],
      microcopy: [
        "Auf dem heutigen Tenaqo-Produktstand aufgebaut.",
        "Keine künstlichen Pay-now-Versprechen.",
        "Klarere Kommunikation ohne Rollenvermischung.",
      ],
      imageSrc: "/screenshots/tenant-home.png",
      imageAlt: "Tenaqo Mieterportal mit Übersichtskarten, Wartungsthemen und Zahlungsübersicht.",
      primaryCta: { label: "Tenaqo ansehen", href: siteConfig.appUrl },
      secondaryCta: { label: "Mieterportal ansehen", href: "/features/tenant-portal" },
    },
    problemSection: {
      title: "Warum die Kommunikation mit Mietern unruhig wird",
      body:
        "Das Problem ist selten, dass Mieter zu viel fragen. Das Problem ist, dass Standardantworten über Postfächer, Anhänge, Zahlungsanweisungen und Reparaturupdates verteilt sind.",
      items: [
        {
          title: "Fragen zu Zahlungen wiederholen sich",
          body: "Mieter fragen nach Wie, Wo und Wer, weil die Zahlungseinrichtung nicht dort sichtbar ist, wo sie sie erwarten.",
        },
        {
          title: "Wartungsupdates wirken unklar",
          body: "Eine Anfrage kann aktiv, zugewiesen oder in Bearbeitung sein, und trotzdem fühlt sich der Mieter im Dunkeln.",
        },
        {
          title: "Dokumente verschwinden in alten Verläufen",
          body: "Belege, Ausweise und Verträge landen in Anhängen und Screenshots, statt am Mietverhältnis zu bleiben.",
        },
      ],
    },
    portalSection: {
      eyebrow: "Was Mieter heute schon tun können",
      title: "Ein saubereres Mietererlebnis, ohne die Vermieterkonsole preiszugeben",
      body:
        "Das aktuelle Tenaqo Mieterportal gibt Mietern bereits einen klaren Blick auf die wichtigsten Themen, während die operative Kontrolle auf Vermieterseite bleibt.",
      items: [
        {
          title: "Zahlungsübersicht prüfen",
          body: "Ausstehende Beträge, Zahlungshistorie, akzeptierte Methoden, externe Zahlungslinks, Supportkontakte und Autopay-Hinweise sichtbar machen.",
        },
        {
          title: "Wartungsfortschritt verfolgen",
          body: "Mieter sehen aktive Themen und Arbeitsaufträge in einem sicheren Dashboard, statt jedem Update hinterherzufragen.",
        },
        {
          title: "Dokumente öffnen und Anfragen beantworten",
          body: "Mieter prüfen Unterlagen, laden angeforderte Nachweise hoch und halten den Dokumentenfluss im selben Portal zusammen.",
        },
        {
          title: "Vertragsprüfung abschließen",
          body: "Vertragspakete unterstützen heute bereits gesendet, angesehen und abgeschlossen, bevor ein externer Signaturprozess übernimmt.",
        },
      ],
      imageSrc: "/screenshots/tenant-documents.png",
      imageAlt: "Tenaqo Mieter-Dokumentenansicht mit Anfragen und Vertragsprüfung.",
      imageAlign: "left",
    },
    workflowSection: {
      title: "Wie sich der Ablauf für Mieter anfühlt",
      body:
        "Hier liegt der Vorteil: Mieter bekommen einen ruhigeren, klareren Weg, während das Vermieterteam die operative Kontrolle behält.",
      itemCtaLabel: "Diesen Ablauf ansehen",
      items: [
        {
          label: "Schritt 1",
          title: "Der Mieter sieht sofort, was Aufmerksamkeit braucht",
          body: "Das Dashboard hebt Zahlungsprüfung, aktive Themen, neue Updates und verfügbare Dokumente in einer sicheren Ansicht hervor.",
          href: "/features/tenant-portal",
          points: ["eine sichere Startfläche", "weniger Routine-Mails", "klarerer nächster Schritt"],
          imageSrc: "/screenshots/tenant-home.png",
          imageAlt: "Tenaqo Mieterportal mit Übersichtskarten und Aufgaben.",
        },
        {
          label: "Schritt 2",
          title: "Der Mieter reagiert im selben Portal",
          body: "Wenn das Vermieterteam einen Beleg, eine Ausweiskopie oder eine Vertragsprüfung anfordert, kann der Mieter das im Dokumentenbereich erledigen statt alte Nachrichten zu durchsuchen.",
          href: "/features/tenant-portal",
          points: ["angeforderte Nachweise hochladen", "Vertragspakete prüfen", "sauberen Verlauf behalten"],
          imageSrc: "/screenshots/tenant-documents.png",
          imageAlt: "Tenaqo Mieter-Dokumentenseite mit Upload-Anforderung und Vertragsprüfung.",
        },
        {
          label: "Schritt 3",
          title: "Der Vermieter behält die Kontrolle, während der Kommunikationsdruck sinkt",
          body: "Das Portal reduziert Verwirrung, ohne den größeren Vermieterworkflow offenzulegen. Dadurch bleibt das Erlebnis professionell und sauber abgegrenzt.",
          href: "/features/tenant-management",
          points: ["kontobezogener Zugriff", "Rollentrennung", "gleicher Workflow-Kern wie in der Hauptanwendung"],
          imageSrc: "/screenshots/security-audit.png",
          imageAlt: "Tenaqo Security Audit Ansicht als Grundlage des kontrollierten Vertrauensmodells hinter dem Mieterportal.",
        },
      ],
    },
    proofSection: {
      eyebrow: "Warum das konvertiert",
      title: "Das Mieterportal ist Teil des operativen Vertrauens",
      body:
        "Eine Vermieterplattform wirkt vollständiger, wenn Mieter die richtigen Informationen sehen, ohne in falsche Oberflächen zu geraten. Das senkt Kommunikationslast und erhöht die Glaubwürdigkeit auf beiden Seiten.",
      items: [
        {
          title: "Weniger wiederkehrende Fragen",
          body: "Standardfragen zu Zahlungen, Dokumenten und Wartung landen an einem besseren Ort als im Vermieter-Postfach.",
        },
        {
          title: "Professionelleres Mietererlebnis",
          body: "Mieter sehen eine saubere, zweckgebundene Oberfläche statt eine beschnittene Version der Vermieterkonsole.",
        },
        {
          title: "Mehr Vertrauen mit echten Grenzen",
          body: "Das heutige Mieterportal ist gerade deshalb nützlich, weil es eng auf das Mietverhältnis und den zugehörigen Ablauf begrenzt bleibt.",
        },
      ],
      imageSrc: "/screenshots/payment-setup.png",
      imageAlt: "Tenaqo Finanzansicht mit Zahlungseinrichtung, die das Mieterportal-Erlebnis speist.",
    },
    finalCta: {
      title: "Machen Sie aus Mieterverwirrung einen klareren Self-Service-Weg",
      body:
        "Wenn sich die aktuelle Belastung aus wiederkehrenden Zahlungsfragen, unklaren Wartungsupdates oder Dokumentenchaos ergibt, bietet Tenaqo ein stärkeres Mietererlebnis ohne Kontrollverlust.",
      primaryCta: { label: "Tenaqo ansehen", href: siteConfig.appUrl },
      secondaryCta: { label: "Mieterportal ansehen", href: "/features/tenant-portal" },
    },
  },
};
