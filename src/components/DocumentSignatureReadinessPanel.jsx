import { useEffect, useMemo, useState } from "react";
import Card from "./Card";
import {
  assessDocumentSignatureReadiness,
  fetchDocumentSignatureSettings,
  normalizeProviderBaseUrlForSave,
  saveDocumentSignatureSettings,
  SIGNATURE_PROVIDERS,
} from "../services/documentSignatureService";

function fieldClasses(extra = "") {
  return `rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 ${extra}`;
}

function statusClasses(state) {
  if (state === "ready") return "border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-200";
  if (state === "provider_ready") return "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200";
  if (state === "needs_attention") return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200";
  return "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300";
}

export default function DocumentSignatureReadinessPanel({ accountId, t }) {
  const [form, setForm] = useState({
    provider: "docuseal",
    providerBaseUrl: "",
    defaultSignatureTemplateId: "",
    isEnabled: false,
    webhookConfigured: false,
  });
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const readiness = useMemo(() => assessDocumentSignatureReadiness({
    provider: form.provider,
    provider_base_url: form.providerBaseUrl,
    default_signature_template_id: form.defaultSignatureTemplateId,
    is_enabled: form.isEnabled,
    webhook_configured: form.webhookConfigured,
  }), [form]);

  async function load() {
    if (!accountId) return;
    setLoading(true);
    setError("");
    try {
      const settings = await fetchDocumentSignatureSettings(accountId);
      setForm({
        provider: settings.provider,
        providerBaseUrl: settings.provider_base_url,
        defaultSignatureTemplateId: settings.default_signature_template_id,
        isEnabled: settings.is_enabled,
        webhookConfigured: settings.webhook_configured,
      });
    } catch (err) {
      setError(err?.message || t("documents.signatures.loadError"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  function patchForm(patch) {
    setForm((current) => ({ ...current, ...patch }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!accountId) return;
    setBusy(true);
    setError("");
    try {
      const saved = await saveDocumentSignatureSettings({
        accountId,
        provider: form.provider,
        providerBaseUrl: form.providerBaseUrl,
        defaultSignatureTemplateId: form.defaultSignatureTemplateId,
        isEnabled: form.isEnabled,
        webhookConfigured: form.webhookConfigured,
      });
      setForm({
        provider: saved.provider,
        providerBaseUrl: saved.provider_base_url,
        defaultSignatureTemplateId: saved.default_signature_template_id,
        isEnabled: saved.is_enabled,
        webhookConfigured: saved.webhook_configured,
      });
    } catch (err) {
      setError(err?.message || t("documents.signatures.saveError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-4 p-4" data-testid="document-signature-readiness-panel">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-300">
            {t("documents.signatures.eyebrow")}
          </p>
          <h2 className="text-lg font-semibold text-slate-950 dark:text-slate-50">
            {t("documents.signatures.title")}
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-300">
            {t("documents.signatures.subtitle")}
          </p>
        </div>
        <span className={`rounded-lg border px-3 py-2 text-sm font-medium ${statusClasses(readiness.state)}`}>
          {t(`documents.signatures.state.${readiness.state}`)}
        </span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid gap-3 lg:grid-cols-[160px_minmax(220px,1fr)_minmax(220px,1fr)]">
          <select
            value={form.provider}
            onChange={(event) => patchForm({ provider: event.target.value })}
            className={fieldClasses()}
            aria-label={t("documents.signatures.provider")}
          >
            {SIGNATURE_PROVIDERS.map((provider) => (
              <option key={provider} value={provider}>
                {t(`documents.signatures.provider.${provider}`)}
              </option>
            ))}
          </select>
          <input
            value={form.providerBaseUrl}
            onChange={(event) => patchForm({ providerBaseUrl: event.target.value })}
            className={fieldClasses()}
            placeholder={t("documents.signatures.providerUrlPlaceholder")}
            aria-label={t("documents.signatures.providerUrl")}
          />
          <input
            value={form.defaultSignatureTemplateId}
            onChange={(event) => patchForm({ defaultSignatureTemplateId: event.target.value })}
            className={fieldClasses()}
            placeholder={t("documents.signatures.templateIdPlaceholder")}
            aria-label={t("documents.signatures.templateId")}
          />
        </div>

        {form.provider === "docuseal" ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-300">
            <p>{t("documents.signatures.docusealHelp.apiUrl")}</p>
            <p>{t("documents.signatures.docusealHelp.templateId")}</p>
            {form.providerBaseUrl ? (
              <p>
                {t("documents.signatures.docusealHelp.normalized", {
                  url: normalizeProviderBaseUrlForSave(form.provider, form.providerBaseUrl),
                })}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-col gap-2 text-sm text-slate-700 dark:text-slate-200 sm:flex-row sm:items-center sm:gap-6">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.isEnabled}
              onChange={(event) => patchForm({ isEnabled: event.target.checked })}
            />
            {t("documents.signatures.enableProvider")}
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.webhookConfigured}
              onChange={(event) => patchForm({ webhookConfigured: event.target.checked })}
            />
            {t("documents.signatures.webhookConfigured")}
          </label>
        </div>

        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-300">
          {t("documents.signatures.secretNote")}
        </p>

        {readiness.requiredActions.length > 0 || readiness.recommendedActions.length > 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">
            {[...readiness.requiredActions, ...readiness.recommendedActions].map((action) => (
              <p key={action}>- {t(`documents.signatures.action.${action}`)}</p>
            ))}
          </div>
        ) : null}

        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={busy || loading}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {busy ? t("common.saving") : t("documents.signatures.save")}
          </button>
        </div>
      </form>
    </Card>
  );
}
