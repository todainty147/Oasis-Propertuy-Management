import { useEffect, useState } from "react";
import Card from "../components/Card";
import Skeleton from "../components/ui/Skeleton";
import { useAccount } from "../context/AccountContext";
import { fetchMyPayments } from "../services/paymentService";
import { useI18n } from "../context/I18nContext";
import { formatCurrencyAmount } from "../utils/currency";
import OnboardingHintCard from "../components/OnboardingHintCard";
import { buildTenantPaymentSummary } from "../utils/tenantPortal";
import { paymentStatusLabelKey, normalizePaymentStatus } from "../utils/statuses";
import DashboardBreadcrumbs from "../components/DashboardBreadcrumbs";

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

export function TenantPaymentsContent({ rows = [], loading = false, err = null, onRefresh, t }) {
  const summary = buildTenantPaymentSummary({}, rows);

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
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  async function load() {
    if (!activeAccountId) return;
    setLoading(true);
    setErr(null);
    try {
      const data = await fetchMyPayments(activeAccountId);
      setRows(data);
    } catch (e) {
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

  return <TenantPaymentsContent rows={rows} loading={loading} err={err} onRefresh={load} t={t} />;
}
