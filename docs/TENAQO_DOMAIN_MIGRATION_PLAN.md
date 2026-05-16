# Tenaqo Domain Migration Plan

This plan documents the future domain migration from the current OASIS-era domains to Tenaqo domains. Do not execute these changes until the new domains, DNS, SSL, Supabase auth settings, billing URLs, and email sender domains are ready.

## Target Domain Options

Candidate structure:

- Marketing site: `tenaqo.com`
- App: `app.tenaqo.com`
- Support/docs: `support.tenaqo.com` or `help.tenaqo.com`
- Email sender domain: `mail.tenaqo.com` or `notifications.tenaqo.com`

Keep the current domains active during the transition:

- `marketing.oasisrentalmgt.app`
- `oasisrentalmgt.app`
- existing `oasisrental.app` auth/email sender domains

## Redirects

When the new domains are configured:

- Add 301 redirects from old marketing URLs to matching Tenaqo URLs.
- Keep existing indexed comparison slugs initially, including `/compare/oasis-vs-*`, unless a separate SEO redirect map has been prepared.
- Redirect app login and invite URLs only after Supabase redirect allow-lists have both old and new domains.
- Keep old domains live through at least one billing cycle and one invite/password reset cycle.

## SEO Migration

Before switching canonicals:

- Add and verify new domain in Google Search Console and Bing Webmaster Tools.
- Generate and test a sitemap for the Tenaqo domain.
- Update canonical URLs, Open Graph URLs, Twitter/X URLs, and structured data `url` values.
- Update robots and sitemap references.
- Monitor crawl errors, redirect chains, and indexed pages for 30-60 days.

## Supabase Auth Redirect URLs

Add the new app domain to Supabase before redirecting users:

- `https://app.tenaqo.com`
- `https://app.tenaqo.com/login`
- invite acceptance URLs
- password reset URLs
- any locale-specific auth routes, if introduced

Keep old OASIS-era URLs during the transition so existing invite and reset links continue to work.

## Stripe and Billing

Update only after the app domain is live:

- Checkout success and cancel URLs
- Customer portal return URLs
- Stripe branding and product display names
- Webhook endpoint references, if any are domain-specific
- Billing emails and receipts where configured in Stripe

Do not change plan IDs or price IDs as part of the domain migration.

## Email Sender Domain

Plan a separate sender-domain migration:

- Configure SPF, DKIM, and DMARC for the new Tenaqo email domain.
- Add verified sender identities in Resend.
- Update invite, reminder, password reset, support, and billing sender addresses.
- Keep old sender addresses active until all older invite/reset links have expired.
- Update environment variables after verification rather than renaming env var keys in the same release.

## App Store / PWA Metadata

After final Tenaqo icon assets are ready:

- Replace PWA icons and favicon files.
- Update install screenshots and social preview images.
- Confirm manifest `name`, `short_name`, and theme colour.
- Update any future App Store or Play Store listings to:
  - Name: Tenaqo
  - Subtitle: Rental operations software

## Social Handles

Reserve and verify social/profile handles before public migration:

- X/Twitter
- LinkedIn
- Facebook
- YouTube
- GitHub or public developer profile, if used

Avoid adding fake or unverified `sameAs` structured-data links until profiles are live.

## Rollback Checklist

If the domain migration causes production issues:

- Revert canonical URLs and app links to the old domains.
- Disable new-domain redirects.
- Keep Supabase auth allow-list entries for both old and new domains until links settle.
- Keep email sender domains verified and active.
- Confirm Stripe checkout and portal return URLs still resolve.
- Re-run app and marketing smoke tests on both old and new domains.

