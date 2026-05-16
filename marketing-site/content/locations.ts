import { siteConfig } from "./site";

export type CityContent = {
  slug: string;
  city: string;
  region: string;
  seo: {
    title: string;
    description: string;
    canonicalPath: string;
  };
  hero: {
    eyebrow: string;
    title: string;
    body: string;
    primaryCta: { label: string; href: string };
    secondaryCta: { label: string; href: string };
  };
  intro: {
    heading: string;
    body: string;
  };
  features: Array<{ title: string; body: string }>;
  cta: {
    heading: string;
    body: string;
    primaryCta: { label: string; href: string };
  };
};

const SHARED_FEATURES = [
  {
    title: "Rent Plans Engine",
    body: "Create rent rules, preview expected charges, and post to Finance only after landlord approval. Proration, deposits, utilities, and split rent included.",
  },
  {
    title: "Maintenance workflows",
    body: "Tenants report issues in the portal. Landlords assign contractors. Every job has a status, photos, cost tracking, and a resolved audit trail.",
  },
  {
    title: "Command Center",
    body: "Urgent, action, and upcoming queues surface rent arrears, overdue maintenance, lease renewals, compliance gaps, and document requests.",
  },
  {
    title: "Documents and compliance",
    body: "Store, request, and tag tenancy documents. Track Renters' Rights readiness, tax deadlines, and lease risks without leaving the platform.",
  },
  {
    title: "Tenant and contractor portals",
    body: "Tenants see lease details, payment status, and maintenance progress. Contractors see assigned jobs and update status without needing landlord back-and-forth.",
  },
  {
    title: "Audit-ready operations",
    body: "Role-based access, append-only finance patterns, security event ledger, and anomaly alerts help landlords stay accountable as the portfolio grows.",
  },
];

