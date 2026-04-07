# 🏠 Property Management SaaS

A modern property management SaaS built with **React**, **Tailwind CSS**, and **Supabase**.  
Designed for landlords and property managers to manage **properties, tenants, and finances** with real-time updates and secure row-level access.

---

## ✨ Features

### 🏢 Properties
- Create, edit, and delete properties
- Assign tenants to properties
- Real-time updates via Supabase subscriptions

### 👤 Tenants
- Full CRUD (Create, Read, Update, Delete)
- Assign / unassign tenants to properties
- Realtime synchronization
- Secure ownership via Row Level Security (RLS)

### 💰 Finance
- Live income summary
- Expected vs paid vs overdue payments
- Aggregated per property and globally
- Derived data (no duplicated state)

### 🔐 Authentication & Security
- Supabase Auth
- Row Level Security (RLS) on all core tables
- Data automatically scoped to the logged-in user

---

## 🧱 Tech Stack

- **Frontend**
  - React
  - React Router
  - Tailwind CSS
  - Vite

- **Backend**
  - Supabase
    - PostgreSQL
    - Auth
    - Row Level Security (RLS)
    - Realtime subscriptions

---

## 📂 Project Structure

src/
├── components/ # Reusable UI components
├── pages/ # Route pages (Dashboard, Properties, Tenants, Finance)
├── hooks/ # Supabase data hooks (useProperties, useTenants, etc.)
├── services/ # Supabase CRUD services
├── layout/ # App layout (Sidebar, Topbar)
├── lib/ # Supabase client
└── data/ # Mock data (being phased out)


---

## 🚀 Getting Started

### 1️⃣ Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
cd YOUR_REPO_NAME

###Install dependencies
npm install

### Configure environment variables
Create a .env file in the root:
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

## RUN THE APP
npm run dev

##The app will be available at:
http://localhost:5173
🗄️ Supabase Schema (Core Tables)
properties

id (uuid)

owner_id → auth.users.id

address

city

status

tenants

id (uuid)

owner_id → auth.users.id

property_id → properties.id

name

email

phone

payments

id

property_id

amount

status

due_date

All tables use Row Level Security to ensure users only access their own data.

🔒 Security Model

Ownership enforced at the database level using RLS

Frontend does not filter by user — Supabase handles it

Safe against accidental cross-user access

🛠️ Development Notes

Realtime updates handled via Supabase channels

No duplicated derived state (finance is computed, not stored)

UUIDs used everywhere — no numeric IDs

Modals reused for create/edit flows

📈 Roadmap

 Auth UI (login / logout)

 Payments CRUD

 Charts for finance dashboard

 Remove remaining mock data

 Deployment (Vercel / Netlify)

 Role-based access (admin / manager)

🧑‍💻 Author

Built by [Your Name]
For learning, experimentation, and real-world SaaS architecture practice.

📄 License

MIT (or your preferred license)


---

## ✅ Commit the README

After saving `README.md`:

