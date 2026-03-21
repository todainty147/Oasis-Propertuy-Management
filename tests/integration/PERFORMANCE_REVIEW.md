# RPC Performance Review

This document tracks the highest-value account-scoped RPC surfaces from a performance and scalability perspective. It is intentionally practical: the goal is to highlight where current SQL is already acceptable, where current indexes line up well, and where the next tightening pass should focus before larger accounts accumulate significantly more payments, requests, work orders, leases, compliance items, and notifications.

## Latest Hardening Pass

What was evaluated:
- `contractor_work_order_cards`
- `finance_snapshot`
- `command_center_items`
- `attention_center_items`

What was added in [performance_rpc_indexes.sql](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/performance_rpc_indexes.sql):
- `work_orders_contractor_user_idx`
- `payments_account_unpaid_due_idx`
- `maintenance_requests_account_status_created_idx`

Why these three won:
- `work_orders.contractor_user_id` was the clearest missing direct lookup path in the entire review.
- manager-side unpaid / overdue payment slices repeatedly filter on `paid_at is null` plus due-date windows, and the existing `payments(account_id, tenant_id, due_date)` index is weaker for the manager path where tenant is not constrained.
- maintenance triage queries repeatedly filter by normalized status plus created time, while the current baseline only had `(account_id, property_id)` on `maintenance_requests`.

EXPLAIN note:
- I attempted to capture local EXPLAIN output against the local Supabase database, but the current shell environment could not invoke either the local Windows `psql.exe` bridge or the local Supabase CLI cleanly from WSL.
- Because of that environment constraint, the added indexes are justified from the real shipped query predicates and current index alignment rather than attached plan text.
- No synthetic benchmark harness was introduced.

## Staging EXPLAIN Pass

What was prepared:
- a repeatable staging EXPLAIN capture kit in [supabase/performance_staging_explain.sql](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/performance_staging_explain.sql)
- a staging runbook in [tests/staging/PERFORMANCE_EXPLAIN.md](/mnt/c/Users/Home/oasisrentalmanagementapp/tests/staging/PERFORMANCE_EXPLAIN.md)
- a results template in [tests/staging/PERFORMANCE_EXPLAIN_RESULTS_TEMPLATE.md](/mnt/c/Users/Home/oasisrentalmanagementapp/tests/staging/PERFORMANCE_EXPLAIN_RESULTS_TEMPLATE.md)

Why this pass stayed procedural:
- this workspace does not have direct staging database access, so I could not honestly attach captured staging plans from here
- the remaining candidates were explicitly deferred until real staging evidence existed

Candidates evaluated for the next pass:
- unread notifications partial index:
  - candidate: `notifications(account_id, created_at desc) where coalesce(is_read, false) = false`
  - target branch: unread `notifications` in `command_center_items` and `attention_center_items`
- work-order status/activity expression index:
  - candidate: `work_orders(account_id, lower(coalesce(status, '')), coalesce(updated_at, created_at) desc)`
  - target branches:
    - stalled work orders
    - recently updated open work orders
    - acknowledgement-overdue work orders

Current decision:
- unread notifications candidate: deferred pending staging plan evidence
- work-order status/activity candidate: deferred pending staging plan evidence
- no additional index was added in this pass

## Tier 3.1 Launch Decision

Capture date:
- 2026-03-20

What was re-checked:
- staging runbook and capture SQL in [tests/staging/PERFORMANCE_EXPLAIN.md](/mnt/c/Users/Home/oasisrentalmanagementapp/tests/staging/PERFORMANCE_EXPLAIN.md) and [supabase/performance_staging_explain.sql](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/performance_staging_explain.sql)
- unread notification branches in:
  - [attention_center_items.sql](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/attention_center_items.sql)
  - [command_center_items.sql](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/command_center_items.sql)
- work-order status/time branches in:
  - [attention_center_items.sql](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/attention_center_items.sql)
  - [command_center_items.sql](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/command_center_items.sql)
- current index support in:
  - [baseline_schema.sql](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/baseline_schema.sql)
  - [operations_foundations.sql](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/operations_foundations.sql)
  - [performance_rpc_indexes.sql](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/performance_rpc_indexes.sql)

What exact query paths were examined:
- unread notifications:
  - `public.notifications` filtered by `account_id` and `coalesce(is_read, false) = false`, ordered by `created_at desc`, then locally capped per feed family
- work-order acknowledgement overdue:
  - `public.work_orders` filtered by `account_id`, assigned-status variants, non-acknowledged state, and `acknowledgement_due_at < now()`
- work-order stalled / blocked:
  - `public.work_orders` filtered by `account_id`, blocked or in-progress status variants, and `coalesce(updated_at, created_at) <= now() - interval '72 hours'`
