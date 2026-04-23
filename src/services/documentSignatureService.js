import { supabase } from "../lib/supabase";
import { logSecurityRelevantFailure } from "./securityFailureLogger";

export const SIGNATURE_PROVIDERS = ["docuseal", "opensign", "libresign", "manual"];

export const DEFAULT_SIGNATURE_SETTINGS = Object.freeze({
  account_id: "",
  provider: "docuseal",
  provider_base_url: "",
  default_signature_template_id: "",
  is_enabled: false,
  webhook_configured: false,
  configured_by: null,
  configured_at: null,
  updated_at: null,
});

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeProvider(value) {
  const next = normalizeText(value).toLowerCase();
  return SIGNATURE_PROVIDERS.includes(next) ? next : "docuseal";
}

function normalizeSettings(row, accountId = "") {
  const value = row || {};
  return {
    ...DEFAULT_SIGNATURE_SETTINGS,
    account_id: String(value.account_id || accountId || ""),
    provider: normalizeProvider(value.provider),
    provider_base_url: normalizeText(value.provider_base_url),
    default_signature_template_id: normalizeText(value.default_signature_template_id),
    is_enabled: Boolean(value.is_enabled),
    webhook_configured: Boolean(value.webhook_configured),
    configured_by: value.configured_by || null,
    configured_at: value.configured_at || null,
    updated_at: value.updated_at || null,
  };
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

function context(extra = {}) {
  return {
    surface: "document_signature_readiness",
    ...extra,
  };
}

export function assessDocumentSignatureReadiness(settings) {
  const current = normalizeSettings(settings);
  const requiredActions = [];
  const recommendedActions = [];

  if (!current.is_enabled) {
    requiredActions.push("enable_provider");
  }
  if (!current.provider_base_url) {
    requiredActions.push("add_provider_url");
  }
  if (!current.default_signature_template_id) {
    requiredActions.push("add_template_id");
  }
  if (!current.webhook_configured) {
    recommendedActions.push("configure_webhook");
  }

  const state =
    !current.is_enabled
      ? "not_started"
      : requiredActions.length > 0
        ? "needs_attention"
        : current.webhook_configured
          ? "ready"
          : "provider_ready";

  return {
    state,
    requiredActions,
    recommendedActions,
    isProviderReady: current.is_enabled && requiredActions.length === 0,
    isWebhookReady: current.is_enabled && requiredActions.length === 0 && current.webhook_configured,
  };
}

export async function fetchDocumentSignatureSettings(accountId) {
  if (!accountId) return normalizeSettings(null);

  const { data, error } = await supabase
    .from("document_signature_provider_settings")
    .select(
      "account_id, provider, provider_base_url, default_signature_template_id, is_enabled, webhook_configured, configured_by, configured_at, updated_at",
    )
    .eq("account_id", accountId)
    .maybeSingle();

  if (error) {
    if (isMissingBackendObject(error)) {
      return normalizeSettings(null, accountId);
    }
    logSecurityRelevantFailure("document_signature_settings_select", {
      error,
      context: context({ accountId }),
    });
    throw error;
  }

  return normalizeSettings(data, accountId);
}

export async function saveDocumentSignatureSettings({
  accountId,
  provider = "docuseal",
  providerBaseUrl = "",
  defaultSignatureTemplateId = "",
  isEnabled = false,
  webhookConfigured = false,
} = {}) {
  if (!accountId) throw new Error("Missing accountId");

  const { data, error } = await supabase.rpc("upsert_document_signature_provider_settings", {
    p_account_id: accountId,
    p_provider: normalizeProvider(provider),
    p_provider_base_url: normalizeText(providerBaseUrl) || null,
    p_default_signature_template_id: normalizeText(defaultSignatureTemplateId) || null,
    p_is_enabled: Boolean(isEnabled),
    p_webhook_configured: Boolean(webhookConfigured),
  });

  if (error) {
    if (isMissingBackendObject(error)) {
      return normalizeSettings({
        account_id: accountId,
        provider,
        provider_base_url: providerBaseUrl,
        default_signature_template_id: defaultSignatureTemplateId,
        is_enabled: isEnabled,
        webhook_configured: webhookConfigured,
      }, accountId);
    }
    logSecurityRelevantFailure("document_signature_settings_upsert", {
      error,
      context: context({ accountId, provider }),
    });
    throw error;
  }

  return normalizeSettings(data, accountId);
}

export async function prepareDocumentPacketSignature({
  packetId,
  signatureProvider = null,
  signatureTemplateId = null,
} = {}) {
  if (!packetId) throw new Error("Missing packetId");

  const { data, error } = await supabase.rpc("prepare_document_packet_signature", {
    p_packet_id: packetId,
    p_signature_provider: signatureProvider ? normalizeProvider(signatureProvider) : null,
    p_signature_template_id: normalizeText(signatureTemplateId) || null,
  });

  if (error) {
    logSecurityRelevantFailure("prepare_document_packet_signature", {
      error,
      context: context({ packetId, signatureProvider }),
    });
    throw error;
  }

  return data;
}
