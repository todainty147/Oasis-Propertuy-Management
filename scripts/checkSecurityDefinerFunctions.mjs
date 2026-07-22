#!/usr/bin/env node
/**
 * SEC-A2: Static SECURITY DEFINER definition-safety CI check.
 *
 * Parses every file in OVERLAY_SEQUENCE (from dbApplyRepoSql.js) in apply
 * order and folds effective state for each SECURITY DEFINER function, then
 * checks two criteria:
 *
 *   C1 — A function whose last CREATE OR REPLACE falls after the hardening
 *        overlay (supabase_linter_security_hardening.sql) is not covered by
 *        that file's bulk ALTER and must pin search_path explicitly.
 *
 *   C2 — A SECURITY DEFINER function must not be callable by anon / PUBLIC
 *        unless it is explicitly listed in the allowlist.
 *
 * MODEL LIMITATION: The bulk ALTER/REVOKE inside supabase_linter_security_
 * hardening.sql runs as dynamic SQL over a pg_proc catalog query — this check
 * models its expected effect using synthetic fold events. If that file's
 * selection logic or the re-grant list changes, update HARDENING_FILE and
 * the allowlist to match, then run a scratch-DB (Option-2) reconciliation to
 * confirm the static model still reflects deployed reality.
 *
 * SCOPE: Only files in OVERLAY_SEQUENCE are parsed. Functions defined solely
 * in baseline_schema.sql are pre-hardening by construction and covered by the
 * bulk ALTER; they are not parsed here.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const HARDENING_FILE = 'supabase_linter_security_hardening.sql';
const ALLOWLIST_PATH = join(ROOT, 'security', 'definer_public_execute_allowlist.json');
const APPLY_SQL_PATH = join(ROOT, 'scripts', 'dbApplyRepoSql.js');
const SUPABASE_DIR = join(ROOT, 'supabase');

// ── Dollar-quote stripping ─────────────────────────────────────────────────
// Replaces $tag$…$tag$ bodies with a placeholder so that keywords in function
// bodies (SET search_path, GRANT, etc.) cannot fool the header parser.
// Handles bare $$ and arbitrary tagged variants ($func$, $BODY$, etc.).

export function stripDollarQuotedBodies(sql) {
  let result = '';
  let i = 0;

  while (i < sql.length) {
    if (sql[i] !== '$') {
      result += sql[i++];
      continue;
    }

    // Try to match a dollar-quote delimiter starting at i: $\w*$
    let j = i + 1;
    while (j < sql.length && sql[j] !== '$' && /\w/.test(sql[j])) j++;

    if (j < sql.length && sql[j] === '$') {
      const delim = sql.slice(i, j + 1); // e.g. '$$' or '$func$'
      const closeIdx = sql.indexOf(delim, j + 1);
      if (closeIdx !== -1) {
        // Preserve the delimiters so header-end detection still finds AS $$
        result += delim + ' /* body */ ' + delim;
        i = closeIdx + delim.length;
        continue;
      }
    }

    result += sql[i++];
  }

  return result;
}

// ── SQL file parser ────────────────────────────────────────────────────────
// Returns an array of typed events extracted from a single SQL file.

