import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  stripDollarQuotedBodies,
  parseSqlFile,
  computeEffectiveState,
  checkCriteria,
} from '../../scripts/checkSecurityDefinerFunctions.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const readSql = (rel) => readFileSync(resolve(ROOT, 'supabase', rel), 'utf8');

// ── Static contracts: REVOKE FROM public for post-hardening DROP+CREATE functions ─
// These 6 functions were created as new objects after the hardening overlay
// (via DROP+CREATE, not CREATE OR REPLACE) and therefore do not inherit the
// bulk ACL revoke. Each must explicitly REVOKE FROM public.

describe('C2 REVOKE contracts — post-hardening DROP+CREATE functions', () => {
  it('p009c1_compliance_gap_unified.sql REVOKEs command_center_items from public', () => {
    const sql = readSql('p009c1_compliance_gap_unified.sql');
    expect(sql).toContain('revoke all on function public.command_center_items(uuid, integer) from public');
  });

  it('p009c1_compliance_gap_unified.sql REVOKEs attention_center_items from public', () => {
    const sql = readSql('p009c1_compliance_gap_unified.sql');
    expect(sql).toContain('revoke all on function public.attention_center_items(uuid, integer) from public');
  });

  it('p009c1_compliance_gap_unified.sql REVOKEs get_operating_calendar from public', () => {
    const sql = readSql('p009c1_compliance_gap_unified.sql');
    expect(sql).toContain('revoke all on function public.get_operating_calendar(uuid, date, date, uuid, text, text, text) from public');
  });

  it('spreadsheet_import_v1.sql REVOKEs record_import_provenance_event from public', () => {
    const sql = readSql('spreadsheet_import_v1.sql');
    expect(sql.toLowerCase()).toContain('revoke all on function public.record_import_provenance_event(');
    expect(sql.toLowerCase()).toContain(') from public');
  });

  it('spreadsheet_import_v1.sql REVOKEs process_import_batch from public', () => {
    const sql = readSql('spreadsheet_import_v1.sql');
    expect(sql.toLowerCase()).toContain('revoke all on function public.process_import_batch(uuid, text, jsonb, text, text)');
    expect(sql.toLowerCase()).toContain('from public');
  });

  it('compliance_import_labeling.sql REVOKEs _set_compliance_item_import_batch from public', () => {
    const sql = readSql('compliance_import_labeling.sql');
    expect(sql.toLowerCase()).toContain('revoke all on function public._set_compliance_item_import_batch() from public');
  });
});

// Synthetic hardeningIndex used in all state/criterion tests
const H = 5;
const NO_ALLOWLIST = {};
const WITH_ALLOWLIST = { my_public_func: { rationale: 'intentionally public' } };

// ── stripDollarQuotedBodies ────────────────────────────────────────────────

describe('stripDollarQuotedBodies', () => {
  it('strips bare $$ dollar quotes, preserving delimiters', () => {
    const sql = `CREATE FUNCTION f() AS $$ SET search_path = bad; $$ LANGUAGE sql;`;
    const stripped = stripDollarQuotedBodies(sql);
    expect(stripped).toContain('$$');
    expect(stripped).not.toContain('SET search_path = bad');
  });

  it('strips tagged dollar quotes ($func$)', () => {
    const sql = `CREATE FUNCTION f() AS $func$ SET search_path = bad; $func$ LANGUAGE sql;`;
    const stripped = stripDollarQuotedBodies(sql);
    expect(stripped).toContain('$func$');
    expect(stripped).not.toContain('SET search_path = bad');
  });

  it('strips multiple sequential dollar-quoted blocks', () => {
    const sql = `DO $$ evil1 $$; DO $body$ evil2 $body$;`;
    const stripped = stripDollarQuotedBodies(sql);
    expect(stripped).not.toContain('evil1');
    expect(stripped).not.toContain('evil2');
  });

  it('preserves SQL outside dollar-quoted regions', () => {
    const sql = `ALTER FUNCTION f() SET search_path = public; DO $$ body $$;`;
    const stripped = stripDollarQuotedBodies(sql);
    expect(stripped).toContain('ALTER FUNCTION f() SET search_path = public');
  });
});

// ── parseSqlFile ───────────────────────────────────────────────────────────

