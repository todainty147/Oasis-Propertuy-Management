// src/pages/WorkOrderDetails.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Card from "../components/Card";
import Skeleton from "../components/ui/Skeleton";
import { usePageTitle } from "../layout/PageTitleContext";
import { useAccount } from "../context/AccountContext";
import { useI18n } from "../context/I18nContext";
import { getContractorRatingByWorkOrder, upsertContractorRating } from "../services/contractorRatingService";
import {
  assignWorkOrderContractor,
  fetchWorkOrderById,
  getWorkOrderAllowedActions,
  listAssignableContractors,
  listWorkOrderAuditLog,
  listWorkOrderStatusDefinitions,
  setWorkOrderStatus as updateWorkOrderStatus,
} from "../services/workOrderService";
import { useRealtimeTables } from "../hooks/useRealtimeTables";
import { formatCurrencyAmount, getDefaultCurrency } from "../utils/currency";
import { isManageRole } from "../utils/permissions";

/* -----------------------------
   Status label helper (Polish)
   Uses DB table/view: work_order_status_definitions(label)
----------------------------- */
function useWorkOrderStatusLabels() {
  const [labels, setLabels] = useState({});
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const map = await listWorkOrderStatusDefinitions();
        if (!cancelled) setLabels(map);
      } catch {
        if (!cancelled) setLabels({});
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return labels;
}

function formatDateTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function formatMoney(val, currency = getDefaultCurrency()) {
  return formatCurrencyAmount(val, { currency });
}

function normalizeWorkOrderStatus(status) {
  const s = String(status ?? "").trim().toLowerCase();
  if (["assigned", "przypisane"].includes(s)) return "assigned";
  if (["in_progress", "w trakcie", "in progress"].includes(s)) return "in_progress";
  if (["completed", "zakończone", "zakonczone"].includes(s)) return "completed";
  if (["cancelled", "anulowane"].includes(s)) return "cancelled";
  if (["blocked", "zablokowane"].includes(s)) return "blocked";
  return s;
}

function translateWorkOrderStatus(status, t) {
  const key = normalizeWorkOrderStatus(status);
  if (key === "assigned") return t("status.wo.assigned");
  if (key === "in_progress") return t("status.wo.in_progress");
  if (key === "completed") return t("status.wo.completed");
  if (key === "cancelled") return t("status.wo.cancelled");
  if (key === "blocked") return t("workOrder.blocked");
  return status || t("workOrder.shortLabel");
}

function normalizeQuoteStatus(status) {
  const s = String(status ?? "").trim().toLowerCase();
  if (["draft", "szkic"].includes(s)) return "draft";
  if (["submitted", "wysłano", "wyslano"].includes(s)) return "submitted";
  if (["approved", "zatwierdzone", "zatwierdzono"].includes(s)) return "approved";
  if (["rejected", "odrzucone", "odrzucono"].includes(s)) return "rejected";
  return s;
}

function isRatingsUnavailableError(err) {
  const msg = String(err?.message || "").toLowerCase();
  return (
    msg.includes("could not find the table 'public.contractor_ratings'") ||
    msg.includes('relation "contractor_ratings" does not exist') ||
    msg.includes("missing contractor_ratings table")
  );
}

function normalizeAckStatus(status, acknowledgedAt, dueAt) {
  if (acknowledgedAt) return "acknowledged";
  const value = String(status || "").trim().toLowerCase();
  if (value === "acknowledged") return "acknowledged";
  if (value === "not_required") return "not_required";
  if (dueAt) {
    const due = new Date(dueAt);
    if (!Number.isNaN(due.getTime()) && due.getTime() < Date.now()) return "overdue";
  }
  return value || "pending";
}

function hoursSince(value) {
  const d = new Date(value || "");
  if (Number.isNaN(d.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 3600000));
}

function daysFromHours(value) {
  if (!Number.isFinite(Number(value))) return null;
  return Math.max(0, Math.floor(Number(value) / 24));
}

