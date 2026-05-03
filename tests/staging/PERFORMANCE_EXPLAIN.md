# Staging Performance EXPLAIN

This is the lightweight staging-side procedure for evaluating the remaining deferred RPC index candidates without introducing a benchmark harness.

It is intentionally narrow. The goal is to answer two questions with real plan evidence:

1. Do unread notifications need a dedicated unread partial index?
2. Do work-order status/time branches need one more selective expression index?

## Files

- [supabase/performance_staging_explain.sql](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/performance_staging_explain.sql)
- [tests/integration/PERFORMANCE_REVIEW.md](/mnt/c/Users/Home/oasisrentalmanagementapp/tests/integration/PERFORMANCE_REVIEW.md)
- [tests/staging/PERFORMANCE_EXPLAIN_RESULTS_TEMPLATE.md](/mnt/c/Users/Home/oasisrentalmanagementapp/tests/staging/PERFORMANCE_EXPLAIN_RESULTS_TEMPLATE.md)

## How To Run

1. Choose a real staging account with meaningful notifications and active work orders.
2. Open [supabase/performance_staging_explain.sql](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/performance_staging_explain.sql).
3. Replace the placeholder account id with the staging account id.
4. Run the `EXPLAIN (ANALYZE, BUFFERS, VERBOSE)` statements in the staging SQL editor or with `psql`.
5. Save the plan output before making any candidate-index change.
   Use [tests/staging/PERFORMANCE_EXPLAIN_RESULTS_TEMPLATE.md](/mnt/c/Users/Home/oasisrentalmanagementapp/tests/staging/PERFORMANCE_EXPLAIN_RESULTS_TEMPLATE.md) to record the before/after evidence.
6. If one candidate looks justified, apply only that candidate in staging.
7. Re-run the exact same EXPLAIN statements and compare.

## What To Look For

Unread notifications candidate:
- Does the query still use a broad scan on `notifications` despite the existing `idx_notifications_account_created`?
- Are there many rows removed by filter on `is_read`?
- Is there a sort step or heap scan cost that stays high for a busy account even with `limit 200`?

Work-order status/time candidate:
- Do the stalled / recently-updated branches fall back to broad scans or bitmap heap scans on `work_orders`?
- Is the planner unable to combine the existing `account_id`, `status`, and time predicates cleanly?
- Does the plan show expensive filtering on `coalesce(updated_at, created_at)` after pulling many rows?

## Candidate Decision Rules

Add the unread notifications index only if:
- the unread branch is a visible hotspot in staging plans, and
- the current `idx_notifications_account_created` leaves substantial row filtering on `is_read`

Preferred candidate if justified:

```sql
create index concurrently if not exists notifications_account_unread_created_idx
  on public.notifications(account_id, created_at desc)
  where coalesce(is_read, false) = false;
```

Add the extra work-order index only if:
- at least one of the stalled / recent / ack-overdue branches shows broad scanning or post-filter work that the current baseline indexes do not avoid, and
- the benefit is visible on the actual staging account plans

Preferred candidate if justified:

```sql
create index concurrently if not exists work_orders_account_status_activity_idx
  on public.work_orders(
    account_id,
    lower(coalesce(status, '')),
    coalesce(updated_at, created_at) desc
  );
```

## Current Recommendation

- unread notifications: deferred pending staging EXPLAIN evidence
- extra work-order status/activity index: deferred pending staging EXPLAIN evidence

No additional index should be added until one of those candidates clearly improves the captured staging plans.
