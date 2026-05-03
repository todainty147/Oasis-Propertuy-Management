# OASIS Next.js Marketing Site Architecture

This document maps the marketing copy in [docs/marketing-final-copy.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/marketing-final-copy.md) into a practical Next.js site structure.

Goal:

- marketing site at `/`
- current SaaS app at `/app`
- strong SEO for public pages
- clear separation between marketing and product

## Recommended Setup

Use a separate Next.js project for marketing.

Suggested production routing:

```text
oasisrental.com        -> Next.js marketing site
oasisrental.com/app    -> current React SaaS app
```

Why:

- Next.js gives you page metadata, static generation, sitemap support, and blog SEO cleanly
- the current Vite app stays focused on authenticated product UX
- no need to mix public marketing routes into the current `src/App.jsx`

## Recommended Repo Shape

If you keep both projects in one repo later, the clean structure is:

```text
/marketing-site   -> Next.js app
/app              -> current React SaaS app
/docs             -> copy, SEO, and architecture docs
```

For now, this doc assumes the marketing site will be created separately.

## Next.js App Router Structure

Use the App Router.

Suggested file tree:

```text
marketing-site/
  app/
    layout.tsx
    page.tsx
    pricing/
      page.tsx
    features/
      page.tsx
      tenant-management/
        page.tsx
      maintenance-management/
        page.tsx
      rental-accounting/
        page.tsx
      document-management/
        page.tsx
      tenant-portal/
        page.tsx
    compare/
      oasis-vs-buildium/
        page.tsx
      oasis-vs-landlordstudio/
        page.tsx
      oasis-vs-tenantcloud/
        page.tsx
    blog/
      page.tsx
      [slug]/
        page.tsx
    sitemap.ts
    robots.ts
    opengraph-image.tsx
  components/
    marketing/
      site-header.tsx
      site-footer.tsx
      hero-section.tsx
      feature-grid.tsx
      benefit-grid.tsx
      pricing-preview.tsx
      testimonial-strip.tsx
      final-cta.tsx
      page-hero.tsx
      content-section.tsx
      comparison-table.tsx
      cta-banner.tsx
      faq-list.tsx
      blog-card.tsx
      article-content.tsx
      software-schema.tsx
  content/
    site.ts
    homepage.ts
    pricing.ts
    features/
      tenant-management.ts
      maintenance-management.ts
      rental-accounting.ts
      document-management.ts
      tenant-portal.ts
    comparisons/
      oasis-vs-buildium.ts
      oasis-vs-landlordstudio.ts
      oasis-vs-tenantcloud.ts
    blog/
      index.ts
      posts/
        how-to-manage-rental-properties-efficiently.ts
        the-ultimate-guide-to-being-a-landlord.ts
        how-to-screen-tenants-properly.ts
        ...
  lib/
    metadata.ts
    schema.ts
    routes.ts
    canonical.ts
  public/
    images/
      marketing/
        hero-dashboard.png
        dashboard-preview.png
        feature-tenants.png
        feature-maintenance.png
        feature-finance.png
        og-default.png
```

## Route Map

### Homepage

Route:

```text
app/page.tsx
```

Source copy:

- homepage section in [docs/marketing-final-copy.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/marketing-final-copy.md)

Page sections:

1. `SiteHeader`
2. `HeroSection`
3. `FeatureGrid`
4. `BenefitGrid`
5. `PricingPreview`
6. `TestimonialStrip`
7. `FinalCta`
8. `SiteFooter`

### Pricing

Route:

```text
app/pricing/page.tsx
```

Page sections:

1. `PageHero`
2. `PricingCards`
3. `IncludedFeatures`
4. `FaqList`
5. `FinalCta`

### Features Hub

Route:

```text
app/features/page.tsx
```

Page sections:

1. `PageHero`
2. `FeatureGrid`
3. `BenefitGrid`
4. `CtaBanner`

### Feature Detail Pages

Routes:

```text
app/features/tenant-management/page.tsx
app/features/maintenance-management/page.tsx
app/features/rental-accounting/page.tsx
app/features/document-management/page.tsx
app/features/tenant-portal/page.tsx
```

Use one shared page component pattern:

1. `PageHero`
2. `ContentSection`
3. `ContentSection`
4. `ContentSection`
5. `CtaBanner`

Recommended implementation:

- `FeaturePageTemplate`
- content loaded from `content/features/*.ts`

### Comparison Pages

Routes:

```text
app/compare/oasis-vs-buildium/page.tsx
app/compare/oasis-vs-landlordstudio/page.tsx
app/compare/oasis-vs-tenantcloud/page.tsx
```

Recommended page sections:

1. `PageHero`
2. `ComparisonSummary`
3. `ComparisonTable`
4. `BestForSection`
5. `CtaBanner`

These should be built from structured content so you can add more comparison pages later without redoing the layout.

### Blog

Routes:

```text
app/blog/page.tsx
app/blog/[slug]/page.tsx
```

Blog index sections:

1. `PageHero`
2. featured article block
3. article grid
4. category or topic clusters
5. `CtaBanner`

Blog post sections:

1. title/meta/author/date block
2. article body
3. inline CTA
4. related posts

## Shared Layout Structure

### `app/layout.tsx`

Responsibilities:

- global fonts
- global styles
- default metadata
- site header/footer wrapper
- global schema defaults

Suggested shell:

```tsx
<html lang="en">
  <body>
    <SiteHeader />
    {children}
    <SiteFooter />
  </body>
</html>
```

## Content Model

Keep page copy in `content/` files, not hardcoded inline in page components.

