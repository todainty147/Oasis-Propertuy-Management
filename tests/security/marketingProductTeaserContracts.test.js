import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

const teaserDir = "marketing-site/components/marketing/product-teaser";

function read(path) {
  return readFileSync(path, "utf8");
}

describe("marketing product teaser contracts", () => {
  it("ships the requested product teaser component set", () => {
    [
      "ProductTeaserFrame.tsx",
      "CommandCenterTeaser.tsx",
      "PortfolioHealthTeaser.tsx",
      "ProductWalkthroughModal.tsx",
      "TenantPortalTeaser.tsx",
      "TeaserMetricCard.tsx",
      "TeaserQueueItem.tsx",
      "TeaserBrowserChrome.tsx",
      "demoTeaserData.ts",
      "useTeaserSequence.ts",
      "index.ts",
    ].forEach((file) => {
      expect(read(`${teaserDir}/${file}`)).toBeTruthy();
    });
  });

  it("uses safe hardcoded demo data with no app auth or Supabase dependencies", () => {
    const combined = [
      "ProductTeaserFrame.tsx",
      "CommandCenterTeaser.tsx",
      "PortfolioHealthTeaser.tsx",
      "ProductWalkthroughModal.tsx",
      "TenantPortalTeaser.tsx",
      "demoTeaserData.ts",
    ]
      .map((file) => read(`${teaserDir}/${file}`))
      .join("\n");

    expect(combined).toContain("Bishopston House");
    expect(combined).toContain("Flat 4, Clifton");
    expect(combined).toContain("Daily AI summary");
    expect(combined).toContain("Issue timeline updated");
    expect(combined).not.toMatch(/supabase|useAuth|AuthContext|AccountContext|fetch\(/i);
  });

  it("wires the refined seven-section homepage flow", () => {
    const hero = read("marketing-site/components/marketing/hero-section.tsx");
    const home = read("marketing-site/components/marketing/home-page.tsx");
    const homepageContent = read("marketing-site/content/homepage.ts");
    const layout = read("marketing-site/app/layout.tsx");

    expect(homepageContent).toContain("The operating layer for independent landlords.");
    expect(homepageContent).toContain("one calm workspace for rent visibility");
    expect(hero).toContain("CommandCenterTeaser");
    expect(hero).toContain("props.productTeaser");
    expect(hero).toContain("See how Tenaqo works");
    expect(home).toContain("productTeaser");
    expect(home).toContain('data-home-section="pain"');
    expect(home).toContain('data-home-section="portfolio-health"');
    expect(home).toContain('data-home-section="workflows"');
    expect(home).toContain('data-home-section="founder-offer"');
    expect(home).toContain('data-home-section="trust"');
    expect(home).toContain("PortfolioHealthTeaser");
    expect(home).toContain("See the Tenant Portal in action");
    expect(home).toContain('initialScene="tenant-portal"');
    expect(layout).toContain("<SiteFooter");
  });

  it("does not render the removed repetitive homepage sections", () => {
    const home = read("marketing-site/components/marketing/home-page.tsx");

    expect(home).not.toContain("TrustBar");
    expect(home).not.toContain("TestimonialCards");
    expect(home).not.toContain("FeatureGrid");
    expect(home).not.toContain("ProductPreview");
    expect(home).not.toContain("AgentComparison");
  });

  it("uses a true tenant-facing portal mockup without Command Center labels", () => {
    const tenantPortal = read(`${teaserDir}/TenantPortalTeaser.tsx`);
    const data = read(`${teaserDir}/demoTeaserData.ts`);

    expect(tenantPortal).toContain("Tenant Portal");
    expect(tenantPortal).toContain("Repair updates");
    expect(tenantPortal).not.toContain("Command Center");
    expect(data).toContain('key: "tenant-portal"');
    expect(data).toContain('eyebrow: "Tenant Portal"');
    expect(data).toContain("My home, repair updates, rent status, and shared documents");
    expect(data).toContain("Property details");
    expect(data).not.toMatch(/tenant-portal[\s\S]{0,900}(Command Center|Owner approval|Portfolio queue|AI operator briefing|landlord-controlled queue|Manager dashboard)/i);
  });

  it("keeps the walkthrough modal accessible and keyboard dismissible", () => {
    const modal = read(`${teaserDir}/ProductWalkthroughModal.tsx`);

    expect(modal).toContain('role="dialog"');
    expect(modal).toContain('aria-modal="true"');
    expect(modal).toContain('event.key === "Escape"');
    expect(modal).toContain('event.key === "Tab"');
    expect(modal).toContain("querySelectorAll<HTMLElement>");
    expect(modal).toContain("event.preventDefault()");
    expect(modal).toContain("event.target === event.currentTarget");
    expect(modal).toContain("Play");
    expect(modal).toContain("Pause");
    expect(modal).toContain("initialScene");
    expect(modal).toContain("findIndex");
  });

  it("adds founder trust chips and partner-like boundary wording", () => {
    const home = read("marketing-site/components/marketing/home-page.tsx");

    expect(home).toContain("Account-scoped access");
    expect(home).toContain("Tenant and contractor role separation");
    expect(home).toContain("Document audit history");
    expect(home).toContain("AI assists - landlord approves");
    expect(home).toContain("Tenaqo is designed to support your existing legal, tax and property advice workflows");
    expect(home).toContain("Tenaqo does not collect rent, move money, or operate as a payment rail today.");
  });

  it("adds the tenant portal persona toggle and the compare calculator surfaces", () => {
    const tenantPage = read("marketing-site/app/features/tenant-portal/page.tsx");
    const personaToggle = read("marketing-site/components/marketing/tenant-portal-persona-toggle.tsx");
    const comparisonPage = read("marketing-site/components/marketing/comparison-page.tsx");
    const calculator = read("marketing-site/components/marketing/agency-fee-calculator.tsx");

    expect(tenantPage).toContain("TenantPortalPersonaToggle");
    expect(personaToggle).toContain("For Landlords");
    expect(personaToggle).toContain("For Tenants");
    expect(personaToggle).toContain("For Contractors");
    expect(personaToggle).not.toMatch(/supabase|useAuth|AuthContext|AccountContext|fetch\(/i);
    expect(comparisonPage).toContain("AgencyFeeCalculator");
    expect(calculator).toContain("Estimated agency fee exposure");
    expect(calculator).toContain("Estimated monthly agency fees");
    expect(calculator).toContain("Estimated annual agency fees");
    expect(calculator).toContain("Actual fees vary by agent and service level");
    expect(calculator).not.toMatch(/guaranteed savings|financial advice|anti-agent/i);
  });

  it("does not require dead screenshot props on the hero component contract", () => {
    const hero = read("marketing-site/components/marketing/hero-section.tsx");

    expect(hero).not.toMatch(/imageSrc:\s*string/);
    expect(hero).not.toMatch(/imageAlt:\s*string/);
  });

  it("removes unused homepage hero clutter fields from the content contract", () => {
    const homepageContent = read("marketing-site/content/homepage.ts");

    expect(homepageContent).not.toMatch(/highlights:\s*Array/);
    expect(homepageContent).not.toMatch(/microcopy:\s*string\[\]/);
    expect(homepageContent).not.toMatch(/\n\s*highlights:\s*\[/);
    expect(homepageContent).not.toMatch(/\n\s*microcopy:\s*\[/);
  });

  it("exposes the 14-day trial on marketing pricing cards", () => {
    const pricingContent = read("marketing-site/content/pricing.ts");
    const pricingCards = read("marketing-site/components/marketing/pricing-cards.tsx");
    const trialSecurity = read("tests/security/trialEnforcementSecurity.test.js");

    expect(trialSecurity).toContain("now() + 14 days");
    expect(pricingCards).toContain("pricing-trial-note");
    expect(pricingCards).toContain("plan.trialNote");
    expect(pricingContent.match(/Includes a 14-day trial/g)).toHaveLength(4);
    expect(pricingContent.match(/14-dniowy okres próbny/g)).toHaveLength(4);
    expect(pricingContent.match(/14-tägige Testphase/g)).toHaveLength(4);
  });

  it("includes reduced-motion handling for teaser animations", () => {
    const css = read("marketing-site/app/globals.css");

    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain(".portfolio-teaser__score-progress");
    expect(css).toContain(".teaser-queue-item.is-active");
  });
});