```bash
git add README.md
git commit -m "Add professional README"
git push

---

## Billing Setup

OASIS billing uses:

- Stripe Checkout for starting subscriptions
- Stripe Customer Portal for self-serve billing management
- Stripe webhooks for subscription lifecycle sync
- Supabase Edge Functions for secure server-side Stripe calls
- account-scoped billing tied to `accounts.id`
- shared plan entitlements and usage limits enforced in both app and SQL

### Current plan model

- `starter`
  - core properties, tenants, maintenance, finance, and documents
  - max `10` properties
- `growth`
  - everything in Starter
  - adds Command Center, Portfolio Health, and Maintenance KPI
  - max `50` properties
- `pro`
  - everything in Growth
  - adds Security Audit, Playbooks, and Root Telemetry
  - unlimited properties

Billing and entitlement state is normalized onto:

- `accounts.subscription_status`
- `accounts.subscription_plan`
- `billing_subscriptions`

Feature and usage enforcement is driven from:

- app config: [src/lib/entitlements.js](/mnt/c/Users/Home/oasisrentalmanagementapp/src/lib/entitlements.js)
- SQL helpers: [supabase/account_entitlements.sql](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/account_entitlements.sql)

### Files in this repo

- SQL: [supabase/20260315_billing.sql](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/20260315_billing.sql)
- entitlement SQL: [supabase/account_entitlements.sql](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/account_entitlements.sql)
- checkout function: [supabase/functions/create-checkout-session/index.ts](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/functions/create-checkout-session/index.ts)
- portal function: [supabase/functions/create-customer-portal-session/index.ts](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/functions/create-customer-portal-session/index.ts)
- webhook function: [supabase/functions/stripe-webhook/index.ts](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/functions/stripe-webhook/index.ts)
- frontend service: [src/services/billingService.js](/mnt/c/Users/Home/oasisrentalmanagementapp/src/services/billingService.js)
- billing page: [src/pages/BillingPage.jsx](/mnt/c/Users/Home/oasisrentalmanagementapp/src/pages/BillingPage.jsx)
- app gating: [src/App.jsx](/mnt/c/Users/Home/oasisrentalmanagementapp/src/App.jsx), [src/layout/Sidebar.jsx](/mnt/c/Users/Home/oasisrentalmanagementapp/src/layout/Sidebar.jsx), [src/pages/Properties.jsx](/mnt/c/Users/Home/oasisrentalmanagementapp/src/pages/Properties.jsx)

### Stripe prerequisites

Create Stripe products and recurring monthly prices for:

- `starter`
- `growth`
- `pro`

Keep the resulting Stripe `price_...` IDs handy.

### Supabase SQL

Run:

```sql
\i supabase/20260315_billing.sql
\i supabase/account_entitlements.sql
```

Or paste/apply the contents of both:

- [supabase/20260315_billing.sql](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/20260315_billing.sql)
- [supabase/account_entitlements.sql](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/account_entitlements.sql)

If you are bringing an environment fully up to the repo's current schema shape, prefer:

```bash
npm run db:apply:repo -- --db-url "postgresql://postgres@HOST:5432/postgres"
```

### Required secrets

Set these in your Supabase project:

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_test_or_live_xxx
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxx
supabase secrets set STRIPE_PRICE_STARTER=price_xxx
supabase secrets set STRIPE_PRICE_GROWTH=price_xxx
supabase secrets set STRIPE_PRICE_PRO=price_xxx
supabase secrets set APP_URL=http://localhost:5173
supabase secrets set STRIPE_TEST_TRIAL_DAYS=14
supabase secrets set RESEND_API_KEY=re_xxx
supabase secrets set OASIS_INVITES_FROM=invites@auth.oasisrental.app
supabase secrets set OASIS_REMINDERS_FROM=reminders@auth.oasisrental.app
supabase secrets set TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
supabase secrets set TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
supabase secrets set TWILIO_FROM_NUMBER=+15555550123
```

Notes:

- `APP_URL` must include an explicit scheme like `http://` or `https://`
- for production, set `APP_URL` to your real deployed app URL
- after changing secrets, redeploy the functions
- `STRIPE_TEST_TRIAL_DAYS` is a temporary test-only switch for Stripe checkout trials
- remove `STRIPE_TEST_TRIAL_DAYS` before going live if you do not want public trial behavior

### Deploy edge functions

```bash
supabase functions deploy create-checkout-session
supabase functions deploy create-customer-portal-session
supabase functions deploy stripe-webhook
supabase functions deploy invite-user
supabase functions deploy send-reminder-emails
supabase functions deploy send-sms-notifications
```

### Outbound email

- `invite-user` sends branded invite emails through Resend when `RESEND_API_KEY` is configured.
- `send-reminder-emails` is a cron-safe outbound reminder sender that emails managers a summary of active operational reminders.
- Both flows append delivery outcomes to `public.outbound_email_events`.
- `APP_URL` should be set to the full app base URL so invite and reminder links resolve correctly.

