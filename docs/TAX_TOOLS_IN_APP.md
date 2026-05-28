# In-App Landlord Tax Tools

These tools are available inside the app at `/compliance/tax-tools`. They are UK-specific, entitlement-gated record-keeping aids — they do not submit anything to HMRC.

## What the feature does

Five tabs under the Tax Tools page help landlords organise their numbers before speaking to an accountant or filing under Making Tax Digital (MTD):

### 1. MTD Expense Tracker

Manually log property expenses with category, amount, tax year, and an MTD-readiness flag. Totals are summarised by category. Records can be exported as CSV.

Categories follow HMRC allowable-expense conventions: `running_cost`, `repairs_maintenance`, `finance_costs`, `professional_fees`, `insurance`, `letting_agent_fees`, `legal_fees`, `capital_improvement`, `needs_review`.

The MTD-ready flag (`mtd_ready`) lets landlords mark records that are already in the correct digital format for their accountant, distinguishing them from records that still need review.

### 2. Section 24 Finance Cost Tracker

Records per-property, per-tax-year finance cost summaries and calculates a simplified Section 24 (residential finance cost restriction) estimated position.

Shows:
- Taxable rental profit under the old full-deduction approach
- Taxable rental profit under the current basic-rate credit approach
- Estimated extra tax from the restriction
- Warnings when income is near a tax band boundary

Records are saved for accountant review and can be exported as CSV.

### 3. Carried-Forward Finance Cost Tracker

Records how much unused finance cost relief is carried forward from one tax year to the next. Takes brought-forward amount, finance costs this year, and used amount; calculates the carried-forward balance automatically.

This is relevant when a landlord's mortgage interest exceeds their rental profit in a given year — the excess carries forward for use in future years.

### 4. Digital Record Readiness Check

A local-only readiness questionnaire (no persistence). Asks about income level, whether spreadsheets are used, whether receipts are kept digitally, and whether expenses are tracked by property. Returns:

- A readiness score (0–100)
- MTD threshold status (under/approaching/above the £50,000 / £30,000 thresholds)
- A prioritised list of next steps
- A deadline note based on the threshold crossed

Nothing is saved to the database from this tab.

### 5. Export / Accountant Pack

Three one-click CSV downloads:

| Export | Contents |
|---|---|
| Expense classifications | All `tax_expense_classifications` rows for the account |
| Section 24 summaries | All `tax_finance_cost_summaries` rows |
| Carried-forward costs | All `tax_carried_forward_finance_costs` rows |

Each download is generated client-side from the already-loaded data — no server round-trip.

**Known limitation:** the expense classifications export uses `property_id` (UUID), not the property address. Accountants reviewing the CSV will need to cross-reference property IDs against the property list.

## Entitlement gating

Each tab has its own feature flag:

| Tab | Entitlement key |
|---|---|
| MTD Expense Tracker | `mtd_expense_tracker` |
| Section 24 Tracker | `section24_finance_cost_tracker` |
| Carried-Forward Tracker | `carried_forward_finance_cost_tracker` |
| Readiness Check | `tax_tools_in_app` |
| Export Pack | `tax_tools_in_app` |

Tabs without a granted entitlement show a "behind a feature flag" notice. HMRC live submission flags (`hmrc_mtd_live_submission`, `hmrc_mtd_sandbox`) are deliberately excluded from all plan tiers — these are record-keeping tools only.

## Database schema

Five tables, all with RLS gated on `user_can_manage_account(account_id)`:

| Table | Purpose |
|---|---|
| `tax_expense_classifications` | Individual expense records |
| `tax_finance_cost_summaries` | Section 24 per-property per-year summary (unique per `account_id, property_id, tax_year`) |
| `tax_carried_forward_finance_costs` | Carried-forward balance per-property per-year (unique per `account_id, property_id, tax_year`) |
| `tax_year_summaries` | MTD readiness score and threshold status (written by future automated jobs; not yet used by any tab) |
| `tax_tool_audit_log` | Append-only audit trail for all write operations |

Applied via `supabase/tax_tools_phase2.sql`.

## Key files

| File | Role |
|---|---|
| [src/pages/compliance/TaxToolsPage.jsx](src/pages/compliance/TaxToolsPage.jsx) | Main 5-tab page component |
| [src/utils/taxTools.js](src/utils/taxTools.js) | Calculation layer (Section 24, MTD readiness, carried-forward) |
| [src/services/taxToolsService.js](src/services/taxToolsService.js) | CRUD service, CSV generators, audit log writes |
| [supabase/tax_tools_phase2.sql](supabase/tax_tools_phase2.sql) | Schema, RLS, triggers, grants |

## Marketing site equivalents

Three public (unauthenticated) calculator pages at `/landlord-tools/` on the marketing site let prospective landlords explore the same concepts without signing in:

- `/landlord-tools/hmrc-expense-tester` — classify a single expense
- `/landlord-tools/section-24-shock-calculator` — compare old vs current finance cost treatment
- `/landlord-tools/mtd-readiness-check` — check MTD threshold and readiness score

These are stateless, UK-locale-only, and have no database interaction. They are implemented separately in `marketing-site/lib/landlordTaxTools/` and `marketing-site/components/landlord-tools/`.