export function parseSqlFile(sql, fileIndex) {
  const stripped = stripDollarQuotedBodies(sql);
  const events = [];

  // CREATE [OR REPLACE] FUNCTION [public.]name(
  const createRe = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?(\w+)\s*\(/gi;
  let m;
  while ((m = createRe.exec(stripped)) !== null) {
    const funcName = m[1].toLowerCase();

    // Walk past the parameter list (balanced parens)
    let depth = 1;
    let i = m.index + m[0].length; // position after opening (
    while (i < stripped.length && depth > 0) {
      if (stripped[i] === '(') depth++;
      else if (stripped[i] === ')') depth--;
      i++;
    }

    // Header runs from CREATE to AS $...$ (body boundary)
    const afterParams = stripped.slice(i);
    const asMatch = /\bAS\s+\$\w*\$/i.exec(afterParams);
    // Fallback window: enough for any realistic header, short enough to avoid
    // accidentally reading into the next function definition
    const headerEnd = asMatch ? i + asMatch.index : Math.min(i + 600, stripped.length);
    const header = stripped.slice(m.index, headerEnd);

    events.push({
      type: 'create',
      funcName,
      fileIndex,
      securityDefiner: /\bSECURITY\s+DEFINER\b/i.test(header),
      hasInlineSearchPath: /\bSET\s+search_path\b/i.test(header),
    });
  }

  // ALTER FUNCTION [public.]name(...) SET search_path
  const alterRe =
    /ALTER\s+FUNCTION\s+(?:public\.)?(\w+)\s*\([^)]*\)[^;]*?\bSET\s+search_path\b/gi;
  while ((m = alterRe.exec(stripped)) !== null) {
    events.push({ type: 'alter_search_path', funcName: m[1].toLowerCase(), fileIndex });
  }

  // REVOKE {ALL|EXECUTE} ON FUNCTION [public.]name[(params)] FROM role
  const revokeRe =
    /REVOKE\s+(?:ALL(?:\s+PRIVILEGES)?|EXECUTE)\s+ON\s+FUNCTION\s+(?:public\.)?(\w+)\s*(?:\([^)]*\))?\s*FROM\s+(\w+)/gi;
  while ((m = revokeRe.exec(stripped)) !== null) {
    const role = m[2].toLowerCase();
    if (role === 'public' || role === 'anon') {
      events.push({
        type: 'revoke',
        funcName: m[1].toLowerCase(),
        fileIndex,
        fromPublic: role === 'public',
        fromAnon: role === 'anon',
      });
    }
  }

  // GRANT {ALL|EXECUTE} ON FUNCTION [public.]name[(params)] TO role
  const grantRe =
    /GRANT\s+(?:ALL(?:\s+PRIVILEGES)?|EXECUTE)\s+ON\s+FUNCTION\s+(?:public\.)?(\w+)\s*(?:\([^)]*\))?\s*TO\s+(\w+)/gi;
  while ((m = grantRe.exec(stripped)) !== null) {
    const role = m[2].toLowerCase();
    if (role === 'public' || role === 'anon') {
      events.push({
        type: 'grant',
        funcName: m[1].toLowerCase(),
        fileIndex,
        toPublic: role === 'public',
        toAnon: role === 'anon',
      });
    }
  }

  // DROP FUNCTION [IF EXISTS] [public.]name[(params)]
  // Must be detected so the C2 model can distinguish DROP+CREATE (new object,
  // ACLs reset) from CREATE OR REPLACE (existing ACLs preserved).
  const dropRe = /DROP\s+FUNCTION\s+(?:IF\s+EXISTS\s+)?(?:public\.)?(\w+)\s*(?:\([^)]*\))?/gi;
  while ((m = dropRe.exec(stripped)) !== null) {
    events.push({ type: 'drop', funcName: m[1].toLowerCase(), fileIndex });
  }

  return events;
}

// ── Effective state computation ────────────────────────────────────────────
// Folds all events in apply order and models the hardening overlay's bulk
// REVOKE (and selective re-grant) as synthetic events at hardeningIndex.
//
// C1 invariant: lastDefinedAt = position of the *last* CREATE OR REPLACE for
// a given function name. A function born before the hardening overlay but
// replaced after it is NOT covered by the bulk ALTER — C1 applies to it.
//
// C2 invariant: PostgreSQL preserves existing ACLs on CREATE OR REPLACE of the
// same signature. The bulk revoke from the hardening overlay therefore survives
// post-hardening replacements. However, DROP FUNCTION followed by CREATE creates
// a NEW object with default PUBLIC EXECUTE — the revoke does not carry over.
// C2 keys on firstDefinedAt + DROP event detection, not lastDefinedAt.

