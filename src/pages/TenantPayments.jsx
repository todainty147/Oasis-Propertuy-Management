import { useEffect, useState } from "react";
import Card from "../components/Card";
import Skeleton from "../components/ui/Skeleton";
import { useAccount } from "../context/AccountContext";
import { fetchMyPayments } from "../services/paymentService";
import { useI18n } from "../context/I18nContext";
import { formatCurrencyAmount } from "../utils/currency";
import OnboardingHintCard from "../components/OnboardingHintCard";
import { buildTenantPaymentSummaryFromPayments } from "../utils/tenantPortal";
import { paymentStatusLabelKey, normalizePaymentStatus } from "../utils/statuses";
import DashboardBreadcrumbs from "../components/DashboardBreadcrumbs";
import { usePageTitle } from "../layout/PageTitleContext";
import { getAccountPaymentCollectionSettings } from "../services/paymentCollectionSettingsService";

function statusBadge(status) {
  const base = "text-xs px-2 py-0.5 rounded border";
  const normalized = normalizePaymentStatus(status);
  if (normalized === "paid") return `${base} bg-emerald-50 text-emerald-700 border-emerald-200`;
  if (normalized === "overdue") return `${base} bg-rose-50 text-rose-700 border-rose-200`;
  return `${base} bg-amber-50 text-amber-700 border-amber-200`;
}

function formatDate(value) {
  if (!value) return "—";
  const next = new Date(value);
  if (Number.isNaN(next.getTime())) return String(value);
  return next.toLocaleDateString();
}

function hasTenantPaymentSetup(settings) {
  if (!settings) return false;
  return (
    settings.collection_status !== "disabled" ||
    (settings.accepted_methods || []).length > 0 ||
    Boolean(settings.instructions) ||
    Boolean(settings.portal_url) ||
    Boolean(settings.support_email) ||
    settings.autopay_status === "external" ||
    Boolean(settings.autopay_instructions)
  );
}

