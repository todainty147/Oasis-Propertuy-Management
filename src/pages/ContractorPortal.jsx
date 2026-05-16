import { useEffect, useMemo, useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import Card from "../components/Card";
import Skeleton from "../components/ui/Skeleton";
import { ActionPill } from "../components/ui/TenaqoPrimitives";
import { usePageTitle } from "../layout/PageTitleContext";
import { useAccount } from "../context/AccountContext";
import { useI18n } from "../context/I18nContext";
import { useRealtimeTables } from "../hooks/useRealtimeTables";
import {
  getContractorAllowedActions,
  loadContractorPortalRows,
  updateContractorWorkOrder,
} from "../services/contractorWorkOrderService";
import OnboardingHintCard from "../components/OnboardingHintCard";
import DocumentRequestsPanel from "../components/DocumentRequestsPanel";
import DocumentPacketsPanel from "../components/DocumentPacketsPanel";
import { normalizeWorkOrderStatus } from "../utils/statuses";

/* -----------------------------
   UI helpers
----------------------------- */

function StatusPill({ status, t }) {
  const base = "text-xs px-2 py-0.5 rounded border";
  const normalized = normalizeWorkOrderStatus(status);

  if (normalized === "completed")
    return <span className={`${base} bg-green-50 border-green-200 text-green-700`}>{t("status.wo.completed")}</span>;
  if (normalized === "in_progress")
    return <span className={`${base} bg-blue-50 border-blue-200 text-blue-700`}>{t("status.wo.in_progress")}</span>;
  if (normalized === "cancelled")
    return <span className={`${base} bg-slate-50 border-slate-200 text-slate-600`}>{t("status.wo.cancelled")}</span>;
  if (normalized === "blocked")
    return <span className={`${base} bg-amber-50 border-amber-200 text-amber-800`}>{t("workOrder.blocked")}</span>;
  return <span className={`${base} bg-amber-50 border-amber-200 text-amber-800`}>{t("status.wo.assigned")}</span>;
}

function statusAccentClass(status) {
  const normalized = normalizeWorkOrderStatus(status);
  if (normalized === "completed") return "border-l-green-500";
  if (normalized === "in_progress") return "border-l-blue-500";
  if (normalized === "cancelled") return "border-l-slate-400";
  if (normalized === "blocked") return "border-l-amber-500";
  return "border-l-indigo-500";
}

function matchesStatusFilter(row, filter) {
  if (filter === "all") return true;
  return normalizeWorkOrderStatus(row?.status) === filter;
}

function formatDateTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function PriorityPill({ priority, t }) {
  const p = String(priority || "normal").trim().toLowerCase();
  const normalized =
    ["niski"].includes(p) ? "low" :
    ["normalny"].includes(p) ? "normal" :
    ["wysoki"].includes(p) ? "high" :
    ["pilny"].includes(p) ? "urgent" :
    ["krytyczny"].includes(p) ? "critical" :
    p;
  const base = "text-[11px] px-2 py-0.5 rounded border";
  if (normalized === "critical") return <span className={`${base} bg-rose-100 border-rose-300 text-rose-700`}>{t("priority.critical")}</span>;
  if (normalized === "urgent") return <span className={`${base} bg-orange-100 border-orange-300 text-orange-700`}>{t("priority.urgent")}</span>;
  if (normalized === "high") return <span className={`${base} bg-orange-100 border-orange-300 text-orange-700`}>{t("priority.high")}</span>;
  return <span className={`${base} bg-slate-100 border-slate-200 text-slate-700`}>{t("priority.normal")}</span>;
}

function shortText(v, max = 120) {
  const txt = String(v || "").trim();
  if (!txt) return "";
  if (txt.length <= max) return txt;
  return `${txt.slice(0, max - 1)}…`;
}

function deriveJobTitle(wo, t) {
  const title = String(wo?.issueTitle || "").trim();
  if (title) return title;
  const fromNotes = String(wo?.issueDescription || wo?.notes || "").trim();
  if (!fromNotes) return t("workOrders.serviceOrder");
  const firstLine = fromNotes.split("\n").find((x) => String(x || "").trim());
  return shortText(firstLine || fromNotes, 56);
}

function ackStateForRow(wo) {
  if (wo?.acknowledged_at) return "acknowledged";
  const value = String(wo?.acknowledgement_status || "").trim().toLowerCase();
  if (value === "acknowledged") return "acknowledged";
  if (value === "not_required") return "not_required";
  if (wo?.acknowledgement_due_at) {
    const due = new Date(wo.acknowledgement_due_at);
    if (!Number.isNaN(due.getTime()) && due.getTime() < Date.now()) return "overdue";
  }
  return value || "pending";
}

function contractorNextStep(wo, allowed, t) {
  const ackState = ackStateForRow(wo);
  if (["pending", "overdue"].includes(ackState)) return t("contractor.nextStep.ack");
  if (allowed.includes("in_progress")) return t("contractor.nextStep.start");
  if (allowed.includes("completed") || allowed.includes("blocked")) return t("contractor.nextStep.progress");
  if (String(wo?.status || "").trim().toLowerCase() === "completed") return t("contractor.nextStep.complete");
  return t("contractor.nextStep.review");
}

/* -----------------------------
   Page
----------------------------- */

export default function ContractorPortal() {
  const { setTitle } = usePageTitle();
  const { activeAccountId, activeRole } = useAccount();
  const { t } = useI18n();
  const navigate = useNavigate();

  const role = useMemo(() => String(activeRole ?? "").toLowerCase(), [activeRole]);
  const isContractor = useMemo(() => role === "contractor", [role]);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState(null);
  const [allowedById, setAllowedById] = useState({});
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    setTitle(t("sidebar.contractorPortal"));
  }, [setTitle, t]);

  const filteredRows = useMemo(
    () => rows.filter((row) => matchesStatusFilter(row, statusFilter)),
    [rows, statusFilter],
  );

  async function load() {
    setLoading(true);
    setError("");
    try {
      const list = await loadContractorPortalRows({
        source: "ContractorPortal",
      });

      setRows(list);

      // Optional: allowed actions per row
      const ids = list.map((x) => x.id).filter(Boolean);
      const pairs = await Promise.all(
        ids.map(async (id) => {
          try {
            const actions = await getContractorAllowedActions(id, {
              accountId: list.find((row) => row.id === id)?.account_id || null,
              source: "ContractorPortal",
            });
            return [id, actions];
          } catch {
            return [id, []];
          }
        })
      );
      setAllowedById(Object.fromEntries(pairs));
    } catch (e) {
      setError(t("contractor.loadError"));
      setRows([]);
      setAllowedById({});
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useRealtimeTables({
    enabled: isContractor,
    subscriptions: [
      { channel: "contractor-portal-work-orders", table: "work_orders" },
      { channel: "contractor-portal-requests", table: "maintenance_requests" },
      { channel: "contractor-portal-financials", table: "work_order_financials" },
    ],
    onChange: load,
  });

  async function updateWorkOrder(id, patch) {
    setSavingId(id);
    try {
      await updateContractorWorkOrder(
        {
          workOrderId: id,
          status: patch.status ?? null,
          notes: patch.notes ?? null,
          scheduledAt: patch.scheduled_at ?? null,
        },
        { accountId: rows.find((row) => row.id === id)?.account_id || null },
      );

      await load();
    } catch (e) {
      alert(e?.message ?? t("workOrders.updateError"));
    } finally {
      setSavingId(null);
    }
  }

  function openDetails(id) {
    if (!id) return;
    navigate(`/contractor/jobs/${id}`);
  }

  if (!isContractor) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">{t("sidebar.contractorPortal")}</h2>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              {t("contractor.subtitle")}
            </p>
          </div>
          <button
            type="button"
            onClick={load}
            className="min-h-[44px] w-full rounded-xl border border-[var(--border-soft)] bg-[var(--surface-2)] px-3 py-2 text-sm font-medium text-[var(--text-secondary)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400/60 sm:w-auto"
          >
            {t("common.refresh")}
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {[
            { key: "all", label: t("contractor.filter.all") },
            { key: "assigned", label: t("status.wo.assigned") },
            { key: "in_progress", label: t("status.wo.in_progress") },
            { key: "completed", label: t("status.wo.completed") },
          ].map((f) => (
            <ActionPill
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              active={statusFilter === f.key}
              className="min-h-[42px] justify-center"
            >
              {f.label}
            </ActionPill>
          ))}
        </div>
      </Card>

      <OnboardingHintCard
        title={t("onboarding.hints.contractors.title")}
        body={t("onboarding.hints.contractors.body")}
      />

      <DocumentRequestsPanel
        accountId={activeAccountId}
        permissionContext={{ role }}
        t={t}
        mode="participant"
      />

      <DocumentPacketsPanel
        accountId={activeAccountId}
        permissionContext={{ role }}
        t={t}
        mode="participant"
      />

      {error ? (
        <Card className="border-red-200 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-700">{error}</p>
        </Card>
      ) : null}

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      ) : filteredRows.length === 0 ? (
        <Card className="p-6">
          <p className="text-sm text-[var(--text-secondary)]">{t("contractor.emptyAssignments")}</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredRows.map((wo) => {
            const isBusy = savingId === wo.id;
            const allowed = allowedById[wo.id] ?? [];
            const accent = statusAccentClass(wo.status);

            return (
              <div
                key={wo.id}
                data-testid="contractor-work-order-card"
                className={`cursor-pointer rounded-2xl border border-l-4 ${accent} border-[var(--border-soft)] bg-[var(--surface-1)] p-4 transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400/60`}
                role="button"
                tabIndex={0}
                onClick={() => openDetails(wo.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") openDetails(wo.id);
                }}
              >
                <div className="min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                        {deriveJobTitle(wo, t)}
                      </p>
                      <p className="mt-1 truncate text-xs font-medium text-[var(--text-secondary)]">
                        {wo.propertyLabel || t("common.property")}
                      </p>
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      <StatusPill status={wo.status} t={t} />
                      <PriorityPill priority={wo.issuePriority} t={t} />
                    </div>
                  </div>

                  {wo.contractor_phone && (
                    <div className="mt-2 text-xs text-[var(--text-muted)]">{t("common.phone")}: {wo.contractor_phone}</div>
                  )}
                  <div className="mt-2 text-xs text-[var(--text-muted)]">
                    {t("common.dueDate")}: {formatDateTime(wo.scheduled_at)} • {t("common.createdAt")}: {formatDateTime(wo.created_at)}
                  </div>

                  <div className="mt-3 line-clamp-2 text-sm text-[var(--text-secondary)]">
                    {shortText(wo.issueDescription || wo.notes, 160) || t("workOrders.noIssueDescription")}
                  </div>

                  <div className="mt-3 rounded-xl border border-[var(--border-soft)] bg-[var(--surface-2)] px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                      {t("contractor.nextStepLabel")}
                    </p>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">
                      {contractorNextStep(wo, allowed, t)}
                    </p>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
                    {allowed.includes("in_progress") && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={(e) => {
                          e.stopPropagation();
                          updateWorkOrder(wo.id, { status: "in_progress" });
                        }}
                        className={`min-h-[42px] px-3 rounded-lg text-sm border ${
                          isBusy
                            ? "text-slate-400 border-slate-200 cursor-not-allowed"
                            : "text-blue-700 border-blue-200 hover:bg-blue-50"
                        }`}
                      >
                        {t("workOrders.startWork")}
                      </button>
                    )}

                    {allowed.includes("blocked") && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={(e) => {
                          e.stopPropagation();
                          updateWorkOrder(wo.id, { status: "blocked" });
                        }}
                        className={`min-h-[42px] px-3 rounded-lg text-sm border ${
                          isBusy
                            ? "text-slate-400 border-slate-200 cursor-not-allowed"
                            : "text-amber-700 border-amber-200 hover:bg-amber-50"
                        }`}
                      >
                        {t("workOrder.blocked")}
                      </button>
                    )}

                    {allowed.includes("completed") && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={(e) => {
                          e.stopPropagation();
                          updateWorkOrder(wo.id, { status: "completed" });
                        }}
                        className={`min-h-[42px] px-3 rounded-lg text-sm border ${
                          isBusy
                            ? "text-slate-400 border-slate-200 cursor-not-allowed"
                            : "text-green-700 border-green-200 hover:bg-green-50"
                        }`}
                      >
                        {t("workOrders.completeWork")}
                      </button>
                    )}

                    {allowed.includes("cancelled") && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={(e) => {
                          e.stopPropagation();
                          updateWorkOrder(wo.id, { status: "cancelled" });
                        }}
                        className={`min-h-[42px] px-3 rounded-lg text-sm border ${
                          isBusy
                            ? "text-slate-400 border-slate-200 cursor-not-allowed"
                            : "text-slate-700 border-slate-300 hover:bg-slate-50"
                        }`}
                      >
                        {t("common.cancel")}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openDetails(wo.id);
                      }}
                      className="col-span-2 min-h-[44px] text-sm px-3 rounded-lg border border-slate-900 bg-slate-900 text-white hover:bg-slate-800 sm:col-span-1 sm:bg-white sm:text-slate-900 sm:hover:bg-slate-50"
                    >
                      {t("workOrder.open")}
                    </button>

                    {allowed.length === 0 && (
                      <span className="text-xs text-slate-400">{t("workOrder.noActions")}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
