import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Mail, Phone, Star, UserPlus, Wrench } from "lucide-react";
import DashboardBreadcrumbs from "../components/DashboardBreadcrumbs";
import {
  EmptyState,
  MetricTile,
  PageHeader,
  PageShell,
  StatusPill,
  TenaqoCard,
} from "../components/ui/TenaqoPrimitives";
import Skeleton from "../components/ui/Skeleton";
import { useAccount } from "../context/AccountContext";
import { useI18n } from "../context/I18nContext";
import { usePageTitle } from "../layout/PageTitleContext";
import {
  contractorBadgeLabels,
  contractorHistoryState,
  contractorPerformanceLines,
  listContractorPerformanceSummary,
  TRUSTED_CONTRACTORS_INTRO_COPY,
} from "../services/contractorDirectoryService";
import { isManageRole } from "../utils/permissions";

function formatHours(value) {
  if (value == null) return "No signal yet";
  const hours = Number(value);
  if (!Number.isFinite(hours)) return "No signal yet";
  if (hours < 24) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

function ContractorCard({ contractor }) {
  const badges = contractorBadgeLabels(contractor);
  const historyLines = contractorPerformanceLines(contractor);
  const stateText = contractorHistoryState(contractor);

  return (
    <TenaqoCard className="p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              {contractor.name || contractor.email || "Contractor"}
            </h2>
            {(badges.length ? badges : ["Active contractor"]).map((label) => (
              <StatusPill key={label} variant={label === "Preferred" ? "success" : "neutral"}>
                {label}
              </StatusPill>
            ))}
          </div>

          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
            {contractor.email ? (
              <span className="inline-flex items-center gap-1">
                <Mail size={13} aria-hidden="true" />
                {contractor.email}
              </span>
            ) : null}
            {contractor.phone ? (
              <span className="inline-flex items-center gap-1">
                <Phone size={13} aria-hidden="true" />
                {contractor.phone}
              </span>
            ) : null}
          </div>

          <p className="mt-3 text-sm text-[var(--text-secondary)]">
            {historyLines.length ? historyLines.join(" | ") : stateText}
          </p>
        </div>

        <div className="grid min-w-[240px] grid-cols-3 gap-2 text-center">
          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2">
            <p className="text-xs text-[var(--text-muted)]">Completed</p>
            <p className="mt-1 text-lg font-semibold text-[var(--text-primary)]">
              {Number(contractor.jobsCompleted || 0)}
            </p>
          </div>
          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2">
            <p className="text-xs text-[var(--text-muted)]">Rating</p>
            <p className="mt-1 text-lg font-semibold text-[var(--text-primary)]">
              {contractor.averageRating == null ? "-" : Number(contractor.averageRating).toFixed(1)}
            </p>
          </div>
          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2">
            <p className="text-xs text-[var(--text-muted)]">Response</p>
            <p className="mt-1 text-lg font-semibold text-[var(--text-primary)]">
              {formatHours(contractor.averageQuoteResponseHours)}
            </p>
          </div>
        </div>
      </div>
    </TenaqoCard>
  );
}

export default function ContractorsPage() {
  const { activeAccountId, activeRole, isRootOperator } = useAccount();
  const { t } = useI18n();
  const { setTitle } = usePageTitle();
  const role = useMemo(() => String(activeRole || "").toLowerCase(), [activeRole]);
  const canManage = useMemo(() => isManageRole(role, { isRootOperator }), [isRootOperator, role]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [contractors, setContractors] = useState([]);

  useEffect(() => {
    setTitle("Contractors");
  }, [setTitle]);

  useEffect(() => {
    let dead = false;

    async function loadContractors() {
      if (!activeAccountId || !canManage) {
        setContractors([]);
        return;
      }

      setLoading(true);
      setError("");
      try {
        const rows = await listContractorPerformanceSummary({ accountId: activeAccountId });
        if (!dead) setContractors(rows.filter((contractor) => contractor.active !== false));
      } catch (e) {
        if (!dead) {
          setError(e?.message || "Could not load contractors");
          setContractors([]);
        }
      } finally {
        if (!dead) setLoading(false);
      }
    }

    loadContractors();
    return () => {
      dead = true;
    };
  }, [activeAccountId, canManage]);

  const stats = useMemo(() => {
    const preferred = contractors.filter((contractor) => contractor.preferred).length;
    const completed = contractors.reduce((sum, contractor) => sum + Number(contractor.jobsCompleted || 0), 0);
    const rated = contractors.filter((contractor) => contractor.averageRating != null);
    const averageRating = rated.length
      ? rated.reduce((sum, contractor) => sum + Number(contractor.averageRating || 0), 0) / rated.length
      : null;

    return { preferred, completed, averageRating };
  }, [contractors]);

  if (!canManage) {
    return (
      <PageShell className="space-y-4">
        <DashboardBreadcrumbs items={[{ label: "Contractors" }]} />
        <EmptyState title="Contractors are manager-only" body={t("maintenance.inbox.accessDenied")} />
      </PageShell>
    );
  }

  return (
    <PageShell className="space-y-5">
      <DashboardBreadcrumbs items={[{ label: "Contractors" }]} />

      <PageHeader
        title="Contractors"
        subtitle={TRUSTED_CONTRACTORS_INTRO_COPY}
        actions={
          <Link
            to="/invitations"
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800"
          >
            <UserPlus size={16} aria-hidden="true" />
            Invite contractor
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <MetricTile label="Active contractors" value={contractors.length} icon={Wrench} />
        <MetricTile label="Preferred suppliers" value={stats.preferred} icon={Star} status="success" />
        <MetricTile
          label="Completed jobs"
          value={stats.completed}
          context={stats.averageRating == null ? "No rated jobs yet" : `${stats.averageRating.toFixed(1)} average rating`}
        />
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : error ? (
        <EmptyState title="Could not load contractors" body={error} />
      ) : contractors.length === 0 ? (
        <EmptyState
          title="No contractors yet"
          body="Invite your first contractor to start building a trusted supplier list."
          action={
            <Link
              to="/invitations"
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800"
            >
              <UserPlus size={16} aria-hidden="true" />
              Invite contractor
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {contractors.map((contractor) => (
            <ContractorCard key={contractor.id} contractor={contractor} />
          ))}
        </div>
      )}
    </PageShell>
  );
}
