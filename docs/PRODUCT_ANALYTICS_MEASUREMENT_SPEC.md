# OASIS Product Analytics Measurement Spec

This document defines the first OASIS product measurement layer. It is vendor-neutral and does not require PostHog, Vercel Analytics, Supabase event tables, or any other analytics provider yet.

The goal is to define what OASIS should measure before deciding where those events should be stored.

## Purpose

OASIS already has security and operational telemetry. Product analytics is different: it should answer whether landlords, tenants, contractors, and support users are reaching value.

The first measurement layer should answer:

- Are new landlords reaching first value?
- Which onboarding step loses people?
- Do demo accounts become meaningful evaluations?
- Are invites accepted and used?
- Are users discovering operational surfaces such as Command Center, Portfolio Health, and Maintenance Inbox?
- Which features correlate with retained or converted accounts?

This spec does not change product behavior.

## Measurement Principles

- Measure account-level activation, not vanity page views.
- Keep events sparse, intentional, and tied to product decisions.
- Do not log secrets, invite tokens, reset tokens, raw document names, full addresses, message bodies, or payment card details.
- Prefer stable IDs and coarse metadata over sensitive raw values.
- Keep product analytics separate from security/audit logs.
- Make demo/sandbox events identifiable so they do not pollute production conversion metrics.
- Do not use product analytics as an authorization or billing source of truth.

## Privacy Rules

Allowed event properties:

- `account_id`
- `user_id`, when already authenticated and needed for journey analysis
- `role`
- `is_demo`
- `sandbox_mode`
- `subscription_plan`
- `subscription_status`
- `surface`
- `locale`
- `source`
- coarse counts, for example `property_count`, `tenant_count`, `request_count`
- boolean flags, for example `has_overdue_payment`, `has_open_maintenance`

Avoid or redact:

- emails
- phone numbers
- full names
- full property addresses
- document filenames
- storage paths
- signed URLs
- invite tokens
- password reset tokens
- raw free-text notes
- provider secrets or API keys
- payment card details or bank details

Where a human-readable label is needed, prefer a controlled enum over free text.

## Activation Funnel

Primary landlord activation is complete when an account reaches a meaningful operating loop:

1. Account created.
2. First property exists.
3. First tenant exists or tenant invite is sent.
4. First rent/payment record exists or Finance is reviewed with seeded/demo payment context.
5. First maintenance request or work order exists.
6. User opens an operational next-step surface: Command Center, Portfolio Health, Maintenance Inbox, or Dashboard operations hub.

For self-serve demo accounts, first value is complete when:

1. Demo account is created.
2. Demo fixtures seed successfully.
3. User opens onboarding.
4. User opens at least two of Properties, Finance, Maintenance Inbox, Command Center, or Portfolio Health.
5. User performs one meaningful action, for example reset demo data, add a property, invite a tenant, create/review a work order, or open a portfolio health explanation.

## Core Events

Event names should use lowercase snake case.

