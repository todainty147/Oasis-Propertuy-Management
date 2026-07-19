# Deposit Pack Release Runbook

Procedures for managing the `deposit_dispute_pack` release state after Gate-B1G.

**Guard summary**: A BEFORE trigger on `deposit_pack_release_registry` and
`deposit_pack_release_transitions` blocks all direct writes from every role while
the guard is enabled. The only authorised write path is `transition_deposit_pack_release_state()`.
The guard is bypassed only by `SET session_replication_role = 'replica'`, which requires
`rolreplication=true` — currently only the `postgres` database user has this.

---

## Procedure 1 — Normal release state transition

Use this to advance or change the release state (e.g., `internal_preview → production`).

**Who**: Root operator (member of the root account).
**When**: Planned release, scheduled suspension, or recovery from suspension.
**How**: Call the RPC via the authenticated Supabase client or directly from the app.

**Allowed state machine**:
- `internal_preview → production` (go live)
- `production → suspended` (emergency suspend)
- `suspended → production` (recover)
- `suspended → internal_preview` (roll back to preview)

**Example (JavaScript)**:
```js
const { data, error } = await supabase.rpc("transition_deposit_pack_release_state", {
  p_pack_type:         "deposit_dispute_pack",
  p_new_state:         "production",
  p_release_reference: "gate_b2_staging_release_v1",
  p_rationale:         "Gate-B2 staging release approved by PO sign-off 2026-07-18.",
  p_pack_version:      "gate_b2_v1",
});
if (error) throw error;
console.log("Transitioned:", data);
```

**What it does**:
1. Validates root membership.
2. Validates state machine transition is permitted.
3. Opens a per-transaction nonce in `_guard.transition_authorisation`.
4. Inserts an immutable event into `deposit_pack_release_transitions` (trigger validates nonce).
5. Updates `deposit_pack_release_registry` (trigger validates nonce).
6. Returns `{ idempotent, pack_type, previous_state, release_state, pack_version, release_reference, approved_by }`.

**Idempotency**: Calling with the same `release_reference` and `new_state` is safe — returns `{ idempotent: true }` with no second ledger row. Calling with the same `release_reference` but a different `new_state` raises `P0406`.

---

## Procedure 2 — Emergency suspension via RPC

Use this when the Deposit Pack must be taken offline immediately.

**Who**: Root operator.
**When**: Detected error, legal hold, or safety concern.
**State required**: Pack must currently be in `production`.

```js
const { data, error } = await supabase.rpc("transition_deposit_pack_release_state", {
  p_pack_type:         "deposit_dispute_pack",
  p_new_state:         "suspended",
  p_release_reference: `emergency-suspend-${Date.now()}`,
  p_rationale:         "Emergency suspension: <reason and ticket reference here>.",
  p_pack_version:      "gate_b2_v1",
});
```

**Effect**: All non-root export attempts immediately receive `P0501 — currently suspended`.
Root operators also receive `P0501`. There is no grace period.

**Recovery**: Run Procedure 1 with `p_new_state: "production"` or `p_new_state: "internal_preview"`.

---

## Owner-level bypass paths (security disclosure)

B1G prevents accidental or application-level privileged writes. **It does not claim to defeat a deliberate database owner.**

A role with ownership or system-level privileges can bypass the guard through several paths. Each is documented here so operators know what actions require out-of-band audit trails.

| Bypass path | Who can use it | What it bypasses | Leaves ledger record? |
|---|---|---|---|
| `SET session_replication_role = 'replica'` | postgres (rolreplication=true) | ALL triggers on both tables | No |
| `ALTER TABLE … DISABLE TRIGGER trg_b1g_registry_write_guard` | postgres (table owner) | That trigger only; other triggers still fire | No |
| Direct `INSERT INTO _guard.transition_authorisation` + `UPDATE` | postgres (table owner) | Nonce validation is satisfied; guard permits the write | No |
| `ALTER FUNCTION _guard.tg_registry_write_guard() SECURITY INVOKER` | postgres (function owner) | Trigger no longer runs as postgres; access depends on caller role | No |
| `DROP TRIGGER` / `DROP FUNCTION` / `DROP SCHEMA _guard` | postgres (object owner) | Guard is removed entirely | No |

**In all cases**: the write succeeds but leaves **no ledger row** in `deposit_pack_release_transitions`. Any direct manipulation must be documented in an incident record and followed by a normal RPC call with `p_rationale` referencing the incident.

The intended day-to-day path is Procedure 1. Break-glass use of `session_replication_role` (Procedure 3) is the sole documented emergency mechanism.

---

## Procedure 3 — Break-glass state correction (outside the RPC)

Use ONLY when the RPC is unavailable or the state machine itself is broken and must be
corrected without going through the normal path.

**Requires**: Direct `postgres` database access (local: `DB_BOOTSTRAP_URL`; staging/production:
a database break-glass session with `rolreplication=true`).
**Warning**: This bypasses the authorisation nonce and leaves **no ledger record**. The
correction must be documented externally (incident ticket, Slack thread) before execution.
**Never use for production state changes that have a legitimate RPC path.**

### Step 1 — Confirm the postgres role has REPLICATION privilege
```sql
SELECT rolname, rolreplication FROM pg_roles WHERE rolname = 'postgres';
-- Must show rolreplication = t
```