describe('parseSqlFile', () => {
  it('detects SECURITY DEFINER in function header', () => {
    const sql = `
      CREATE OR REPLACE FUNCTION public.my_func(p_id uuid)
      RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
      SET search_path = public AS $$ BEGIN RETURN true; END; $$;
    `;
    const events = parseSqlFile(sql, 0);
    const create = events.find(e => e.type === 'create');
    expect(create).toBeDefined();
    expect(create.securityDefiner).toBe(true);
  });

  it('detects SET search_path in function header', () => {
    const sql = `
      CREATE OR REPLACE FUNCTION public.my_func(p_id uuid)
      RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
      SET search_path = public AS $$ BEGIN RETURN true; END; $$;
    `;
    const events = parseSqlFile(sql, 0);
    const create = events.find(e => e.type === 'create');
    expect(create.hasInlineSearchPath).toBe(true);
  });

  // Correction 3: body content must not fool the header parser
  it('does NOT detect SET search_path that appears only in the dollar-quoted body', () => {
    const sql = `
      CREATE OR REPLACE FUNCTION public.unsafe_func(p_id uuid)
      RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
      AS $$
      DECLARE
        -- SET search_path = public (this is only a comment inside the body)
      BEGIN
        RETURN true;
      END;
      $$;
    `;
    const events = parseSqlFile(sql, 0);
    const create = events.find(e => e.type === 'create');
    expect(create.securityDefiner).toBe(true);
    expect(create.hasInlineSearchPath).toBe(false);
  });

  it('detects REVOKE ... FROM public', () => {
    const sql = `REVOKE ALL ON FUNCTION public.my_func(uuid, text) FROM public;`;
    const events = parseSqlFile(sql, 0);
    const rev = events.find(e => e.type === 'revoke' && e.fromPublic);
    expect(rev).toBeDefined();
    expect(rev.funcName).toBe('my_func');
  });

  it('detects GRANT ... TO anon', () => {
    const sql = `GRANT EXECUTE ON FUNCTION public.my_func(uuid) TO anon;`;
    const events = parseSqlFile(sql, 0);
    const grant = events.find(e => e.type === 'grant' && e.toAnon);
    expect(grant).toBeDefined();
    expect(grant.funcName).toBe('my_func');
  });

  it('does not emit grant events for non-public/anon roles', () => {
    const sql = `GRANT EXECUTE ON FUNCTION public.my_func(uuid) TO authenticated;`;
    const events = parseSqlFile(sql, 0);
    expect(events.filter(e => e.type === 'grant')).toHaveLength(0);
  });

  it('detects ALTER FUNCTION ... SET search_path', () => {
    const sql = `ALTER FUNCTION public.my_func(uuid) SET search_path = public;`;
    const events = parseSqlFile(sql, 0);
    const alt = events.find(e => e.type === 'alter_search_path');
    expect(alt).toBeDefined();
    expect(alt.funcName).toBe('my_func');
  });
});

// ── Criterion scenarios ────────────────────────────────────────────────────
// H = 5 is the synthetic hardeningIndex throughout.

