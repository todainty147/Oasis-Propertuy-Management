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
      "demoTeaserData.ts",
    ]
      .map((file) => read(`${teaserDir}/${file}`))
      .join("\n");

    expect(combined).toContain("Bishopston House");
    expect(combined).toContain("Flat 4, Clifton");
    expect(combined).toContain("Daily AI summary");
    expect(combined).not.toMatch(/supabase|useAuth|AuthContext|AccountContext|fetch\(/i);
  });

  it("wires the refined seven-section homepage flow", () => {
    const hero = read("marketing-site/components/marketing/hero-section.tsx");
    const home = read("marketing-site/components/marketing/home-page.tsx");
    const layout = read("marketing-site/app/layout.tsx");

    expect(hero).toContain("CommandCenterTeaser");
    expect(hero).toContain("props.productTeaser");
    expect(hero).toContain("Watch product preview");
    expect(home).toContain("productTeaser");
    expect(home).toContain('data-home-section="pain"');
    expect(home).toContain('data-home-section="portfolio-health"');
    expect(home).toContain('data-home-section="workflows"');
    expect(home).toContain('data-home-section="founder-offer"');
    expect(home).toContain('data-home-section="trust"');
    expect(home).toContain("PortfolioHealthTeaser");
    expect(home).toContain("See Tenaqo in action");
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

  it("includes reduced-motion handling for teaser animations", () => {
    const css = read("marketing-site/app/globals.css");

    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain(".portfolio-teaser__score-progress");
    expect(css).toContain(".teaser-queue-item.is-active");
  });
});
