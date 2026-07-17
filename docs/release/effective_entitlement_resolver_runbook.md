# Effective Entitlement Resolver — Operator Runbook

**Feature:** Gate-B-ENT
**SQL file:** `supabase/gate_b_ent_effective_feature_resolver.sql`
**Applied after:** `gate_b1_deposit_release_registry.sql`

---

## 1. Overview

`account_has_effective_feature(account_id, feature_key)` is the single authoritative
resolver for all server-side feature access checks. It is a SECURITY DEFINER SQL function
that runs as the postgres role and bypasses RLS.

Every new release gate **must** call this function. Do not use `account_has_feature()` — it
is a legacy function with two documented security gaps (see §8).

---

## 2. Resolver Precedence

The following branches are evaluated in order; the first match wins:

| Priority | Condition | Result |
|----------|-----------|--------|
| 1 | `account_id` is NULL | `false` — deny |
| 2 | Feature key not in catalogue (returns NULL) | `false` — deny-by-default |
| 3 | `account_feature_flags` row with `enabled = false` | `false` — **explicit deny overrides plan** |
| 4 | `account_feature_flags` row with `enabled = true` | `true` — explicit grant overrides plan |
| 5 | Feature is `flag_only` and no flag row exists | `false` — deny |
| 6 | `account_plan_rank(account_subscription_plan())` ≥ min_plan rank | `true` / `false` |

**Critical:** Priority 3 (explicit deny) evaluates **before** the plan rank check. A Growth
or Pro account with an `enabled = false` flag is denied regardless of plan tier.

---

## 3. Feature Catalogue

The governed catalogue is embedded in `account_feature_min_plan(text)`. It has **79 entries**:

| Plan tier | Count | Notes |
|-----------|-------|-------|
| `starter` | 7 | Core infrastructure available to all active plans |
| `growth` | 38 | Includes evidence vault, compliance, deposit pack |
| `pro` | 19 | Advanced AI, PDF export, Poland advanced features |
| `operator_agency` | 3 | AI security copilot, natural language query, audit summaries |
| `flag_only` | 12 | All HMRC MTD features — require explicit flag regardless of plan |
| **Total** | **79** | |

Two server-side keys are in the SQL catalogue but not in `src/lib/entitlements.js`:
- `maintenance_evidence_pack` (growth)
- `document_extraction` (growth)

These are used in server RPCs only. The client `hasFeature()` function cannot reference them
and defaults to `'starter'` if asked — this is a display gap, not a security hole.

Ten growth features in the SQL catalogue are not in the client `PLAN_ENTITLEMENTS.growth`
array (e.g. `mtd_property_finance_sync`, `compliance_safe_tenant_acknowledgement`,
`evidence_vault_tenant_sharing`). Client-side `getFeatureMinimumPlan()` returns `'starter'`
for these. Server-side access is correct because `account_has_effective_feature()` is
authoritative.

---

## 4. Effective vs Billed Plan

`account_subscription_plan(account_id)` resolves the **effective** plan, not the billing plan.

Resolution order (highest priority first):
1. Root accounts → always `'operator_agency'`
2. Sentinel states (billing_locked, trial_expired, etc.) → as stored
3. Active `account_entitlements` row (`source = 'launch_offer'` or `'manual_admin'`) → `effective_plan`
4. `accounts.subscription_plan` column (billed plan)

A founder who pays Starter but has an active entitlement row with `effective_plan = 'pro'`
resolves to `'pro'`. The billed plan is irrelevant for feature gating.

---

## 5. Founder20 / Launch-Offer Behaviour

Founder accounts get a row in `account_entitlements` with:
- `source = 'launch_offer'`
- `effective_plan = 'pro'`
- `billed_plan = 'starter'`
- `ends_at = starts_at + INTERVAL '12 months'`
- `is_active = true`

`account_subscription_plan()` picks up this row via a lateral join:

```sql
where ae.is_active = true
  and ae.starts_at <= now()
  and (ae.ends_at IS NULL OR ae.ends_at > now())
order by account_plan_rank(ae.effective_plan) desc
limit 1
```

After `ends_at` passes, the row no longer matches → plan falls back to billing plan
(`starter`). The founder's Pro features are revoked automatically.

---

## 6. Expiry Semantics

| `ends_at` value | Behaviour |
|-----------------|-----------|
| `NULL` | Perpetual — never expires |
| Future timestamp | Active until that moment |
| Past timestamp | Expired — row is ignored |

`is_active = false` also disqualifies a row regardless of timestamps.

---

## 7. Account-Level Grants and Denies

Grants and denies are stored in `account_feature_flags(account_id, feature_key, enabled)`.

**To grant access below the required plan:**

```sql
insert into public.account_feature_flags (account_id, feature_key, enabled, created_by)
values ('<account_id>', 'evidence_vault_dispute_pack', true, auth.uid());
```

