import type { MetadataRoute } from "next";

import { blogArticles } from "../content/blog";
import { changelogEntries } from "../content/changelog";
import { helpArticles } from "../content/help";
import { cityPages } from "../content/locations";
import { siteConfig } from "../content/site";

const routes = [
  "",
  "/pl",
  "/pricing",
  "/pl/pricing",
  "/features",
  "/property-risk-protection-software",
  "/pl/features",
  "/tenant-portal-software",
  "/pl/tenant-portal-software",
  "/impressum",
  "/pl/impressum",
  "/blog",
  "/landlord-tools",
  "/landlord-tools/hmrc-expense-tester",
  "/landlord-tools/section-24-shock-calculator",
  "/landlord-tools/mtd-readiness-check",
  "/pl/blog",
  // /compare/tenaqo-vs-landlord-management-apps is noindex (WP4 stub) — excluded until real page ships
  "/features/command-center",
  "/features/compliance",
  "/features/maintenance-management",
  "/features/portfolio-health",
  "/features/security-audit",
  "/features/tenant-management",
  "/features/tenant-portal",
  "/features/rental-accounting",
  "/pl/features/command-center",
  "/pl/features/compliance",
  "/pl/features/maintenance-management",
  "/pl/features/portfolio-health",
  "/pl/features/rental-accounting",
  "/pl/features/security-audit",
  "/pl/features/tenant-management",
  "/pl/features/tenant-portal",
  ...blogArticles.map((article) => `/blog/${article.slug}`),
  "/help",
  ...helpArticles.map((article) => `/help/${article.slug}`),
  "/changelog",
  ...changelogEntries.map((entry) => `/changelog/${entry.slug}`),
  "/locations",
  ...cityPages.map((c) => `/locations/${c.slug}`),
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return routes.map((route) => ({
    url: `${siteConfig.url}${route}`,
    lastModified: now,
    changeFrequency: route === "" ? "weekly" : "monthly",
    priority: route === "" ? 1 : route === "/pricing" || route === "/features" ? 0.9 : 0.8,
  }));
}
