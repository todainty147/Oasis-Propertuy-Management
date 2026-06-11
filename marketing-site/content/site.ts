import type { Locale } from "../lib/i18n";

const isProduction = process.env.NODE_ENV === "production";

export const siteConfig = {
  name: "Tenaqo",
  url: process.env.NEXT_PUBLIC_SITE_URL || "https://www.tenaqo.com",
  appUrl:
    process.env.NEXT_PUBLIC_APP_URL ||
    (isProduction ? "https://oasisrentalmgt.app" : "http://localhost:5173"),
  nav: [
    { key: "features", href: "/features" },
    { key: "tenantPortal", href: "/features/tenant-portal" },
    { key: "tools", href: "/landlord-tools" },
    { key: "pricing", href: "/pricing" },
    { key: "compare", href: "/compare/oasis-vs-landlordstudio" },
    { key: "blog", href: "/blog" },
  ] as const,
};

type SiteCopy = {
  nav: Record<(typeof siteConfig.nav)[number]["key"], string>;
  navHrefOverrides?: Partial<Record<(typeof siteConfig.nav)[number]["key"], string>>;
  signIn: string;
  primaryCta: string;
  footerBlurb: string;
  footerLinks: {
    features: string;
    pricing: string;
    compare: string;
    tools: string;
    blog: string;
    legalNotice: string;
    earlyAccess: string;
  };
  languageSwitcherLabel: string;
  languageNames: Record<Locale, string>;
};

export const siteCopyByLocale: Record<Locale, SiteCopy> = {
  en: {
    nav: {
      features: "Features",
      tenantPortal: "Tenant Portal",
      tools: "Tools",
      pricing: "Pricing",
      compare: "Compare",
      blog: "Blog",
    },
    navHrefOverrides: {
      tenantPortal: "/tenant-portal-software",
    },
    signIn: "Sign in",
    primaryCta: "Claim Founder Access",
    footerBlurb:
      "Tenaqo helps landlords run rental operations with clearer follow-up, stronger maintenance control, and a tighter audit trail.",
    footerLinks: {
      features: "Features",
      pricing: "Pricing",
      compare: "Compare",
      tools: "Landlord tax tools",
      blog: "Blog",
      legalNotice: "Legal notice",
      earlyAccess: "Early access",
    },
    languageSwitcherLabel: "Language",
    languageNames: {
      en: "EN",
      pl: "PL",
      de: "DE",
    },
  },
  pl: {
    nav: {
      features: "Funkcje",
      tenantPortal: "Portal najemcy",
      tools: "Narzędzia",
      pricing: "Cennik",
      compare: "Porównanie",
      blog: "Blog",
    },
    navHrefOverrides: {
      tenantPortal: "/tenant-portal-software",
    },
    signIn: "Zaloguj się",
    primaryCta: "Zobacz, jak działa Tenaqo",
    footerBlurb:
      "Tenaqo pomaga właścicielom mieszkań prowadzić najem z pełną kontrolą nad zgłoszeniami, płatnościami, dokumentami i historią działań.",
    footerLinks: {
      features: "Funkcje",
      pricing: "Cennik",
      compare: "Porównanie",
      tools: "Narzędzia podatkowe",
      blog: "Blog",
      legalNotice: "Informacje prawne",
      earlyAccess: "Wczesny dostęp",
    },
    languageSwitcherLabel: "Język",
    languageNames: {
      en: "EN",
      pl: "PL",
      de: "DE",
    },
  },
  de: {
    nav: {
      features: "Funktionen",
      tenantPortal: "Mieterportal",
      tools: "Tools",
      pricing: "Preise",
      compare: "Vergleich",
      blog: "Blog",
    },
    navHrefOverrides: {
      tenantPortal: "/tenant-portal-software",
    },
    signIn: "Anmelden",
    primaryCta: "Tenaqo im Einsatz sehen",
    footerBlurb:
      "Tenaqo unterstützt Vermieter mit nachvollziehbaren Abläufen, strukturierter Instandhaltungssteuerung und klarer operativer Nachverfolgung.",
    footerLinks: {
      features: "Funktionen",
      pricing: "Preise",
      compare: "Vergleich",
      tools: "Vermieter-Steuertools",
      blog: "Blog",
      legalNotice: "Impressum",
      earlyAccess: "Frühzugang",
    },
    languageSwitcherLabel: "Sprache",
    languageNames: {
      en: "EN",
      pl: "PL",
      de: "DE",
    },
  },
};