| Event | Trigger | Required properties | Notes |
| --- | --- | --- | --- |
| `signup_started` | User opens or starts the self-serve signup form. | `source`, `locale` | Public event; no account id yet. |
| `signup_submitted` | Signup form is submitted. | `source`, `sandbox_mode`, `locale` | Do not include password or email. |
| `account_created` | `create_self_serve_landlord_account(...)` succeeds. | `account_id`, `user_id`, `is_demo`, `sandbox_mode` | Server-confirmed event. |
| `demo_seed_completed` | Demo fixtures seed successfully. | `account_id`, `seeded_fixture_version`, `property_count`, `tenant_count`, `payment_count`, `maintenance_request_count`, `work_order_count` | Demo accounts only. |
| `demo_reset_completed` | Demo fixtures are reset successfully. | `account_id`, `seeded_fixture_version`, `property_count`, `tenant_count`, `payment_count`, `maintenance_request_count`, `work_order_count` | Useful for QA/sales rehearsal. |
| `onboarding_opened` | Landlord onboarding page opens. | `account_id`, `role`, `is_demo` | Owner-focused. |
| `first_property_created` | First property is created for an account. | `account_id`, `user_id`, `role`, `property_count` | Count only when account moves from 0 to 1 properties. |
| `first_tenant_created` | First tenant is created for an account. | `account_id`, `user_id`, `role`, `tenant_count` | Count only when account moves from 0 to 1 tenants. |
| `tenant_invite_sent` | Tenant invite is created/sent. | `account_id`, `user_id`, `role`, `invite_role` | Do not include recipient email. |
| `staff_or_contractor_invite_sent` | Staff/admin/contractor invite is created/sent. | `account_id`, `user_id`, `role`, `invite_role` | Do not include recipient email. |
| `invite_accepted` | Invite is accepted and account membership/role is established. | `account_id`, `accepted_user_id`, `invite_role` | Server-confirmed event. |
| `first_payment_added` | First payment/rent record is created for an account. | `account_id`, `user_id`, `role`, `payment_count` | Do not include tenant name or address. |
| `finance_reviewed` | Finance page or finance snapshot is meaningfully opened. | `account_id`, `user_id`, `role`, `has_overdue_payment`, `has_due_soon_payment` | Use coarse booleans/counts. |
| `first_maintenance_request_created` | First maintenance request is created. | `account_id`, `user_id`, `role`, `request_count`, `source` | `source` can be landlord, tenant, demo, support. |
| `first_work_order_created` | First work order is created. | `account_id`, `user_id`, `role`, `work_order_count` | Useful for maintenance activation. |
| `work_order_assigned` | Work order is assigned to contractor. | `account_id`, `user_id`, `role`, `has_contractor` | Do not include contractor name/email. |
| `contractor_update_submitted` | Contractor updates assigned job status/details. | `account_id`, `user_id`, `role`, `status` | Contractor journey event. |
| `document_request_created` | Manager creates a document request. | `account_id`, `user_id`, `role`, `recipient_type`, `document_type` | Use controlled document type label. |
| `document_uploaded` | Tenant/contractor/manager uploads or finalizes a document. | `account_id`, `user_id`, `role`, `document_type` | Do not include filename/path. |
| `command_center_used` | User opens Command Center and sees briefing/action list. | `account_id`, `user_id`, `role`, `item_count`, `has_urgent_item` | Product value event. |
| `command_center_action_clicked` | User clicks an action from briefing/priority list. | `account_id`, `user_id`, `role`, `surface`, `item_type` | Do not include raw item text. |
| `portfolio_health_used` | User opens Portfolio Health or property health explainer. | `account_id`, `user_id`, `role`, `property_count`, `high_risk_count` | Product value event. |
| `maintenance_inbox_used` | User opens Maintenance Inbox and sees triage/workflow columns. | `account_id`, `user_id`, `role`, `open_request_count` | Product value event. |
| `billing_intent_started` | User opens checkout, portal, or billing upgrade path. | `account_id`, `user_id`, `role`, `subscription_plan`, `source` | Product conversion event. |
| `subscription_state_changed` | Billing webhook or admin action changes subscription state. | `account_id`, `subscription_plan`, `subscription_status` | Server-confirmed event. |

## Activation Metrics

Recommended launch metrics:

| Metric | Definition | Why it matters |
| --- | --- | --- |
| Landlord first-value rate | Percentage of new production accounts completing property + tenant/invite + finance/payment + maintenance/operator surface within 7 days. | Measures whether OASIS becomes operational, not just signed up. |
| Demo first-value rate | Percentage of demo accounts with seeded fixtures that open two or more core surfaces and complete one meaningful action. | Measures whether demos are useful. |
| Invite acceptance rate | Accepted invites divided by sent invites by role. | Measures collaboration onboarding. |
| Time to first property | Time from account creation to first property. | Detects setup friction. |
| Time to first tenant/invite | Time from account creation to first tenant or tenant invite. | Detects portfolio setup progression. |
| Time to first maintenance action | Time from account creation to first maintenance request/work order. | Detects operational depth adoption. |
| Operator surface adoption | Percentage of activated accounts using Command Center, Portfolio Health, or Maintenance Inbox in first 14 days. | Measures OASIS differentiation. |
| Billing intent rate | Percentage of active accounts that open checkout/portal or hit an upgrade path. | Measures commercial readiness. |
| Subscription conversion rate | Percentage of production accounts that move to a paid/active subscription state. | Measures revenue conversion. |

