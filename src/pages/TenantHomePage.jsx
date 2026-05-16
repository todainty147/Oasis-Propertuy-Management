import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Card from "../components/Card";
import Skeleton from "../components/ui/Skeleton";
import DashboardBreadcrumbs from "../components/DashboardBreadcrumbs";
import { useAccount } from "../context/AccountContext";
import { useI18n } from "../context/I18nContext";
import { usePageTitle } from "../layout/PageTitleContext";
import { fetchMyLease, getDerivedLeaseStatus } from "../services/leaseService";
import { fetchMyPayments } from "../services/paymentService";
import { buildTenantPaymentSummary } from "../utils/tenantPortal";
import { formatCurrencyAmount } from "../utils/currency";

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString();
}

function LeaseStatusBadge({ status }) {
  const base = "inline-flex rounded-full border px-3 py-1 text-xs font-medium";
  if (status === "active") return <span className={`${base} border-emerald-200 bg-emerald-50 text-emerald-700`}>Active</span>;
  if (status === "expiring_soon") return <span className={`${base} border-amber-200 bg-amber-50 text-amber-800`}>Expiring soon</span>;
  if (status === "renewal_in_progress") return <span className={`${base} border-blue-200 bg-blue-50 text-blue-700`}>Renewal in progress</span>;
  if (status === "renewed") return <span className={`${base} border-emerald-200 bg-emerald-50 text-emerald-700`}>Renewed</span>;
  if (status === "ended") return <span className={`${base} border-slate-200 bg-slate-50 text-slate-600`}>Ended</span>;
  return <span className={`${base} border-slate-200 bg-slate-50 text-slate-600`}>{status || "—"}</span>;
}

function LeaseSummaryCard({ lease, loading, t }) {
  if (loading) return <Skeleton className="h-32" />;

  if (!lease) {
    return (
      <Card className="p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">{t("tenantPortal.home.leaseCard.title")}</p>
        <p className="mt-3 text-sm text-[var(--text-secondary)]">{t("tenantPortal.home.leaseCard.empty")}</p>
        <Link to="/tenant/lease" className="mt-3 inline-block text-sm font-medium text-[var(--focus-border)] hover:underline">
          {t("tenantPortal.home.leaseCard.viewDetails")} →
        </Link>
      </Card>
    );
  }

  const status = getDerivedLeaseStatus(lease);
  const daysUntilEnd = lease.daysUntilEnd;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">{t("tenantPortal.home.leaseCard.title")}</p>
          <p className="mt-2 text-base font-semibold text-[var(--text-primary)]">{lease.propertyLabel || "—"}</p>
        </div>
        <LeaseStatusBadge status={status} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-[var(--text-muted)]">{t("tenantPortal.lease.startDate")}</p>
          <p className="mt-1 text-sm font-medium text-[var(--text-primary)]">{formatDate(lease.lease_start_date)}</p>
        </div>
        <div>
          <p className="text-xs text-[var(--text-muted)]">{t("tenantPortal.lease.endDate")}</p>
          <p className="mt-1 text-sm font-medium text-[var(--text-primary)]">{formatDate(lease.lease_end_date)}</p>
        </div>
      </div>

      {Number.isFinite(daysUntilEnd) && daysUntilEnd >= 0 ? (
        <p className="mt-3 text-xs text-[var(--text-muted)]">
          {daysUntilEnd === 0
            ? t("tenantPortal.lease.endsToday")
            : t("tenantPortal.lease.daysRemaining", { count: daysUntilEnd })}
        </p>
      ) : null}

      <Link to="/tenant/lease" className="mt-4 inline-block text-sm font-medium text-[var(--focus-border)] hover:underline">
        {t("tenantPortal.home.leaseCard.viewDetails")} →
      </Link>
    </Card>
  );
}

function PaymentSummaryCard({ summary, loading, t }) {
  if (loading) return <Skeleton className="h-32" />;

  const stateClasses = {
    overdue: "border-rose-200 bg-rose-50",
    due: "border-amber-200 bg-amber-50",
    clear: "border-[var(--border-soft)] bg-[var(--surface-1)]",
  };

  return (
    <Card className={`p-5 border ${stateClasses[summary.state] || stateClasses.clear}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">{t("tenantPortal.home.paymentCard.title")}</p>
      <p className={`mt-2 text-2xl font-bold ${summary.state === "overdue" ? "text-rose-700 dark:text-rose-300" : summary.state === "due" ? "text-amber-800 dark:text-amber-300" : "text-[var(--text-primary)]"}`}>
        {formatCurrencyAmount(summary.outstanding)}
      </p>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">
        {summary.state === "overdue"
          ? t("tenantPortal.payment.helper.overdue")
          : summary.state === "due"
            ? t("tenantPortal.payment.helper.due")
            : t("tenantPortal.payment.helper.clear")}
      </p>
      <Link to="/tenant/payments" className="mt-4 inline-block text-sm font-medium text-[var(--focus-border)] hover:underline">
        {t("tenantPortal.home.paymentCard.viewAll")} →
      </Link>
    </Card>
  );
}

function QuickLinksCard({ t }) {
  const links = [
    { to: "/tenant/lease", label: t("tenantPortal.shell.nav.lease") },
    { to: "/tenant/maintenance", label: t("tenantPortal.shell.nav.maintenance") },
    { to: "/tenant/payments", label: t("tenantPortal.shell.nav.payments") },
    { to: "/tenant/documents", label: t("tenantPortal.shell.nav.documents") },
    { to: "/tenant/profile", label: t("tenantPortal.shell.nav.profile") },
  ];

  return (
    <Card className="p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">{t("tenantPortal.home.quickLinks")}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {links.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-2)] px-4 py-3 text-sm font-medium text-[var(--text-primary)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-3)]"
          >
            {link.label}
          </Link>
        ))}
      </div>
    </Card>
  );
}

export default function TenantHomePage() {
  const { activeAccountId, accountLoading } = useAccount();
  const { t } = useI18n();
  const { setTitle } = usePageTitle();

  const [lease, setLease] = useState(null);
  const [leaseLoading, setLeaseLoading] = useState(true);
  const [payments, setPayments] = useState([]);
  const [paymentsLoading, setPaymentsLoading] = useState(true);

  useEffect(() => {
    setTitle(t("tenantPortal.shell.nav.home"));
  }, [setTitle, t]);

  useEffect(() => {
    if (accountLoading || !activeAccountId) return;
    let cancelled = false;

    async function load() {
      setLeaseLoading(true);
      setPaymentsLoading(true);

      const [leaseResult, paymentsResult] = await Promise.allSettled([
        fetchMyLease(activeAccountId),
        fetchMyPayments(activeAccountId),
      ]);

      if (!cancelled) {
        setLease(leaseResult.status === "fulfilled" ? leaseResult.value : null);
        setPayments(paymentsResult.status === "fulfilled" ? paymentsResult.value : []);
        setLeaseLoading(false);
        setPaymentsLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [accountLoading, activeAccountId]);

  const summary = buildTenantPaymentSummary({}, payments);

  if (accountLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DashboardBreadcrumbs items={[{ label: t("tenantPortal.shell.nav.home") }]} />

      <div>
        <h2 className="text-2xl font-bold text-[var(--text-primary)]">{t("tenantPortal.home.title")}</h2>
        <p className="text-sm text-[var(--text-muted)]">{t("tenantPortal.home.subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <LeaseSummaryCard lease={lease} loading={leaseLoading} t={t} />
        <PaymentSummaryCard summary={summary} loading={paymentsLoading} t={t} />
      </div>

      <QuickLinksCard t={t} />
    </div>
  );
}
