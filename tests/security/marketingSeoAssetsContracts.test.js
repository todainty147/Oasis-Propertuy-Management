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

    expect(siteConfig).toContain('process.env.NEXT_PUBLIC_SITE_URL || "https://www.tenaqo.com"');
    expect(sitemap).toContain("siteConfig.url");
    expect(robots).toContain("siteConfig.url");
  });
});
