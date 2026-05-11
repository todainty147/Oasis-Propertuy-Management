// src/utils/passwordPolicy.js
//
// Shared password policy for all OASIS auth flows that create or change a
// password. Applied client-side before any Supabase call; Supabase Auth
// policy is a second layer, not the first.
//
// NEVER log the password or password fragments.

// ---------------------------------------------------------------------------
// Common / weak passwords to block explicitly.
// Stored lowercase; comparison is case-insensitive.
// Only passwords that pass basic character-class checks need to appear here
// (i.e., 12+ chars with mixed classes), since short/simple ones are already
// rejected by the structural checks.
// ---------------------------------------------------------------------------
const COMMON_PASSWORDS = new Set([
  "password123!",
  "password1234",
  "password12345",
  "password123456",
  "password123!!",
  "password!123",
  "p@ssword1234",
  "p@ssw0rd1234",
  "passw0rd1234",
  "admin123456!",
  "admin1234567",
  "qwerty123456",
  "qwerty12345!",
  "qwerty123!@#",
  "letmein12345",
  "letmein123!@",
  "welcome12345",
  "welcome1234!",
  "welcome123!!",
  "iloveyou123!",
  "iloveyou1234",
  "monkey123456",
  "dragon123456",
  "master123456",
  "master1234!@",
  "superman123!",
  "batman12345!",
  "starwars123!",
  "trustno1234!",
  "hello1world!",
  "abc123456789",
  "abc12345678!",
  "1234567890ab",
  "1234567890!@",
  "123456789abc",
  "summer2024!!",
  "winter2024!!",
  "spring2024!!",
  "autumn2024!!",
  "january2024!",
  "february2024",
  "changeme1234",
  "changeme123!",
  "correct-horse",
  "hunter2hunter",
  "zxcvbnm12345",
]);

// ---------------------------------------------------------------------------
// Sequential keyboard / alphabet patterns to detect.
// ---------------------------------------------------------------------------
const SEQUENCE_STRINGS = [
  "abcdefghijklmnopqrstuvwxyz",
  "qwertyuiopasdfghjklzxcvbnm",
  "qwertyuiop",
  "asdfghjkl",
  "zxcvbnm",
  "0123456789",
];
const MIN_SEQUENCE_RUN = 4;

function hasSequentialPattern(pw) {
  const lower = pw.toLowerCase();
  for (const seq of SEQUENCE_STRINGS) {
    for (let i = 0; i <= seq.length - MIN_SEQUENCE_RUN; i++) {
      const fwd = seq.slice(i, i + MIN_SEQUENCE_RUN);
      const rev = fwd.split("").reverse().join("");
      if (lower.includes(fwd) || lower.includes(rev)) return true;
    }
  }
  return false;
}

