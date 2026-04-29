import { useEffect, useState } from "react";
import Card from "../components/Card";
import Skeleton from "../components/ui/Skeleton";
import DashboardBreadcrumbs from "../components/DashboardBreadcrumbs";
import { useAccount } from "../context/AccountContext";
import { useI18n } from "../context/I18nContext";
import { usePageTitle } from "../layout/PageTitleContext";
import { fetchMyLease, getDerivedLeaseStatus } from "../services/leaseService";

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString();
}

function LeaseStatusBadge({ status, t }) {
  const base = "inline-flex rounded-full border px-3 py-1 text-xs font-medium";
  if (status === "active") return <span className={`${base} border-emerald-200 bg-emerald-50 text-emerald-700`}>{t("tenantPortal.lease.status.active")}</span>;
  if (status === "expiring_soon") return <span className={`${base} border-amber-200 bg-amber-50 text-amber-800`}>{t("tenantPortal.lease.status.expiringSoon")}</span>;
  if (status === "renewal_in_progress") return <span className={`${base} border-blue-200 bg-blue-50 text-blue-700`}>{t("tenantPortal.lease.status.renewalInProgress")}</span>;
  if (status === "renewed") return <span className={`${base} border-emerald-200 bg-emerald-50 text-emerald-700`}>{t("tenantPortal.lease.status.renewed")}</span>;
  if (status === "ended") return <span className={`${base} border-slate-200 bg-slate-50 text-slate-600`}>{t("tenantPortal.lease.status.ended")}</span>;
  return <span className={`${base} border-slate-200 bg-slate-50 text-slate-600`}>{status || "—"}</span>;
}

function DetailRow({ label, value }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <p className="text-sm text-slate-500 sm:shrink-0 sm:w-48">{label}</p>
      <p className="text-sm font-medium text-slate-900 sm:text-right">{value || "—"}</p>
    </div>
  );
}

export default function TenantLeasePage() {
  const { activeAccountId, accountLoading } = useAccount();
  const { t } = useI18n();
  const { setTitle } = usePageTitle();

  const [lease, setLease] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setTitle(t("tenantPortal.shell.nav.lease"));
  }, [setTitle, t]);

  useEffect(() => {
    if (accountLoading || !activeAccountId) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const row = await fetchMyLease(activeAccountId);
        if (!cancelled) setLease(row);
      } catch (err) {
        if (!cancelled) setError(err?.message || t("tenantPortal.lease.loadError"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [accountLoading, activeAccountId, t]);

  if (accountLoading || loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-48" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <DashboardBreadcrumbs items={[{ label: t("tenantPortal.shell.nav.lease") }]} />
        <Card className="border-rose-200 bg-rose-50 p-6">
          <p className="font-semibold text-rose-800">{t("tenantPortal.lease.loadError")}</p>
          <p className="mt-2 text-sm text-rose-700">{error}</p>
        </Card>
      </div>
    );
  }

  if (!lease) {
    return (
      <div className="space-y-4">
        <DashboardBreadcrumbs items={[{ label: t("tenantPortal.shell.nav.lease") }]} />
        <Card className="p-6">
          <p className="font-semibold text-slate-900">{t("tenantPortal.lease.noLease")}</p>
          <p className="mt-2 text-sm text-slate-600">{t("tenantPortal.lease.noLeaseHint")}</p>
        </Card>
      </div>
    );
  }

  const status = getDerivedLeaseStatus(lease);
  const daysUntilEnd = lease.daysUntilEnd;

  return (
    <div className="space-y-6">
      <DashboardBreadcrumbs items={[{ label: t("tenantPortal.shell.nav.lease") }]} />

      <div>
        <h2 className="text-2xl font-bold text-slate-900">{t("tenantPortal.lease.pageTitle")}</h2>
        <p className="text-sm text-slate-500">{lease.propertyLabel}</p>
      </div>

      <Card className="p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t("tenantPortal.lease.statusLabel")}</p>
            <div className="mt-2">
              <LeaseStatusBadge status={status} t={t} />
            </div>
          </div>
          {Number.isFinite(daysUntilEnd) ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-right">
              <p className="text-xs text-slate-500">{t("tenantPortal.lease.timeRemaining")}</p>
              <p className={`mt-1 text-2xl font-bold ${daysUntilEnd < 0 ? "text-rose-700" : daysUntilEnd <= 30 ? "text-amber-700" : "text-slate-900"}`}>
                {daysUntilEnd < 0 ? Math.abs(daysUntilEnd) : daysUntilEnd}
              </p>
              <p className="text-xs text-slate-500">{daysUntilEnd < 0 ? t("tenantPortal.lease.daysOverdue") : t("tenantPortal.lease.daysLeft")}</p>
            </div>
          ) : null}
        </div>

        <hr className="border-slate-200" />

        <div className="space-y-4">
          <DetailRow label={t("tenantPortal.lease.property")} value={lease.propertyLabel} />
          <DetailRow label={t("tenantPortal.lease.startDate")} value={formatDate(lease.lease_start_date)} />
          <DetailRow label={t("tenantPortal.lease.endDate")} value={formatDate(lease.lease_end_date)} />
          <DetailRow
            label={t("tenantPortal.lease.noticePeriod")}
            value={t("tenantPortal.lease.noticePeriodValue", { days: lease.notice_period_days })}
          />
          <DetailRow
            label={t("tenantPortal.lease.autoRenew")}
            value={lease.auto_renew ? t("common.yes") : t("common.no")}
          />
        </div>

        {lease.notes ? (
          <>
            <hr className="border-slate-200" />
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t("tenantPortal.lease.notes")}</p>
              <p className="mt-2 text-sm text-slate-700 whitespace-pre-wrap">{lease.notes}</p>
            </div>
          </>
        ) : null}
      </Card>

      {(status === "expiring_soon" || status === "ended") ? (
        <Card className="border-amber-200 bg-amber-50 p-5">
          <p className="font-semibold text-amber-900">
            {status === "ended" ? t("tenantPortal.lease.expiredNotice") : t("tenantPortal.lease.expiringSoonNotice")}
          </p>
          <p className="mt-2 text-sm text-amber-800">{t("tenantPortal.lease.renewalHint")}</p>
        </Card>
      ) : null}
    </div>
  );
}
