# Phase 5D E2E Clearance

Generated from `tmp/phase5d-e2e-results.json` on 2026-06-05.

## Run Summary

- Passed: 261
- Failed: 103
- Did not run / skipped: 42
- Duration: 1021 seconds
- Real HMRC live-network submission: not run
- READY_FOR_REAL_LIVE_NETWORK_ATTEMPT: blocked until blocking groups below are fixed or formally waived
- READY_FOR_GENERAL_LIVE_SUBMISSION: remains false

## 1. App shell/session

- Failure count: 6
- Blocking classification: Blocking
- Likely root cause: The app shell/session layer is prerequisite for every pilot verification.
- Fix or waiver recommendation: Fix before readiness; do not waive unless the failure is proven to be a test harness only issue.
- Failed test files:
  - `tests/e2e/app-shell.spec.js`
  - `tests/e2e/poland-compliance-security-routes.spec.js`
  - `tests/e2e/shell-redesign.spec.js`
- Failed test names and messages:
  - `tests/e2e/app-shell.spec.js` - loads the Tenaqo app shell
    - Error: expect(locator).toBeVisible() failed Locator: getByRole('heading', { name: 'Sign in' }) Expected: visible Timeout: 10000ms Error: element(s) not found Call log: - Expect "toBeVisible" with timeout 10000ms - waiting for getByRole('heading', { name: 'Sign in' })
  - `tests/e2e/poland-compliance-security-routes.spec.js` - app shell loads and shows sign-in page
    - Error: expect(locator).toBeVisible() failed Locator: getByRole('heading', { name: 'Sign in' }) Expected: visible Timeout: 20000ms Error: element(s) not found Call log: - Expect "toBeVisible" with timeout 20000ms - waiting for getByRole('heading', { name: 'Sign in' })
  - `tests/e2e/shell-redesign.spec.js` - page title updates when navigating between routes
    - Error: expect(locator).not.toBeEmpty() failed Locator: locator('header p').first() Expected: not empty Received: empty Timeout: 10000ms Call log: - Expect "not toBeEmpty" with timeout 10000ms - waiting for locator('header p').first() 8 × locator resolved to <p class="flex-1 min-w-0 truncate "></p> - unexpected value "empty"
  - `tests/e2e/shell-redesign.spec.js` - sidebar and content area render as distinct surfaces
    - Error: expect(locator).toBeVisible() failed Locator: getByRole('navigation', { name: /sidebar|main navigation/i }).first() Expected: visible Timeout: 10000ms Error: element(s) not found Call log: - Expect "toBeVisible" with timeout 10000ms - waiting for getByRole('navigation', { name: /sidebar|main navigation/i }).first()
  - `tests/e2e/shell-redesign.spec.js` - main content is scrollable without page-level scroll
    - Error: expect(received).toContain(expected) // indexOf Expected value: "" Received array: ["auto", "scroll"]
  - `tests/e2e/shell-redesign.spec.js` - logout helper works for tenant role via direct button
    - Test timeout of 60000ms exceeded.

## 2. Roles/account/root support

- Failure count: 6
- Blocking classification: Blocking
- Likely root cause: Phase 5D depends on strict account scoping, root/operator access, and role navigation.
- Fix or waiver recommendation: Fix before readiness; waiver requires proof pilot account/operator controls are unaffected.
- Failed test files:
  - `tests/e2e/invite-acceptance-flow.spec.js`
  - `tests/e2e/role-navigation-permissions.spec.js`
  - `tests/e2e/root-invitations-flow.spec.js`