## Role-Specific Journeys

### Owner / Manager

Measure whether they:

- create or review property inventory
- create/invite tenants
- review finance
- triage maintenance
- use Command Center or Portfolio Health
- invite staff/contractors
- engage billing/upgrade paths

### Tenant

Measure whether they:

- accept invite
- open tenant dashboard
- view payments
- submit maintenance request
- upload requested document

### Contractor

Measure whether they:

- accept invite
- open contractor portal
- view assigned work order
- submit update
- upload attachment or quote/invoice where available

### Root / Support

Measure sparingly:

- root telemetry used
- support account switch/impersonation flow used
- support triage event linked to ticket

Do not treat support/root use as normal product adoption.

## Recommended Implementation Options

OASIS should choose one primary analytics sink later. Options:

| Option | Strength | Tradeoff |
| --- | --- | --- |
| Supabase product event table | Strong account-scoped control, easy SQL analysis, close to current architecture. | Must design retention, privacy, and RLS carefully. |
| PostHog | Strong funnel/cohort tooling and product analytics UX. | Adds third-party processing and consent/privacy review. |
| Vercel Analytics | Simple page/performance visibility. | Not enough for account-scoped activation events by itself. |
| Hybrid | Use Supabase for authoritative product events and external tool for aggregate funnels. | More moving parts; needs clear source of truth. |

Recommended first implementation: a small Supabase-backed event table or Edge Function that records only the events in this spec, with strict redaction and account-scoped analysis. Add external tooling later if funnel/cohort exploration becomes a bottleneck.

## Implementation Decision

The first code layer is a centralized, no-op-safe frontend analytics wrapper:

- [productAnalyticsService.js](/mnt/c/Users/Home/oasisrentalmanagementapp/src/services/productAnalyticsService.js)

Current behavior:

- defines the approved event names
- allowlists approved event properties
- drops sensitive or unapproved properties before any sink sees them
- defaults to disabled unless `VITE_PRODUCT_ANALYTICS_ENABLED=true`
- accepts an injected sink so a Supabase-backed capture path can be added without changing UI call sites
- swallows sink failures so analytics never blocks product workflows

The actual production sink is intentionally not enabled yet. The next implementation slice should choose and add one sink, with Supabase as the preferred first target because it keeps account-scoped product events close to the existing RLS/RPC architecture.

## Implementation Guardrails

- Add a single product analytics service wrapper rather than scattering vendor calls through components.
- Keep event naming centralized.
- Prefer server-confirmed events for account creation, invite acceptance, billing, and seed/reset completion.
- Use frontend events only for UI discovery and click-through behavior.
- Make analytics no-op safely when disabled.
- Do not block product workflows if analytics fails.
- Add tests for event payload redaction before enabling production capture.
- Keep demo/sandbox events queryable but excluded from default production conversion metrics.

## Open Decisions

- Analytics sink: Supabase table, PostHog, Vercel, or hybrid.
- Retention period for product events.
- Whether product analytics requires cookie/consent handling by region.
- Whether marketing-site and app analytics share an identity model.
- Whether root/support actions are captured in the same table or a separate support operations log.

## Related Docs

- [OASIS_ENGINEERING_ROADMAP.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/OASIS_ENGINEERING_ROADMAP.md)
- [ACCOUNT_SANDBOX_PROFILES.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/ACCOUNT_SANDBOX_PROFILES.md)
- [sandbox-demo-onboarding-operations.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/sandbox-demo-onboarding-operations.md)
- [OPERATIONAL_GOLDEN_SIGNALS.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/OPERATIONAL_GOLDEN_SIGNALS.md)
- [OASIS_WHITEPAPER_V5.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/OASIS_WHITEPAPER_V5.md)