- work-order recently updated open:
  - `public.work_orders` filtered by `account_id`, assigned or in-progress status variants, and `coalesce(updated_at, created_at) >= now() - interval '72 hours'`

Current supporting indexes:
- unread notifications:
  - `idx_notifications_account_created`
- work orders:
  - `work_orders_account_status_idx`
  - `work_orders_ack_due_idx`
  - `work_orders_contractor_user_idx`

Evidence captured in this workspace:
- source-level query-shape review only
- no real staging `EXPLAIN (ANALYZE, BUFFERS, VERBOSE)` output could be attached from this environment

Why no staging plan was captured here:
- the repo contains the staging EXPLAIN runbook and SQL kit, but this workspace does not include a checked-in staging database connection path
- only the staging smoke anon/auth path is documented locally
- `.env.staging.local` is not present in this workspace
- without direct staging SQL access, adding either deferred index would still be speculative

Tier 3.1 decision:
- unread notifications candidate: deferred
- work-order status/activity candidate: deferred

Reasoning:
- unread notifications:
  - the current unread branch is simple and already account-scoped with a recent-first order
  - `idx_notifications_account_created` may already be sufficient for launch-sized accounts, but only staging plans can confirm whether `is_read` filtering remains expensive enough to justify another partial index
  - no unread partial index was added before go-live because the required staging hotspot evidence is still missing
- work-order status/activity:
  - the current work-order branches already have baseline support from `work_orders_account_status_idx` and `work_orders_ack_due_idx`
  - the deferred expression index could help stalled/recent branches, but the added write and maintenance cost is not justified without captured staging plans showing broad scans or heavy post-filtering on `coalesce(updated_at, created_at)`
  - no broader work-order index was added before go-live because the required staging benefit has not yet been demonstrated

Launch-safe conclusion:
- no additional launch index is justified yet
- no SQL rewrite or caching change was introduced
- the correct next step remains: run the existing staging EXPLAIN kit against a real busy staging account and only add one of the deferred indexes if the captured plan clearly improves

Evidence to look for:
- unread notifications:
  - many filtered rows on `is_read`
  - broad scans under `account_id`
  - sort work that the current `idx_notifications_account_created` does not avoid
- work orders:
  - broad scans or bitmap heap scans on status/time branches
  - heavy post-filtering on `coalesce(updated_at, created_at)`
  - planner inability to exploit the current `work_orders_account_status_idx` and `work_orders_ack_due_idx` cleanly

## Latest Query-Shape Pass

What was reviewed:
- `command_center_items`
- `attention_center_items`

What remains in place after review:
- `command_center_items` already trims each major branch family before the final `unioned` sort:
  - payments
  - maintenance request items
  - work order items
  - lease items
  - preventive items
  - compliance items
  - notifications
  - automation
  - security alerts
- `attention_center_items` already does the same for its branch families:
  - payments
  - maintenance request items
  - work order items
  - lease items
  - preventive items
  - compliance items
  - notifications

What changed in this pass:
- no new SQL rewrite was added
- the existing safer query shape is now protected by a fast source-level regression contract in [rpcPerformanceContracts.test.js](/mnt/c/Users/Home/oasisrentalmanagementapp/tests/security/rpcPerformanceContracts.test.js)

Why this is safe:
- each branch-family cap uses the same local ordering keys that the final query already uses
- each family is capped at `max_items`, which means no family can lose rows that would be needed to produce the final top `max_items`
- product behavior, visible ordering, and limit semantics stay unchanged

Why this helps:
- the old shape let every branch contribute all matching rows into one large union before the final sort/limit
- the new shape prevents obviously unbounded families like notifications, work-order signals, and maintenance triage rows from flooding the final merge step
- this is still lightweight and reversible, without introducing caching or materialization

Why nothing larger was added:
- the current branch-family caps already address the clearest fan-in problem without changing output semantics
- a deeper rewrite would need real staging or production plan evidence to justify extra complexity
- this pass intentionally avoids premature materialization, per-branch bespoke caps, or duplicated feed logic

## Summary

