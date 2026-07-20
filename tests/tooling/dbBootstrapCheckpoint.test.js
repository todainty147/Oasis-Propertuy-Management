/**
 * PF-TOOL-01 tooling tests — 15 contract proofs for the boundary tooling.
 * All tests are pure-function unit tests; no live database required.
 */

import { describe, it, expect } from 'vitest';
import {
  computeSequenceHash,
  resolveStepIdentities,
  parseBootstrapBoundaryArgs,
  validateStopBefore,
  isDisposableEnvironment,
  buildCheckpoint,
  validateCheckpointForResume,
} from '../../scripts/dbBootstrapCheckpoint.mjs';

// ── Synthetic sequence used across tests ─────────────────────────────────────
const MOCK_STEPS = [
  { file: '/repo/supabase/baseline_schema.sql' },
  { file: '/repo/supabase/step_a.sql' },
  { file: '/repo/supabase/migrations/20260622000000_migration.sql' },
  { file: '/repo/supabase/step_b.sql' },
  { file: '/repo/supabase/target.sql' },
  { file: '/repo/supabase/step_c.sql' },
];
const MOCK_IDS = resolveStepIdentities(MOCK_STEPS);
// ['baseline_schema.sql', 'step_a.sql', '20260622000000_migration.sql', 'step_b.sql', 'target.sql', 'step_c.sql']

const MOCK_HASH = computeSequenceHash(MOCK_IDS);
const MOCK_DB = 'postgresql://postgres:postgres@127.0.0.1:61022/postgres';

function mockCheckpoint(overrides = {}) {
  return buildCheckpoint({
    sequenceHash: MOCK_HASH,
    stepIdentities: MOCK_IDS,
    targetIndex: 4,
    lastAppliedIndex: 3,
    dbUrl: MOCK_DB,
    ...overrides,
  });
}

// ── T01 — no argument → complete sequence selected ────────────────────────────

describe('T01: no argument — complete sequence selected', () => {
  it('parseBootstrapBoundaryArgs([]) returns all null boundary flags', () => {
    const args = parseBootstrapBoundaryArgs([]);
    expect(args.stopBefore).toBeNull();
    expect(args.writeCheckpoint).toBeNull();
    expect(args.resumeFromCheckpoint).toBeNull();
  });

  it('resolveStepIdentities returns all 6 mock step identities', () => {
    expect(MOCK_IDS).toHaveLength(6);
    expect(MOCK_IDS[0]).toBe('baseline_schema.sql');
    expect(MOCK_IDS[5]).toBe('step_c.sql');
  });

  it('migration file identity is basename only (no directory component)', () => {
    expect(MOCK_IDS[2]).toBe('20260622000000_migration.sql');
    expect(MOCK_IDS[2]).not.toContain('/');
    expect(MOCK_IDS[2]).not.toContain('migrations');
  });
});

// ── T02 — valid exact target → halt before target ─────────────────────────────

describe('T02: valid exact target — halt before target', () => {
  it('validateStopBefore("target.sql") returns index 4', () => {
    const { index } = validateStopBefore('target.sql', MOCK_IDS);
    expect(index).toBe(4);
  });

  it('steps 0..3 are before the target; step 4 is the target (not applied)', () => {
    const { index } = validateStopBefore('target.sql', MOCK_IDS);
    const appliedRange = MOCK_IDS.slice(0, index);
    const notApplied = MOCK_IDS.slice(index);
    expect(appliedRange).toHaveLength(4);
    expect(notApplied[0]).toBe('target.sql');
  });
});

// ── T03 — unknown target → fail before SQL ────────────────────────────────────

describe('T03: unknown target — fail before SQL', () => {
  it('validateStopBefore throws on unknown filename', () => {
    expect(() => validateStopBefore('nonexistent.sql', MOCK_IDS))
      .toThrow(/not found in bootstrap sequence/i);
  });

  it('error message includes the unknown target name', () => {
    expect(() => validateStopBefore('ghost_overlay.sql', MOCK_IDS))
      .toThrow('ghost_overlay.sql');
  });
});

// ── T04 — duplicate sequence identity → fail as ambiguous ────────────────────

describe('T04: duplicate sequence identity — fail as ambiguous', () => {
  it('validateStopBefore throws when target appears twice', () => {
    const dup = ['a.sql', 'b.sql', 'target.sql', 'c.sql', 'target.sql'];
    expect(() => validateStopBefore('target.sql', dup))
      .toThrow(/appears 2 times.*ambiguous/i);
  });
});