export const cityPages: CityContent[] = [
  {
    slug: "bristol",
    city: "Bristol",
    region: "South West England",
    seo: {
      title: "Property Management Software for Landlords in Bristol | Tenaqo",
      description:
        "Bristol landlords use Tenaqo to track rent, manage maintenance, organise documents, and keep compliance readiness up to date — from one rental management dashboard.",
      canonicalPath: "/locations/bristol",
    },
    hero: {
      eyebrow: "Automated Property Management in Bristol",
      title: "Bristol Landlords: Run a More Passive Portfolio With Tenaqo",
      body: "Managing properties in Bristol — from Clifton to Easton — means balancing tenant expectations, maintenance demands, and ever-changing compliance requirements. Tenaqo gives you the operating layer to handle it all without living in your inbox.",
      primaryCta: { label: "Claim Founder Access", href: siteConfig.appUrl },
      secondaryCta: { label: "See all features", href: "/features" },
    },
    intro: {
      heading: "Rental Portfolio Management Built for Bristol Landlords",
      body: "Tenaqo helps landlords in Bristol reduce manual admin, track rental income, manage maintenance across multiple properties, organise tenancy documents, and keep portfolio actions visible from one dashboard. Whether you have a single HMO in Redland or a mixed portfolio across BS postcodes, Tenaqo keeps the operation running without the daily chaos.",
    },
    features: SHARED_FEATURES,
    cta: {
      heading: "Ready to run a more passive portfolio in Bristol?",
      body: "Tenaqo is built for landlords who want visibility, control, and less daily admin — not a letting agent, but an operating layer you control.",
      primaryCta: { label: "Claim Founder Access", href: siteConfig.appUrl },
    },
  },
  {
    slug: "manchester",
    city: "Manchester",
    region: "Greater Manchester",
    seo: {
      title: "Property Management Software for Landlords in Manchester | Tenaqo",
      description:
        "Manchester landlords use Tenaqo to track rent, manage maintenance, handle compliance, and keep portfolio actions visible — from one rental management dashboard.",
      canonicalPath: "/locations/manchester",
    },
    hero: {
      eyebrow: "Automated Property Management in Manchester",
      title: "Manchester Landlords: One Dashboard for Rent, Repairs, and Compliance",
      body: "From Didsbury to Salford Quays, Manchester's rental market moves fast. Tenaqo keeps your rent rules, maintenance workflows, tenant records, and compliance readiness in one place — so you stop chasing and start running a more passive portfolio.",
      primaryCta: { label: "Claim Founder Access", href: siteConfig.appUrl },
      secondaryCta: { label: "See all features", href: "/features" },
    },
    intro: {
      heading: "Rental Portfolio Management Built for Manchester Landlords",
      body: "Tenaqo helps landlords across Greater Manchester reduce manual admin, track rental income and expected charges, manage maintenance without WhatsApp threads, and keep tenancy documents and compliance evidence in one accountable place. From student lets in Fallowfield to professional flats in the city centre, Tenaqo keeps the operation visible.",
    },
    features: SHARED_FEATURES,
    cta: {
      heading: "Ready to run a more passive portfolio in Manchester?",
      body: "Tenaqo is built for landlords who want visibility and control without the agent fee structure — an operating layer you own.",
      primaryCta: { label: "Claim Founder Access", href: siteConfig.appUrl },
    },
  },
  {
    slug: "london",
    city: "London",
    region: "Greater London",
    seo: {
      title: "Property Management Software for London Landlords | Tenaqo",
      description:
        "London landlords use Tenaqo to track rent, manage maintenance, handle compliance readiness, and keep portfolio actions visible across multiple properties.",
      canonicalPath: "/locations/london",
    },
    hero: {
      eyebrow: "Automated Property Management in London",
      title: "London Landlords: Stop Managing Your Portfolio From an Inbox",
      body: "London's rental market is high-pressure: rising compliance obligations, tenant expectations, and maintenance complexity across zones. Tenaqo gives London landlords the operating clarity to see what needs action — before it becomes expensive.",
      primaryCta: { label: "Claim Founder Access", href: siteConfig.appUrl },
      secondaryCta: { label: "See all features", href: "/features" },
    },
    intro: {
      heading: "Rental Portfolio Management Built for London Landlords",
      body: "Tenaqo helps London landlords reduce the admin overhead of running multiple properties across different boroughs. Track rent, expected charges, and arrears. Manage maintenance without losing jobs in WhatsApp threads. Keep compliance evidence — Renters' Rights readiness, right-to-rent checks, deposit records — in one audit-ready platform.",
    },
    features: SHARED_FEATURES,
    cta: {
      heading: "Ready to run a more passive London portfolio?",
      body: "Tenaqo gives London landlords the operating layer between spreadsheets and a letting agent — at software cost, not commission.",
      primaryCta: { label: "Claim Founder Access", href: siteConfig.appUrl },
    },
  },
  {
    slug: "birmingham",
    city: "Birmingham",
    region: "West Midlands",
    seo: {
      title: "Property Management Software for Landlords in Birmingham | Tenaqo",
      description:
        "Birmingham landlords use Tenaqo to track rent, manage maintenance, organise documents, and keep compliance readiness visible — from one landlord dashboard.",
      canonicalPath: "/locations/birmingham",
    },
    hero: {
      eyebrow: "Automated Property Management in Birmingham",
      title: "Birmingham Landlords: Clearer Rent, Faster Maintenance, Less Admin",
      body: "Whether you manage properties in Edgbaston, Moseley, or across the West Midlands, Tenaqo keeps your rental portfolio visible and moving — from rent plans and expected charges through to maintenance, documents, and compliance readiness.",
      primaryCta: { label: "Claim Founder Access", href: siteConfig.appUrl },
      secondaryCta: { label: "See all features", href: "/features" },
    },
    intro: {
      heading: "Rental Portfolio Management Built for Birmingham Landlords",
      body: "Tenaqo helps Birmingham landlords consolidate the daily rental operation: rent tracking, maintenance workflows, tenancy documents, contractor coordination, and compliance readiness — all in one accountable place. Less time in spreadsheets. More time running a passive portfolio.",
    },
    features: SHARED_FEATURES,
    cta: {
      heading: "Ready to simplify your Birmingham rental portfolio?",
      body: "Tenaqo is the operating layer Birmingham landlords use to bring rent, repairs, documents, and compliance into one controllable workflow.",
      primaryCta: { label: "Claim Founder Access", href: siteConfig.appUrl },
    },
  },
  {
    slug: "leeds",
    city: "Leeds",
    region: "West Yorkshire",
    seo: {
      title: "Property Management Software for Landlords in Leeds | Tenaqo",
      description:
        "Leeds landlords use Tenaqo to track rent and expected charges, manage maintenance, handle compliance, and keep portfolio actions visible from one rental dashboard.",
      canonicalPath: "/locations/leeds",
    },
    hero: {
      eyebrow: "Automated Property Management in Leeds",
      title: "Leeds Landlords: Rent, Maintenance, and Compliance — One Dashboard",
      body: "From Headingley student lets to city centre apartments, Leeds landlords face the same operational pressure: rent to track, maintenance to manage, compliance to stay on top of. Tenaqo brings it all into one place — so you can run a more passive portfolio without the admin chaos.",
      primaryCta: { label: "Claim Founder Access", href: siteConfig.appUrl },
      secondaryCta: { label: "See all features", href: "/features" },
    },
    intro: {
      heading: "Rental Portfolio Management Built for Leeds Landlords",
      body: "Tenaqo helps Leeds landlords manage the full rental operation: rent plans and expected charges, maintenance workflows, tenancy documents, compliance evidence, and tenant/contractor portals — from one accountable landlord dashboard. Whether you have two properties or twenty, Tenaqo keeps the operation running without manual reconstruction every week.",
    },
    features: SHARED_FEATURES,
    cta: {
      heading: "Ready to run a more passive portfolio in Leeds?",
      body: "Tenaqo gives Leeds landlords the operational clarity to see what needs action — before it becomes expensive.",
      primaryCta: { label: "Claim Founder Access", href: siteConfig.appUrl },
    },
  },
];

export const cityPagesBySlug: Record<string, CityContent> = Object.fromEntries(
  cityPages.map((c) => [c.slug, c])
);