describe('C1 — post-hardening search_path requirement', () => {
  // Scenario 1: pre-hardening function, no inline search_path → bulk ALTER covers it → PASS
  it('C1-PRE-PASS: pre-hardening SECURITY DEFINER without explicit search_path passes', () => {
    const events = [
      { type: 'create', funcName: 'pre_func', fileIndex: 3, securityDefiner: true, hasInlineSearchPath: false },
    ];
    const state = computeEffectiveState(events, H, NO_ALLOWLIST);
    const violations = checkCriteria(state.get('pre_func'), H);
    expect(violations.filter(v => v.criterion === 'C1')).toHaveLength(0);
  });

  // Scenario 2: post-hardening function, no search_path → not covered by bulk ALTER → FAIL
  it('C1-POST-FAIL: post-hardening SECURITY DEFINER without search_path fails', () => {
    const events = [
      { type: 'create', funcName: 'post_func', fileIndex: 7, securityDefiner: true, hasInlineSearchPath: false },
    ];
    const state = computeEffectiveState(events, H, NO_ALLOWLIST);
    const violations = checkCriteria(state.get('post_func'), H);
    expect(violations.filter(v => v.criterion === 'C1')).toHaveLength(1);
  });

  // Scenario 3: post-hardening function with inline SET search_path → PASS
  it('C1-POST-PASS: post-hardening SECURITY DEFINER with inline SET search_path passes', () => {
    const events = [
      { type: 'create', funcName: 'post_func', fileIndex: 7, securityDefiner: true, hasInlineSearchPath: true },
    ];
    const state = computeEffectiveState(events, H, NO_ALLOWLIST);
    const violations = checkCriteria(state.get('post_func'), H);
    expect(violations.filter(v => v.criterion === 'C1')).toHaveLength(0);
  });

  // Scenario 4: post-hardening function with ALTER SET search_path → PASS
  it('C1-ALTER-PASS: post-hardening SECURITY DEFINER covered by ALTER SET search_path passes', () => {
    const events = [
      { type: 'create', funcName: 'post_func', fileIndex: 7, securityDefiner: true, hasInlineSearchPath: false },
      { type: 'alter_search_path', funcName: 'post_func', fileIndex: 8 },
    ];
    const state = computeEffectiveState(events, H, NO_ALLOWLIST);
    const violations = checkCriteria(state.get('post_func'), H);
    expect(violations.filter(v => v.criterion === 'C1')).toHaveLength(0);
  });

  // Scenario 5 (Correction 1): function born pre-hardening, replaced post-hardening without
  // search_path — lastDefinedAt is the replacement position, so C1 applies → FAIL
  it('C1-REPLACE-FAIL: function born pre-hardening but replaced post-hardening without search_path fails', () => {
    const events = [
      // First definition — pre-hardening, would be covered by bulk ALTER
      { type: 'create', funcName: 'evolved_func', fileIndex: 3, securityDefiner: true, hasInlineSearchPath: false },
      // Replacement — post-hardening, NOT covered by bulk ALTER, no search_path added
      { type: 'create', funcName: 'evolved_func', fileIndex: 7, securityDefiner: true, hasInlineSearchPath: false },
    ];
    const state = computeEffectiveState(events, H, NO_ALLOWLIST);
    const fn = state.get('evolved_func');
    expect(fn.lastDefinedAt).toBe(7); // correction 1: keyed on last definition
    const violations = checkCriteria(fn, H);
    expect(violations.filter(v => v.criterion === 'C1')).toHaveLength(1);
  });

  // Correction 3 (parser robustness): body text with SET search_path must not satisfy C1
  it('C2-BODY-MISLEAD: function with SET search_path only in body still fails C1', () => {
    // The body content is dollar-quoted so it gets stripped; only the header is checked
    const sql = `
      CREATE OR REPLACE FUNCTION public.body_trick(p uuid)
      RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
      AS $$
      BEGIN
        -- SET search_path = public  (just a comment inside the body)
        RETURN true;
      END;
      $$;
    `;
    const events = parseSqlFile(sql, 7); // post-hardening (index 7 > H=5)
    const allEvents = computeEffectiveState(events, H, NO_ALLOWLIST);
    const fn = allEvents.get('body_trick');
    expect(fn.hasSearchPath).toBe(false);
    const violations = checkCriteria(fn, H);
    expect(violations.filter(v => v.criterion === 'C1')).toHaveLength(1);
  });
});

