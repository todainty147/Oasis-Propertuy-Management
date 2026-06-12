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

  it("keeps localized feature pages, titles, and anchors crawl-friendly", () => {
    const featuresPage = read("marketing-site/content/features-page.ts");
    const blogIndex = read("marketing-site/content/blog-index.ts");
    const blogIndexPage = read("marketing-site/components/marketing/blog-index-page.tsx");
    const landlordTools = read("marketing-site/app/landlord-tools/page.tsx");
    const locationsPage = read("marketing-site/app/locations/page.tsx");
    const riskProtectionPage = read("marketing-site/app/property-risk-protection-software/page.tsx");
    const workflowShowcase = read("marketing-site/components/marketing/workflow-showcase.tsx");

    expect(featuresPage).toContain('href: "/features/tenant-management"');
    expect(featuresPage).toContain("Poznaj zarządzanie najemcami");
    expect(blogIndex).not.toContain('readMoreLabel: "Read more"');
    expect(blogIndexPage).toContain("`Read: ${article.title}`");
    expect(landlordTools).toContain("Open {tool.title}");
    expect(workflowShowcase).toContain("`Explore ${item.title}`");

    const longTitleSources = [featuresPage, blogIndex, locationsPage, riskProtectionPage];
    for (const source of longTitleSources) {
      const titleMatches = source.matchAll(/title:\s*"([^"]+)"/g);
      for (const [, title] of titleMatches) {
        if (title.includes("| Tenaqo") || title.startsWith("Tenaqo ")) {
          expect(title.length, title).toBeLessThanOrEqual(65);
        }
      }
    }
  });
});