- Failed test names and messages:
  - `tests/e2e/invite-acceptance-flow.spec.js` - invited staff member accepts invite and lands in the scoped account
    - Error: expect(locator).toBeVisible() failed Locator: getByRole('link', { name: 'Tenant A1' }) Expected: visible Error: strict mode violation: getByRole('link', { name: 'Tenant A1' }) resolved to 2 elements: 1) <a data-discover="true" href="/tenants/a18d8931-47dc-41b7-bbe1-7f681d8f024b" class="block focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded-xl">…</a> aka getByRole('link', { name: 'E2E Calc Tenant a18d8931 calc' }) 2) <a data-discover="true" href="/tenants/33333333-3333-3333-3333-333333333331" class="block focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded-xl">…</a> aka getByRole(...
  - `tests/e2e/role-navigation-permissions.spec.js` - owner can read scoped landlord tenants and properties
    - Error: expect(locator).toBeVisible() failed Locator: getByRole('link', { name: 'Tenant A1' }) Expected: visible Error: strict mode violation: getByRole('link', { name: 'Tenant A1' }) resolved to 2 elements: 1) <a data-discover="true" href="/tenants/a18d8931-47dc-41b7-bbe1-7f681d8f024b" class="block focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded-xl">…</a> aka getByRole('link', { name: 'E2E Calc Tenant a18d8931 calc' }) 2) <a data-discover="true" href="/tenants/33333333-3333-3333-3333-333333333331" class="block focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded-xl">…</a> aka getByRole(...
  - `tests/e2e/role-navigation-permissions.spec.js` - admin can read scoped landlord tenants and properties
    - Error: expect(locator).toBeVisible() failed Locator: getByRole('link', { name: 'Tenant A1' }) Expected: visible Error: strict mode violation: getByRole('link', { name: 'Tenant A1' }) resolved to 2 elements: 1) <a data-discover="true" href="/tenants/a18d8931-47dc-41b7-bbe1-7f681d8f024b" class="block focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded-xl">…</a> aka getByRole('link', { name: 'E2E Calc Tenant a18d8931 calc' }) 2) <a data-discover="true" href="/tenants/33333333-3333-3333-3333-333333333331" class="block focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded-xl">…</a> aka getByRole(...
  - `tests/e2e/role-navigation-permissions.spec.js` - staff can read scoped landlord tenants and properties
    - Error: expect(locator).toBeVisible() failed Locator: getByRole('link', { name: 'Tenant A1' }) Expected: visible Error: strict mode violation: getByRole('link', { name: 'Tenant A1' }) resolved to 2 elements: 1) <a data-discover="true" href="/tenants/a18d8931-47dc-41b7-bbe1-7f681d8f024b" class="block focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded-xl">…</a> aka getByRole('link', { name: 'E2E Calc Tenant a18d8931 calc' }) 2) <a data-discover="true" href="/tenants/33333333-3333-3333-3333-333333333331" class="block focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded-xl">…</a> aka getByRole(...
  - `tests/e2e/role-navigation-permissions.spec.js` - root support can switch accounts, read landlord data, and keeps root-only account switcher
    - Error: expect(locator).toBeVisible() failed Locator: getByRole('link', { name: 'Tenant A1' }) Expected: visible Error: strict mode violation: getByRole('link', { name: 'Tenant A1' }) resolved to 2 elements: 1) <a data-discover="true" href="/tenants/a18d8931-47dc-41b7-bbe1-7f681d8f024b" class="block focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded-xl">…</a> aka getByRole('link', { name: 'E2E Calc Tenant a18d8931 calc' }) 2) <a data-discover="true" href="/tenants/33333333-3333-3333-3333-333333333331" class="block focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded-xl">…</a> aka getByRole(...
  - `tests/e2e/root-invitations-flow.spec.js` - root can open the invitations admin view and see scoped SaaS accounts
    - Error: root invitations admin has blocking accessibility violations: aria-prohibited-attr (serious) Elements must only use permitted ARIA attributes https://dequeuniversity.com/rules/axe/4.11/aria-prohibited-attr?application=playwright - .brand-logo--sidebar: Fix all of the following: aria-label attribute cannot be used on a div with no valid role attribute. - .brand-logo--header: Fix all of the following: aria-label attribute cannot be used on a div with no valid role attribute. color-contrast (serious) Elements must meet minimum color contrast ratio thresholds https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright - .brand-logo__subtitle: Fix any of the following:...

## 3. Tenant restrictions/isolation

- Failure count: 3
- Blocking classification: Blocking
- Likely root cause: Tenant and contractor users must not access landlord Tax/HMRC/Pilot surfaces.
- Fix or waiver recommendation: Fix before readiness; waiver requires direct tenant/contractor denial evidence for Tax Tools and pilot routes.
- Failed test files:
  - `tests/e2e/tenant-payment-setup.spec.js`
  - `tests/e2e/tenant-restrictions-flow.spec.js`
- Failed test names and messages:
  - `tests/e2e/tenant-payment-setup.spec.js` - owner-configured payment setup appears in the standalone tenant portal
    - Error: expect(locator).toBeVisible() failed Locator: getByTestId('payment-collection-settings-card') Expected: visible Timeout: 10000ms Error: element(s) not found Call log: - Expect "toBeVisible" with timeout 10000ms - waiting for getByTestId('payment-collection-settings-card')
  - `tests/e2e/tenant-restrictions-flow.spec.js` - tenant sees the restricted surface and does not get manager-only property performance
    - Error: expect(locator).toBeVisible() failed Locator: getByRole('heading', { name: 'Your home overview' }) Expected: visible Timeout: 10000ms Error: element(s) not found Call log: - Expect "toBeVisible" with timeout 10000ms - waiting for getByRole('heading', { name: 'Your home overview' })
  - `tests/e2e/tenant-restrictions-flow.spec.js` - tenant dashboard actions remain usable on mobile width
    - Error: expect(locator).toBeVisible() failed Locator: getByRole('heading', { name: 'Your home overview' }) Expected: visible Timeout: 10000ms Error: element(s) not found Call log: - Expect "toBeVisible" with timeout 10000ms - waiting for getByRole('heading', { name: 'Your home overview' })

## 4. Finance/rent/payment

- Failure count: 18
- Blocking classification: Blocking
- Likely root cause: Finance, rent, payment, and currency data feed tax records and draft confidence.
- Fix or waiver recommendation: Fix before readiness if any tax/finance source record could be wrong.
- Failed test files:
  - `tests/e2e/finance-calculations.spec.js`
  - `tests/e2e/finance-mobile-responsive.spec.js`
  - `tests/e2e/finance-payment-lifecycle.spec.js`
  - `tests/e2e/finance.spec.js`
  - `tests/e2e/rent-plans.spec.js`
- Failed test names and messages:
  - `tests/e2e/finance-calculations.spec.js` - property with 3+ months elapsed and zero payments shows 'overdue' status
    - Error: expect(locator).toBeVisible() failed Locator: getByTestId('property-finance-table').locator('tr').filter({ hasText: 'E2E Calc Prop e8ae8152' }) Expected: visible Timeout: 15000ms Error: element(s) not found Call log: - Expect "toBeVisible" with timeout 15000ms - waiting for getByTestId('property-finance-table').locator('tr').filter({ hasText: 'E2E Calc Prop e8ae8152' })
  - `tests/e2e/finance-calculations.spec.js` - property row shows 'paid' status badge when fully paid this month
    - Error: expect(locator).toBeVisible() failed Locator: getByTestId('property-finance-table').locator('tr').filter({ hasText: 'E2E Calc Prop fc958d3f' }) Expected: visible Timeout: 15000ms Error: element(s) not found Call log: - Expect "toBeVisible" with timeout 15000ms - waiting for getByTestId('property-finance-table').locator('tr').filter({ hasText: 'E2E Calc Prop fc958d3f' })
  - `tests/e2e/finance-calculations.spec.js` - property with overpayment shows 'paid' status and remaining=0
    - Error: expect(locator).toBeVisible() failed Locator: getByTestId('property-finance-table').locator('tr').filter({ hasText: 'E2E Calc Prop b109d03a' }) Expected: visible Timeout: 15000ms Error: element(s) not found Call log: - Expect "toBeVisible" with timeout 15000ms - waiting for getByTestId('property-finance-table').locator('tr').filter({ hasText: 'E2E Calc Prop b109d03a' })
  - `tests/e2e/finance-calculations.spec.js` - voided duplicate receipt does not clear a tenant running balance
    - Error: expect(locator).toBeVisible() failed Locator: getByTestId('property-finance-table').locator('tr').filter({ hasText: 'E2E Calc Prop 6e7b6987' }) Expected: visible Timeout: 15000ms Error: element(s) not found Call log: - Expect "toBeVisible" with timeout 15000ms - waiting for getByTestId('property-finance-table').locator('tr').filter({ hasText: 'E2E Calc Prop 6e7b6987' })
  - `tests/e2e/finance-mobile-responsive.spec.js` - mobile viewport hides desktop tables and shows card lists
    - Error: expect(locator).toBeVisible() failed Locator: getByTestId('payments-cards') Expected: visible Timeout: 15000ms Error: element(s) not found Call log: - Expect "toBeVisible" with timeout 15000ms - waiting for getByTestId('payments-cards')
  - `tests/e2e/finance-mobile-responsive.spec.js` - desktop viewport hides card lists and shows desktop tables
    - Error: expect(locator).toBeVisible() failed Locator: getByTestId('payments-table') Expected: visible Timeout: 15000ms Error: element(s) not found Call log: - Expect "toBeVisible" with timeout 15000ms - waiting for getByTestId('payments-table')
  - `tests/e2e/finance-mobile-responsive.spec.js` - payment card on mobile shows tenant name, amount, due date, and action buttons
    - Error: expect(received).toBeNull() Received: {"code": "23502", "details": "Failing row contains (32890492-6cd3-4c13-9643-7aed4b56a67b, null, 44444444-4444-4444-4444-444444444441, 33333333-3333-3333-3333-333333333331, 1250.00, due, 2026-06-19, null, 2026-06-05 12:14:34.595407+00, 11111111-1111-1111-1111-111111111111, null, 2026-06-05 12:14:34.595407+00, PLN).", "hint": null, "message": "null value in column \"owner_id\" of relation \"payments\" violates not-null constraint"}
  - `tests/e2e/finance-mobile-responsive.spec.js` - switching from mobile to desktop viewport shows table and hides cards
    - Error: expect(locator).toBeVisible() failed Locator: getByTestId('payments-cards') Expected: visible Timeout: 20000ms Error: element(s) not found Call log: - Expect "toBeVisible" with timeout 20000ms - waiting for getByTestId('payments-cards')
  - `tests/e2e/finance-payment-lifecycle.spec.js` - mark paid button visible to owner (B-1), updates status immediately (B-5, A-1)
    - Error: expect(locator).toBeVisible() failed Locator: getByTestId(/mark-paid-/).filter({ visible: true }).first() Expected: visible Timeout: 10000ms Error: element(s) not found Call log: - Expect "toBeVisible" with timeout 10000ms - waiting for getByTestId(/mark-paid-/).filter({ visible: true }).first()
  - `tests/e2e/finance.spec.js` - clicking Overdue card switches to payments tab with overdue filter
    - Error: expect(page).toHaveURL(expected) failed Expected pattern: /tab=payments/ Received string: "http://127.0.0.1:4173/finance" Timeout: 10000ms Call log: - Expect "toHaveURL" with timeout 10000ms 13 × unexpected value "http://127.0.0.1:4173/finance"
  - `tests/e2e/finance.spec.js` - clicking Due Soon card switches to payments tab with 7d range filter
    - Error: expect(page).toHaveURL(expected) failed Expected pattern: /tab=payments/ Received string: "http://127.0.0.1:4173/finance" Timeout: 10000ms Call log: - Expect "toHaveURL" with timeout 10000ms 13 × unexpected value "http://127.0.0.1:4173/finance"
  - `tests/e2e/finance.spec.js` - clicking Settings tab shows settings content
    - Error: locator.click: Error: strict mode violation: getByRole('button', { name: /settings/i }) resolved to 2 elements: 1) <button type="button" class="flex items-center gap-1 px-2.5 pt-5 pb-[5px] text-[10px] font-semibold uppercase tracking-widest text-slate-400/80 dark:text-slate-500 w-full justify-between">…</button> aka getByRole('button', { name: 'Admin / Settings' }) 2) <button type="button" class="shrink-0 border-b-2 px-5 py-3 text-sm font-medium transition-colors whitespace-nowrap border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700">Settings</button> aka getByRole('button', { name: 'Settings', exact: true }) Call log: - waiting for getByRole('button', { name:...
  - `tests/e2e/finance.spec.js` - seeded payment appears in payments table with amount and status
    - Error: expect(locator).toContainText(expected) failed Locator: getByTestId('payments-table') Expected pattern: /1.?750/ Received string: "TenantPropertyAmountStatusDue dateTenant A111 Starlight Avenue750,00 złPaid6/5/2026Paid at: 6/5/2026VoidEditTenant A111 Starlight Avenue500,00 złPaid6/2/2026Paid at: 6/5/2026VoidEdit" Timeout: 15000ms Call log: - Expect "toContainText" with timeout 15000ms - waiting for getByTestId('payments-table') 18 × locator resolved to <div data-testid="payments-table" class="hidden md:block overflow-x-auto">…</div> - unexpected value "TenantPropertyAmountStatusDue dateTenant A111 Starlight Avenue750,00 złPaid6/5/2026Paid at: 6/5/2026VoidEditTenant A111 Starlight Aven...
  - `tests/e2e/finance.spec.js` - Mark Paid button present for due payment (B-1)
    - Error: expect(locator).toBeVisible() failed Locator: getByTestId(/^mark-paid-/).filter({ visible: true }).first() Expected: visible Timeout: 15000ms Error: element(s) not found Call log: - Expect "toBeVisible" with timeout 15000ms - waiting for getByTestId(/^mark-paid-/).filter({ visible: true }).first()
  - `tests/e2e/finance.spec.js` - Mark Paid updates row status immediately (B-5, A-1)
    - Error: expect(locator).toBeVisible() failed Locator: getByTestId(/^mark-paid-/).filter({ visible: true }).first() Expected: visible Timeout: 15000ms Error: element(s) not found Call log: - Expect "toBeVisible" with timeout 15000ms - waiting for getByTestId(/^mark-paid-/).filter({ visible: true }).first()
  - `tests/e2e/rent-plans.spec.js` - no blocking accessibility violations
    - Error: rent-plans-page has blocking accessibility violations: aria-prohibited-attr (serious) Elements must only use permitted ARIA attributes https://dequeuniversity.com/rules/axe/4.11/aria-prohibited-attr?application=playwright - .brand-logo--sidebar: Fix all of the following: aria-label attribute cannot be used on a div with no valid role attribute. - .brand-logo--header: Fix all of the following: aria-label attribute cannot be used on a div with no valid role attribute. color-contrast (serious) Elements must meet minimum color contrast ratio thresholds https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright - .brand-logo__subtitle: Fix any of the following: Elemen...
  - `tests/e2e/rent-plans.spec.js` - new draft plan created via admin appears in list with draft badge
    - Error: expect(locator).toBeVisible() failed Locator: locator('[class*="space-y-3"]').filter({ hasText: 'Rent plan draft b5a65737' }).first().getByText('draft', { exact: true }) Expected: visible Timeout: 10000ms Error: element(s) not found Call log: - Expect "toBeVisible" with timeout 10000ms - waiting for locator('[class*="space-y-3"]').filter({ hasText: 'Rent plan draft b5a65737' }).first().getByText('draft', { exact: true })
  - `tests/e2e/rent-plans.spec.js` - changing market to UK auto-selects GBP currency
    - Test timeout of 60000ms exceeded.

## 5. Currency/account settings

- Failure count: 2
- Blocking classification: Blocking if tax/finance affected
- Likely root cause: Currency/account settings can affect tax and finance presentation.
- Fix or waiver recommendation: Fix if monetary/tax display or source records are affected; otherwise document a waiver.
- Failed test files:
  - `tests/e2e/currency-localization.spec.js`
  - `tests/e2e/german-localization.spec.js`
- Failed test names and messages:
  - `tests/e2e/currency-localization.spec.js` - saving localization settings shows success message and persists to DB
    - Error: expect(locator).toBeVisible() failed Locator: getByTestId('localization-form').getByText(/saved/i) Expected: visible Timeout: 10000ms Error: element(s) not found Call log: - Expect "toBeVisible" with timeout 10000ms - waiting for getByTestId('localization-form').getByText(/saved/i)
  - `tests/e2e/german-localization.spec.js` - authenticated landlord shell exposes German navigation labels
    - Error: expect(locator).toBeVisible() failed Locator: locator('select').filter({ has: locator('option[value="de"]') }).first() Expected: visible Timeout: 10000ms Error: element(s) not found Call log: - Expect "toBeVisible" with timeout 10000ms - waiting for locator('select').filter({ has: locator('option[value="de"]') }).first()

## 6. Security audit/root panel

- Failure count: 2
- Blocking classification: Blocking if HMRC audit visibility affected
- Likely root cause: Support/admin must inspect consent, pilot and live-attempt audit trails.
- Fix or waiver recommendation: Fix if audit visibility, root support, or evidence lookup is affected.
- Failed test files:
  - `tests/e2e/security-audit-investigation.spec.js`
- Failed test names and messages:
  - `tests/e2e/security-audit-investigation.spec.js` - security audit page loads with ledger, anomaly, and hosted event sections
    - Error: expect(locator).toBeVisible() failed Locator: getByText('Security Audit') Expected: visible Error: strict mode violation: getByText('Security Audit') resolved to 3 elements: 1) <span>Security Audit</span> aka getByRole('link', { name: 'Security Audit' }) 2) <h2 class="text-lg font-semibold text-white">Security Audit</h2> aka getByRole('heading', { name: 'Security Audit', exact: true }) 3) <h3 class="text-sm font-semibold text-[var(--text-primary)]">Security Audit brings together the key access and…</h3> aka getByRole('heading', { name: 'Security Audit brings' }) Call log: - Expect "toBeVisible" with timeout 20000ms - waiting for getByText('Security Audit')
  - `tests/e2e/security-audit-investigation.spec.js` - security audit ledger shows a real inserted event row
    - Error: expect(received).toBeNull() Received: {"code": "23503", "details": "Key (actor_user_id)=(aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2) is not present in table \"users\".", "hint": null, "message": "insert or update on table \"security_audit_ledger\" violates foreign key constraint \"security_audit_ledger_actor_user_id_fkey\""}

