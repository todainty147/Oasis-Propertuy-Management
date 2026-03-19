import { supabase } from "../lib/supabase";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function clampLimit(value) {
  return Math.min(Math.max(Number(value) || DEFAULT_LIMIT, 1), MAX_LIMIT);
}

function normalizeFilter(value) {
  const next = String(value || "").trim().toLowerCase();
  return next || null;
}

function friendly(error, fallback) {
  return new Error(error?.message || fallback);
}

export async function listSecurityObservabilityEvents(
  accountId,
  {
    category = null,
    kind = null,
    surface = null,
    limit = DEFAULT_LIMIT,
  } = {},
) {
  if (!accountId) return [];

  const { data, error } = await supabase.rpc("security_observability_event_feed", {
    p_account_id: accountId,
    p_category: normalizeFilter(category),
    p_kind: normalizeFilter(kind),
    p_surface: normalizeFilter(surface),
    p_limit: clampLimit(limit),
  });

  if (error) throw friendly(error, "Failed to load security observability events");
  return Array.isArray(data) ? data : [];
}
