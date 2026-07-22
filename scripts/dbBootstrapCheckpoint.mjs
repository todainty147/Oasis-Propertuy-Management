/**
 * PF-TOOL-01: Pure helpers for --stop-before / checkpoint / resume logic.
 *
 * No side effects, no imports from dbBootstrap.js. Safe to import in tests.
 */

import { createHash } from 'node:crypto';
import path from 'node:path';

// ── Step identity ──────────────────────────────────────────────────────────

/**
 * Return the canonical identity for a bootstrap step: basename of its file path.
 * Migration files like "migrations/20260622000000_x.sql" → "20260622000000_x.sql".
 */
export function stepIdentity(filePath) {
  return path.basename(filePath);
}

/**
 * Extract ordered step identities from the bootstrapSteps array.
 */
export function resolveStepIdentities(bootstrapSteps) {
  return bootstrapSteps.map((s) => stepIdentity(s.file));
}

// ── Sequence hash ──────────────────────────────────────────────────────────

/**
 * SHA-256 over the ordered sequence of step identities.
 * Used for checkpoint tamper-detection: if the sequence changes, resume fails.
 */
export function computeSequenceHash(stepIdentities) {
  return 'sha256:' + createHash('sha256')
    .update(JSON.stringify(stepIdentities))
    .digest('hex');
}

// ── Argument parsing ───────────────────────────────────────────────────────

/**
 * Parse boundary-tooling CLI arguments from an argv array.
 * Returns { stopBefore, writeCheckpoint, resumeFromCheckpoint } or throws on
 * unsupported / conflicting options.
 */
export function parseBootstrapBoundaryArgs(argv) {
  const result = {
    stopBefore: null,
    writeCheckpoint: null,
    resumeFromCheckpoint: null,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--stop-before') {
      result.stopBefore = argv[i + 1] ?? null;
      i++;
    } else if (arg === '--write-checkpoint') {
      result.writeCheckpoint = argv[i + 1] ?? null;
      i++;
    } else if (arg === '--resume-from-checkpoint') {
      result.resumeFromCheckpoint = argv[i + 1] ?? null;
      i++;
    } else if (arg === '--start-at') {
      // Rejected: a general start-at/skip mechanism could produce invalid databases
      // by continuing after an omitted migration. Use --resume-from-checkpoint instead.
      throw new Error(
        '--start-at is not supported. Use --stop-before + --resume-from-checkpoint to ' +
        'resume safely from a checkpoint. A skip mechanism could create invalid databases ' +
        'by continuing after an omitted overlay.'
      );
    } else if (arg === '--skip') {
      throw new Error(
        '--skip is not supported. Use --stop-before for a deliberate inspection ' +
        'boundary that halts cleanly rather than continuing after an omitted step.'
      );
    }
    // Other args (e.g. no-op flags) are silently ignored; dbBootstrap uses env vars
  }

  if (result.stopBefore !== null && result.resumeFromCheckpoint !== null) {
    throw new Error('--stop-before and --resume-from-checkpoint are mutually exclusive.');
  }

  return result;
}

// ── Target validation ──────────────────────────────────────────────────────

/**
 * Validate a --stop-before target against the sequence.
 * Returns { index } (0-based position of the target step in the sequence).
 * Throws on: missing/empty target, path components in target, not found, duplicate.
 */
export function validateStopBefore(target, stepIdentities) {
  if (!target || typeof target !== 'string' || !target.trim()) {
    throw new Error('--stop-before requires a non-empty filename argument.');
  }

  // Reject path components (traversal, directory separators)
  if (target.includes('/') || target.includes('\\') || target.includes('..')) {
    throw new Error(
      `--stop-before target must be a plain filename with no path components: "${target}". ` +
      'Provide only the basename, e.g. gate_b_ent_seed_cleanup.sql'
    );
  }

  const matches = stepIdentities.reduce((acc, id, idx) => {
    if (id === target) acc.push(idx);
    return acc;
  }, []);

  if (matches.length === 0) {
    throw new Error(
      `--stop-before target not found in bootstrap sequence: "${target}". ` +
      'The target must be the exact filename of a step in bootstrapSteps.'
    );
  }

  if (matches.length > 1) {
    throw new Error(
      `--stop-before target "${target}" appears ${matches.length} times in the ` +
      'sequence (ambiguous). Bootstrap sequence must have unique step identities.'
    );
  }

  return { index: matches[0] };
}