**To deny access despite plan entitlement:**

```sql
insert into public.account_feature_flags (account_id, feature_key, enabled, created_by)
values ('<account_id>', 'evidence_vault_dispute_pack', false, auth.uid());
```

**To remove a flag (restores plan-based access):**

```sql
delete from public.account_feature_flags
where account_id = '<account_id>'
  and feature_key = 'evidence_vault_dispute_pack';
```

---

## 8. Diagnosing Access Issues

### Operator audit query (counts only — no PII)

```sql
-- Accounts by effective plan
select public.account_subscription_plan(a.id) as eff_plan,
       count(*) as account_count
from public.accounts a
where a.is_root = false
group by 1
order by account_plan_rank(eff_plan::text) desc nulls last;

-- Active and expired founder entitlements
select
  count(*) filter (where is_active and (ends_at is null or ends_at > now())) as active_founders,
  count(*) filter (where is_active and ends_at <= now())                      as expired_founders,
  count(*) filter (where not is_active)                                        as inactive_entitlements
from public.account_entitlements
where source = 'launch_offer';

-- Deposit pack access breakdown
select
  count(*) filter (where public.deposit_pack_account_has_entitlement(a.id))       as has_deposit_access,
  count(*) filter (where not public.deposit_pack_account_has_entitlement(a.id))   as no_deposit_access
from public.accounts a
where a.is_root = false;

-- Starter-plan accounts with Deposit access (should come from explicit flag or founder)
select count(*)
from public.accounts a
where a.is_root = false
  and a.subscription_plan = 'starter'
  and public.deposit_pack_account_has_entitlement(a.id);

-- Anomalous: active founder entitlements where account is NOT resolving to pro
select count(*)
from public.account_entitlements ae
where ae.source = 'launch_offer'
  and ae.is_active = true
  and (ae.ends_at is null or ae.ends_at > now())
  and ae.effective_plan = 'pro'
  and public.account_subscription_plan(ae.account_id) != 'pro';
```

### Diagnosing a founder account not getting Pro access

1. Check entitlement exists and is active:
   ```sql
   select id, effective_plan, billed_plan, starts_at, ends_at, is_active
   from public.account_entitlements
   where account_id = '<id>' and source = 'launch_offer';
   ```
2. Verify `ends_at > now()` and `is_active = true`.
3. Check for an explicit deny flag overriding grant:
   ```sql
   select feature_key, enabled from public.account_feature_flags where account_id = '<id>';
   ```
4. Verify the resolver returns the expected plan:
   ```sql
   select public.account_subscription_plan('<id>');
   ```

---

## 9. Downgrade Effects

If a founder's `account_entitlements` row expires:
- `account_subscription_plan()` returns the billing plan (e.g. `'starter'`).
- `account_has_effective_feature()` will deny all Growth+ features.
- The account loses access immediately (next request, no cache).

If a subscription plan is downgraded (billing change):
- Plan-gated features above the new tier are denied on the next resolver call.
- Explicit flag grants (`enabled = true`) continue to work regardless of plan.

---

## 10. Rules for New Gates

1. **Use `account_has_effective_feature(account_id, 'your_feature_key')` — always.**
2. Register the feature key in `account_feature_min_plan()` in `gate_b_ent_effective_feature_resolver.sql`.
3. Add the key to `ENTITLEMENT_FEATURES` in `src/lib/entitlements.js` and the correct tier array.
4. **Never use `account_has_feature()` for new gates.** It is legacy and deny-unsafe (see §11).
5. Never gate access in the frontend only. The server RPC or RLS policy is the authoritative check.

---

## 11. Legacy `account_has_feature()` — DO NOT USE FOR NEW GATES

`account_has_feature(account_id, feature_key)` has two gaps:

**Gap 1 — No explicit deny:**
`enabled = false` flag rows are ignored. A Growth account with `enabled = false` still
passes the plan rank check and is **incorrectly allowed**. `account_has_effective_feature()`
fixes this (priority 3 above).

**Gap 2 — Unregistered key fallthrough:**
`account_feature_required_plan()` returns `'starter'` for unknown keys. Any Starter account
is then allowed for an unregistered feature. `account_has_effective_feature()` denies
unregistered keys (priority 2 above).

**Safe existing callers (hardcoded registered keys):**
- `automation_playbooks.sql` — `'playbooks'` (Pro, registered)
- `command_center_items.sql` — `'command_center'` (Growth, registered)
- `assert_account_feature_access()` — called with dynamic key; safe only if all callers
  use registered keys. Add new callers through `account_has_effective_feature()` instead.

**Do not globally replace `account_has_feature()` without a full impact audit.**
The callers listed above pass hardcoded registered keys and are safe as-is.
