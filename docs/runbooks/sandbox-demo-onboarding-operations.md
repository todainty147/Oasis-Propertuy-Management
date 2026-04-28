# Sandbox Demo Onboarding Operations

Use this runbook to operate OASIS demo/sandbox accounts safely.

This runbook documents the current support process around existing demo behavior. It does not change signup, seed, reset, expiry, billing, or account lifecycle behavior.

## Current Demo Contract

OASIS supports demo accounts through `account_sandbox_profiles`.

Current behavior:

- self-serve signup can mark a new landlord account as `mode = 'demo'`
- demo accounts receive a `demo_expires_at` timestamp, currently created as 14 days after signup
- signup attempts to seed deterministic demo fixtures
- the landlord onboarding page can seed fixtures if the first attempt failed
- the landlord onboarding page can reset demo fixtures back to the default seeded state
- existing production accounts remain production when no sandbox profile marks them as demo

Current limitation:

- demo expiry is metadata and guidance, not an automated archive/delete job
- account-level archival is not implemented
- support-side remote reseed is limited to the same existing account-scoped seed/reset RPCs

## Ownership

| Role | Responsibility |
| --- | --- |
| Support owner | Confirm demo account identity, handle customer/demo requests, record reseed/reset evidence. |
| Product owner | Decide whether a demo should be extended, converted, archived, or left to expire naturally. |
| Engineering owner | Investigate failed seed/reset behavior, schema drift, or unsafe data state. |
| Security owner | Review any request that could blur demo and production account boundaries. |

If a single person holds multiple roles, record that in the evidence.

## Demo Expiry Policy

The current launch policy is soft expiry:

- demo accounts are intended for short evaluation and test use
- `demo_expires_at` is the operational review date
- expiry does not currently delete or disable account data automatically
- after expiry, support should review whether the account should be reset, extended, converted to production, or disabled through normal account lifecycle tooling

Recommended handling:

| Condition | Action |
| --- | --- |
| Active prospect still evaluating | Product/support may extend the review date manually after approval. |
| Internal QA/demo account | Reset when needed; archive only when no longer useful. |
| Demo converted to real customer | Treat as a production conversion decision; do not purge fixtures until customer data state is understood. |
| Demo abandoned after expiry | Mark for archive/disable review rather than deleting immediately. |
| Demo contains real customer data | Stop treating it as disposable; escalate to product/engineering before reset or purge. |

Do not automatically purge expired demos until an archive/disable workflow exists and has been tested.

## Safe Reseed / Reset Workflow

Use reset only for accounts confirmed as demo.

1. Confirm the account id and account name.
2. Confirm `account_sandbox_profiles.mode = 'demo'`.
3. Confirm the requester is authorized to reset the demo.
4. Check whether the demo contains real user-entered data that should be preserved.
5. Prefer the onboarding page reset button when the account owner can self-serve.
6. If support must inspect directly, use read-only SQL first.
7. If engineering must run a reset, use only the existing `reset_demo_account(account_id)` RPC.
8. Verify fixture counts after reset.
9. Record the reset in [sandbox-demo-evidence-template.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/templates/sandbox-demo-evidence-template.md).

Read-only status check:

```sql
select
  asp.account_id,
  a.name as account_name,
  asp.mode,
  asp.lifecycle_status,
  asp.seeded_fixture_version,
  asp.demo_expires_at,
  asp.last_seeded_at,
  asp.reset_requested_at,
  asp.updated_at
from public.account_sandbox_profiles asp
join public.accounts a on a.id = asp.account_id
where asp.account_id = '<account-id>'::uuid;
```

Fixture count check:

```sql
select
  a.id as account_id,
  a.name as account_name,
  count(distinct p.id) as properties,
  count(distinct t.id) as tenants,
  count(distinct c.id) as contractors,
  count(distinct pay.id) as payments,
  count(distinct mr.id) as maintenance_requests,
  count(distinct wo.id) as work_orders
from public.accounts a
left join public.properties p on p.account_id = a.id
left join public.tenants t on t.account_id = a.id
left join public.contractors c on c.account_id = a.id
left join public.payments pay on pay.account_id = a.id
left join public.maintenance_requests mr on mr.account_id = a.id
left join public.work_orders wo on wo.account_id = a.id
where a.id = '<account-id>'::uuid
group by a.id, a.name;
```

Engineering-only reset command:

```sql
select *
from public.reset_demo_account('<account-id>'::uuid);
```

Do not call `purge_demo_account_fixtures(...)` directly in support workflows. Use `reset_demo_account(...)` so the seed/reset lifecycle remains consistent.

## First-Value Onboarding Checks

A demo account is first-value ready when a reviewer can show the account’s operational story in under five minutes.

Minimum checks:

- Dashboard loads and shows operational summary cards.
- Properties page shows at least one occupied and one vacant property.
- Tenants page shows at least one tenant linked to a property.
- Finance page shows due/overdue payment context.
- Maintenance Inbox shows at least one open or waiting maintenance issue.
- Work order flow has at least one assigned work order or a path to create one.
- Command Center or Portfolio Health shows a meaningful next-step surface when the account plan allows it.
- Landlord onboarding page shows demo fixture status and reset capability.

If any of these fail, use the reseed/reset workflow before using the account for a sales demo, QA run, or onboarding rehearsal.

## When Not To Reset

Do not reset a demo account when:

- the account has been converted to production or billing is active
- a customer has entered real data that should be preserved
- the requester cannot prove account ownership/authorization
- the account mode is missing or `production`
- there is an open security, billing, or data integrity investigation
- the reset would destroy evidence needed for a support ticket

Escalate to engineering/product if any of these conditions apply.

## Suggested Future Tooling

These are future improvements, not current capabilities:

- root/support demo account list with expiry filters
- explicit extend-demo action
- archive/disable workflow for abandoned demo accounts
- export-before-reset option
- account-level demo evidence timeline
- richer fixture versions for document, signature, marketplace, and tenant portal walkthroughs

## Related Docs

- [ACCOUNT_SANDBOX_PROFILES.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/ACCOUNT_SANDBOX_PROFILES.md)
- [account_sandbox_profiles.sql](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/account_sandbox_profiles.sql)
- [account_sandbox_demo_seed.sql](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/account_sandbox_demo_seed.sql)
- [support-triage-workflow.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/support-triage-workflow.md)
- [sandbox-demo-evidence-template.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/templates/sandbox-demo-evidence-template.md)

