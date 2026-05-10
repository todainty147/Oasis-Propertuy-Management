import { useEffect, useMemo, useState } from "react";
import Card from "../components/Card";
import { usePageTitle } from "../layout/PageTitleContext";
import { useAccount } from "../context/AccountContext";
import { useI18n } from "../context/I18nContext";
import { supabase } from "../lib/supabase";
import {
  SUPPORTED_COUNTRIES,
  SUPPORTED_CURRENCIES,
  getDefaultCurrencyForCountry,
} from "../utils/currency";

const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "pl", label: "Polski" },
  { code: "de", label: "Deutsch" },
];

export default function AccountLocalizationPage() {
  const { t } = useI18n();
  const { setTitle } = usePageTitle();
  const { activeAccountId, activeRole, isRootOperator,
          activeCurrency, activeCountryCode, activeLanguage } = useAccount();

  const canEdit = isRootOperator || String(activeRole || "").toLowerCase() === "owner";

  const [form, setForm] = useState({
    country_code: activeCountryCode || "PL",
    currency:     activeCurrency    || "PLN",
    language:     activeLanguage    || "pl",
  });
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => { setTitle(t("localization.title")); }, [setTitle, t]);

  // Keep form in sync when account switches
  useEffect(() => {
    setForm({
      country_code: activeCountryCode || "PL",
      currency:     activeCurrency    || "PLN",
      language:     activeLanguage    || "pl",
    });
  }, [activeCountryCode, activeCurrency, activeLanguage]);

  // Auto-suggest currency when country changes
  function handleCountryChange(code) {
    const suggestedCurrency = getDefaultCurrencyForCountry(code);
    setForm((prev) => ({
      ...prev,
      country_code: code,
      currency: suggestedCurrency,
    }));
  }

  const currencyLabel = useMemo(() => {
    const found = SUPPORTED_CURRENCIES.find((c) => c.code === form.currency);
    return found?.label || form.currency;
  }, [form.currency]);

  async function onSave(e) {
    e.preventDefault();
    if (!activeAccountId || !canEdit) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const { error: rpcErr } = await supabase.rpc("update_account_localization", {
        p_account_id:   activeAccountId,
        p_country_code: form.country_code,
        p_currency:     form.currency,
        p_language:     form.language,
      });
      if (rpcErr) throw rpcErr;
      setMessage(t("localization.saved"));
    } catch (err) {
      setError(err?.message || t("localization.saveError"));
    } finally {
      setSaving(false);
    }
  }

  if (!canEdit) {
    return (
      <Card className="p-6">
        <p className="text-sm text-slate-600">{t("localization.accessDenied")}</p>
      </Card>
    );
  }

  return (
    <form onSubmit={onSave} className="space-y-4" data-testid="localization-form">
      <Card className="p-5 border">
        <h2 className="text-base font-semibold text-slate-900">{t("localization.title")}</h2>
        <p className="text-sm text-slate-500 mt-1">{t("localization.subtitle")}</p>

        <div className="mt-5 space-y-4">
          {/* Country */}
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-700">{t("localization.country")}</span>
            <select
              value={form.country_code}
              onChange={(e) => handleCountryChange(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              aria-label={t("localization.country")}
            >
              {SUPPORTED_COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>{c.label}</option>
              ))}
            </select>
            <p className="text-xs text-slate-500">{t("localization.countryHint")}</p>
          </label>

          {/* Currency */}
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-700">{t("common.currency")}</span>
            <select
              value={form.currency}
              onChange={(e) => setForm((prev) => ({ ...prev, currency: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              aria-label={t("common.currency")}
            >
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>{c.label}</option>
              ))}
            </select>
            <p className="text-xs text-slate-500">{t("localization.currencyHint")}</p>
          </label>

          {/* Language */}
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-700">{t("localization.language")}</span>
            <select
              value={form.language}
              onChange={(e) => setForm((prev) => ({ ...prev, language: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              aria-label={t("localization.language")}
            >
              {SUPPORTED_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
          </label>

          {/* Preview */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t("localization.preview")}
            </p>
            <p className="text-sm text-slate-700">
              {t("localization.previewCurrency")}{" "}
              <span className="font-semibold text-slate-900">{currencyLabel}</span>
            </p>
            <p className="text-xs text-slate-500">{t("localization.previewNote")}</p>
          </div>

          {error   && <p className="text-sm text-rose-600">{error}</p>}
          {message && <p className="text-sm text-emerald-700">{message}</p>}
        </div>

        <div className="mt-5">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? t("common.saving") : t("localization.save")}
          </button>
        </div>
      </Card>
    </form>
  );
}
