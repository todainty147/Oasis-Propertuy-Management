-- Staging EXPLAIN capture kit for the remaining deferred RPC index candidates.
-- Replace the account id placeholder with a real, busy staging account before use.
--
-- Recommended execution:
-- 1. Run each EXPLAIN once on the current schema.
-- 2. Save the text/JSON output alongside the date and account id used.
-- 3. Only if a candidate looks promising, test the candidate index in staging first.
-- 4. Re-run the same EXPLAIN and compare scan type, buffer hits/reads, row counts, and sort behavior.

-- Replace before running.
-- Example: 11111111-1111-1111-1111-111111111111

-- 1) Unread notifications branch shared by command_center_items / attention_center_items.
explain (analyze, buffers, verbose)
select
  n.id,
  n.created_at,
  n.title,
  n.link_path
from public.notifications n
where n.account_id = '00000000-0000-0000-0000-000000000000'::uuid
  and coalesce(n.is_read, false) = false
order by n.created_at desc
limit 200;

-- 2) Work-order ack-overdue branch.
explain (analyze, buffers, verbose)
select
  w.id,
  w.acknowledgement_due_at,
  coalesce(w.updated_at, w.created_at) as activity_at
from public.work_orders w
where w.account_id = '00000000-0000-0000-0000-000000000000'::uuid
  and lower(coalesce(w.status, '')) in ('assigned', 'przypisane')
  and coalesce(lower(w.acknowledgement_status), 'pending') <> 'acknowledged'
  and w.acknowledgement_due_at is not null
  and w.acknowledgement_due_at < now()
order by coalesce(w.updated_at, w.created_at) desc
limit 200;

-- 3) Work-order stalled / blocked status-time branch.
explain (analyze, buffers, verbose)
select
  w.id,
  lower(coalesce(w.status, '')) as normalized_status,
  coalesce(w.updated_at, w.created_at) as activity_at
from public.work_orders w
where w.account_id = '00000000-0000-0000-0000-000000000000'::uuid
  and lower(coalesce(w.status, '')) in ('in_progress', 'w trakcie', 'blocked', 'zablokowane')
  and coalesce(w.updated_at, w.created_at) <= now() - interval '72 hours'
order by coalesce(w.updated_at, w.created_at) desc
limit 200;

-- 4) Work-order recently-updated-open branch.
explain (analyze, buffers, verbose)
select
  w.id,
  lower(coalesce(w.status, '')) as normalized_status,
  coalesce(w.updated_at, w.created_at) as activity_at
from public.work_orders w
where w.account_id = '00000000-0000-0000-0000-000000000000'::uuid
  and lower(coalesce(w.status, '')) in ('assigned', 'przypisane', 'in_progress', 'w trakcie')
  and coalesce(w.updated_at, w.created_at) >= now() - interval '72 hours'
order by coalesce(w.updated_at, w.created_at) desc
limit 200;

-- 5) Actual feed entry-point sanity check.
-- Useful to confirm the full RPC still caps and sorts cleanly after any staged candidate index test.
explain (analyze, buffers, verbose)
select *
from public.command_center_items(
  '00000000-0000-0000-0000-000000000000'::uuid,
  80
);

explain (analyze, buffers, verbose)
select *
from public.attention_center_items(
  '00000000-0000-0000-0000-000000000000'::uuid,
  60
);
