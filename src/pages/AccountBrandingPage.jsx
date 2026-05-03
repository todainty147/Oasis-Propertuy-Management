import { useEffect, useMemo, useState } from "react";
import Card from "../components/Card";
import { usePageTitle } from "../layout/PageTitleContext";
import { useAccount } from "../context/AccountContext";
import { useI18n } from "../context/I18nContext";
import { getAccountBranding, upsertAccountBranding } from "../services/accountBrandingService";

const INITIAL = {
  brand_name: "",
  logo_url: "",
  primary_color: "#2563eb",
  accent_color: "#0f172a",
  email_from_name: "",
  reply_to_email: "",
  support_email: "",
  invite_subject_template: "",
  invite_button_label: "Accept invitation",
  invite_footer_text: "Sent securely via OASIS Rental",
};

export default function AccountBrandingPage() {
  const { t } = useI18n();
  const { setTitle } = usePageTitle();
  const { activeAccountId, activeRole, isRootOperator } = useAccount();
  const role = useMemo(() => String(activeRole || "").toLowerCase(), [activeRole]);
  const canEdit = isRootOperator || role === "owner";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState(INITIAL);

  useEffect(() => {
    setTitle(t("branding.title"));
  }, [setTitle, t]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!activeAccountId) return;
      setLoading(true);
      setError("");
      try {
        const data = await getAccountBranding(activeAccountId);
        if (!cancelled && data) setForm((prev) => ({ ...prev, ...data }));
      } catch (e) {
        if (!cancelled) setError(e?.message || t("branding.loadError"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [activeAccountId, t]);

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSave(e) {
    e.preventDefault();
    if (!activeAccountId || !canEdit) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await upsertAccountBranding({
        account_id: activeAccountId,
        ...form,
      });
      setMessage(t("branding.saved"));
    } catch (e2) {
      setError(e2?.message || t("branding.saveError"));
    } finally {
      setSaving(false);
    }
  }

  if (!canEdit) {
    return (
      <Card className="p-6">
        <p className="text-sm text-slate-600">{t("branding.accessDenied")}</p>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card className="p-6">
        <p className="text-sm text-slate-600">{t("common.loading")}</p>
      </Card>
    );
  }

  return (
    <form onSubmit={onSave} className="space-y-4">
      <Card className="p-5 border">
        <h2 className="text-base font-semibold text-slate-900">{t("branding.title")}</h2>
        <p className="text-sm text-slate-500 mt-1">{t("branding.subtitle")}</p>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label={t("branding.brandName")} value={form.brand_name} onChange={(v) => updateField("brand_name", v)} />
          <Field label={t("branding.emailFromName")} value={form.email_from_name} onChange={(v) => updateField("email_from_name", v)} />
          <Field label={t("branding.logoUrl")} value={form.logo_url} onChange={(v) => updateField("logo_url", v)} />
          <Field label={t("branding.replyTo")} value={form.reply_to_email} onChange={(v) => updateField("reply_to_email", v)} />
          <Field label={t("branding.supportEmail")} value={form.support_email} onChange={(v) => updateField("support_email", v)} />
          <Field label={t("branding.primaryColor")} value={form.primary_color} onChange={(v) => updateField("primary_color", v)} />
        </div>

        <div className="mt-3">
          <Field
            label={t("branding.inviteSubjectTemplate")}
            value={form.invite_subject_template}
            onChange={(v) => updateField("invite_subject_template", v)}
          />
        </div>

        <div className="mt-3">
          <Field
            label={t("branding.inviteButtonLabel")}
            value={form.invite_button_label}
            onChange={(v) => updateField("invite_button_label", v)}
          />
        </div>

        <label className="mt-3 block">
          <span className="text-xs text-slate-500">{t("branding.inviteFooterText")}</span>
          <textarea
            value={form.invite_footer_text || ""}
            onChange={(e) => updateField("invite_footer_text", e.target.value)}
            className="mt-1 w-full min-h-[100px] border rounded-lg px-3 py-2 text-sm"
          />
        </label>

        {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}
        {message ? <p className="mt-3 text-sm text-emerald-700">{message}</p> : null}

        <div className="mt-4">
          <button
            type="submit"
            disabled={saving}
            className={`px-4 py-2 rounded-lg text-sm text-white ${saving ? "bg-slate-400" : "bg-blue-600 hover:bg-blue-700"}`}
          >
            {saving ? t("common.saving") : t("branding.save")}
          </button>
        </div>
      </Card>
    </form>
  );
}

function Field({ label, value, onChange }) {
  return (
    <label>
      <span className="text-xs text-slate-500">{label}</span>
      <input
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
      />
    </label>
  );
}