// ── Environment safety gate ────────────────────────────────────────────────

/**
 * Returns true only for local/disposable database targets.
 * Loopback IPs, localhost, unqualified Docker service hostnames are allowed.
 * Any dotted FQDN (supabase.co, remote hosts) is rejected.
 */
export function isDisposableEnvironment(dbUrl) {
  if (!dbUrl || typeof dbUrl !== 'string') return false;

  let host;
  try {
    const normalized = /^postgres(ql)?:\/\//.test(dbUrl)
      ? dbUrl
      : 'postgresql://' + dbUrl;
    host = new URL(normalized).hostname.toLowerCase();
  } catch {
    return false;
  }

  // IPv4 loopback
  if (host === '127.0.0.1') return true;

  // Named loopback
  if (host === 'localhost') return true;

  // IPv6 loopback
  if (host === '::1' || host === '[::1]') return true;

  // Docker / container service hostnames: no dots = unqualified, local-only hostname
  // e.g. 'db', 'postgres', 'supabase_db_xxx' — acceptable disposable targets
  if (!host.includes('.')) return true;

  // Everything else (*.supabase.co, any remote FQDN) is not local
  return false;
}

// ── Checkpoint construction ────────────────────────────────────────────────

/**
 * Build a checkpoint object for persisting to disk after a stopped run.
 * All fields required for tamper-evident resume validation.
 */
export function buildCheckpoint({
  sequenceHash,
  stepIdentities,
  targetIndex,
  lastAppliedIndex,
  dbUrl,
  toolingVersion = '1.0.0',
}) {
  const totalSteps = stepIdentities.length;
  const lastApplied = lastAppliedIndex >= 0 ? stepIdentities[lastAppliedIndex] : null;
  const nextToApply = stepIdentities[targetIndex];

  return {
    toolingVersion,
    createdAt: new Date().toISOString(),
    sequenceHash,
    targetFilename: nextToApply,
    targetIndex,
    totalSteps,
    lastApplied,
    lastAppliedIndex,
    nextToApply,
    nextIndex: targetIndex,
    dbUrlHash: 'sha256:' + createHash('sha256').update(dbUrl || '').digest('hex'),
  };
}

// ── Checkpoint validation ──────────────────────────────────────────────────

/**
 * Validate a checkpoint loaded from disk before resuming.
 * Throws with a descriptive message on any mismatch.
 * Accepts: matching sequence hash AND matching database identity.
 */
export function validateCheckpointForResume(checkpoint, currentSequenceHash, currentDbUrl) {
  if (
    checkpoint === null ||
    typeof checkpoint !== 'object' ||
    Array.isArray(checkpoint)
  ) {
    throw new Error('Checkpoint is malformed: not a valid JSON object.');
  }

  const required = [
    'sequenceHash', 'nextToApply', 'nextIndex',
    'totalSteps', 'dbUrlHash', 'targetFilename', 'createdAt',
  ];
  for (const field of required) {
    if (!(field in checkpoint)) {
      throw new Error(`Checkpoint is malformed: missing required field "${field}".`);
    }
  }

  if (typeof checkpoint.nextIndex !== 'number' || checkpoint.nextIndex < 0) {
    throw new Error('Checkpoint is malformed: nextIndex must be a non-negative number.');
  }

  if (checkpoint.sequenceHash !== currentSequenceHash) {
    throw new Error(
      'Checkpoint sequence hash mismatch — the bootstrap sequence has changed since ' +
      'this checkpoint was created. A changed sequence means the committed overlays no ' +
      'longer match the stopped run. Do not resume from this checkpoint.\n' +
      `  checkpoint: ${checkpoint.sequenceHash}\n` +
      `  current:    ${currentSequenceHash}`
    );
  }

  const currentDbHash = 'sha256:' + createHash('sha256')
    .update(currentDbUrl || '')
    .digest('hex');

  if (checkpoint.dbUrlHash !== currentDbHash) {
    throw new Error(
      'Checkpoint database identity mismatch — this checkpoint targets a different ' +
      'database than the current run. Resume must target the exact same database as ' +
      'the original stopped run.'
    );
  }
}
