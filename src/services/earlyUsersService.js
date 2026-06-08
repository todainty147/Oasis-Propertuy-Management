import { supabase } from "../lib/supabase";

const DEFAULT_LIMIT = 100;

function optionalText(value) {
  const text = String(value || "").trim();
  return text || null;
}

function safeLimit(value) {
  return Math.min(Math.max(Number(value) || DEFAULT_LIMIT, 1), 500);
}

const SIGNUP_ONLY_EVENTS = new Set([
  "landlord_signup_completed",
  "tenant_invite_accepted",
  "contractor_invite_accepted",
]);

const WARM_LEAD_COMPANION_EVENTS = new Set([
  "first_tenant_created",
  "first_document_uploaded",
  "first_maintenance_request_created",
  "first_rent_record_added",
]);

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function eventKeys(value = {}) {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry?.event_key || entry?.eventKey || entry || "").trim())
      .filter(Boolean);
  }
  return Object.entries(value)
    .filter(([, enabled]) => Boolean(enabled))
    .map(([key]) => key);
}

export function classifyFollowUpPriority(row = {}, { now = new Date() } = {}) {
  const feedbackStatus = String(row.feedbackStatus || row.feedback_status || "").toLowerCase();
  const feedbackOptIn = Boolean(row.feedbackOptIn ?? row.feedback_contact_opt_in);
  if (feedbackStatus === "do_not_contact" || !feedbackOptIn) return "do_not_contact";

  const signedUpAt = parseDate(row.signedUpAt || row.signed_up_at || row.created_at);
  const currentTime = parseDate(now) || new Date();
  const ageMs = signedUpAt ? currentTime.getTime() - signedUpAt.getTime() : null;
  const founderStatus = String(row.founderOfferStatus || row.founder_status || "").toLowerCase();
  const isFounder = Boolean(founderStatus && founderStatus !== "none");
  if (isFounder && ageMs !== null && ageMs >= 0 && ageMs <= 14 * 24 * 60 * 60 * 1000) {
    return "high_priority";
  }

  const keys = eventKeys(row.activationEvents || row.activation_events);
  const hasProperty = keys.includes("first_property_created");
  const hasCompanionEvent = keys.some((key) => WARM_LEAD_COMPANION_EVENTS.has(key));
  if (hasProperty && hasCompanionEvent) return "warm_lead";

  const signupType = String(row.signupType || row.signup_type || "").toLowerCase();
  const hasActivationBeyondSignup = keys.some((key) => !SIGNUP_ONLY_EVENTS.has(key));
  if (
    signupType === "landlord_self_serve" &&
    !hasActivationBeyondSignup &&
    ageMs !== null &&
    ageMs >= 24 * 60 * 60 * 1000
  ) {
    return "needs_help";
  }

  return "not_ready";
}

function normalizeEarlyUserRow(row = {}) {
  const normalized = {
    signupId: row.signup_id || `${row.user_id || "user"}:${row.account_id || "account"}`,
    userId: row.user_id,
    accountId: row.account_id,
    accountName: row.account_name || "",
    signupType: row.signup_type || "",
    email: row.email || "",
    fullName: row.full_name || "",
    signupSource: row.signup_source || "",
    utmSource: row.utm_source || "",
    utmCampaign: row.utm_campaign || "",
    referrer: row.referrer || "",
    landingPath: row.landing_path || "",
    locale: row.locale || row.preferred_language || "",
    signedUpAt: row.signed_up_at || row.created_at || "",
    founderOfferStatus: [null, undefined, "", "none"].includes(row.founder_offer_status || row.founder_status)
      ? ""
      : row.founder_offer_status || row.founder_status,
    founderOfferPosition: row.founder_offer_position ?? row.founder_position ?? null,
    feedbackOptIn: Boolean(row.feedback_opt_in ?? row.feedback_contact_opt_in),
    productUpdatesOptIn: Boolean(row.product_updates_opt_in),
    marketingConsent: Boolean(row.marketing_consent ?? row.marketing_opt_in),
    preferredChannel: row.preferred_channel || "email",
    feedbackStatus: row.feedback_status || "not_contacted",
    feedbackRating: row.feedback_rating ?? null,
    feedbackNotes: row.feedback_notes || "",
    feedbackUpdatedAt: row.feedback_updated_at || row.last_feedback_at || "",
    activationScore: Number(row.activation_score || 0),
    activationEvents: row.activation_events || {},
    firstActivatedAt: row.first_activated_at || "",
    lastActivatedAt: row.last_activated_at || "",
  };
  return {
    ...normalized,
    followUpPriority: classifyFollowUpPriority(normalized),
  };
}