// Returns true when any character appears 3+ times consecutively.
function hasExcessiveRepeats(pw) {
  for (let i = 0; i <= pw.length - 3; i++) {
    if (pw[i] === pw[i + 1] && pw[i + 1] === pw[i + 2]) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Context-based checks (email local-part, name parts, account name).
// ---------------------------------------------------------------------------
function containsPersonalInfo(pw, context = {}) {
  const lower = pw.toLowerCase();
  const { email, name, accountName } = context;

  if (email) {
    const localPart = String(email).split("@")[0].toLowerCase().replace(/[^a-z0-9]/g, "");
    if (localPart.length >= 3 && lower.replace(/[^a-z0-9]/g, "").includes(localPart)) return true;
  }

  if (name) {
    const parts = String(name)
      .toLowerCase()
      .split(/[\s,._\-@]+/)
      .filter((p) => p.length >= 3);
    for (const part of parts) {
      if (lower.includes(part)) return true;
    }
  }

  if (accountName) {
    const clean = String(accountName)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    if (clean.length >= 3 && lower.replace(/[^a-z0-9]/g, "").includes(clean)) return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Requirement definitions
// ---------------------------------------------------------------------------
const BASE_REQUIREMENTS = [
  {
    key:     "minLength",
    i18nKey: "passwordPolicy.req.minLength",
    label:   "At least 12 characters",
    check:   (pw) => pw.length >= 12,
  },
  {
    key:     "uppercase",
    i18nKey: "passwordPolicy.req.uppercase",
    label:   "At least one uppercase letter",
    check:   (pw) => /[A-Z]/.test(pw),
  },
  {
    key:     "lowercase",
    i18nKey: "passwordPolicy.req.lowercase",
    label:   "At least one lowercase letter",
    check:   (pw) => /[a-z]/.test(pw),
  },
  {
    key:     "number",
    i18nKey: "passwordPolicy.req.number",
    label:   "At least one number",
    check:   (pw) => /[0-9]/.test(pw),
  },
  {
    key:     "symbol",
    i18nKey: "passwordPolicy.req.symbol",
    label:   "At least one symbol (!@#$…)",
    check:   (pw) => /[^A-Za-z0-9]/.test(pw),
  },
  {
    key:     "noCommon",
    i18nKey: "passwordPolicy.req.noCommon",
    label:   "Not a commonly used password",
    check:   (pw) => !COMMON_PASSWORDS.has(pw.toLowerCase()),
  },
  {
    key:     "noRepeats",
    i18nKey: "passwordPolicy.req.noRepeats",
    label:   "No three or more repeated characters in a row",
    check:   (pw) => !hasExcessiveRepeats(pw),
  },
  {
    key:     "noSequence",
    i18nKey: "passwordPolicy.req.noSequence",
    label:   "No simple keyboard sequences (123, abc, qwerty)",
    check:   (pw) => !hasSequentialPattern(pw),
  },
];

const PERSONAL_REQUIREMENT = {
  key:     "noPersonal",
  i18nKey: "passwordPolicy.req.noPersonal",
  label:   "Does not contain your name or email",
  check:   (pw, ctx) => !containsPersonalInfo(pw, ctx),
};

// ---------------------------------------------------------------------------
// Score labels (index = score 0–4)
// ---------------------------------------------------------------------------
const SCORE_LABELS    = ["Weak", "Weak", "Fair", "Good", "Strong"];
const SCORE_LABEL_KEYS = [
  "passwordPolicy.label.weak",
  "passwordPolicy.label.weak",
  "passwordPolicy.label.fair",
  "passwordPolicy.label.good",
  "passwordPolicy.label.strong",
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the full list of requirements for display, each with whether met.
 * Always includes the noPersonal requirement when context has email/name/accountName.
 */
export function getPasswordRequirements(password, context = {}) {
  const pw = String(password || "");
  const hasPersonalCtx = !!(context.email || context.name || context.accountName);
  const reqs = hasPersonalCtx ? [...BASE_REQUIREMENTS, PERSONAL_REQUIREMENT] : BASE_REQUIREMENTS;

  return reqs.map(({ key, i18nKey, label, check }) => ({
    key,
    i18nKey,
    label,
    met: pw.length === 0 ? false : check(pw, context),
  }));
}

/**
 * Returns a numeric strength score 0–4.
 *   0 – empty
 *   1 – weak
 *   2 – fair
 *   3 – good
 *   4 – strong (all requirements met)
 */
export function getPasswordStrengthScore(password, context = {}) {
  const pw = String(password || "");
  if (!pw) return 0;

  const requirements = getPasswordRequirements(pw, context);
  const total = requirements.length;
  const met   = requirements.filter((r) => r.met).length;

  if (met === total) return 4;
  const ratio = met / total;
  if (ratio >= 0.75) return 3;
  if (ratio >= 0.5)  return 2;
  if (ratio >= 0.25) return 1;
  return 0;
}

/**
 * Full validation result.
 *
 * {
 *   valid:        boolean         – true only when every requirement is met
 *   score:        0 | 1 | 2 | 3 | 4
 *   label:        "Weak" | "Fair" | "Good" | "Strong"
 *   labelKey:     string          – i18n key for the label
 *   errors:       string[]        – human-readable descriptions of unmet requirements
 *   failedKeys:   string[]        – machine-readable requirement keys (safe to log)
 *   requirements: Array<{ key, i18nKey, label, met }>
 * }
 */
export function validatePasswordStrength(password, context = {}) {
  const pw           = String(password || "");
  const requirements = getPasswordRequirements(pw, context);
  const unmet        = requirements.filter((r) => !r.met);
  const valid        = unmet.length === 0 && pw.length > 0;
  const score        = getPasswordStrengthScore(pw, context);

  return {
    valid,
    score,
    label:       SCORE_LABELS[score],
    labelKey:    SCORE_LABEL_KEYS[score],
    errors:      unmet.map((r) => r.label),
    failedKeys:  unmet.map((r) => r.key),
    requirements,
  };
}