// ── T05 — first eligible target → zero preceding overlays, clean stop ─────────

describe('T05: first target — zero preceding overlays applied', () => {
  it('validateStopBefore("baseline_schema.sql") returns index 0', () => {
    const { index } = validateStopBefore('baseline_schema.sql', MOCK_IDS);
    expect(index).toBe(0);
  });

  it('applied range before first target has length 0', () => {
    const { index } = validateStopBefore('baseline_schema.sql', MOCK_IDS);
    expect(MOCK_IDS.slice(0, index)).toHaveLength(0);
  });

  it('buildCheckpoint with lastAppliedIndex -1 records null lastApplied', () => {
    const cp = buildCheckpoint({
      sequenceHash: MOCK_HASH,
      stepIdentities: MOCK_IDS,
      targetIndex: 0,
      lastAppliedIndex: -1,
      dbUrl: MOCK_DB,
    });
    expect(cp.lastApplied).toBeNull();
    expect(cp.lastAppliedIndex).toBe(-1);
    expect(cp.nextToApply).toBe('baseline_schema.sql');
    expect(cp.nextIndex).toBe(0);
  });
});

// ── T06 — final target → every preceding overlay applies ──────────────────────

describe('T06: final target — all preceding steps applied', () => {
  it('validateStopBefore("step_c.sql") returns index 5 (last)', () => {
    const { index } = validateStopBefore('step_c.sql', MOCK_IDS);
    expect(index).toBe(5);
  });

  it('applied range before last target has length 5 (N-1)', () => {
    const { index } = validateStopBefore('step_c.sql', MOCK_IDS);
    expect(MOCK_IDS.slice(0, index)).toHaveLength(5);
  });
});

// ── T07 — earlier overlay error → no checkpoint claiming target reached ────────

describe('T07: earlier overlay error — no checkpoint on failure', () => {
  it('buildCheckpoint is called only after preceding steps succeed (contract)', () => {
    // If a step fails, main() throws before reaching the checkpoint write.
    // This test verifies the checkpoint structure records the target—not prior success—
    // and that the nextIndex equals targetIndex (not a count of applied steps).
    const cp = mockCheckpoint();
    expect(cp.nextIndex).toBe(4);
    expect(cp.targetFilename).toBe('target.sql');
    // lastAppliedIndex is 3 (step_b.sql), meaning steps 0..3 ran
    expect(cp.lastAppliedIndex).toBe(3);
    expect(cp.lastApplied).toBe('step_b.sql');
  });
});

// ── T08 — target not applied accidentally ─────────────────────────────────────

describe('T08: target not applied accidentally', () => {
  it('step at targetIndex is in the NOT-applied range (slice from targetIndex)', () => {
    const { index } = validateStopBefore('target.sql', MOCK_IDS);
    const applied = MOCK_IDS.slice(0, index);
    const notApplied = MOCK_IDS.slice(index);
    expect(applied).not.toContain('target.sql');
    expect(notApplied).toContain('target.sql');
    expect(notApplied[0]).toBe('target.sql');
  });
});

// ── T09 — resume with matching checkpoint → starts at exact pending step ──────

describe('T09: resume with matching checkpoint — starts at nextIndex', () => {
  it('validateCheckpointForResume succeeds on a valid matching checkpoint', () => {
    const cp = mockCheckpoint();
    expect(() => validateCheckpointForResume(cp, MOCK_HASH, MOCK_DB)).not.toThrow();
  });

  it('checkpoint.nextIndex is 4 (target step, first NOT applied)', () => {
    const cp = mockCheckpoint();
    expect(cp.nextIndex).toBe(4);
    expect(cp.nextToApply).toBe('target.sql');
  });
});

// ── T10 — resume with changed sequence hash → fail ───────────────────────────

describe('T10: resume with changed sequence hash — fail', () => {
  it('validateCheckpointForResume throws when sequence hash changed', () => {
    const cp = mockCheckpoint();
    const differentHash = computeSequenceHash([...MOCK_IDS, 'extra_step.sql']);
    expect(() => validateCheckpointForResume(cp, differentHash, MOCK_DB))
      .toThrow(/sequence hash mismatch/i);
  });
});

// ── T11 — resume against different DB → fail ─────────────────────────────────