export async function recordSignupIntelligence({
  userId,
  accountId = null,
  signupType,
  email,
  fullName = null,
  signupSource = "app_landlord_signup",
  utmSource = null,
  utmMedium = null,
  utmCampaign = null,
  referrer = null,
  landingPath = null,
  locale = null,
  feedbackOptIn = false,
  productUpdatesOptIn = false,
  marketingConsent = false,
} = {}) {
  if (!userId) throw new Error("Missing userId");
  if (!signupType) throw new Error("Missing signupType");
  if (!email) throw new Error("Missing email");

  const { data, error } = await supabase.rpc("record_signup_intelligence", {
    p_user_id: userId,
    p_account_id: accountId || null,
    p_signup_type: signupType,
    p_email: email,
    p_full_name: optionalText(fullName),
    p_signup_source: optionalText(signupSource) || "app_landlord_signup",
    p_utm_source: optionalText(utmSource),
    p_utm_medium: optionalText(utmMedium),
    p_utm_campaign: optionalText(utmCampaign),
    p_referrer: optionalText(referrer),
    p_landing_path: optionalText(landingPath),
    p_locale: optionalText(locale),
    p_feedback_contact_opt_in: Boolean(feedbackOptIn),
    p_product_updates_opt_in: Boolean(productUpdatesOptIn),
    p_marketing_consent: Boolean(marketingConsent),
  });

  if (error) throw error;
  return data;
}

export async function recordActivationEvent({
  accountId,
  eventKey,
  metadata = {},
} = {}) {
  if (!accountId || !eventKey) return null;

  const { data, error } = await supabase.rpc("record_user_activation_event", {
    p_account_id: accountId,
    p_event_key: eventKey,
    p_metadata: metadata || {},
  });

  if (error) throw error;
  return data;
}

export function recordActivationEventBestEffort(payload) {
  recordActivationEvent(payload).catch((error) => {
    console.warn("[early-users] activation event failed", {
      eventKey: payload?.eventKey || "unknown",
      code: error?.code || "unknown",
    });
  });
}

export async function listEarlyUsers({
  signupType = null,
  feedbackStatus = null,
  founderOnly = false,
  limit = DEFAULT_LIMIT,
} = {}) {
  const { data, error } = await supabase.rpc("early_users_admin_list", {
    p_signup_type: optionalText(signupType),
    p_feedback_status: optionalText(feedbackStatus),
    p_founder_only: Boolean(founderOnly),
    p_limit: safeLimit(limit),
  });

  if (error) throw error;
  return (Array.isArray(data) ? data : []).map(normalizeEarlyUserRow);
}

export async function updateFeedbackStatus({
  userId,
  accountId,
  status,
  notes = null,
  rating = null,
  preferredChannel = null,
} = {}) {
  if (!userId) throw new Error("Missing userId");
  if (!accountId) throw new Error("Missing accountId");
  if (!status) throw new Error("Missing status");

  const { data, error } = await supabase.rpc("update_feedback_status", {
    p_user_id: userId,
    p_account_id: accountId,
    p_status: status,
    p_notes: optionalText(notes),
    p_rating: rating === "" || rating == null ? null : Number(rating),
    p_preferred_channel: optionalText(preferredChannel),
  });

  if (error) throw error;
  return data;
}

export async function getEarlyUserDetail(userId, accountId = null) {
  if (!userId) throw new Error("Missing userId");

  const { data, error } = await supabase.rpc("early_user_detail", {
    p_user_id: userId,
    p_account_id: accountId || null,
  });

  if (error) throw error;
  return data || null;
}