export function computeEffectiveState(allEvents, hardeningIndex, allowlist) {
  const functions = new Map();

  function getOrCreate(name) {
    if (!functions.has(name)) {
      functions.set(name, {
        name,
        securityDefiner: false,
        firstDefinedAt: Infinity,
        lastDefinedAt: -1,
        lastDroppedAt: undefined, // tracks DROP FUNCTION for C2 new-object detection
        hasSearchPath: false,
        grantHistory: [], // { fileIndex: number, granted: boolean }
      });
    }
    return functions.get(name);
  }

  for (const ev of allEvents) {
    const fn = getOrCreate(ev.funcName);
    switch (ev.type) {
      case 'create':
        if (ev.securityDefiner) fn.securityDefiner = true;
        if (ev.hasInlineSearchPath) fn.hasSearchPath = true;
        fn.firstDefinedAt = Math.min(fn.firstDefinedAt, ev.fileIndex);
        // Correction: use LAST definition position, not first
        fn.lastDefinedAt = Math.max(fn.lastDefinedAt, ev.fileIndex);
        break;
      case 'alter_search_path':
        fn.hasSearchPath = true;
        break;
      case 'drop':
        fn.lastDroppedAt = fn.lastDroppedAt === undefined
          ? ev.fileIndex
          : Math.max(fn.lastDroppedAt, ev.fileIndex);
        break;
      case 'revoke':
        if (ev.fromPublic || ev.fromAnon) {
          fn.grantHistory.push({ fileIndex: ev.fileIndex, granted: false });
        }
        break;
      case 'grant':
        if (ev.toPublic || ev.toAnon) {
          fn.grantHistory.push({ fileIndex: ev.fileIndex, granted: true });
        }
        break;
    }
  }

  const result = new Map();

  for (const [name, fn] of functions) {
    if (!fn.securityDefiner) continue;

    // Collect grant/revoke history plus synthetic events for the hardening overlay.
    // The overlay's dynamic SQL loop: first bulk-REVOKEs public+anon from all
    // pre-existing SECURITY DEFINER functions, then re-GRANTs to allowlisted ones.
    // We model this as two synthetic events at hardeningIndex (and +0.5 for the
    // re-grant so it sorts after the revoke within the same file position).
    const history = [...fn.grantHistory];

    // C2 ACL model — PostgreSQL rule:
    //   CREATE OR REPLACE FUNCTION (same signature) → existing ACLs are PRESERVED.
    //   DROP FUNCTION + CREATE FUNCTION             → new object, ACLs reset to default PUBLIC.
    //
    // A post-hardening DROP (lastDroppedAt >= hardeningIndex) followed by a CREATE
    // (lastDefinedAt >= lastDroppedAt) means the object is genuinely new and does
    // NOT inherit the revoke applied by the hardening overlay.
    const effectivelyNewObject =
      fn.lastDroppedAt !== undefined &&
      fn.lastDroppedAt >= hardeningIndex &&
      fn.lastDefinedAt >= fn.lastDroppedAt;

    if (!effectivelyNewObject && fn.firstDefinedAt < hardeningIndex) {
      // Pre-hardening origin, ACL preserved through CREATE OR REPLACE replacements;
      // the bulk revoke from the hardening overlay still applies.
      history.push({ fileIndex: hardeningIndex, granted: false, synthetic: 'bulk-revoke' });
      if (name in allowlist) {
        // Allowlist re-grant happens after the bulk revoke in the same file
        history.push({ fileIndex: hardeningIndex + 0.5, granted: true, synthetic: 'allowlist-regrant' });
      }
    }
    // else: new post-hardening object (effectivelyNewObject OR firstDefinedAt >= hardeningIndex)
    // → default PUBLIC EXECUTE applies; no synthetic revoke

    // Sort in apply order so later events override earlier ones
    history.sort((a, b) => a.fileIndex - b.fileIndex);

    // Fold: PostgreSQL grants PUBLIC execute by default when a function is created
    let anonCanExecute = true;
    for (const ev of history) {
      anonCanExecute = ev.granted;
    }

    result.set(name, {
      ...fn,
      anonCanExecute,
      isAllowlisted: name in allowlist,
    });
  }

  return result;
}

