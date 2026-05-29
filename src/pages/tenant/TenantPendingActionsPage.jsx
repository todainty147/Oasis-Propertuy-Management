import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, ClipboardCheck, FileCheck2, X } from "lucide-react";

import Card from "../../components/Card";
import Skeleton from "../../components/ui/Skeleton";
import DashboardBreadcrumbs from "../../components/DashboardBreadcrumbs";
import { useAccount } from "../../context/AccountContext";
import { usePageTitle } from "../../layout/PageTitleContext";
import { buildTenantPendingActions } from "../../lib/riskProtectionSummary";
import { getRiskProtectionBadgeProps } from "../../lib/riskProtectionStatus";
import {
  listTenantComplianceAcknowledgements,
  listTenantInspectionReportShares,
} from "../../services/legalSecurityService";

function formatDate(value) {
  if (!value) return "No due date";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString();
}

function ActionCard({ action }) {
  const badge = getRiskProtectionBadgeProps(action.status);
  const Icon = action.type === "evidence_report" ? FileCheck2 : ClipboardCheck;
  return (
    <Link
      to={action.path}
      className="block rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-1)] p-4 shadow-sm transition hover:border-teal-400/60"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-teal-600 dark:text-teal-300">
            <Icon size={14} /> {action.typeLabel}
          </p>
          <h3 className="mt-2 truncate font-semibold text-[var(--text-primary)]">{action.title}</h3>
          <p className="mt-1 text-sm text-[var(--text-muted)]">{action.property}</p>
          <p className="mt-2 text-xs text-[var(--text-muted)]">Due: {formatDate(action.dueDate)}</p>
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${badge.className}`}>
          {badge.label}
        </span>
      </div>
      <p className="mt-3 text-sm font-semibold text-blue-600 dark:text-blue-300">{action.cta}</p>
    </Link>
  );
}

export default function TenantPendingActionsPage({ properties = [] }) {
  const { activeAccountId } = useAccount();
  const { setTitle } = usePageTitle();
  const [evidenceShares, setEvidenceShares] = useState([]);
  const [complianceAcknowledgements, setComplianceAcknowledgements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setTitle("Pending Actions");
  }, [setTitle]);

  useEffect(() => {
    let cancelled = false;
    if (!activeAccountId) return () => { cancelled = true; };
    async function load() {
      try {
        setLoading(true);
        setError("");
        const [shares, acknowledgements] = await Promise.all([
          listTenantInspectionReportShares(activeAccountId),
          listTenantComplianceAcknowledgements(activeAccountId),
        ]);
        if (cancelled) return;
        setEvidenceShares(shares);
        setComplianceAcknowledgements(acknowledgements);
      } catch (err) {
        if (!cancelled) setError(err?.message || "Could not load tenant pending actions.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [activeAccountId]);

  const actions = useMemo(
    () => buildTenantPendingActions({ evidenceShares, complianceAcknowledgements, properties }),
    [complianceAcknowledgements, evidenceShares, properties],
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28" />
        <Skeleton className="h-60" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <DashboardBreadcrumbs items={[{ label: "Pending Actions" }]} />
      <Card className="p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-teal-600 dark:text-teal-300">Tenant portal</p>
        <h1 className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">Pending Actions</h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--text-secondary)]">
          Review evidence reports and compliance documents that have been explicitly shared with you.
        </p>
      </Card>

      {error ? (
        <div className="flex items-start justify-between gap-3 rounded-2xl border border-rose-400/30 bg-rose-950/40 p-4 text-sm text-rose-100">
          <span>{error}</span>
          <button type="button" onClick={() => setError("")} aria-label="Dismiss error">
            <X size={14} />
          </button>
        </div>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Awaiting your response</h2>
        {actions.pending.length === 0 ? (
          <Card className="p-5">
            <CheckCircle2 size={20} className="text-emerald-400" />
            <p className="mt-2 text-sm text-[var(--text-muted)]">No pending tenant actions right now.</p>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {actions.pending.map((action) => <ActionCard key={action.id} action={action} />)}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Completed history</h2>
        {actions.completed.length === 0 ? (
          <Card className="p-5">
            <p className="text-sm text-[var(--text-muted)]">Signed evidence reports and acknowledged compliance documents will appear here.</p>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {actions.completed.map((action) => <ActionCard key={action.id} action={action} />)}
          </div>
        )}
      </section>
    </div>
  );
}
