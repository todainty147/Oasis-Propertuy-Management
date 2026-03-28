import { supabase } from "../lib/supabase";
import { parseRpcRows, parseSecurityObservabilityEventRow } from "./rpcContracts";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function clampLimit(value) {
  return Math.min(Math.max(Number(value) || DEFAULT_LIMIT, 1), MAX_LIMIT);
}

function normalizeFilter(value) {
  const next = String(value || "").trim().toLowerCase();
  return next || null;
}

function normalizeDateFilter(value) {
  if (!value) return null;
  const next = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(next.getTime())) return null;
  return next.toISOString();
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
    since = null,
    until = null,
  } = {},
) {
  if (!accountId) return [];

  const { data, error } = await supabase.rpc("security_observability_event_feed", {
    p_account_id: accountId,
    p_category: normalizeFilter(category),
    p_kind: normalizeFilter(kind),
    p_surface: normalizeFilter(surface),
    p_limit: clampLimit(limit),
    p_since: normalizeDateFilter(since),
    p_until: normalizeDateFilter(until),
  });

  if (error) throw friendly(error, "Failed to load security observability events");
  return parseRpcRows(
    data || [],
    parseSecurityObservabilityEventRow,
    "security_observability_event_feed rows",
  );
}
