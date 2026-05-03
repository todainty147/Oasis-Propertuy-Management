/**
 * Epic C1 — relative time formatting for AI-generated insight timestamps.
 * Shows "just now", "4 minutes ago", "2 hours ago", or falls back to an
 * absolute locale string for anything older than 24 hours.
 */

function absoluteTimestamp(date) {
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/**
 * Formats an ISO timestamp as a relative age string for AI insight cards.
 *
 * @param {string|null|undefined} value  - ISO 8601 timestamp string
 * @param {Date} [now]                   - reference point (default: Date.now())
 * @returns {string}
 */
export function formatRelativeTimestamp(value, now = new Date()) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const diffMs = now.getTime() - date.getTime();

  // Future timestamps (clock skew / just-generated) → "just now"
  if (diffMs < 0) return "just now";

  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);

  if (diffSeconds < 60) return "just now";
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;

  // Older than 24h — fall back to absolute date+time
  return absoluteTimestamp(date);
}

/**
 * Formats a "Generated X ago" label suitable for AI insight footers.
 * Returns an empty string when value is absent.
 */
export function formatGeneratedAgoLabel(value, now = new Date()) {
  const relative = formatRelativeTimestamp(value, now);
  if (!relative) return "";
  return `Generated ${relative}`;
}