### Outbound SMS

- `send-sms-notifications` is a cron-safe outbound sender for Twilio.
- It currently supports rent reminders and maintenance alerts only.
- Delivery outcomes are appended to `public.outbound_sms_events`.
- Required Twilio secrets:
  - `TWILIO_ACCOUNT_SID`
  - `TWILIO_AUTH_TOKEN`
  - `TWILIO_FROM_NUMBER`

### Stripe webhook

Register this webhook URL in Stripe:

```text
https://YOUR_PROJECT_REF.supabase.co/functions/v1/stripe-webhook
```

Subscribe to:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`

### Local testing checklist

1. Confirm the billing SQL is applied.
2. Confirm the entitlement SQL is applied.
3. Confirm all Stripe secrets are set.
4. Confirm `APP_URL` is a full URL like `http://localhost:5173`.
5. Redeploy the billing functions after any secret change.
6. Rebuild and redeploy the frontend after billing or entitlement UI changes.
7. Open `/settings/billing` in the app.
8. Click a plan and verify Stripe Checkout opens.
9. Complete a test checkout in Stripe test mode.
10. Verify `billing_customers`, `billing_subscriptions`, `accounts.subscription_status`, and `accounts.subscription_plan` update after webhook delivery.
11. Verify gated surfaces and property limits match the active plan:
   - Starter cannot exceed `10` properties
   - Growth cannot exceed `50` properties
   - Starter cannot access Command Center / Portfolio Health / Maintenance KPI
   - Growth cannot access Security Audit / Playbooks / Root Telemetry
12. If `STRIPE_TEST_TRIAL_DAYS` is set, verify the resulting subscription lands in `trialing` status.

### Common errors

- `Invalid planKey`
  Usually means the client sent an unknown plan slug.

- `Stripe price is not configured for plan 'starter'`
  The matching `STRIPE_PRICE_*` secret is missing or empty.

- `APP_URL is not configured with an explicit scheme`
  Set `APP_URL` to a full URL such as `http://localhost:5173` or `https://app.example.com`.

- Checkout opens but still asks for immediate payment
  Confirm `STRIPE_TEST_TRIAL_DAYS` is set and the checkout function has been redeployed.

## Test Branch Protection

OASIS now ships a GitHub Actions workflow at [tests.yml](/mnt/c/Users/Home/oasisrentalmanagementapp/.github/workflows/tests.yml) with two required lanes:

- `Unit Tests`
- `Integration Isolation Tests`

Recommended GitHub branch protection for `main`:

1. Open GitHub repository settings.
2. Go to `Branches`.
3. Add or edit the protection rule for `main`.
4. Enable `Require a pull request before merging`.
5. Enable `Require status checks to pass before merging`.
6. Mark these checks as required:
   - `Unit Tests`
   - `Integration Isolation Tests`

Why both checks matter:
- `Unit Tests` gives fast feedback on fixture, service, and SQL contract regressions.
- `Integration Isolation Tests` proves the real local-Supabase authenticated isolation suite still passes before merge.

## Git Guardrails

Lightweight repo-local Git guardrails are documented in:
- [GIT_GUARDRAILS.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/GIT_GUARDRAILS.md)

Install them for your local clone with:

```bash
npm run guardrails:install
```

## Schema Workflow

The local bootstrap source of truth is:
- [supabase/baseline_schema.sql](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/baseline_schema.sql)
- plus explicit additive overlays applied after baseline when needed

Refresh the checked-in baseline from the current local authoritative database with:

```bash
npm run schema:baseline:refresh
```

Check for baseline drift with:

```bash
npm run schema:baseline:check
```

Full workflow and limitations are documented in:
- [SCHEMA_WORKFLOW.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/SCHEMA_WORKFLOW.md)
