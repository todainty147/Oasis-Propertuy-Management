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

const DOCUSEAL_HOSTS = new Set([
  "docuseal.com",
  "www.docuseal.com",
  "docuseal.eu",
  "www.docuseal.eu",
]);

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

function ensureUrlWithScheme(value) {
  const raw = normalizeText(value);
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

export function normalizeProviderBaseUrlForSave(provider, value) {
  const normalizedProvider = normalizeProvider(provider);
  const raw = ensureUrlWithScheme(value);
  if (!raw) return "";

  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error("Provider URL must start with http:// or https://");
    }

    if (normalizedProvider === "docuseal") {
      const hostname = url.hostname.toLowerCase();
      if (DOCUSEAL_HOSTS.has(hostname)) {
        const rootHost = hostname.replace(/^www\./, "");
        return `https://api.${rootHost}`;
      }
      if (/^api\.docuseal\.(com|eu)$/i.test(hostname)) {
        return url.origin.replace(/\/+$/, "");
      }
    }

    return url.origin.replace(/\/+$/, "");
  } catch {
    throw new Error("Enter a valid provider URL.");
  }
}

export function validateDocumentSignatureSettings({
  provider = "docuseal",
  providerBaseUrl = "",
  defaultSignatureTemplateId = "",
  isEnabled = false,
} = {}) {
  const normalizedProvider = normalizeProvider(provider);
  const templateId = normalizeText(defaultSignatureTemplateId);
  const baseUrl = normalizeProviderBaseUrlForSave(normalizedProvider, providerBaseUrl);

  if (!isEnabled) {
    return {
      provider: normalizedProvider,
      providerBaseUrl: baseUrl,
      defaultSignatureTemplateId: templateId,
    };
  }

  if (!baseUrl) {
    throw new Error("Provider URL is required before enabling signatures.");
  }

  if (!templateId) {
    throw new Error("Default signature template ID is required before enabling signatures.");
  }

  if (normalizedProvider === "docuseal" && !/^\d+$/.test(templateId)) {
    throw new Error("DocuSeal template ID must be numeric.");
  }

  return {
    provider: normalizedProvider,
    providerBaseUrl: baseUrl,
    defaultSignatureTemplateId: templateId,
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

  const validated = validateDocumentSignatureSettings({
    provider,
    providerBaseUrl,
    defaultSignatureTemplateId,
    isEnabled,
  });

  const { data, error } = await supabase.rpc("upsert_document_signature_provider_settings", {
    p_account_id: accountId,
    p_provider: validated.provider,
    p_provider_base_url: validated.providerBaseUrl || null,
    p_default_signature_template_id: validated.defaultSignatureTemplateId || null,
    p_is_enabled: Boolean(isEnabled),
    p_webhook_configured: Boolean(webhookConfigured),
  });

  if (error) {
    if (isMissingBackendObject(error)) {
      return normalizeSettings({
        account_id: accountId,
        provider: validated.provider,
        provider_base_url: validated.providerBaseUrl,
        default_signature_template_id: validated.defaultSignatureTemplateId,
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
