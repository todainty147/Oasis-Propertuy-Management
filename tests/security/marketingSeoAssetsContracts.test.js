import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("marketing SEO assets", () => {
  it("publishes an llms.txt asset for AI crawler discovery", () => {
    const llms = read("marketing-site/public/llms.txt");

    expect(llms).toContain("# Tenaqo");
    expect(llms).toContain("https://www.tenaqo.com/");
    expect(llms).toContain("https://www.tenaqo.com/sitemap.xml");
    expect(llms).toContain("Tenaqo helps organise property management workflows and evidence");
    expect(llms).toContain("does not replace legal, tax, financial, or professional advice");
  });

  it("uses the Tenaqo production host for marketing canonical assets by default", () => {
    const siteConfig = read("marketing-site/content/site.ts");
    const sitemap = read("marketing-site/app/sitemap.ts");
    const robots = read("marketing-site/app/robots.ts");
    const softwareSchema = read("marketing-site/components/marketing/software-schema.tsx");

    expect(siteConfig).toContain('process.env.NEXT_PUBLIC_SITE_URL || "https://www.tenaqo.com"');
    expect(sitemap).toContain("siteConfig.url");
    expect(robots).toContain("siteConfig.url");
    expect(softwareSchema).toContain("const siteUrl = siteConfig.url");
    expect(softwareSchema).not.toContain("marketing.oasisrentalmgt.app");
  });

  it("does not emit body-level hreflang links that conflict with metadata alternates", () => {
    const siteHeader = read("marketing-site/components/marketing/site-header.tsx");

    expect(siteHeader).not.toContain("hrefLang=");
    expect(siteHeader).toContain("lang={targetLocale}");
  });

  it("keeps feature and comparison canonicals on the active Tenaqo domain", () => {
    const files = [
      "marketing-site/content/features/command-center.ts",
      "marketing-site/content/features/compliance.ts",
      "marketing-site/content/features/maintenance-management.ts",
      "marketing-site/content/features/portfolio-health.ts",
      "marketing-site/content/features/rental-accounting.ts",
      "marketing-site/content/features/security-audit.ts",
      "marketing-site/content/features/tenant-management.ts",
      "marketing-site/content/features/tenant-portal.ts",
      "marketing-site/content/comparisons/oasis-vs-buildium.ts",
      "marketing-site/content/comparisons/oasis-vs-landlordstudio.ts",
      "marketing-site/content/comparisons/oasis-vs-tenantcloud.ts",
    ];

    for (const file of files) {
      const source = read(file);
      expect(source).toContain("siteConfig.url");
      expect(source).not.toContain("marketing.oasisrentalmgt.app");
    }
  });
});