| Surface | Current shape | Current limit / scope guard | Index alignment | Main risk | Recommended next action |
| --- | --- | --- | --- | --- | --- |
| `dashboard_snapshot` | Aggregated account or tenant snapshot across properties, payments, requests, and work orders | Tenant-aware via `assert_tenant_scope_access`; horizon clamped to `1..30` days | Mostly acceptable | Multiple full account scans for large manager views | Keep as-is for now; add payment/request/work-order partial indexes if account volume grows materially |
| `finance_snapshot` | Aggregated payment totals + property JSON | Tenant-aware via `assert_tenant_scope_access` | Acceptable for current shape | Payment scans rely on broad account filters, not highly selective unpaid/overdue indexes | Add a partial unpaid payments index if finance dashboards become slow on large accounts |
| `command_center_items` | Large multi-domain union across payments, requests, work orders, leases, preventive tasks, compliance, notifications, security alerts | Manager-only via `assert_manage_account_access`; limit clamped to `1..200` | Improved but still mixed | Highest fan-in hotspot in current repo | Monitor with real production plans next; defer broader work-order/notification indexes until there is clearer evidence |
| `attention_center_items` | Similar multi-domain union to command center, slightly narrower output | Manager-only via `assert_manage_account_access`; limit clamped to `1..200` | Improved but still mixed | Same fan-in pattern as command center | Same as above; treat this as a top monitoring candidate |
| `portfolio_attention_items` | Narrower portfolio summary union over vacant properties, overdue/due-soon payments, and high-priority requests | Tenant-aware; limit clamped to `1..50` | Reasonable | Vacancy/recent-request calculations still require per-property checks | Keep as-is for now; revisit only if property counts per account grow large |
| `portfolio_health_snapshot` | Large aggregated operational + financial snapshot | Tenant-aware | Reasonable but scan-heavy | Repeated scans over payments, requests, and work orders for manager views | Add more selective status/date indexes before rewriting query shape |
| `contractor_work_order_cards` | Direct contractor-scoped card query | Contractor-only via `auth.uid()` | Weakest index alignment | Missing direct index on `work_orders.contractor_user_id` | Add contractor assignment index first if contractor data volume grows |

## By RPC

### `dashboard_snapshot`

What it does well:
- clamps `p_horizon_days` to a small range
- scopes tenant requests through `assert_tenant_scope_access`
- keeps the output to a single aggregate row

Why it is usually fine:
- single-row output means transport cost is trivial
- existing account and tenant/property indexes already support the basic joins

Why it can still get expensive:
- manager views scan all account payments, maintenance requests, and work orders each time
- `occupied_properties` uses `exists` over `tenants` per property
- `work_orders_with_flags` adds extra view work on top of `work_orders`

Relevant existing indexes:
- `properties_account_id_idx`
- `tenants_property_id_idx`
- `payments_account_tenant_due_idx`
- `maintenance_requests_account_property_idx`
- `work_orders_account_property_idx`
- `work_orders_account_status_idx`

Recommended tightening:
- if manager dashboards slow down, add a partial unpaid payments index keyed by `(account_id, due_date)`
- consider an additional maintenance request index keyed by `(account_id, status, created_at)`
- consider a work order index keyed by `(account_id, status, updated_at)`

### `finance_snapshot`

What it does well:
- scopes tenant requests through `assert_tenant_scope_access`
- returns one summary row plus compact property JSON

Why it is usually fine:
- account filter is always present
- property JSON is bounded by account property count, not an unbounded feed

Main risk:
- payment scans still rely mostly on `account_id` and optional `tenant_id`
- overdue / unpaid logic is driven by `status`, `paid_at`, and `due_date`, but the current payment index is not optimized for the common unpaid-manager path

Relevant existing indexes:
- `payments_account_id_idx`
- `payments_account_tenant_due_idx`
- `properties_account_id_idx`

Hardening added now:
- `payments_account_unpaid_due_idx on public.payments(account_id, due_date) where paid_at is null and due_date is not null`

Why:
- this lines up directly with manager-side unpaid, overdue, and due-soon filters
- it narrows the index to the hot slice instead of indexing all payments again

Deferred:
- wider `(account_id, tenant_id, paid_at, due_date)` variant was deferred because it adds more write overhead and the current problem is primarily the manager path, not tenant self-scope

### `command_center_items`

This is one of the two highest-risk read surfaces in the repo.

Why:
- it unions payments, requests, work orders, leases, preventive tasks, compliance items, notifications, and security alerts
- most branches do their own filtering and sorting before the final `limit`
- several branches filter by `lower(status)` and time windows, which can reduce index effectiveness

What is already good:
- manager-only guard via `assert_manage_account_access`
- hard cap of `200`
- many source tables already have account-oriented indexes
- branch-family local caps now cut intermediate union size before the final sort

Where it can still struggle first:
- unread notifications per account
- overdue / due-soon payment slices
- request triage and waiting/staleness checks
- overdue/stalled/blocked work order checks
- compliance / lease / preventive due-date branches on large operational accounts

Relevant existing indexes:
- `payments_account_tenant_due_idx`
- `maintenance_requests_account_property_idx`
- `work_orders_account_status_idx`
- `work_orders_ack_due_idx`
- `idx_notifications_account_created`
- `compliance_items_account_due_idx`
- `leases_account_id_idx`
- `leases_account_property_idx`
- `preventive_maintenance_tasks_account_idx`