## 7. Accessibility on relevant surfaces

- Failure count: 11
- Blocking classification: Blocking on Tax/HMRC/Finance/Consent/Pilot surfaces
- Likely root cause: Pilot review/consent surfaces must remain keyboard and screen-reader accessible.
- Fix or waiver recommendation: Fix relevant surfaces; waive only unrelated non-pilot surfaces with evidence.
- Failed test files:
  - `tests/e2e/operating-calendar.spec.js`
  - `tests/e2e/owner-property-flow.spec.js`
  - `tests/e2e/properties.spec.js`
  - `tests/e2e/responsive-accessibility-release.spec.js`
- Failed test names and messages:
  - `tests/e2e/operating-calendar.spec.js` - page has no blocking accessibility violations
    - Error: operating-calendar-page has blocking accessibility violations: aria-prohibited-attr (serious) Elements must only use permitted ARIA attributes https://dequeuniversity.com/rules/axe/4.11/aria-prohibited-attr?application=playwright - .brand-logo--sidebar: Fix all of the following: aria-label attribute cannot be used on a div with no valid role attribute. - .brand-logo--header: Fix all of the following: aria-label attribute cannot be used on a div with no valid role attribute. color-contrast (serious) Elements must meet minimum color contrast ratio thresholds https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright - .brand-logo__subtitle: Fix any of the following...
  - `tests/e2e/owner-property-flow.spec.js` - owner can browse properties and open the property detail experience
    - Error: owner property details has blocking accessibility violations: aria-prohibited-attr (serious) Elements must only use permitted ARIA attributes https://dequeuniversity.com/rules/axe/4.11/aria-prohibited-attr?application=playwright - .brand-logo--sidebar: Fix all of the following: aria-label attribute cannot be used on a div with no valid role attribute. - .brand-logo--header: Fix all of the following: aria-label attribute cannot be used on a div with no valid role attribute. color-contrast (serious) Elements must meet minimum color contrast ratio thresholds https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright - .brand-logo__subtitle: Fix any of the following:...
  - `tests/e2e/properties.spec.js` - property detail page has no blocking accessibility violations
    - Error: property detail page has blocking accessibility violations: aria-prohibited-attr (serious) Elements must only use permitted ARIA attributes https://dequeuniversity.com/rules/axe/4.11/aria-prohibited-attr?application=playwright - .brand-logo--sidebar: Fix all of the following: aria-label attribute cannot be used on a div with no valid role attribute. - .brand-logo--header: Fix all of the following: aria-label attribute cannot be used on a div with no valid role attribute. color-contrast (serious) Elements must meet minimum color contrast ratio thresholds https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright - .brand-logo__subtitle: Fix any of the following: E...
  - `tests/e2e/responsive-accessibility-release.spec.js` - dashboard passes release accessibility scan at desktop width
    - Error: expect(locator).toBeVisible() failed Locator: getByRole('heading', { name: 'Operations Hub' }) Expected: visible Error: strict mode violation: getByRole('heading', { name: 'Operations Hub' }) resolved to 2 elements: 1) <h1 class="tenaqo-page-header__title">Operations Hub</h1> aka locator('h1') 2) <h2 class="tenaqo-section-header__title">Operations Hub</h2> aka locator('section').getByRole('heading', { name: 'Operations Hub' }) Call log: - Expect "toBeVisible" with timeout 10000ms - waiting for getByRole('heading', { name: 'Operations Hub' })
  - `tests/e2e/responsive-accessibility-release.spec.js` - finance passes release accessibility scan at desktop width
    - Error: finance desktop has blocking accessibility violations: aria-prohibited-attr (serious) Elements must only use permitted ARIA attributes https://dequeuniversity.com/rules/axe/4.11/aria-prohibited-attr?application=playwright - .brand-logo--sidebar: Fix all of the following: aria-label attribute cannot be used on a div with no valid role attribute. - .brand-logo--header: Fix all of the following: aria-label attribute cannot be used on a div with no valid role attribute. color-contrast (serious) Elements must meet minimum color contrast ratio thresholds https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright - .brand-logo__subtitle: Fix any of the following: Elemen...
  - `tests/e2e/responsive-accessibility-release.spec.js` - documents passes release accessibility scan at desktop width
    - Error: documents desktop has blocking accessibility violations: aria-prohibited-attr (serious) Elements must only use permitted ARIA attributes https://dequeuniversity.com/rules/axe/4.11/aria-prohibited-attr?application=playwright - .brand-logo--sidebar: Fix all of the following: aria-label attribute cannot be used on a div with no valid role attribute. - .brand-logo--header: Fix all of the following: aria-label attribute cannot be used on a div with no valid role attribute. color-contrast (serious) Elements must meet minimum color contrast ratio thresholds https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright - .brand-logo__subtitle: Fix any of the following: Elem...
  - `tests/e2e/responsive-accessibility-release.spec.js` - dashboard passes release accessibility scan at mobile width
    - Error: expect(locator).toBeVisible() failed Locator: getByRole('heading', { name: 'Operations Hub' }) Expected: visible Error: strict mode violation: getByRole('heading', { name: 'Operations Hub' }) resolved to 2 elements: 1) <h1 class="tenaqo-page-header__title">Operations Hub</h1> aka locator('h1') 2) <h2 class="tenaqo-section-header__title">Operations Hub</h2> aka locator('section').getByRole('heading', { name: 'Operations Hub' }) Call log: - Expect "toBeVisible" with timeout 10000ms - waiting for getByRole('heading', { name: 'Operations Hub' })
  - `tests/e2e/responsive-accessibility-release.spec.js` - finance passes release accessibility scan at mobile width
    - Error: finance mobile has blocking accessibility violations: aria-prohibited-attr (serious) Elements must only use permitted ARIA attributes https://dequeuniversity.com/rules/axe/4.11/aria-prohibited-attr?application=playwright - .brand-logo: Fix all of the following: aria-label attribute cannot be used on a div with no valid role attribute. expect(received).toEqual(expected) // deep equality - Expected - 1 + Received + 47 - Array [] + Array [ + Object { + "description": "Ensure ARIA attributes are not prohibited for an element's role", + "help": "Elements must only use permitted ARIA attributes", + "helpUrl": "https://dequeuniversity.com/rules/axe/4.11/aria-prohibited-attr?application=playw...
  - `tests/e2e/responsive-accessibility-release.spec.js` - documents passes release accessibility scan at mobile width
    - Error: documents mobile has blocking accessibility violations: aria-prohibited-attr (serious) Elements must only use permitted ARIA attributes https://dequeuniversity.com/rules/axe/4.11/aria-prohibited-attr?application=playwright - .brand-logo: Fix all of the following: aria-label attribute cannot be used on a div with no valid role attribute. expect(received).toEqual(expected) // deep equality - Expected - 1 + Received + 47 - Array [] + Array [ + Object { + "description": "Ensure ARIA attributes are not prohibited for an element's role", + "help": "Elements must only use permitted ARIA attributes", + "helpUrl": "https://dequeuniversity.com/rules/axe/4.11/aria-prohibited-attr?application=pla...
  - `tests/e2e/responsive-accessibility-release.spec.js` - contractor portal passes release accessibility scan at desktop and mobile widths
    - Error: contractor portal 1440px has blocking accessibility violations: aria-prohibited-attr (serious) Elements must only use permitted ARIA attributes https://dequeuniversity.com/rules/axe/4.11/aria-prohibited-attr?application=playwright - .brand-logo--sidebar: Fix all of the following: aria-label attribute cannot be used on a div with no valid role attribute. - .brand-logo--header: Fix all of the following: aria-label attribute cannot be used on a div with no valid role attribute. color-contrast (serious) Elements must meet minimum color contrast ratio thresholds https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright - .brand-logo__subtitle: Fix any of the followin...
  - `tests/e2e/responsive-accessibility-release.spec.js` - root telemetry passes release accessibility scan at desktop and mobile widths
    - Error: root telemetry 1440px has blocking accessibility violations: aria-prohibited-attr (serious) Elements must only use permitted ARIA attributes https://dequeuniversity.com/rules/axe/4.11/aria-prohibited-attr?application=playwright - .brand-logo--sidebar: Fix all of the following: aria-label attribute cannot be used on a div with no valid role attribute. - .brand-logo--header: Fix all of the following: aria-label attribute cannot be used on a div with no valid role attribute. color-contrast (serious) Elements must meet minimum color contrast ratio thresholds https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright - .brand-logo__subtitle: Fix any of the following: ...

