# Staging EXPLAIN Results Template

Use this file as the checklist/template when you run the staging EXPLAIN pass from [supabase/performance_staging_explain.sql](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/performance_staging_explain.sql).

Fill in the actual account id, capture date, and the key before/after findings for each candidate. The goal is to make the decision to add, defer, or reject an index auditable later.

## Capture Metadata

- Environment:
- Capture date:
- Account id used:
- Account size notes:
  - unread notifications:
  - active/open work orders:
  - blocked/stalled work orders:

## Candidate 1: Unread Notifications

Query:
- unread notifications branch shared by `command_center_items` / `attention_center_items`

Existing support:
- `idx_notifications_account_created`

Candidate:

```sql
create index concurrently if not exists notifications_account_unread_created_idx
  on public.notifications(account_id, created_at desc)
  where coalesce(is_read, false) = false;
```

Before:
- scan type:
- rows examined:
- rows removed by filter:
- sort present:
- total execution time:
- buffers:

After:
- scan type:
- rows examined:
- rows removed by filter:
- sort present:
- total execution time:
- buffers:

Decision:
- accepted / deferred / rejected

Reason:

## Candidate 2: Work Order Status / Activity

Queries:
- acknowledgement overdue branch
- stalled/blocked branch
- recently updated open branch

Existing support:
- `work_orders_account_status_idx`
- `work_orders_ack_due_idx`

Candidate:

```sql
create index concurrently if not exists work_orders_account_status_activity_idx
  on public.work_orders(
    account_id,
    lower(coalesce(status, '')),
    coalesce(updated_at, created_at) desc
  );
```

Before:
- scan type:
- rows examined:
- rows removed by filter:
- sort present:
- total execution time:
- buffers:

After:
- scan type:
- rows examined:
- rows removed by filter:
- sort present:
- total execution time:
- buffers:

Decision:
- accepted / deferred / rejected

Reason:

## Full Feed Sanity Check

Queries:
- `command_center_items(account_id, 80)`
- `attention_center_items(account_id, 60)`

Before:
- notable plan nodes:
- total execution time:
- buffers:

After:
- notable plan nodes:
- total execution time:
- buffers:

Behavior check:
- ordering unchanged:
- row count unchanged:
- no new broad sort/regression:

## Final Recommendation

- unread notifications:
- work order status/activity:
- any adjacent surprise hotspot discovered:

## Follow-Up Repo Changes

- SQL file to change:
- performance review update needed:
- contract test update needed:
