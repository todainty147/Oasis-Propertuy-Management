import type { MetadataRoute } from "next";

import { blogArticles } from "../content/blog";
import { cityPages } from "../content/locations";
import { siteConfig } from "../content/site";

const routes = [
  "",
  "/pl",
  "/de",
  "/pricing",
  "/pl/pricing",
  "/de/pricing",
  "/features",
  "/property-risk-protection-software",
  "/pl/features",
  "/de/features",
  "/tenant-portal-software",
  "/pl/tenant-portal-software",
  "/de/tenant-portal-software",
  "/impressum",
  "/pl/impressum",
  "/de/impressum",
  "/blog",
  "/landlord-tools",
  "/landlord-tools/hmrc-expense-tester",
  "/landlord-tools/section-24-shock-calculator",
  "/landlord-tools/mtd-readiness-check",
  "/pl/blog",
  "/de/blog",
  "/compare/oasis-vs-landlordstudio",
  "/pl/compare/oasis-vs-landlordstudio",
  "/de/compare/oasis-vs-landlordstudio",
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
  "/de/features/command-center",
  "/de/features/compliance",
  "/de/features/maintenance-management",
  "/de/features/portfolio-health",
  "/de/features/rental-accounting",
  "/de/features/security-audit",
  "/de/features/tenant-management",
  "/de/features/tenant-portal",
  "/compare/oasis-vs-buildium",
  "/compare/oasis-vs-tenantcloud",
  ...blogArticles.map((article) => `/blog/${article.slug}`),
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