## 8. Notifications

- Failure count: 19
- Blocking classification: Potentially non-blocking
- Likely root cause: Non-HMRC notifications are not directly part of live pilot controls.
- Fix or waiver recommendation: Waive only if no HMRC consent/audit/operator notification is involved.
- Failed test files:
  - `tests/e2e/notification-coverage.spec.js`
  - `tests/e2e/notifications.spec.js`
- Failed test names and messages:
  - `tests/e2e/notification-coverage.spec.js` - owner marking a payment paid sends payment_received notification to tenant
    - Error: expect(received).toBeNull() Received: {"code": "23502", "details": "Failing row contains (32e11f72-2cad-42af-8d1b-2389bd6f1850, null, 44444444-4444-4444-4444-444444444441, 33333333-3333-3333-3333-333333333331, 950.00, due, 2026-06-05, null, 2026-06-05 12:17:50.141775+00, 11111111-1111-1111-1111-111111111111, null, 2026-06-05 12:17:50.141775+00, PLN).", "hint": null, "message": "null value in column \"owner_id\" of relation \"payments\" violates not-null constraint"}
  - `tests/e2e/notification-coverage.spec.js` - owner approving a tenant cancellation request sends cancellation_approved notification
    - Error: expect(received).toBeNull() Received: {"code": "PGRST204", "details": null, "hint": null, "message": "Could not find the 'pending_cancel_request' column of 'work_orders' in the schema cache"}
  - `tests/e2e/notification-coverage.spec.js` - owner denying a tenant cancellation request sends cancellation_denied notification
    - Error: expect(received).toBeNull() Received: {"code": "PGRST204", "details": null, "hint": null, "message": "Could not find the 'pending_cancel_request' column of 'work_orders' in the schema cache"}
  - `tests/e2e/notification-coverage.spec.js` - creating a payment notifies tenant of new payment due
    - Error: locator.selectOption: Error: strict mode violation: locator('.fixed').filter({ hasText: /add payment/i }).locator('select') resolved to 2 elements: 1) <select required="" class="w-full border border-slate-300 dark:border-slate-600 rounded px-3 py-2 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 disabled:bg-slate-100 dark:disabled:bg-slate-800">…</select> aka getByRole('combobox').nth(2) 2) <select disabled required="" class="w-full border border-slate-300 dark:border-slate-600 rounded px-3 py-2 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-500">…</select> aka getByRole('combobox').nth(3...
  - `tests/e2e/notifications.spec.js` - dropdown shows seeded notification title and body
    - Error: expect(locator).toBeVisible() failed Locator: getByText('E2E Bell UI title check') Expected: visible Timeout: 10000ms Error: element(s) not found Call log: - Expect "toBeVisible" with timeout 10000ms - waiting for getByText('E2E Bell UI title check')
  - `tests/e2e/notifications.spec.js` - unread notification shows blue dot indicator; read notification does not
    - Error: expect(locator).toBeVisible() failed Locator: getByText('E2E Bell UI unread') Expected: visible Timeout: 10000ms Error: element(s) not found Call log: - Expect "toBeVisible" with timeout 10000ms - waiting for getByText('E2E Bell UI unread')
  - `tests/e2e/notifications.spec.js` - clicking a notification marks it read (dot disappears)
    - Error: expect(locator).toBeVisible() failed Locator: locator('button').filter({ hasText: 'E2E Bell UI click-to-read' }) Expected: visible Timeout: 10000ms Error: element(s) not found Call log: - Expect "toBeVisible" with timeout 10000ms - waiting for locator('button').filter({ hasText: 'E2E Bell UI click-to-read' })
  - `tests/e2e/notifications.spec.js` - notification with link_path navigates on click
    - Error: expect(locator).toBeVisible() failed Locator: locator('button').filter({ hasText: 'E2E Bell UI nav test' }) Expected: visible Timeout: 10000ms Error: element(s) not found Call log: - Expect "toBeVisible" with timeout 10000ms - waiting for locator('button').filter({ hasText: 'E2E Bell UI nav test' })
  - `tests/e2e/notifications.spec.js` - unread count capped at 99+ when ≥100 notifications
    - Error: expect(locator).toHaveText(expected) failed Locator: locator('button[aria-label*=\'otif\'] span, button[aria-label*=\'Notif\'] span').first() Expected: "99+" Received: "20" Timeout: 20000ms Call log: - Expect "toHaveText" with timeout 20000ms - waiting for locator('button[aria-label*=\'otif\'] span, button[aria-label*=\'Notif\'] span').first() 17 × locator resolved to <span class="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-blue-600 text-white text-[11px] leading-[18px] text-center">20</span> - unexpected value "20"
  - `tests/e2e/notifications.spec.js` - owner marking payment paid triggers payment_received notification for tenant
    - Error: expect(locator).toBeVisible() failed Locator: getByTestId('mark-paid-b9ce8a6d-a1d3-4442-869d-9d454d195b33').filter({ visible: true }) Expected: visible Timeout: 15000ms Error: element(s) not found Call log: - Expect "toBeVisible" with timeout 15000ms - waiting for getByTestId('mark-paid-b9ce8a6d-a1d3-4442-869d-9d454d195b33').filter({ visible: true })
  - `tests/e2e/notifications.spec.js` - tenant submitting maintenance request creates notification for owner/manager
    - Error: expect(locator).toBeVisible() failed Locator: getByRole('heading', { name: /requests|issues/i }).first() Expected: visible Timeout: 20000ms Error: element(s) not found Call log: - Expect "toBeVisible" with timeout 20000ms - waiting for getByRole('heading', { name: /requests|issues/i }).first()
  - `tests/e2e/notifications.spec.js` - maintenance_request_created notification visible in admin bell
    - Error: expect(locator).toBeVisible() failed Locator: getByText('E2E Type Test maint_created') Expected: visible Timeout: 10000ms Error: element(s) not found Call log: - Expect "toBeVisible" with timeout 10000ms - waiting for getByText('E2E Type Test maint_created')
  - `tests/e2e/notifications.spec.js` - maintenance_request_created notification visible in staff bell
    - Error: expect(locator).toBeVisible() failed Locator: getByText('E2E Type Test staff_maint') Expected: visible Timeout: 10000ms Error: element(s) not found Call log: - Expect "toBeVisible" with timeout 10000ms - waiting for getByText('E2E Type Test staff_maint')
  - `tests/e2e/notifications.spec.js` - work_order_assigned notification visible in contractor bell
    - Error: expect(locator).toBeVisible() failed Locator: getByText('E2E Type Test wo_assigned') Expected: visible Timeout: 10000ms Error: element(s) not found Call log: - Expect "toBeVisible" with timeout 10000ms - waiting for getByText('E2E Type Test wo_assigned')
  - `tests/e2e/notifications.spec.js` - payment_received notification visible in owner bell (confirms receipt side)
    - Error: expect(locator).toBeVisible() failed Locator: getByText('E2E Type Test payment_recv') Expected: visible Timeout: 10000ms Error: element(s) not found Call log: - Expect "toBeVisible" with timeout 10000ms - waiting for getByText('E2E Type Test payment_recv')
  - `tests/e2e/notifications.spec.js` - overdue_rent notification visible in owner bell with urgent styling
    - Error: expect(locator).toBeVisible() failed Locator: getByText('E2E Type Test overdue_rent') Expected: visible Timeout: 10000ms Error: element(s) not found Call log: - Expect "toBeVisible" with timeout 10000ms - waiting for getByText('E2E Type Test overdue_rent')
  - `tests/e2e/notifications.spec.js` - lease_expiring notification visible in owner bell with action styling
    - Error: expect(locator).toBeVisible() failed Locator: getByText('E2E Type Test lease_expiring') Expected: visible Timeout: 10000ms Error: element(s) not found Call log: - Expect "toBeVisible" with timeout 10000ms - waiting for getByText('E2E Type Test lease_expiring')
  - `tests/e2e/notifications.spec.js` - notification without link_path closes dropdown but does not navigate
    - Error: expect(received).toBe(expected) // Object.is equality Expected: "http://127.0.0.1:4173/dashboard" Received: "http://127.0.0.1:4173/dashboard?horizon=week"
  - `tests/e2e/notifications.spec.js` - only the current user's notifications appear — cross-user isolation
    - Error: expect(locator).toBeVisible() failed Locator: getByText('E2E Edge owner-only') Expected: visible Timeout: 10000ms Error: element(s) not found Call log: - Expect "toBeVisible" with timeout 10000ms - waiting for getByText('E2E Edge owner-only')

## 9. Documents/evidence/export

- Failure count: 4
- Blocking classification: Blocking if accountant pack/evidence/receipt affected
- Likely root cause: Exports and evidence artifacts support accountant review and audit reliability.
- Fix or waiver recommendation: Fix if accountant pack, evidence, receipts, or audit artifact storage is affected.
- Failed test files:
  - `tests/e2e/document-packets-flow.spec.js`
  - `tests/e2e/document-requests-flow.spec.js`
  - `tests/e2e/document-template-library.spec.js`
  - `tests/e2e/poland-evidence-flow.spec.js`
- Failed test names and messages:
  - `tests/e2e/document-packets-flow.spec.js` - agreement packets move from active template to tenant signature task visibility
    - Error: expect(locator).toBeVisible() failed Locator: getByTestId('document-packets-panel') Expected: visible Timeout: 10000ms Error: element(s) not found Call log: - Expect "toBeVisible" with timeout 10000ms - waiting for getByTestId('document-packets-panel')
  - `tests/e2e/document-requests-flow.spec.js` - document requests move from manager to tenant and contractor upload review
    - Error: expect(locator).toBeVisible() failed Locator: getByTestId('document-requests-panel') Expected: visible Timeout: 10000ms Error: element(s) not found Call log: - Expect "toBeVisible" with timeout 10000ms - waiting for getByTestId('document-requests-panel')
  - `tests/e2e/document-template-library.spec.js` - template library uploads a manager template and shows it in the repository
    - Error: expect(locator).toBeVisible() failed Locator: getByTestId('document-template-library') Expected: visible Timeout: 10000ms Error: element(s) not found Call log: - Expect "toBeVisible" with timeout 10000ms - waiting for getByTestId('document-template-library')
  - `tests/e2e/poland-evidence-flow.spec.js` - EvidencePack completion bar renders with correct percentage
    - Error: expect(locator).toBeVisible() failed Locator: getByText('Evidence Pack').or(getByText('Pakiet Dowodowy')) Expected: visible Timeout: 8000ms Error: element(s) not found Call log: - Expect "toBeVisible" with timeout 8000ms - waiting for getByText('Evidence Pack').or(getByText('Pakiet Dowodowy'))

## 10. Compliance/risk protection

- Failure count: 5
- Blocking classification: Potentially blocking
- Likely root cause: Shared compliance routing/RLS failures can indicate isolation or document-risk regressions.
- Fix or waiver recommendation: Fix shared shell/RLS issues; waive only Poland-only or unrelated compliance flows.
- Failed test files:
  - `tests/e2e/compliance-screenshots.spec.js`
  - `tests/e2e/poland-compliance-flow.spec.js`
  - `tests/e2e/poland-compliance-security-routes.spec.js`
- Failed test names and messages:
  - `tests/e2e/compliance-screenshots.spec.js` - captures compliance suite screenshots
    - Error: expect(locator).toBeVisible() failed Locator: getByText('Tax Readiness').first() Expected: visible Timeout: 10000ms Error: element(s) not found Call log: - Expect "toBeVisible" with timeout 10000ms - waiting for getByText('Tax Readiness').first()
  - `tests/e2e/poland-compliance-flow.spec.js` - shows 'Set up checklist' button when no checklist items exist
    - Test timeout of 60000ms exceeded.
  - `tests/e2e/poland-compliance-security-routes.spec.js` - clicking Rental Protection card opens section and shows breadcrumb
    - TimeoutError: locator.waitFor: Timeout 20000ms exceeded. Call log: - waiting for locator('h1').filter({ hasText: 'Poland Compliance Toolkit' }) to be visible
  - `tests/e2e/poland-compliance-security-routes.spec.js` - only weak-password users have a badge — strong users do not
    - Error: expect(locator).toBeVisible() failed Locator: getByText('owner.a@oasis.test') Expected: visible Error: strict mode violation: getByText('owner.a@oasis.test') resolved to 2 elements: 1) <p class="mt-1.5 text-[10px] text-slate-400/70 dark:text-slate-500 truncate leading-4">owner.a@oasis.test</p> aka getByRole('complementary').getByText('owner.a@oasis.test') 2) <p class="font-medium text-slate-900 dark:text-slate-100">owner.a@oasis.test</p> aka getByRole('main').getByText('owner.a@oasis.test') Call log: - Expect "toBeVisible" with timeout 10000ms - waiting for getByText('owner.a@oasis.test')
  - `tests/e2e/poland-compliance-security-routes.spec.js` - dashboard loads for authenticated owner
    - Error: expect(locator).toBeVisible() failed Locator: getByRole('heading', { name: 'Operations Hub' }) Expected: visible Error: strict mode violation: getByRole('heading', { name: 'Operations Hub' }) resolved to 2 elements: 1) <h1 class="tenaqo-page-header__title">Operations Hub</h1> aka locator('h1') 2) <h2 class="tenaqo-section-header__title">Operations Hub</h2> aka locator('section').getByRole('heading', { name: 'Operations Hub' }) Call log: - Expect "toBeVisible" with timeout 20000ms - waiting for getByRole('heading', { name: 'Operations Hub' })