function workOrderSlaState(workOrder) {
  if (!workOrder) {
    return {
      ackStatus: "pending",
      ackOverdue: false,
      stalledRepair: false,
      longRunning: false,
      ageDays: null,
      lastUpdatedDays: null,
    };
  }

  const status = normalizeWorkOrderStatus(workOrder.status);
  const ackStatus = normalizeAckStatus(
    workOrder.acknowledgement_status,
    workOrder.acknowledged_at,
    workOrder.acknowledgement_due_at,
  );
  const ageHours = hoursSince(workOrder.created_at);
  const lastUpdatedHours = hoursSince(workOrder.updated_at || workOrder.created_at);
  const incomplete = !["completed", "cancelled"].includes(status);

  return {
    ackStatus,
    ackOverdue: ackStatus === "overdue",
    stalledRepair:
      incomplete &&
      ["in_progress", "blocked"].includes(status) &&
      Number.isFinite(lastUpdatedHours) &&
      lastUpdatedHours >= 72,
    longRunning:
      incomplete &&
      Number.isFinite(ageHours) &&
      ageHours >= 14 * 24,
    ageDays: daysFromHours(ageHours),
    lastUpdatedDays: daysFromHours(lastUpdatedHours),
  };
}

function StatusPill({ status, labels, t }) {
  const base = "text-xs px-2 py-0.5 rounded border";
  const s = normalizeWorkOrderStatus(status);
  const dbLabel = labels?.[s] ?? null;
  const label = translateWorkOrderStatus(dbLabel || s, t);

  if (s === "completed")
    return (
      <span className={`${base} bg-green-50 border-green-200 text-green-700`}>
        {label}
      </span>
    );
  if (s === "in_progress")
    return (
      <span className={`${base} bg-blue-50 border-blue-200 text-blue-700`}>
        {label}
      </span>
    );
  if (s === "cancelled")
    return (
      <span className={`${base} bg-slate-50 border-slate-200 text-slate-600`}>
        {label}
      </span>
    );
  if (s === "blocked")
    return (
      <span className={`${base} bg-amber-50 border-amber-200 text-amber-800`}>
        {label}
      </span>
    );
  return (
    <span className={`${base} bg-amber-50 border-amber-200 text-amber-800`}>
      {label}
    </span>
  );
}