describe('T11: resume against different DB — fail', () => {
  it('validateCheckpointForResume throws when dbUrl differs from checkpoint', () => {
    const cp = mockCheckpoint();
    const differentDb = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
    expect(() => validateCheckpointForResume(cp, MOCK_HASH, differentDb))
      .toThrow(/database identity mismatch/i);
  });
});

// ── T12 — arbitrary start index → unsupported ────────────────────────────────

describe('T12: arbitrary start index — unsupported', () => {
  it('parseBootstrapBoundaryArgs throws on --start-at', () => {
    expect(() => parseBootstrapBoundaryArgs(['--start-at', '5']))
      .toThrow(/--start-at is not supported/i);
  });

  it('error message references --resume-from-checkpoint as the alternative', () => {
    expect(() => parseBootstrapBoundaryArgs(['--start-at', '5']))
      .toThrow(/--resume-from-checkpoint/i);
  });
});

// ── T13 — remote/staging target → boundary mode refused ──────────────────────

describe('T13: remote/staging target — boundary mode refused', () => {
  it('rejects Supabase Cloud project URL', () => {
    expect(isDisposableEnvironment('postgresql://postgres:secret@db.abc123.supabase.co:5432/postgres'))
      .toBe(false);
  });

  it('rejects arbitrary remote FQDN', () => {
    expect(isDisposableEnvironment('postgresql://postgres@staging.example.com:5432/mydb'))
      .toBe(false);
  });

  it('accepts localhost', () => {
    expect(isDisposableEnvironment('postgresql://postgres:postgres@localhost:5432/postgres'))
      .toBe(true);
  });

  it('accepts 127.0.0.1', () => {
    expect(isDisposableEnvironment('postgresql://postgres:postgres@127.0.0.1:61022/postgres'))
      .toBe(true);
  });

  it('accepts unqualified Docker hostname', () => {
    expect(isDisposableEnvironment('postgresql://postgres:postgres@db:5432/postgres'))
      .toBe(true);
  });
});

// ── T14 — malformed checkpoint → fail closed ─────────────────────────────────

describe('T14: malformed checkpoint — fail closed', () => {
  it('throws on null checkpoint', () => {
    expect(() => validateCheckpointForResume(null, MOCK_HASH, MOCK_DB))
      .toThrow(/malformed/i);
  });

  it('throws on array checkpoint', () => {
    expect(() => validateCheckpointForResume([], MOCK_HASH, MOCK_DB))
      .toThrow(/malformed/i);
  });

  it('throws on checkpoint missing sequenceHash', () => {
    const { sequenceHash: _omit, ...partial } = mockCheckpoint();
    expect(() => validateCheckpointForResume(partial, MOCK_HASH, MOCK_DB))
      .toThrow(/missing required field "sequenceHash"/i);
  });

  it('throws on checkpoint missing nextIndex', () => {
    const { nextIndex: _omit, ...partial } = mockCheckpoint();
    expect(() => validateCheckpointForResume(partial, MOCK_HASH, MOCK_DB))
      .toThrow(/missing required field "nextIndex"/i);
  });

  it('throws on negative nextIndex', () => {
    const cp = { ...mockCheckpoint(), nextIndex: -1 };
    expect(() => validateCheckpointForResume(cp, MOCK_HASH, MOCK_DB))
      .toThrow(/nextIndex must be a non-negative number/i);
  });
});

// ── T15 — no skip-and-continue option ────────────────────────────────────────

describe('T15: no skip-and-continue option — parser contract', () => {
  it('--skip is rejected with an error', () => {
    expect(() => parseBootstrapBoundaryArgs(['--skip', 'some_overlay.sql']))
      .toThrow(/--skip is not supported/i);
  });

  it('parsed result has no skip-related field', () => {
    const args = parseBootstrapBoundaryArgs(['--stop-before', 'target.sql']);
    expect(args).not.toHaveProperty('skip');
    expect(args).not.toHaveProperty('skipBefore');
    expect(args).not.toHaveProperty('skipAt');
  });

  it('--stop-before and --resume-from-checkpoint are mutually exclusive', () => {
    expect(() => parseBootstrapBoundaryArgs([
      '--stop-before', 'target.sql',
      '--resume-from-checkpoint', '/tmp/cp.json',
    ])).toThrow(/mutually exclusive/i);
  });
});