## 11. Maintenance/AI/calendar/screenshots/signup

- Failure count: 27
- Blocking classification: Potentially non-blocking
- Likely root cause: These are usually outside HMRC pilot controls unless they break shared shell/session/routing.
- Fix or waiver recommendation: Waive with evidence that HMRC controls, account isolation, finance/tax records and exports are unaffected.
- Failed test files:
  - `tests/e2e/ai-surface-robustness.spec.js`
  - `tests/e2e/command-center-ai.spec.js`
  - `tests/e2e/degraded-paths.spec.js`
  - `tests/e2e/dropdown-dark-contrast.spec.js`
  - `tests/e2e/linkedin-product-shots.spec.js`
  - `tests/e2e/maintenance-inbox-ai.spec.js`
  - `tests/e2e/maintenance-inbox-redesign.spec.js`
  - `tests/e2e/maintenance-work-order-flow.spec.js`
  - `tests/e2e/marketing-screenshots.spec.js`
  - `tests/e2e/operating-calendar.spec.js`
  - `tests/e2e/self-serve-signup-flow.spec.js`
  - `tests/e2e/self-serve-signup.spec.js`
- Failed test names and messages:
  - `tests/e2e/ai-surface-robustness.spec.js` - maintenance triage AI request does not include tenant email in prompt body
    - Error: expect(received).toBe(expected) // Object.is equality Expected: "9b694430-453e-40c0-88fa-9eeb60f27b6d" Received: "77c6ce48-8af2-430f-be79-6e9967cea826"
  - `tests/e2e/ai-surface-robustness.spec.js` - AI insight card renders gracefully when rate limit (429) is returned
    - Error: expect(received).not.toBe(expected) // Object.is equality Expected: not "loading" Call Log: - Timeout 30000ms exceeded while waiting on the predicate
  - `tests/e2e/command-center-ai.spec.js` - owner can follow an operator briefing action to the target surface
    - Error: expect(locator).toBeEnabled() failed Locator: getByTestId('attention-insight-card').getByRole('button', { name: /Refresh briefing|Odśwież briefing/i }) Expected: enabled Timeout: 30000ms Error: element(s) not found Call log: - Expect "toBeEnabled" with timeout 30000ms - waiting for getByTestId('attention-insight-card').getByRole('button', { name: /Refresh briefing|Odśwież briefing/i })
  - `tests/e2e/degraded-paths.spec.js` - new landlord accounts show the empty property state before first data entry
    - Error: expect(locator).toBeVisible() failed Locator: getByText('No properties') Expected: visible Timeout: 10000ms Error: element(s) not found Call log: - Expect "toBeVisible" with timeout 10000ms - waiting for getByText('No properties')
  - `tests/e2e/degraded-paths.spec.js` - subscription-gated operator surfaces show an upgrade card instead of noisy RPC errors
    - Error: expect(locator).toBeVisible() failed Locator: getByText('Plan upgrade') Expected: visible Timeout: 10000ms Error: element(s) not found Call log: - Expect "toBeVisible" with timeout 10000ms - waiting for getByText('Plan upgrade')
  - `tests/e2e/dropdown-dark-contrast.spec.js` - dark mode dropdowns have readable contrast for landlord owner
    - Error: landlord owner should expose at least one dropdown expect(received).toBeGreaterThan(expected) Expected: > 0 Received: 0
  - `tests/e2e/dropdown-dark-contrast.spec.js` - dark mode dropdowns have readable contrast for staff
    - Error: staff should expose at least one dropdown expect(received).toBeGreaterThan(expected) Expected: > 0 Received: 0
  - `tests/e2e/dropdown-dark-contrast.spec.js` - dark mode dropdowns have readable contrast for tenant
    - Error: tenant should expose at least one dropdown expect(received).toBeGreaterThan(expected) Expected: > 0 Received: 0
  - `tests/e2e/dropdown-dark-contrast.spec.js` - dark mode dropdowns have readable contrast for contractor
    - Error: contractor should expose at least one dropdown expect(received).toBeGreaterThan(expected) Expected: > 0 Received: 0
  - `tests/e2e/linkedin-product-shots.spec.js` - captures linkedin-ready product shots for operator storytelling
    - Test timeout of 120000ms exceeded.
  - `tests/e2e/maintenance-inbox-ai.spec.js` - owner can move from AI triage guidance into contractor recommendation
    - Error: expect(locator).toBeEnabled() failed Locator: getByTestId('maintenance-request-card-03e55820-e23b-41de-ad3f-02a067313697').locator('[data-testid^="maintenance-triage-card-"]').first().getByRole('button', { name: /Refresh suggestion|Odśwież sugestię|Empfehlung aktualisieren/i }) Expected: enabled Timeout: 30000ms Error: element(s) not found Call log: - Expect "toBeEnabled" with timeout 30000ms - waiting for getByTestId('maintenance-request-card-03e55820-e23b-41de-ad3f-02a067313697').locator('[data-testid^="maintenance-triage-card-"]').first().getByRole('button', { name: /Refresh suggestion|Odśwież sugestię|Empfehlung aktualisieren/i })
  - `tests/e2e/maintenance-inbox-redesign.spec.js` - compact toolbar shows status count badges and SLA legend, no handoff guide card
    - Error: expect(locator).toBeVisible() failed Locator: getByText('Maintenance Inbox / Triage Board') Expected: visible Error: strict mode violation: getByText('Maintenance Inbox / Triage Board') resolved to 2 elements: 1) <span class="text-slate-900 font-medium">Maintenance Inbox / Triage Board</span> aka getByLabel('Breadcrumb').getByText('Maintenance Inbox / Triage') 2) <h2 class="text-base font-semibold text-slate-900">Maintenance Inbox / Triage Board</h2> aka getByRole('heading', { name: 'Maintenance Inbox / Triage' }) Call log: - Expect "toBeVisible" with timeout 20000ms - waiting for getByText('Maintenance Inbox / Triage Board')
  - `tests/e2e/maintenance-inbox-redesign.spec.js` - request card is collapsed by default and shows SLA dot, priority badge, and truncated description
    - Error: expect(locator).toBeHidden() failed Locator: getByTestId('maintenance-request-card-5441f7f5-3d15-4204-a6d9-6b4f26146406').getByText(/Radiators in the living room/) Expected: hidden Received: visible Timeout: 5000ms Call log: - Expect "toBeHidden" with timeout 5000ms - waiting for getByTestId('maintenance-request-card-5441f7f5-3d15-4204-a6d9-6b4f26146406').getByText(/Radiators in the living room/) 9 × locator resolved to <p class="mt-2 text-sm text-slate-600 break-words line-clamp-2">The boiler has been making a loud banging noise e…</p> - unexpected value "visible"
  - `tests/e2e/maintenance-work-order-flow.spec.js` - maintenance request becomes a contractor-completed linked work order
    - Error: expect(locator).toContainText(expected) failed Locator: getByTestId('maintenance-request-card-a24f6eea-f2c5-4733-b1ef-3367d9d7e2b9') Expected substring: "Status: In progress" Received string: "E2E maintenance triage 178066187265011 Starlight Avenue, London · 0hHigh▼Playwright verifies that a manager can move from issue triage to a linked work order.⚡ High priority · General maintenance contractorWork order: assignedCreate work order···" Timeout: 10000ms Call log: - Expect "toContainText" with timeout 10000ms - waiting for getByTestId('maintenance-request-card-a24f6eea-f2c5-4733-b1ef-3367d9d7e2b9') 5 × locator resolved to <div data-testid="maintenance-request-card-a24f6eea-f2c5-4733-b1...
  - `tests/e2e/marketing-screenshots.spec.js` - captures marketing product screenshots
    - Test timeout of 120000ms exceeded.
  - `tests/e2e/operating-calendar.spec.js` - seeded payment from account A appears in agenda as a Rent item
    - Error: expect(locator).toBeVisible() failed Locator: getByText(/^Rent:/) Expected: visible Timeout: 20000ms Error: element(s) not found Call log: - Expect "toBeVisible" with timeout 20000ms - waiting for getByText(/^Rent:/)
  - `tests/e2e/operating-calendar.spec.js` - custom calendar item appears in agenda after admin seed
    - Error: expect(received).toBeNull() Received: {"code": "PGRST205", "details": null, "hint": "Perhaps you meant the table 'public.property_eco_upgrade_plan_items'", "message": "Could not find the table 'public.operating_calendar_items' in the schema cache"}
  - `tests/e2e/operating-calendar.spec.js` - custom item due in the past is rendered with Overdue status badge
    - Error: expect(received).toBeNull() Received: {"code": "PGRST205", "details": null, "hint": "Perhaps you meant the table 'public.property_eco_upgrade_plan_items'", "message": "Could not find the table 'public.operating_calendar_items' in the schema cache"}
  - `tests/e2e/operating-calendar.spec.js` - custom item status blocked renders Blocked badge
    - Error: expect(received).toBeNull() Received: {"code": "PGRST205", "details": null, "hint": "Perhaps you meant the table 'public.property_eco_upgrade_plan_items'", "message": "Could not find the table 'public.operating_calendar_items' in the schema cache"}
  - `tests/e2e/operating-calendar.spec.js` - source module filter to 'payment' hides custom and maintenance items
    - Error: expect(locator).toBeVisible() failed Locator: getByText('E2E Custom Filter Test 1780662065353') Expected: visible Timeout: 20000ms Error: element(s) not found Call log: - Expect "toBeVisible" with timeout 20000ms - waiting for getByText('E2E Custom Filter Test 1780662065353')
  - `tests/e2e/operating-calendar.spec.js` - summary bar shows status chip counts above the agenda
    - Error: expect(locator).toBeVisible() failed Locator: locator('[aria-label="Month summary"] span').first() Expected: visible Timeout: 20000ms Error: element(s) not found Call log: - Expect "toBeVisible" with timeout 20000ms - waiting for locator('[aria-label="Month summary"] span').first()
  - `tests/e2e/operating-calendar.spec.js` - items group by date with day headers (Today / formatted date)
    - Error: expect(locator).toBeVisible() failed Locator: locator('section[aria-label]').first() Expected: visible Timeout: 20000ms Error: element(s) not found Call log: - Expect "toBeVisible" with timeout 20000ms - waiting for locator('section[aria-label]').first()
  - `tests/e2e/operating-calendar.spec.js` - clicking a day with items shows item detail below the grid
    - Error: expect(locator).toBeVisible() failed Locator: getByText('E2E Month Click Task 1780662076308') Expected: visible Timeout: 15000ms Error: element(s) not found Call log: - Expect "toBeVisible" with timeout 15000ms - waiting for getByText('E2E Month Click Task 1780662076308')
  - `tests/e2e/operating-calendar.spec.js` - status dots appear in month grid cells that have items
    - Error: expect(locator).toBeVisible() failed Locator: locator('.w-1\\.5.h-1\\.5.rounded-full').first() Expected: visible Timeout: 15000ms Error: element(s) not found Call log: - Expect "toBeVisible" with timeout 15000ms - waiting for locator('.w-1\\.5.h-1\\.5.rounded-full').first()
  - `tests/e2e/self-serve-signup-flow.spec.js` - self-serve landlord signup provisions an owner account and lands on the dashboard
    - Error: expect(locator).toBeVisible() failed Locator: getByText('Signup Flow Rentals 1780662418600') Expected: visible Timeout: 10000ms Error: element(s) not found Call log: - Expect "toBeVisible" with timeout 10000ms - waiting for getByText('Signup Flow Rentals 1780662418600')
  - `tests/e2e/self-serve-signup-flow.spec.js` - self-serve sandbox signup seeds demo data and supports a first landlord action
    - Error: expect(locator).toBeVisible() failed Locator: getByText('21 Demo Crescent') Expected: visible Timeout: 10000ms Error: element(s) not found Call log: - Expect "toBeVisible" with timeout 10000ms - waiting for getByText('21 Demo Crescent')
  - `tests/e2e/self-serve-signup.spec.js` - shows the self-serve signup sandbox option
    - Error: expect(locator).toBeVisible() failed Locator: getByRole('heading', { name: 'Create landlord account' }) Expected: visible Timeout: 10000ms Error: element(s) not found Call log: - Expect "toBeVisible" with timeout 10000ms - waiting for getByRole('heading', { name: 'Create landlord account' })

## 12. Phase 5D-specific HMRC/pilot surfaces

- Failure count: 0
- Blocking classification: Blocking
- Likely root cause: Any Phase 5D HMRC/pilot UI or route failure blocks real live-network attempt readiness.
- Fix or waiver recommendation: Fix before readiness; no waiver unless the test itself is invalid and replaced by stronger evidence.
- Failed test files: none in this run
- Failed test names/messages: none

## Clearance Decision

- Blocking failures currently counted: 52
- Real live-network attempt evidence must remain false until these blockers are fixed or formally waived with evidence.
- Non-blocking waivers must explicitly state why HMRC live pilot controls, consent, account isolation, tenant/contractor restrictions, finance/tax source records, operator support/audit visibility, and export/accountant pack reliability are unaffected.