function TenantPaymentCollectionCard({ settings, t }) {
  const methods = Array.isArray(settings?.accepted_methods) ? settings.accepted_methods : [];
  const showSetup = hasTenantPaymentSetup(settings);
  const externalPortalEnabled = settings?.collection_status === "external_portal" && settings?.portal_url;

  if (!showSetup) {
    return (
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card className="p-5" data-testid="tenant-payment-options-card">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">{t("tenantPortal.payments.options.title")}</p>
              <h3 className="mt-2 text-lg font-semibold text-slate-900">
                {t("tenantPortal.payments.options.checkoutTitle")}
              </h3>
              <p className="mt-2 text-sm text-slate-600">
                {t("tenantPortal.payments.options.body")}
              </p>
            </div>
            <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">
              {t("tenantPortal.payments.options.unavailable")}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-medium text-slate-700">{t("tenantPortal.payments.options.onlinePayments")}</p>
              <p className="mt-2 text-sm text-slate-500">{t("tenantPortal.payments.options.onlinePaymentsBody")}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-medium text-slate-700">{t("tenantPortal.payments.options.autopay")}</p>
              <p className="mt-2 text-sm text-slate-500">{t("tenantPortal.payments.options.autopayBody")}</p>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <p className="text-sm font-medium text-slate-500">{t("tenantPortal.payments.options.todayTitle")}</p>
          <h3 className="mt-2 text-lg font-semibold text-slate-900">
            {t("tenantPortal.payments.options.todayHeading")}
          </h3>
          <p className="mt-2 text-sm text-slate-600">
            {t("tenantPortal.payments.options.todayBody")}
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.4fr_1fr]">
      <Card className="p-5" data-testid="tenant-payment-options-card">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">{t("tenantPortal.payments.collection.title")}</p>
            <h3 className="mt-2 text-lg font-semibold text-slate-900">
              {externalPortalEnabled
                ? t("tenantPortal.payments.collection.externalTitle")
                : t("tenantPortal.payments.collection.manualTitle")}
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              {settings?.instructions || t("tenantPortal.payments.collection.instructionsFallback")}
            </p>
          </div>
          <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800">
            {externalPortalEnabled
              ? t("tenantPortal.payments.collection.portalEnabled")
              : t("tenantPortal.payments.collection.collectionEnabled")}
          </span>
        </div>

        {methods.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {methods.map((method) => (
              <span
                key={method}
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700"
              >
                {t(`tenantPortal.payments.methods.${method}`)}
              </span>
            ))}
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-3">
          {externalPortalEnabled ? (
            <a
              href={settings.portal_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              {t("tenantPortal.payments.collection.openPortal")}
            </a>
          ) : null}
          {settings?.support_email ? (
            <a
              href={`mailto:${settings.support_email}`}
              className="inline-flex items-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {t("tenantPortal.payments.collection.emailSupport")}
            </a>
          ) : null}
        </div>
      </Card>

      <Card className="p-5">
        <p className="text-sm font-medium text-slate-500">{t("tenantPortal.payments.collection.autopayTitle")}</p>
        <h3 className="mt-2 text-lg font-semibold text-slate-900">
          {settings?.autopay_status === "external"
            ? t("tenantPortal.payments.collection.autopayEnabledTitle")
            : t("tenantPortal.payments.collection.autopayDisabledTitle")}
        </h3>
        <p className="mt-2 text-sm text-slate-600">
          {settings?.autopay_instructions || t("tenantPortal.payments.collection.autopayFallback")}
        </p>
        {settings?.support_email ? (
          <p className="mt-3 text-xs text-slate-500">
            {t("tenantPortal.payments.collection.supportLine", { email: settings.support_email })}
          </p>
        ) : null}
      </Card>
    </div>
  );
}

export function TenantPaymentsContent({ rows = [], loading = false, err = null, onRefresh, settings = null, t }) {
  const summary = buildTenantPaymentSummaryFromPayments(rows);

  return (
    <div className="space-y-6">
      <DashboardBreadcrumbs items={[{ label: t("payments.title") }]} />
      <div>
        <h2 className="text-2xl font-bold text-slate-900">{t("payments.title")}</h2>
        <p className="text-sm text-slate-500">{t("payments.myPaymentsSubtitle")}</p>
      </div>

      <OnboardingHintCard
        title={t("onboarding.hints.tenantPayments.title")}
        body={t("onboarding.hints.tenantPayments.body")}
      />

      <TenantPaymentCollectionCard settings={settings} t={t} />

      {!loading && !err ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card className="p-5">
            <p className="text-sm font-medium text-slate-500">{t("tenantPortal.payments.summary.outstanding")}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">
              {formatCurrencyAmount(summary.outstanding)}
            </p>
            <p className="mt-2 text-sm text-slate-500">
              {summary.overdue > 0
                ? t("tenantPortal.payment.helper.overdue")
                : summary.outstanding > 0
                  ? t("tenantPortal.payment.helper.due")
                  : t("tenantPortal.payment.helper.clear")}
            </p>
          </Card>
          <Card className="p-5">
            <p className="text-sm font-medium text-slate-500">{t("tenantPortal.payments.summary.paid")}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">
              {formatCurrencyAmount(summary.paid)}
            </p>
            <p className="mt-2 text-sm text-slate-500">
              {t("tenantPortal.payments.summary.paidHelper")}
            </p>
          </Card>
          <Card className="p-5">
            <p className="text-sm font-medium text-slate-500">{t("tenantPortal.payments.summary.review")}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">
              {summary.dueOrOverdueCount}
            </p>
            <p className="mt-2 text-sm text-slate-500">
              {t("tenantPortal.payments.summary.reviewHelper", { count: summary.dueOrOverdueCount })}
            </p>
          </Card>
        </div>
      ) : null}

      {err && (
        <Card className="p-4 border border-rose-200 bg-rose-50 text-rose-800">
          {err}
        </Card>
      )}

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      )}

      {!loading && rows.length === 0 && (
        <Card className="p-6">
          <h3 className="text-base font-semibold text-slate-900">{t("tenantPortal.payments.emptyTitle")}</h3>
          <p className="mt-2 text-sm text-slate-600">{t("tenantPortal.payments.emptyBody")}</p>
        </Card>
      )}

      {!loading && rows.length > 0 && (
        <div className="overflow-hidden rounded-xl border bg-white">
          <div className="border-b bg-slate-50 px-6 py-4">
            <h3 className="text-base font-semibold text-slate-900">{t("tenantPortal.payments.historyTitle")}</h3>
            <p className="mt-1 text-sm text-slate-500">{t("tenantPortal.payments.historySubtitle")}</p>
          </div>
          <div className="divide-y">
          {rows.map((p) => (
            <div key={p.id} className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium">{t("payments.amount")}: {formatCurrencyAmount(p.amount)} </p>
                  <span className={statusBadge(p.status)}>
                    {t(paymentStatusLabelKey(p.status) || "common.status")}
                  </span>
                </div>
                <p className="text-sm text-slate-500">
                  {t("payments.dueDate")}: {formatDate(p.due_date)} {p.paid_at ? `• ${t("payments.paidAt")}: ${formatDate(p.paid_at)}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={onRefresh}
                className="text-sm text-blue-600 hover:underline"
              >
                {t("common.refresh")}
              </button>
            </div>
          ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function TenantPayments() {
  const { activeAccountId, accountLoading } = useAccount();
  const { t } = useI18n();
  const { setTitle } = usePageTitle();
  const [rows, setRows] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    setTitle(t("payments.title"));
  }, [setTitle, t]);

  async function load() {
    if (!activeAccountId) return;
    setLoading(true);
    setErr(null);
    try {
      const [data, nextSettings] = await Promise.all([
        fetchMyPayments(activeAccountId),
        getAccountPaymentCollectionSettings(activeAccountId),
      ]);
      setRows(data);
      setSettings(nextSettings);
    } catch (e) {
      setSettings(null);
      setErr(e?.message ?? t("payments.loadError"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!accountLoading && activeAccountId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountLoading, activeAccountId]);

  if (accountLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    );
  }

  return <TenantPaymentsContent rows={rows} loading={loading} err={err} onRefresh={load} settings={settings} t={t} />;
}
