# Tenaqo Marketing Site

This is the starter Next.js marketing site for Tenaqo.

It is intentionally separate from the main Vite app so public SEO pages can live at `/` while the SaaS product stays under `/app`.

## Included

- App Router scaffold
- homepage at `app/page.tsx`
- pricing page at `app/pricing/page.tsx`
- features hub at `app/features/page.tsx`
- shared marketing components in `components/marketing`
- structured content files in `content`
- reusable metadata helper in `lib/metadata.ts`

## Run locally

From the repo root:

```bash
cd marketing-site
npm install
npm run dev
```

Then open:

```text
http://localhost:3000
```

## Current routes

- `/`
- `/pricing`
- `/features`

## Content sources

- homepage content: `content/homepage.ts`
- pricing content: `content/pricing.ts`
- shared site config: `content/site.ts`

## Next build steps

1. Add feature detail pages under `app/features/*`
2. Add comparison pages under `app/compare/*`
3. Add the blog index and blog post routes
4. Add real screenshots and Open Graph images in `public/`
5. Add `sitemap.ts` and `robots.ts`
6. Connect `/app` to the production SaaS app URL if marketing and app are deployed separately

## Notes

- The content is based on the docs in `../docs/marketing-final-copy.md`
- Styling is intentionally lightweight so the structure is easy to evolve
- No CMS is required for the first version; the site is data-driven from local content files