Hardening added now:
- `maintenance_requests_account_status_created_idx on public.maintenance_requests(account_id, lower(coalesce(status, '')), created_at desc)`

Why:
- the maintenance branches in both center RPCs repeatedly filter on normalized status and created-time windows
- the baseline index on `(account_id, property_id)` does not help those triage/status paths much

Deferred:
- unread notifications partial index was deferred because the baseline already has `idx_notifications_account_created`, and the unread branch is not yet the clearest bottleneck
- broader work-order `(account_id, lower(status), updated_at)` index was deferred because the baseline already has `work_orders_account_status_idx` and `work_orders_ack_due_idx`; the next step should be a real production-plan capture before adding another wide work-order index
- materialization / query splitting was deferred because the current goal is a reversible, additive pass
- per-branch materialized feeds were intentionally deferred because the new family caps reduce union fan-in without adding operational complexity

### `attention_center_items`

This is the other major hotspot.

Compared with `command_center_items`:
- narrower output
- same broad union pattern across payments, requests, work orders, leases, preventive tasks, compliance, and notifications

Current strengths:
- manager-only guard
- hard cap of `200`
- most data branches remain account-scoped
- branch-family local caps now cut intermediate union size before the final sort

Main risk:
- same as command center: many account-wide scans before the final sort/limit
- the final order prioritizes bucket + sort order + age/due, so the planner may still need significant intermediate work

Hardening impact:
- benefits from the same new `payments` and `maintenance_requests` indexes added for command center
- now trims branch-family row counts before the final cross-family merge

Deferred:
- same as command center for notifications and broader work-order indexing

### `portfolio_attention_items`

This query is lighter than the two centers above.

What helps:
- default limit `10`, hard cap `50`
- each sub-branch is capped internally to `4`
- smaller union surface than command/attention center

Remaining risks:
- vacancy checks rely on `not exists` against `tenants`
- repeated `max(created_at)` over tenant history per property can become heavier on long-lived portfolios

Relevant existing indexes:
- `properties_account_id_idx`
- `tenants_property_id_idx`
- `payments_account_tenant_due_idx`
- `maintenance_requests_account_property_idx`

Recommended tightening:
- acceptable as-is for now
- if vacancy aging becomes slow, consider a derived property occupancy cache or a vacancy-history helper later rather than premature query complexity now

### `portfolio_health_snapshot`

This is a scan-heavy but still manageable summary RPC.

Strengths:
- single aggregate row
- tenant-aware scope guard
- broad existing account indexes on payments, requests, and work orders

Main risk:
- multiple conditional aggregate passes over account payments
- multiple counts over requests and work orders for status/aging buckets
- repeat repair detection groups recent requests by property

Hardening impact:
- benefits directly from `payments_account_unpaid_due_idx`
- benefits indirectly from `maintenance_requests_account_status_created_idx` on status-window request counts

Deferred:
- broader work-order status+updated index was left out of this pass because the existing baseline still covers part of that surface and the additional write cost is less justified without captured plans

### `contractor_work_order_cards`

This is the simplest query in the set.

Strengths:
- direct `auth.uid()` contractor filter
- optional `p_work_order_ids` narrowing
- no expensive unions or aggregates

Main risk:
- there is no direct index on `work_orders.contractor_user_id`
- as work orders grow, contractor card lookups can degrade into wider scans than necessary

Hardening added now:
- `work_orders_contractor_user_idx on public.work_orders(contractor_user_id)`

Why:
- this directly matches the core contractor card predicate and is the cleanest missing index in the current review

Deferred:
- `(contractor_user_id, status, updated_at desc)` was deferred because the current card RPC does not filter by status or sort by update time

## Lightweight Contracts Protected In Tests

The fast source-level performance guard test protects:
- hard caps on `command_center_items`, `attention_center_items`, and `portfolio_attention_items`
- the current branch-capped union shape for `command_center_items` and `attention_center_items`
- tenant/contractor scoping on the most important read paths
- presence of the current core baseline index definitions these RPCs depend on
- presence of the new additive high-signal index overlay in `supabase/performance_rpc_indexes.sql`

That guard is intentionally not a benchmark. It exists to catch the kinds of migration drift that silently remove a cap or delete a supporting index while functional tests still pass.

## Top Remaining Performance Risks

1. `command_center_items` still scans many operational domains even though the final union now trims branch families earlier.
2. `attention_center_items` still has the same broad source coverage and may eventually justify deeper structural simplification.
3. Work-order aging and stale-item branches still lack a dedicated status+updated-at expression index.
4. Unread notification branches may eventually justify an unread-only account index if alert volume grows.
5. The next tuning pass should use captured staging/production EXPLAIN plans, because local plan capture from this shell was blocked by environment tooling limits.
