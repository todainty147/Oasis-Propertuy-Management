const DEFAULT_TTL_MS = 15_000;
const cache = new Map();

function nowMs() {
  return Date.now();
}

export function buildSnapshotCacheKey(surface, parts = {}) {
  const stableParts = Object.entries(parts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}:${value == null ? "" : String(value)}`)
    .join("|");
  return `${surface}|${stableParts}`;
}

export function getSnapshotCacheValue(key, { ttlMs = DEFAULT_TTL_MS, now = nowMs() } = {}) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (now - hit.storedAt > ttlMs) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

export function setSnapshotCacheValue(key, value, { now = nowMs() } = {}) {
  cache.set(key, { value, storedAt: now });
  return value;
}

export function clearSnapshotCache(prefix = "") {
  if (!prefix) {
    cache.clear();
    return;
  }

  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

export const SNAPSHOT_CACHE_TTL_MS = DEFAULT_TTL_MS;
