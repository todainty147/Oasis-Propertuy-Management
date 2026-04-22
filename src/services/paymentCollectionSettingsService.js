import { supabase } from "../lib/supabase";

export const PAYMENT_COLLECTION_METHODS = [
  "bank_transfer",
  "standing_order",
  "external_card",
  "cash",
  "cheque",
  "other",
];

export const DEFAULT_PAYMENT_COLLECTION_SETTINGS = Object.freeze({
  account_id: "",
  collection_status: "disabled",
  accepted_methods: [],
  instructions: "",
  portal_url: "",
  support_email: "",
  autopay_status: "not_available",
  autopay_instructions: "",
  created_at: null,
  updated_at: null,
});

function friendly(err, fallback) {
  return new Error(err?.message ?? fallback);
}

function isMissingBackendObject(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.code === "PGRST205" ||
    error?.code === "PGRST116" ||
    message.includes("relation") ||
    message.includes("does not exist")
  );
}

function normalizeMethod(value) {
  const next = String(value || "").trim().toLowerCase();
  return PAYMENT_COLLECTION_METHODS.includes(next) ? next : null;
}

function normalizeMethods(values) {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values.map(normalizeMethod).filter(Boolean)));
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeUrl(value) {
  const next = normalizeText(value);
  if (!next) return "";
  try {
    const parsed = new URL(next);
    return parsed.toString();
  } catch {
    throw new Error("Payment portal URL must be a valid absolute URL");
  }
}

export function normalizePaymentCollectionSettings(row, accountId = "") {
  const value = row || {};
  return {
    ...DEFAULT_PAYMENT_COLLECTION_SETTINGS,
    account_id: String(value.account_id || accountId || ""),
    collection_status: ["disabled", "manual", "external_portal"].includes(String(value.collection_status || ""))
      ? String(value.collection_status)
      : "disabled",
    accepted_methods: normalizeMethods(value.accepted_methods),
    instructions: normalizeText(value.instructions),
    portal_url: normalizeText(value.portal_url),
    support_email: normalizeText(value.support_email),
    autopay_status: ["not_available", "external"].includes(String(value.autopay_status || ""))
      ? String(value.autopay_status)
      : "not_available",
    autopay_instructions: normalizeText(value.autopay_instructions),
    created_at: value.created_at || null,
    updated_at: value.updated_at || null,
  };
}

export async function getAccountPaymentCollectionSettings(accountId) {
  if (!accountId) return normalizePaymentCollectionSettings(null);

  const { data, error } = await supabase
    .from("account_payment_collection_settings")
    .select(
      "account_id, collection_status, accepted_methods, instructions, portal_url, support_email, autopay_status, autopay_instructions, created_at, updated_at",
    )
    .eq("account_id", accountId)
    .maybeSingle();

  if (error) {
    if (isMissingBackendObject(error)) {
      return normalizePaymentCollectionSettings(null, accountId);
    }
    throw friendly(error, "Failed to load tenant payment settings");
  }

  return normalizePaymentCollectionSettings(data, accountId);
}

export async function upsertAccountPaymentCollectionSettings({
  accountId,
  collectionStatus = "disabled",
  acceptedMethods = [],
  instructions = "",
  portalUrl = "",
  supportEmail = "",
  autopayStatus = "not_available",
  autopayInstructions = "",
} = {}) {
  if (!accountId) throw new Error("Missing accountId");

  const nextCollectionStatus = ["disabled", "manual", "external_portal"].includes(String(collectionStatus))
    ? String(collectionStatus)
    : "disabled";
  const nextAutopayStatus = ["not_available", "external"].includes(String(autopayStatus))
    ? String(autopayStatus)
    : "not_available";

  const payload = {
    account_id: accountId,
    collection_status: nextCollectionStatus,
    accepted_methods: normalizeMethods(acceptedMethods),
    instructions: normalizeText(instructions),
    portal_url: nextCollectionStatus === "external_portal" ? normalizeUrl(portalUrl) : "",
    support_email: normalizeText(supportEmail),
    autopay_status: nextAutopayStatus,
    autopay_instructions: normalizeText(autopayInstructions),
  };

  const { data, error } = await supabase
    .from("account_payment_collection_settings")
    .upsert(payload, { onConflict: "account_id" })
    .select(
      "account_id, collection_status, accepted_methods, instructions, portal_url, support_email, autopay_status, autopay_instructions, created_at, updated_at",
    )
    .single();

  if (error && isMissingBackendObject(error)) {
    return normalizePaymentCollectionSettings(payload, accountId);
  }
  if (error) throw friendly(error, "Failed to save tenant payment settings");
  return normalizePaymentCollectionSettings(data, accountId);
}