export default function WorkOrderDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { setTitle } = usePageTitle();

  const { activeAccountId, activeRole } = useAccount();
  const { t } = useI18n();
  const role = useMemo(() => String(activeRole ?? "").toLowerCase(), [activeRole]);
  const canManage = useMemo(() => isManageRole(role), [role]);

  const labels = useWorkOrderStatusLabels();

  const [loading, setLoading] = useState(true);
  const [wo, setWo] = useState(null);
  const [audit, setAudit] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);

  const [allowedActions, setAllowedActions] = useState([]);
  const [actionsLoading, setActionsLoading] = useState(false);

  const [contractors, setContractors] = useState([]);
  const [contractorsLoading, setContractorsLoading] = useState(false);
  const [assignContractorId, setAssignContractorId] = useState("");
  const [busy, setBusy] = useState(false);
  const [ratingLoading, setRatingLoading] = useState(false);
  const [ratingSaving, setRatingSaving] = useState(false);
  const [ratingUnavailable, setRatingUnavailable] = useState(false);
  const [ratingRow, setRatingRow] = useState(null);
  const [ratingValue, setRatingValue] = useState("");
  const [ratingComment, setRatingComment] = useState("");
  const slaState = useMemo(() => workOrderSlaState(wo), [wo]);

  useEffect(() => {
    setTitle(t("workOrder.shortLabel"));
  }, [setTitle, t]);

  // -----------------------------
  // Load work order
  // -----------------------------
  async function loadWorkOrder() {
    if (!id) return;
    setLoading(true);
    try {
      const data = await fetchWorkOrderById(id);
      setWo(data || null);
    } catch (e) {
      console.error(e);
      setWo(null);
    } finally {
      setLoading(false);
    }
  }

  // -----------------------------
  // Load audit timeline
  // -----------------------------
  async function loadAudit() {
    if (!id) return;
    setAuditLoading(true);
    try {
      const rows = await listWorkOrderAuditLog(id);
      setAudit(rows);
    } catch (e) {
      console.error(e);
      setAudit([]);
    } finally {
      setAuditLoading(false);
    }
  }

  // -----------------------------
  // Allowed actions
  // -----------------------------
  async function loadAllowedActions() {
    if (!id) return;
    if (!canManage) {
      setAllowedActions([]);
      return;
    }
    setActionsLoading(true);
    try {
      const actions = await getWorkOrderAllowedActions(id, {
        accountId: activeAccountId,
      });
      setAllowedActions(actions);
    } catch (e) {
      console.error(e);
      setAllowedActions([]);
    } finally {
      setActionsLoading(false);
    }
  }

  // -----------------------------
  // Contractors list (manager only)
  // -----------------------------
  async function loadContractors() {
    if (!activeAccountId || !canManage) {
      setContractors([]);
      return;
    }
    setContractorsLoading(true);
    try {
      const rows = await listAssignableContractors(activeAccountId);
      setContractors(rows);
    } catch (e) {
      console.error(e);
      setContractors([]);
    } finally {
      setContractorsLoading(false);
    }
  }

  // Initial load (and when account changes)
  useEffect(() => {
    loadWorkOrder();
    loadAudit();
    loadAllowedActions();
    loadContractors();
    loadRating();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, activeAccountId, canManage]);

  // Make title nicer when WO loaded
  useEffect(() => {
    if (!wo) return;
    const statusLabel = translateWorkOrderStatus(labels?.[normalizeWorkOrderStatus(wo.status)] ?? wo.status, t);
    setTitle(`${t("workOrder.shortLabel")} • ${statusLabel}`);
  }, [wo, labels, setTitle, t]);

  // -----------------------------
  // Actions
  // -----------------------------
  async function setStatus(nextStatus) {
    if (!id) return;
    setBusy(true);
    try {
      await updateWorkOrderStatus(
        {
          workOrderId: id,
          newStatus: nextStatus,
          applyIfTenantAllowed: false,
        },
        {
          accountId: activeAccountId,
        },
      );

      await loadWorkOrder();
      await loadAllowedActions();
      await loadAudit();
    } catch (e) {
      alert(e?.message ?? t("workOrders.statusChangeError"));
    } finally {
      setBusy(false);
    }
  }

  async function assignContractor() {
    if (!id || !assignContractorId) return;
    setBusy(true);
    try {
      await assignWorkOrderContractor(
        {
          workOrderId: id,
          contractorId: assignContractorId,
        },
        {
          accountId: activeAccountId,
        },
      );

      await loadWorkOrder();
      await loadAllowedActions();
      await loadAudit();
    } catch (e) {
      alert(e?.message ?? t("workOrders.assignError"));
    } finally {
      setBusy(false);
    }
  }

  async function loadRating() {
    if (!id || !canManage) return;
    setRatingLoading(true);
    setRatingUnavailable(false);
    try {
      const row = await getContractorRatingByWorkOrder(id);
      setRatingRow(row);
      setRatingValue(row?.rating != null ? String(row.rating) : "");
      setRatingComment(row?.comment || "");
    } catch (e) {
      if (isRatingsUnavailableError(e)) {
        setRatingUnavailable(true);
        return;
      }
      setRatingRow(null);
      setRatingValue("");
      setRatingComment("");
    } finally {
      setRatingLoading(false);
    }
  }

  async function refreshAll() {
    await Promise.all([
      loadWorkOrder(),
      loadAudit(),
      loadAllowedActions(),
      loadContractors(),
      loadRating(),
    ]);
  }

  useRealtimeTables({
    enabled: !!id,
    subscriptions: [
      { channel: `work-order-details:${id}`, table: "work_orders", filter: `id=eq.${id}` },
      { channel: `work-order-details-fin:${id}`, table: "work_order_financials", filter: `work_order_id=eq.${id}` },
      { channel: `work-order-details-audit:${id}`, table: "work_order_audit_log", filter: `work_order_id=eq.${id}` },
      { channel: `work-order-details-requests:${id}`, table: "maintenance_requests" },
      { channel: `work-order-details-contractors:${activeAccountId || "none"}`, table: "contractors", ...(activeAccountId ? { filter: `account_id=eq.${activeAccountId}` } : {}) },
    ],
    onChange: refreshAll,
  });

  async function saveRating() {
    if (!canManage || !wo?.id) return;
    if (ratingUnavailable) return;
    if (normalizeWorkOrderStatus(wo.status) !== "completed") return;
    if (!ratingValue) {
      alert(t("ratings.pickValue"));
      return;
    }

    setRatingSaving(true);
    try {
      const row = await upsertContractorRating({
        accountId: wo.account_id || activeAccountId,
        workOrderId: wo.id,
        contractorUserId: wo.contractor_user_id || null,
        rating: Number(ratingValue),
        comment: ratingComment || null,
      });
      setRatingRow(row);
      alert(t("ratings.saved"));
    } catch (e) {
      if (isRatingsUnavailableError(e)) {
        setRatingUnavailable(true);
        alert(t("ratings.unavailable"));
        return;
      }
      alert(e?.message ?? t("ratings.saveError"));
    } finally {
      setRatingSaving(false);
    }
  }

  // -----------------------------
  // Render
  // -----------------------------
  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    );
  }

  // Not found / blocked by RLS
  if (!wo) {
    return (
      <Card className="p-6 space-y-3">
        <p className="font-medium text-slate-900">{t("workOrder.notFound")}</p>
        <p className="text-sm text-slate-600">
          {t("workOrder.noAccessHint")}
        </p>
        <button
          type="button"
          onClick={() => navigate("/dashboard")}
          className="text-sm px-3 py-2 rounded-lg border hover:bg-slate-50 w-fit"
        >
          {t("workOrder.backToDashboard")}
        </button>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <StatusPill status={wo.status} labels={labels} t={t} />
              {wo.pending_cancel_request && (
                <span className="text-xs px-2 py-0.5 rounded border bg-amber-50 border-amber-200 text-amber-800">
                  {t("workOrders.cancelRequestLabel")}
                </span>
              )}
            </div>

            {wo.maintenance_requests?.title && (
              <p className="text-sm text-slate-800 mt-2">
                {t("workOrders.linkedRequest")}: <b>{wo.maintenance_requests.title}</b>
              </p>
            )}

            <p className="text-xs text-slate-500 mt-2">
              {t("common.dueDate")}: {formatDateTime(wo.scheduled_at)} • {t("common.createdAt")}:{" "}
              {formatDateTime(wo.created_at)}
            </p>

            {wo.contractor_name && (
              <div className="mt-3 space-y-1">
                <p className="text-sm text-slate-900 font-medium">
                  {t("common.contractor")}: {wo.contractor_name}
                  {wo.contractor_phone ? (
                    <span className="text-xs text-slate-500"> • {wo.contractor_phone}</span>
                  ) : null}
                </p>
                <p className="text-xs text-slate-500">
                  {t("contractor.ackStatus")}:{" "}
                  <span className="font-medium text-slate-700">
                    {t(`contractor.ackState.${normalizeAckStatus(wo.acknowledgement_status, wo.acknowledged_at, wo.acknowledgement_due_at)}`)}
                  </span>
                  {wo.acknowledgement_due_at ? ` • ${t("contractor.ackDue")}: ${formatDateTime(wo.acknowledgement_due_at)}` : ""}
                </p>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => navigate(-1)}
            className="text-sm px-3 py-2 rounded-lg border hover:bg-slate-50 shrink-0"
          >
            {t("common.back")}
          </button>
        </div>

        {wo.notes && (
          <div className="mt-4 bg-slate-50 border rounded-lg p-3 text-sm text-slate-700 whitespace-pre-wrap">
            {wo.notes}
          </div>
        )}
      </Card>

      <Card className="p-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="font-semibold text-slate-900">{t("workOrder.slaTitle")}</p>
            <p className="text-xs text-slate-500 mt-1">{t("workOrder.slaSubtitle")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {slaState.ackOverdue ? (
              <span className="text-xs px-2 py-1 rounded border bg-rose-50 border-rose-200 text-rose-700">
                {t("workOrder.slaAckOverdue")}
              </span>
            ) : null}
            {slaState.stalledRepair ? (
              <span className="text-xs px-2 py-1 rounded border bg-rose-50 border-rose-200 text-rose-700">
                {t("workOrder.slaStalledRepair")}
              </span>
            ) : null}
            {slaState.longRunning ? (
              <span className="text-xs px-2 py-1 rounded border bg-amber-50 border-amber-200 text-amber-700">
                {t("workOrder.slaLongRunning")}
              </span>
            ) : null}
            {!slaState.ackOverdue && !slaState.stalledRepair && !slaState.longRunning ? (
              <span className="text-xs px-2 py-1 rounded border bg-emerald-50 border-emerald-200 text-emerald-700">
                {t("workOrder.slaOnTrack")}
              </span>
            ) : null}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">{t("workOrder.slaRepairAge")}</p>
            <p className="text-sm font-semibold text-slate-900 mt-1">
              {slaState.ageDays == null ? "—" : t("workOrder.slaDaysOpen", { count: slaState.ageDays })}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">{t("workOrder.slaLastUpdate")}</p>
            <p className="text-sm font-semibold text-slate-900 mt-1">
              {slaState.lastUpdatedDays == null ? "—" : t("workOrder.slaDaysSinceUpdate", { count: slaState.lastUpdatedDays })}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">{t("contractor.ackStatus")}</p>
            <p className="text-sm font-semibold text-slate-900 mt-1">
              {t(`contractor.ackState.${slaState.ackStatus}`)}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">{t("workOrder.slaScheduledFor")}</p>
            <p className="text-sm font-semibold text-slate-900 mt-1">{formatDateTime(wo.scheduled_at)}</p>
          </div>
        </div>
      </Card>

      {/* Manager actions */}
      {canManage && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-slate-900">{t("workOrder.actions")}</p>
              <p className="text-xs text-slate-500">
                {t("workOrder.actionsHint")}
              </p>
            </div>
            <button
              type="button"
              onClick={async () => {
                await loadAllowedActions();
                await loadWorkOrder();
              }}
              className="text-sm px-3 py-2 rounded-lg border hover:bg-slate-50"
              disabled={busy}
            >
              {t("common.refresh")}
            </button>
          </div>

          {/* Status transitions */}
          {actionsLoading ? (
            <Skeleton className="h-10" />
          ) : allowedActions.length === 0 ? (
            <p className="text-sm text-slate-500">{t("workOrder.noActions")}</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {allowedActions.includes("in_progress") && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setStatus("in_progress")}
                  className={`text-sm px-3 py-2 rounded-lg border hover:bg-slate-50 ${
                    busy ? "opacity-60 cursor-not-allowed" : ""
                  }`}
                >
                  {t("workOrders.startWork")}
                </button>
              )}

              {allowedActions.includes("blocked") && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setStatus("blocked")}
                  className={`text-sm px-3 py-2 rounded-lg border hover:bg-slate-50 ${
                    busy ? "opacity-60 cursor-not-allowed" : ""
                  }`}
                >
                  {t("workOrder.blocked")}
                </button>
              )}

              {allowedActions.includes("completed") && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setStatus("completed")}
                  className={`text-sm px-3 py-2 rounded-lg border hover:bg-slate-50 ${
                    busy ? "opacity-60 cursor-not-allowed" : ""
                  }`}
                >
                  {t("workOrders.completeWork")}
                </button>
              )}

              {allowedActions.includes("cancelled") && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setStatus("cancelled")}
                  className={`text-sm px-3 py-2 rounded-lg border hover:bg-slate-50 ${
                    busy ? "opacity-60 cursor-not-allowed" : ""
                  }`}
                >
                  {t("common.cancel")}
                </button>
              )}
            </div>
          )}

          {/* Assign contractor */}
          <div className="pt-2 border-t">
            <p className="text-xs text-slate-500 mb-2">{t("workOrder.assignContractor")}</p>

            <div className="flex flex-wrap items-center gap-2">
	              <select
	                value={assignContractorId}
	                disabled={busy || contractorsLoading}
	                onChange={(e) => setAssignContractorId(e.target.value)}
	                className="border rounded-lg px-3 py-2 text-sm min-w-[280px] disabled:bg-slate-50"
	              >
	                <option value="">{t("workOrder.selectContractorPlaceholder")}</option>
	                {(contractors ?? []).map((c) => (
	                  <option key={c.id} value={c.id}>
	                    {c.name}
	                    {c.phone ? ` • ${c.phone}` : ""}
	                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={assignContractor}
	                disabled={!assignContractorId || busy}
	                className={`text-sm px-3 py-2 rounded-lg text-white ${
	                  !assignContractorId || busy ? "bg-slate-400" : "bg-blue-600"
	                }`}
	              >
	                {busy ? t("common.processing") : t("workOrder.assignContractorAction")}
	              </button>
	            </div>
	          </div>
	        </Card>
	      )}

      {/* Financial summary */}
      <Card className="p-6">
        <p className="font-semibold text-slate-900">{t("workOrders.finSummaryTitle")}</p>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">{t("workOrders.quote")}</p>
            <p className="text-sm font-semibold text-slate-900 mt-1">{formatMoney(wo.quote_amount)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">{t("workOrders.invoice")}</p>
            <p className="text-sm font-semibold text-slate-900 mt-1">{formatMoney(wo.invoice_amount)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">{t("workOrders.margin")}</p>
            <p className="text-sm font-semibold text-slate-900 mt-1">
              {Number.isFinite(Number(wo.invoice_amount)) && Number.isFinite(Number(wo.quote_amount))
                ? formatMoney(Number(wo.invoice_amount) - Number(wo.quote_amount))
                : "—"}
            </p>
          </div>
        </div>
      </Card>

      {/* Contractor rating */}
      {canManage && (
        <Card className="p-6 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold text-slate-900">{t("ratings.title")}</p>
            {ratingRow?.updated_at ? (
              <p className="text-xs text-slate-500">
                {t("common.updatedAt")}: {formatDateTime(ratingRow.updated_at)}
              </p>
            ) : null}
          </div>

          {ratingUnavailable ? (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
              {t("ratings.unavailable")}
            </p>
          ) : normalizeWorkOrderStatus(wo.status) !== "completed" ? (
            <p className="text-sm text-slate-500">{t("ratings.afterCompletionOnly")}</p>
          ) : ratingLoading ? (
            <Skeleton className="h-10" />
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5].map((n) => {
                  const active = Number(ratingValue || 0) === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setRatingValue(String(n))}
                      className={`px-3 py-1.5 text-sm rounded-lg border ${
                        active
                          ? "border-amber-300 bg-amber-50 text-amber-700"
                          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                      disabled={ratingSaving}
                    >
                      {n} ★
                    </button>
                  );
                })}
              </div>
              <textarea
                value={ratingComment}
                onChange={(e) => setRatingComment(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm min-h-[90px] disabled:bg-slate-50"
                placeholder={t("ratings.commentOptional")}
                disabled={ratingSaving}
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={saveRating}
                  disabled={ratingSaving}
                  className={`text-sm px-3 py-2 rounded-lg text-white ${
                    ratingSaving ? "bg-slate-400" : "bg-blue-600"
                  }`}
                >
                  {ratingSaving ? t("common.saving") : t("ratings.save")}
                </button>
              </div>
            </>
          )}
        </Card>
      )}

      {/* Audit log */}
      <Card className="p-6">
        <div className="flex items-center justify-between gap-3">
          <p className="font-semibold text-slate-900">{t("workOrder.activity")}</p>
          <button
            type="button"
            onClick={loadAudit}
            className="text-sm px-3 py-2 rounded-lg border hover:bg-slate-50"
            disabled={auditLoading}
          >
            {t("common.refresh")}
          </button>
        </div>

        {auditLoading ? (
          <div className="mt-3 space-y-2">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : audit.length === 0 ? (
          <p className="text-sm text-slate-500 mt-3">{t("workOrder.noEntries")}</p>
        ) : (
          <div className="mt-3 space-y-2">
            {audit.map((e) => (
              <div key={e.id} className="border rounded-lg p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-slate-900">
                    {String(e.action || "").replaceAll("_", " ")}
                  </div>
                  <div className="text-xs text-slate-500 shrink-0">
                    {formatDateTime(e.created_at)}
                  </div>
                </div>

                {(e.old_value || e.new_value) && (
                  <pre className="mt-2 text-xs bg-slate-50 p-2 rounded overflow-auto">
{JSON.stringify({ old: e.old_value, new: e.new_value }, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
