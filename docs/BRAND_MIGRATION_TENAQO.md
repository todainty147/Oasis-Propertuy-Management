# Tenaqo Brand Migration Note

Date: 2026-05-16

## Summary

The primary user-facing brand has moved from OASIS Rental / OASIS Rental Management to Tenaqo.

The product positioning is now:

- Brand: Tenaqo
- Short tagline: Rental operations software
- Longer tagline: Rent, repairs, documents, and compliance in one action queue.
- Transition wording, where useful: Tenaqo, formerly OASIS Rental Management

This was a brand migration only. Product features, routes, authentication, billing behaviour, tenant and contractor portals, finance logic, document storage, compliance workflows, and database table names were not intentionally changed.

## Files Changed

Main app surfaces:

- `src/config/brand.js`
- `src/components/BrandLogo.jsx`
- `src/index.css`
- `src/layout/Sidebar.jsx`
- `src/layout/Topbar.jsx`
- `src/pages/Login.jsx`
- `src/pages/LandlordSignup.jsx`
- `src/pages/PublicDataDeletionPage.jsx`
- `src/pages/DataPrivacyPage.jsx`
- `src/pages/AccountBrandingPage.jsx`
- `src/pages/BillingPage.jsx`
- `src/i18n/messages.js`
- `src/components/auth/PasswordStrengthMeter.jsx`
- `src/components/rent/AdvancedModelSelector.jsx`
- `src/components/work-orders/ExternalMarketplacePanel.jsx`
- `src/utils/marketplaceHandoffCopy.js`
- `index.html`
- `public/manifest.json`
- `public/offline.html`
- `public/sw.js`
- `public/brand/tenaqo/*`
- `tests/security/brandLogoContracts.test.js`
- `tests/unit/pwaManifest.test.js`

Marketing site:

- `marketing-site/content/site.ts`
- `marketing-site/content/homepage.ts`
- `marketing-site/content/features-page.ts`
- `marketing-site/content/blog-index.ts`
- `marketing-site/content/pricing.ts`
- `marketing-site/content/blog.ts`
- `marketing-site/content/legal.ts`
- `marketing-site/content/locations.ts`
- `marketing-site/content/tenant-portal-landing.ts`
- `marketing-site/content/features/*.ts`
- `marketing-site/content/comparisons/*.ts`
- `marketing-site/components/marketing/site-header.tsx`
- `marketing-site/components/marketing/site-footer.tsx`
- `marketing-site/components/marketing/software-schema.tsx`
- `marketing-site/components/marketing/*.tsx`
- `marketing-site/app/**/*.tsx`
- `marketing-site/app/manifest.ts`
- `marketing-site/app/globals.css`
- `marketing-site/lib/metadata.ts`

Email, billing, and operational templates:

- `supabase/functions/invite-user/index.ts`
- `supabase/functions/send-reminder-emails/index.ts`
- `supabase/functions/send-password-reset-email/index.ts`
- `supabase/functions/create-checkout-session/index.ts`
- `supabase/functions/create-oa-checkout-session/index.ts`
- `supabase/functions/suggest-checklist-item-match/index.ts`
- `supabase/functions/submit-marketplace-handoff/index.ts`
- `docs/templates/*.md`
- `docs/templates/*.html`

Policy/readiness docs with user-facing copy:

- `docs/DATA_RETENTION_POLICY.md`
- `docs/MOBILE_PRIVACY_READINESS.md`
- `docs/RENTERS_RIGHTS_READINESS.md`

## Old Brand References Found

The audit found OASIS references in:

- main app shell, auth screens, PWA metadata, offline page, and service worker text
- landlord dashboard copy, tenant portal copy, billing copy, notifications, onboarding, marketplace handoff copy, and AI-assisted wording
- marketing homepage, pricing, feature pages, comparison pages, blog metadata, legal pages, structured data, header, and footer
- invite, reminder, password reset, billing, marketplace handoff, and AI assistance functions
- historical engineering docs, roadmap docs, internal runbooks, test fixture emails, route slugs, and package names

## Intentional References Left Unchanged

The following old identifiers remain intentionally because changing them now would create unnecessary release risk or break existing integrations:

- package names such as `oasisrentalmanagementapp`
- current production domains such as `oasisrentalmgt.app` and `marketing.oasisrentalmgt.app`
- comparison route slugs such as `/compare/oasis-vs-landlordstudio`
- imported content variable names such as `oasisVsLandlordStudioContent`
- internal environment variable names such as `OASIS_INVITES_FROM`, `OASIS_REMINDERS_FROM`, `OASIS_PASSWORD_RESETS_FROM`, `OASIS_AI_MODEL`, and `OASIS_AI_CACHE_TTL_HOURS`
- internal marketplace idempotency keys and headers that include `oasis`
- local storage keys and test fixture domains such as `@oasis.test`
- historical docs, roadmap docs, and release notes that describe work completed under the old brand
- Supabase project names, database tables, RPCs, storage buckets, and auth settings

These should be revisited only as part of a controlled domain/config migration, not a copy-only brand migration.

## Asset Paths Updated

The approved production Tenaqo assets were copied from:

```text
C:\Users\Home\oasisrentalmanagementapp\tenaqo_production_brand_asset_pack
```

to:

```text
public/brand/tenaqo/
```

Copied app assets include:

- `logo-primary-transparent.png`
- `logo-primary-dark.png`
- `logo-primary-light.png`
- `logo-stacked-transparent.png`
- `logo-icon-transparent.png`
- `app-icon-512.png`
- `app-icon-maskable-512.png`
- `favicon-16.png`
- `favicon-32.png`
- `favicon.ico`
- `monochrome-logo-dark.png`
- `monochrome-logo-light.png`
- `brand-concept-board.png`
- `brand-guidelines.png`

The main app sidebar/header uses `src/components/BrandLogo.jsx`, which renders the approved generated Tenaqo icon inside a rounded tile and keeps the wordmark/subtitle as live, theme-aware text:

```text
[generated icon in tile]
Tenaqo
Rental operations software
```

Logo usage rules:

- Use full-colour logo assets on confirmed light backgrounds.
- Use the tile plus live text lockup in the app sidebar and mobile/header contexts.
- Use light/monochrome logo assets only on dark backgrounds where contrast is confirmed.
- Use icon-only assets for favicon, app icons, and PWA install metadata.
- Do not use the full horizontal logo image in the app sidebar; the live text lockup is more reliable across light and dark themes.

Existing OASIS logo files and historical asset folders remain in the repository as legacy assets. They should not be used as the primary product mark going forward.

## Domain References Left Unchanged Temporarily

The following domains remain active and unchanged for now:

- `oasisrentalmgt.app`
- `marketing.oasisrentalmgt.app`
- existing auth/email domains under `oasisrental.app`

User-facing copy now says Tenaqo, but domain migration is intentionally deferred to avoid breaking production routes, auth redirects, billing callbacks, email sender verification, and indexed marketing URLs.

## Future Domain Migration Notes

See `docs/TENAQO_DOMAIN_MIGRATION_PLAN.md` for the staged plan covering:

- target Tenaqo domains
- redirects and canonical URLs
- Supabase auth redirect URLs
- Stripe and billing callback URLs
- Resend/email sender domains
- SEO migration
- social handles and app-store metadata
