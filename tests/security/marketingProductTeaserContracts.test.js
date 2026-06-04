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

    expect(combined).toContain("36 Ashton Rd");
    expect(combined).toContain("Daily AI summary");
    expect(combined).not.toMatch(/supabase|useAuth|AuthContext|AccountContext|fetch\(/i);
  });

  it("wires the Command Center teaser into the hero and Portfolio Health into the homepage", () => {
    const hero = read("marketing-site/components/marketing/hero-section.tsx");
    const home = read("marketing-site/components/marketing/home-page.tsx");

    expect(hero).toContain("CommandCenterTeaser");
    expect(hero).toContain("Watch product preview");
    expect(home).toContain("PortfolioHealthTeaser");
    expect(home).toContain("See Tenaqo in action");
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

  it("includes reduced-motion handling for teaser animations", () => {
    const css = read("marketing-site/app/globals.css");

    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain(".portfolio-teaser__score-progress");
    expect(css).toContain(".teaser-queue-item.is-active");
  });
});
