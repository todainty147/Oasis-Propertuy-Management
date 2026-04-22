import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_PAYMENT_COLLECTION_SETTINGS,
  PAYMENT_COLLECTION_METHODS,
  getAccountPaymentCollectionSettings,
  upsertAccountPaymentCollectionSettings,
} from "../../services/paymentCollectionSettingsService";

function emptySettings(accountId) {
  return {
    ...DEFAULT_PAYMENT_COLLECTION_SETTINGS,
    account_id: accountId || "",
  };
}

export default function TenantPaymentCollectionSettingsCard({
  accountId,
  canManage = false,
  t,
}) {
  const [settings, setSettings] = useState(() => emptySettings(accountId));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!accountId || !canManage) {
        if (!cancelled) {
          setSettings(emptySettings(accountId));
          setLoading(false);
        }
        return;
      }

      try {
        setLoading(true);
        setError("");
        const next = await getAccountPaymentCollectionSettings(accountId);
        if (!cancelled) {
          setSettings(next);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t("finance.collection.loadError"));
          setSettings(emptySettings(accountId));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [accountId, canManage, t]);

  const selectedMethods = useMemo(() => new Set(settings.accepted_methods || []), [settings.accepted_methods]);
  const showMethods = settings.collection_status !== "disabled";
  const showPortal = settings.collection_status === "external_portal";

  function updateField(key, value) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function toggleMethod(method) {
    setSettings((current) => {
      const methods = new Set(current.accepted_methods || []);
      if (methods.has(method)) methods.delete(method);
      else methods.add(method);
      return { ...current, accepted_methods: Array.from(methods) };
    });
  }

  async function handleSave(event) {
    event.preventDefault();
    if (!accountId) return;

    try {
      setSaving(true);
      setError("");
      setMessage("");
      const next = await upsertAccountPaymentCollectionSettings({
        accountId,
        collectionStatus: settings.collection_status,
        acceptedMethods: settings.accepted_methods,
        instructions: settings.instructions,
        portalUrl: settings.portal_url,
        supportEmail: settings.support_email,
        autopayStatus: settings.autopay_status,
        autopayInstructions: settings.autopay_instructions,
      });
      setSettings(next);
      setMessage(t("finance.collection.saveSuccess"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("finance.collection.saveError"));
    } finally {
      setSaving(false);
    }
  }

  if (!canManage) return null;

  return (
    <form
      onSubmit={handleSave}
      className="rounded-xl border border-slate-200 bg-white p-6"
      data-testid="payment-collection-settings-card"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{t("finance.collection.title")}</h2>
          <p className="mt-1 text-sm text-slate-600">{t("finance.collection.subtitle")}</p>
        </div>
        <span className="inline-flex self-start rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
          {t("finance.collection.truthBadge")}
        </span>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">{t("finance.collection.loading")}</p>
      ) : (
        <div className="mt-5 space-y-5">
          <label className="block space-y-2">
            <span className="text-sm font-medium text-slate-700">{t("finance.collection.collectionStatus")}</span>
            <select
              value={settings.collection_status}
              onChange={(event) => updateField("collection_status", event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
            >
              <option value="disabled">{t("finance.collection.status.disabled")}</option>
              <option value="manual">{t("finance.collection.status.manual")}</option>
              <option value="external_portal">{t("finance.collection.status.externalPortal")}</option>
            </select>
          </label>

          {showMethods ? (
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium text-slate-700">{t("finance.collection.acceptedMethods")}</legend>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {PAYMENT_COLLECTION_METHODS.map((method) => (
                  <label
                    key={method}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                  >
                    <input
                      type="checkbox"
                      checked={selectedMethods.has(method)}
                      onChange={() => toggleMethod(method)}
                    />
                    <span>{t(`tenantPortal.payments.methods.${method}`)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

          {showPortal ? (
            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-700">{t("finance.collection.portalUrl")}</span>
              <input
                type="url"
                value={settings.portal_url}
                onChange={(event) => updateField("portal_url", event.target.value)}
                placeholder="https://payments.example.com/pay"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </label>
          ) : null}

          <label className="block space-y-2">
            <span className="text-sm font-medium text-slate-700">{t("finance.collection.instructions")}</span>
            <textarea
              value={settings.instructions}
              onChange={(event) => updateField("instructions", event.target.value)}
              rows={4}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              placeholder={t("finance.collection.instructionsPlaceholder")}
            />
          </label>

          <div className="grid gap-5 lg:grid-cols-2">
            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-700">{t("finance.collection.supportEmail")}</span>
              <input
                type="email"
                value={settings.support_email}
                onChange={(event) => updateField("support_email", event.target.value)}
                placeholder="billing@example.com"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-700">{t("finance.collection.autopayStatus")}</span>
              <select
                value={settings.autopay_status}
                onChange={(event) => updateField("autopay_status", event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              >
                <option value="not_available">{t("finance.collection.autopay.notAvailable")}</option>
                <option value="external">{t("finance.collection.autopay.external")}</option>
              </select>
            </label>
          </div>

          <label className="block space-y-2">
            <span className="text-sm font-medium text-slate-700">{t("finance.collection.autopayInstructions")}</span>
            <textarea
              value={settings.autopay_instructions}
              onChange={(event) => updateField("autopay_instructions", event.target.value)}
              rows={3}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              placeholder={t("finance.collection.autopayInstructionsPlaceholder")}
            />
          </label>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {message ? <p className="text-sm text-emerald-700">{message}</p> : null}

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-slate-500">{t("finance.collection.disclaimer")}</p>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? t("finance.collection.saving") : t("finance.collection.save")}
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