describe('C2 — anon/PUBLIC execute gate', () => {
  // Scenario 6: pre-hardening function, no explicit grants → synthetic bulk revoke fires → PASS
  it('C2-PRE-PASS: pre-hardening function gets synthetic bulk revoke applied', () => {
    const events = [
      { type: 'create', funcName: 'pre_func', fileIndex: 3, securityDefiner: true, hasInlineSearchPath: false },
    ];
    const state = computeEffectiveState(events, H, NO_ALLOWLIST);
    const fn = state.get('pre_func');
    expect(fn.anonCanExecute).toBe(false);
    const violations = checkCriteria(fn, H);
    expect(violations.filter(v => v.criterion === 'C2')).toHaveLength(0);
  });

  // Scenario 7: post-hardening function, no explicit revoke → implicit PUBLIC grant remains → FAIL
  it('C2-POST-FAIL: post-hardening function without explicit REVOKE has implicit public grant', () => {
    const events = [
      { type: 'create', funcName: 'post_func', fileIndex: 7, securityDefiner: true, hasInlineSearchPath: true },
    ];
    const state = computeEffectiveState(events, H, NO_ALLOWLIST);
    const fn = state.get('post_func');
    expect(fn.anonCanExecute).toBe(true);
    const violations = checkCriteria(fn, H);
    expect(violations.filter(v => v.criterion === 'C2')).toHaveLength(1);
  });

  // Scenario 8: post-hardening function with explicit REVOKE FROM public → PASS
  it('C2-REVOKE-PASS: post-hardening function with REVOKE FROM public closes anon access', () => {
    const events = [
      { type: 'create', funcName: 'post_func', fileIndex: 7, securityDefiner: true, hasInlineSearchPath: true },
      { type: 'revoke', funcName: 'post_func', fileIndex: 8, fromPublic: true, fromAnon: false },
    ];
    const state = computeEffectiveState(events, H, NO_ALLOWLIST);
    const fn = state.get('post_func');
    expect(fn.anonCanExecute).toBe(false);
    const violations = checkCriteria(fn, H);
    expect(violations.filter(v => v.criterion === 'C2')).toHaveLength(0);
  });

  // Scenario 9: allowlisted pre-hardening function — synthetic revoke then synthetic re-grant → PASS
  it('C2-ALLOWLIST-PASS: allowlisted function gets synthetic re-grant after bulk revoke', () => {
    const events = [
      { type: 'create', funcName: 'my_public_func', fileIndex: 3, securityDefiner: true, hasInlineSearchPath: false },
    ];
    const state = computeEffectiveState(events, H, WITH_ALLOWLIST);
    const fn = state.get('my_public_func');
    expect(fn.anonCanExecute).toBe(true);
    expect(fn.isAllowlisted).toBe(true);
    const violations = checkCriteria(fn, H);
    expect(violations.filter(v => v.criterion === 'C2')).toHaveLength(0);
  });

  // PO correction: CREATE OR REPLACE of same signature preserves existing ACLs (PostgreSQL rule).
  // The bulk revoke from the hardening overlay survives a post-hardening replacement.
  it('C2-REPLACE-PASS: pre-hardening CREATE OR REPLACE post-hardening preserves revoked ACL', () => {
    const events = [
      { type: 'create', funcName: 'stable_func', fileIndex: 3, securityDefiner: true, hasInlineSearchPath: true },
      // No DROP — this is CREATE OR REPLACE semantics; existing ACL (revoke) is preserved
      { type: 'create', funcName: 'stable_func', fileIndex: 7, securityDefiner: true, hasInlineSearchPath: true },
    ];
    const state = computeEffectiveState(events, H, NO_ALLOWLIST);
    const fn = state.get('stable_func');
    // firstDefinedAt=3 < H=5, no DROP → effectivelyNewObject=false → synthetic revoke applied
    expect(fn.anonCanExecute).toBe(false);
    const violations = checkCriteria(fn, H);
    expect(violations.filter(v => v.criterion === 'C2')).toHaveLength(0);
  });

  // DROP FUNCTION + CREATE FUNCTION is a new object: default PUBLIC EXECUTE applies.
  // The hardening overlay's revoke does NOT carry over to the new object.
  it('C2-DROP-CREATE-FAIL: pre-hardening DROP+CREATE post-hardening is a new object with default PUBLIC', () => {
    const events = [
      { type: 'create', funcName: 'dropped_func', fileIndex: 3, securityDefiner: true, hasInlineSearchPath: true },
      { type: 'drop',   funcName: 'dropped_func', fileIndex: 7 }, // dropped post-hardening
      { type: 'create', funcName: 'dropped_func', fileIndex: 7, securityDefiner: true, hasInlineSearchPath: true },
    ];
    const state = computeEffectiveState(events, H, NO_ALLOWLIST);
    const fn = state.get('dropped_func');
    // lastDroppedAt=7 >= H=5, lastDefinedAt=7 >= 7 → effectivelyNewObject=true → no synthetic revoke
    expect(fn.anonCanExecute).toBe(true);
    const violations = checkCriteria(fn, H);
    expect(violations.filter(v => v.criterion === 'C2')).toHaveLength(1);
  });

  // Correction 2: a post-hardening GRANT TO PUBLIC after the hardening position re-opens the door
  it('C2-POST-GRANT-FAIL: explicit GRANT TO PUBLIC after hardening index is folded in', () => {
    // Function created pre-hardening (synthetic revoke at H makes it safe)…
    // then an explicit GRANT TO PUBLIC at index 8 re-opens access
    const events = [
      { type: 'create', funcName: 'pre_func', fileIndex: 3, securityDefiner: true, hasInlineSearchPath: false },
      { type: 'grant', funcName: 'pre_func', fileIndex: 8, toPublic: true, toAnon: false },
    ];
    const state = computeEffectiveState(events, H, NO_ALLOWLIST);
    const fn = state.get('pre_func');
    // The synthetic revoke fires at H, the explicit grant fires at 8 (> H)
    // Final fold: granted = true  →  must fail C2
    expect(fn.anonCanExecute).toBe(true);
    const violations = checkCriteria(fn, H);
    expect(violations.filter(v => v.criterion === 'C2')).toHaveLength(1);
  });
});