// ── Criterion checks ───────────────────────────────────────────────────────

export function checkCriteria(state, hardeningIndex) {
  const violations = [];
  if (!state.securityDefiner) return violations;

  // C1: post-hardening SECURITY DEFINER must pin search_path explicitly
  if (state.lastDefinedAt >= hardeningIndex && !state.hasSearchPath) {
    violations.push({
      criterion: 'C1',
      funcName: state.name,
      detail: `last defined at overlay index ${state.lastDefinedAt} (>= hardening index ${hardeningIndex}) without SET search_path`,
    });
  }

  // C2: must not be callable by anon/PUBLIC unless allowlisted
  if (state.anonCanExecute && !state.isAllowlisted) {
    violations.push({
      criterion: 'C2',
      funcName: state.name,
      detail: `callable by anon/PUBLIC with no allowlist entry`,
    });
  }

  return violations;
}

// ── OVERLAY_SEQUENCE loader ────────────────────────────────────────────────

export function loadOverlaySequence() {
  const src = readFileSync(APPLY_SQL_PATH, 'utf8');
  const arrayMatch = src.match(/const\s+OVERLAY_SEQUENCE\s*=\s*\[([\s\S]*?)\];/);
  if (!arrayMatch) throw new Error('OVERLAY_SEQUENCE not found in dbApplyRepoSql.js');
  const files = [];
  const strRe = /"([^"]+)"/g;
  let m;
  while ((m = strRe.exec(arrayMatch[1])) !== null) files.push(m[1]);
  return files;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const allowlist = JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf8'));
  const sequence = loadOverlaySequence();
  const hardeningIndex = sequence.findIndex(f => f === HARDENING_FILE);

  if (hardeningIndex === -1) {
    console.error(`ERROR: ${HARDENING_FILE} not found in OVERLAY_SEQUENCE`);
    process.exit(1);
  }

  console.log(`SEC-A2 SECURITY DEFINER definition-safety check`);
  console.log(`Hardening overlay: ${HARDENING_FILE} at OVERLAY_SEQUENCE index ${hardeningIndex}`);
  console.log(
    `MODEL LIMITATION: bulk ALTER/REVOKE in the hardening overlay is modelled statically.` +
    ` Run periodic scratch-DB reconciliation to confirm the model matches deployed reality.\n`
  );

  // Parse all overlay files in apply order
  const allEvents = [];
  let skipped = 0;

  for (let idx = 0; idx < sequence.length; idx++) {
    const filename = sequence[idx];
    const filePath = join(SUPABASE_DIR, filename);
    if (!existsSync(filePath)) {
      skipped++;
      continue;
    }
    const sql = readFileSync(filePath, 'utf8');
    const fileEvents = parseSqlFile(sql, idx);
    allEvents.push(...fileEvents);
  }

  if (skipped > 0) {
    console.warn(`  (${skipped} file(s) in OVERLAY_SEQUENCE not found on disk — skipped)\n`);
  }

  // Compute effective state and check criteria
  const effectiveState = computeEffectiveState(allEvents, hardeningIndex, allowlist);
  const allViolations = [];

  for (const [name, state] of effectiveState) {
    const vs = checkCriteria(state, hardeningIndex);
    allViolations.push(...vs);
  }

  if (allViolations.length === 0) {
    const funcCount = effectiveState.size;
    console.log(`PASS — ${funcCount} SECURITY DEFINER function(s) checked, 0 violations.`);
    return;
  }

  console.error(`FAIL — ${allViolations.length} violation(s):\n`);
  for (const v of allViolations) {
    console.error(`  [${v.criterion}] ${v.funcName}: ${v.detail}`);
  }
  console.error(`\nC1 = post-hardening function lacks SET search_path`);
  console.error(`C2 = SECURITY DEFINER callable by anon/PUBLIC without allowlist entry`);
  process.exit(1);
}

// Only run when invoked directly, not when imported by test runners
const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