Suggested types:

```ts
type SeoMeta = {
  title: string;
  description: string;
  canonical: string;
};

type HeroContent = {
  eyebrow?: string;
  title: string;
  body: string;
  primaryCta?: { label: string; href: string };
  secondaryCta?: { label: string; href: string };
};

type SectionContent = {
  title: string;
  body?: string;
  bullets?: string[];
};
```

This makes it easier to:

- reuse layouts
- update SEO content without touching component structure
- scale to the 50-article plan cleanly

## Metadata Pattern

Use `generateMetadata()` for each page.

Recommended helper:

```ts
import type { Metadata } from "next";

export function buildMetadata({
  title,
  description,
  canonical,
}: {
  title: string;
  description: string;
  canonical: string;
}): Metadata {
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}
```

Use it in each route page:

```ts
export const metadata = buildMetadata(content.seo);
```

## Structured Data

### Site-wide software schema

Render once in the root layout or homepage.

Component:

```text
components/marketing/software-schema.tsx
```

Use for:

- `SoftwareApplication`
- `Organization`

### Blog post schema

Add:

- `BlogPosting`

on article pages only.

### FAQ schema

Add:

- `FAQPage`

only if a page has a real FAQ section.

## Navigation

Recommended header nav:

- Features
- Pricing
- Compare
- Blog
- Sign In
- Start Free

Recommended footer nav:

- Product
- Features
- Pricing
- Blog
- Compare
- Sign In
- Privacy
- Terms

## CTA Mapping

Marketing CTA targets should be consistent:

- primary CTA: `/app`
- pricing CTA: `/pricing`
- feature exploration CTA: `/features`

Use the same CTA language patterns from [docs/marketing-final-copy.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/marketing-final-copy.md).

## Visual Component Mapping

### Homepage

Suggested component composition:

```tsx
<HeroSection />
<FeatureGrid />
<BenefitGrid />
<PricingPreview />
<TestimonialStrip />
<FinalCta />
```

### Feature page

```tsx
<PageHero />
<ContentSection />
<ContentSection />
<ContentSection />
<CtaBanner />
```

### Comparison page

```tsx
<PageHero />
<ComparisonSummary />
<ComparisonTable />
<ContentSection />
<CtaBanner />
```

### Blog post

```tsx
<ArticleHeader />
<ArticleContent />
<InlineCta />
<RelatedPosts />
```

## `/app` Integration Options

### Option A: separate deployments

Best option.

- deploy Next.js marketing site on main domain
- deploy current Vite app separately
- route `/app` to the Vite deployment via reverse proxy or platform routing

### Option B: same infra, rewritten path

Use platform-level rewrites so:

- `/` goes to Next.js
- `/app` proxies to the Vite app

This is the better architecture than trying to mount the Vite app inside Next.js directly.

## Minimum Viable Build Order

Build in this order:

1. `app/layout.tsx`
2. `app/page.tsx`
3. `app/pricing/page.tsx`
4. `app/features/page.tsx`
5. 5 feature detail pages
6. 3 comparison pages
7. `app/blog/page.tsx`
8. first 10 blog posts
9. `sitemap.ts`
10. `robots.ts`

## First Content Files to Create

Start with:

```text
content/site.ts
content/homepage.ts
content/pricing.ts
content/features/tenant-management.ts
content/features/maintenance-management.ts
content/features/rental-accounting.ts
content/features/document-management.ts
content/features/tenant-portal.ts
content/comparisons/oasis-vs-buildium.ts
content/comparisons/oasis-vs-landlordstudio.ts
content/comparisons/oasis-vs-tenantcloud.ts
```

## Suggested `content/homepage.ts` Shape

```ts
export const homepageContent = {
  seo: {
    title: "Property Management Software for Landlords | OASIS Rental",
    description:
      "OASIS Rental helps landlords manage tenants, maintenance, finances, and documents in one place. Built for modern property owners.",
    canonical: "https://oasisrental.com/",
  },
  hero: {
    eyebrow: "Built for modern landlords",
    title: "Manage tenants, maintenance, finances, and documents in one place",
    body:
      "OASIS gives landlords a cleaner way to run rental operations day to day...",
    primaryCta: { label: "Start Free in OASIS", href: "/app" },
    secondaryCta: { label: "View Features", href: "/features" },
  },
};
```

## Blog Architecture

Use structured `ts` content files at first instead of a CMS.

Recommended post shape:

```ts
export const post = {
  slug: "how-to-manage-rental-properties-efficiently",
  seo: {
    title: "...",
    description: "...",
    canonical: "https://oasisrental.com/blog/how-to-manage-rental-properties-efficiently",
  },
  title: "...",
  excerpt: "...",
  publishedAt: "2026-03-16",
  category: "Landlord Guides",
  readingTime: "8 min read",
  body: [
    {
      type: "paragraph",
      content: "...",
    },
    {
      type: "heading",
      level: 2,
      content: "...",
    },
  ],
};
```

This is enough to launch and index content fast without overengineering.

## Final Recommendation

The best immediate build path is:

1. create a separate Next.js marketing project
2. use `docs/marketing-final-copy.md` as the page copy source
3. implement the route/component structure in this document
4. connect `/app` to the existing SaaS app

## Best Next Deliverable

After this architecture doc, the most useful next artifact is:

- a concrete starter file set for the Next.js marketing app

That means:

- `app/layout.tsx`
- `app/page.tsx`
- `app/pricing/page.tsx`
- `components/marketing/*`
- `content/homepage.ts`
- `content/pricing.ts`

If you want, I can generate that starter file set next.  