### Step 2 — Disable triggers for this session
```sql
SET session_replication_role = 'replica';
-- All triggers are now disabled for this psql session.
```

### Step 3 — Apply the correction
```sql
-- Example: restore internal_preview after a direct-write incident.
UPDATE public.deposit_pack_release_registry
SET release_state = 'internal_preview',
    updated_at    = now()
WHERE pack_type = 'deposit_dispute_pack'
  AND release_state = '<incorrect_current_state>';

-- Confirm:
SELECT pack_type, release_state, pack_version, updated_at
FROM public.deposit_pack_release_registry
WHERE pack_type = 'deposit_dispute_pack';
```

### Step 4 — Re-enable triggers
```sql
RESET session_replication_role;
-- Triggers active again.
```

### Step 5 — Manually record the correction
The break-glass correction leaves no ledger row. Record what happened, who executed it,
and why in the relevant incident document and in the `p_rationale` of the next normal RPC
call when the RPC path is restored.

---

## Local development reset

If the local database needs to be wiped completely (e.g., to re-run bootstrap with a clean slate):

```bash
npm run db:bootstrap
# This calls supabase db reset, drops and recreates the public schema,
# re-applies all overlays including gate_b1g_release_guard.sql, and
# re-seeds deposit_dispute_pack at internal_preview.
# The guard trigger is reinstalled automatically.
```

The test suite cleanup helper (`localPsqlBreakGlassDelete`) also uses
`SET session_replication_role = 'replica'` and is only available to the
`postgres` user in the local Docker Supabase environment.

---

## Defect disclosure: export-authorisation `pack_version` — Gate-B1V (2026-07-18)

**Status**: Corrected by Gate-B1V (`gate_b1v_export_version_integrity.sql`).
Historic rows preserved unedited; this note is the permanent disclosure record.

### What happened

`prepare_deposit_dispute_pack_export` read `pack_version` from the
`deposit_dispute_packs` table column rather than from the registry row.
For packs whose `pack_version` column is `NULL` (all pre-Gate-B packs),
the function applied `coalesce(NULL, 'pre_gate_b')`, producing the literal
`pre_gate_b` regardless of what the registry held. The registry version was
read correctly into `v_registry_version` but was returned in the JSON payload
only, never inserted into `deposit_pack_export_authorisations`.

### Affected rows — `deposit_pack_export_authorisations`

| id | release_mode | pack_version | authorised_at (UTC) |
|---|---|---|---|
| `8e5276b0-725a-439f-95ac-f8c586714888` | `internal_preview` | `pre_gate_b` | 2026-07-17 18:11:32 |
| `814276a1-176f-45dd-a27e-5fe5d78beaaa` | `production` | `pre_gate_b` | 2026-07-18 10:50:40 |

Defect period: `2026-07-17 18:11:32 UTC` → `2026-07-18 10:50:40 UTC`.
Both rows are for `pack_type = deposit_dispute_pack`.
No other pack types are present in the table.

### Transition ledger — CLEAN

The release transition event is unaffected. `transition_deposit_pack_release_state`
takes `pack_version` as an explicit caller-supplied parameter; it does not read
from the pack record column.

| id | pack_version | new_release_state | approved_at (UTC) |
|---|---|---|---|
| `3d298390-59d3-4eb4-a809-0c975e11d232` | `gate_b1_v1` | `production` | 2026-07-18 10:38:08 |

The birth-certificate event (the authorisation that advanced the pack to production)
carries the correct version. Only the per-print export-authorisation rows are wrong.

### Correction

`gate_b1v_export_version_integrity.sql` (Gate-B1V, committed 2026-07-19):
- Removes `v_pack_version_col` and `v_historical_version` from the function.
- Step 4 reads `release_state` and `pack_version` atomically from the same
  registry row used for the state gate.
- The INSERT into `deposit_pack_export_authorisations` now uses `v_registry_version`.
- All rows written after this hotfix carry the registry version (e.g. `gate_b1_v1`).

### Post-B1V acceptance proof — CONFIRMED (2026-07-19)

A second production print was executed after deploying Gate-B1V. The new
authorisation row confirms the fix is working in production:

| id | pack_version | release_mode | authorised_at (UTC) |
|---|---|---|---|
| `c0999f06-d738-449a-86aa-f30549b2bcbb` | `gate_b1_v1` | `production` | 2026-07-19 17:09:53 |

The table now holds 3 rows: the 2 defective historic rows and 1 correct post-B1V row.

### Historic rows

The two defective rows are preserved unedited in the append-only table.
They must not be deleted or corrected. Their `pack_version = pre_gate_b` is
the accurate record of what the system wrote at that time.

---

## Ledger reference

| Table | Insert | Update | Delete |
|---|---|---|---|
| `deposit_pack_release_registry` | Allowed at `internal_preview` only | RPC only (nonce) | Never |
| `deposit_pack_release_transitions` | RPC only (nonce) | Never | Never |

Break-glass (`session_replication_role = 'replica'`) bypasses ALL trigger rules.
Only `postgres` (rolreplication=true) can set it. `service_role`, `authenticated`,
and `anon` do not have this privilege.
