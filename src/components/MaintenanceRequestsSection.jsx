// src/components/MaintenanceRequestsSection.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Card from "./Card";
import Skeleton from "./ui/Skeleton";
import MaintenanceRequestAttachmentsPanel from "./maintenance/MaintenanceRequestAttachmentsPanel";
import { useAccount } from "../context/AccountContext";
import { ENTITLEMENT_FEATURES } from "../lib/entitlements";
import {
  buildMaintenanceRequestDiagnosticDescription,
  calculateDiagnosticOutcome,
  EMERGENCY_SAFETY_COPY,
  formatDiagnosticSummary,
  MAINTENANCE_DIAGNOSTIC_ISSUES,
  normalizeDiagnosticAnswer,
} from "../lib/maintenanceDiagnostics";
import { supabase } from "../lib/supabase";
import {
  createMaintenanceDiagnosticForRequest,
  getMaintenanceDiagnosticTemplate,
} from "../services/maintenanceDiagnosticsService";
import {
  createMaintenanceRequest,
  listLinkedWorkOrdersForRequests,
  listMaintenanceRequestsByProperty,
  resolveTenantReporterId,
  updateMaintenanceRequest,
} from "../services/maintenanceService";
import { createWorkOrder } from "../services/workOrderService";
import { useI18n } from "../context/I18nContext";
import { isManageRole } from "../utils/permissions";

/* -----------------------------
   Helpers
----------------------------- */

function statusLabel(status, t) {
  switch (String(status ?? "").toLowerCase()) {
    case "open":
      return t("status.req.open");
    case "in_progress":
      return t("status.req.in_progress");
    case "waiting":
      return t("status.req.waiting");
    case "resolved":
      return t("status.req.resolved");
    case "closed":
      return t("status.req.closed");
    default:
      return status ?? "—";
  }
}

function priorityLabel(priority, t) {
  switch (String(priority ?? "").toLowerCase()) {
    case "low":
      return t("priority.low");
    case "normal":
      return t("priority.normal");
    case "high":
      return t("priority.high");
    case "urgent":
      return t("priority.urgent");
    default:
      return priority ?? "—";
  }
}

function formatDateTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function StatusPill({ status, t }) {
  const base = "text-xs px-2 py-0.5 rounded border";
  const s = String(status ?? "").toLowerCase();

  if (s === "resolved" || s === "closed") {
    return (
      <span className={`${base} bg-green-50 border-green-200 text-green-700`}>
        {statusLabel(s, t)}
      </span>
    );
  }
  if (s === "in_progress") {
    return (
      <span className={`${base} bg-blue-50 border-blue-200 text-blue-700`}>
        {statusLabel(s, t)}
      </span>
    );
  }
  if (s === "waiting") {
    return (
      <span className={`${base} bg-slate-50 border-slate-200 text-slate-600`}>
        {statusLabel(s, t)}
      </span>
    );
  }
  return (
    <span className={`${base} bg-amber-50 border-amber-200 text-amber-800`}>
      {statusLabel(s || "open", t)}
    </span>
  );
}

function WorkOrderPill({ wo, t }) {
  const base = "text-xs px-2 py-0.5 rounded border";
  const s = String(wo?.status ?? "").toLowerCase();

  if (s === "completed") {
    return (
      <span className={`${base} bg-green-50 border-green-200 text-green-700`}>
        {t("maintenance.workOrderStatus.completed")}
      </span>
    );
  }
  if (s === "in_progress") {
    return (
      <span className={`${base} bg-blue-50 border-blue-200 text-blue-700`}>
        {t("maintenance.workOrderStatus.inProgress")}
      </span>
    );
  }
  if (s === "cancelled") {
    return (
      <span className={`${base} bg-slate-50 border-slate-200 text-slate-600`}>
        {t("maintenance.workOrderStatus.cancelled")}
      </span>
    );
  }
  return (
    <span className={`${base} bg-amber-50 border-amber-200 text-amber-800`}>
      {t("maintenance.workOrderStatus.assigned")}
    </span>
  );
}

function Modal({ open, onClose, title, children }) {
  const { t } = useI18n();
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute left-1/2 top-1/2 w-[95vw] max-w-3xl -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-xl border">
        <div className="p-4 border-b flex items-center justify-between">
          <div className="font-semibold text-slate-900">{title}</div>
          <button
            type="button"
            onClick={onClose}
            className="text-sm px-2 py-1 rounded hover:bg-slate-100"
          >
            {t("common.close")}
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function PaginationFooter({
  page,
  totalPages,
  totalCount,
  pageSize,
  onPrev,
  onNext,
  onPageSizeChange,
  t,
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pt-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500">{t("common.perPage")}</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="border rounded-lg px-2 py-1 text-sm bg-white"
          aria-label={t("common.perPage")}
        >
          {[10, 20, 30, 50, 100].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-between md:justify-end gap-3">
        <button
          className="px-3 py-2 rounded-lg border text-sm disabled:opacity-50"
          onClick={onPrev}
          disabled={page <= 1}
        >
          {t("common.prev")}
        </button>

        <div className="text-sm text-slate-600">
          {t("common.page")} <span className="font-medium text-slate-900">{page}</span> {t("common.of")}{" "}
          <span className="font-medium text-slate-900">{totalPages}</span>
          {typeof totalCount === "number" ? (
            <span className="ml-2 text-xs text-slate-500">({totalCount} {t("common.total").toLowerCase()})</span>
          ) : null}
        </div>

        <button
          className="px-3 py-2 rounded-lg border text-sm disabled:opacity-50"
          onClick={onNext}
          disabled={page >= totalPages}
        >
          {t("common.next")}
        </button>
      </div>
    </div>
  );
}

/* -----------------------------
   Component
----------------------------- */

export default function MaintenanceRequestsSection({ propertyId }) {
  const { activeAccountId, activeRole, hasEntitlement } = useAccount();
  const { t } = useI18n();
  const navigate = useNavigate();

  const isTenant = useMemo(
    () => String(activeRole ?? "").toLowerCase() === "tenant",
    [activeRole]
  );

  const canManage = useMemo(() => {
    return isManageRole(activeRole);
  }, [activeRole]);

  const canCreate = canManage || isTenant;
  const diagnosticsEnabled =
    hasEntitlement?.(ENTITLEMENT_FEATURES.MAINTENANCE_SMART_DIAGNOSTICS) ||
    (isTenant && hasEntitlement?.(ENTITLEMENT_FEATURES.TENANT_MAINTENANCE_DIAGNOSTICS));

  // -----------------------------
  // Data: requests + linked work orders
  // -----------------------------
  const [requests, setRequests] = useState([]);
  const [workOrdersByRequestId, setWorkOrdersByRequestId] = useState({});
  const [loading, setLoading] = useState(false);
  const [woLoading, setWoLoading] = useState(false);
  const [error, setError] = useState(null);

  // ✅ Pagination (V1) + page-size selector
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalCount, setTotalCount] = useState(0);

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil((totalCount || 0) / (pageSize || 1)));
  }, [totalCount, pageSize]);

  // Keep page in bounds after deletes / data changes
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
    if (page < 1) setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalPages]);

  // Reset to page 1 when changing property/account
  useEffect(() => {
    setPage(1);
  }, [activeAccountId, propertyId]);

  async function reloadRequests() {
    if (!activeAccountId || !propertyId) return;

    setLoading(true);
    setError(null);

    try {
      const result = await listMaintenanceRequestsByProperty({
        accountId: activeAccountId,
        propertyId,
        page,
        pageSize,
      });
      setRequests(result.data ?? []);
      setTotalCount(result.count ?? 0);
    } catch (e) {
      setRequests([]);
      setTotalCount(0);
      setError(e);
    } finally {
      setLoading(false);
    }
  }

  async function reloadLinkedWorkOrders(requestRows) {
    if (!activeAccountId || !propertyId) return;

    const ids = (requestRows ?? []).map((r) => r.id).filter(Boolean);
    if (ids.length === 0) {
      setWorkOrdersByRequestId({});
      return;
    }

    setWoLoading(true);
    try {
      const grouped = await listLinkedWorkOrdersForRequests({
        accountId: activeAccountId,
        propertyId,
        requests: requestRows,
      });
      setWorkOrdersByRequestId(grouped);
    } catch {
      setWorkOrdersByRequestId({});
    } finally {
      setWoLoading(false);
    }
  }

  useEffect(() => {
    if (!activeAccountId || !propertyId) return;
    reloadRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccountId, propertyId, page, pageSize]);

  useEffect(() => {
    if (!activeAccountId || !propertyId) return;
    reloadLinkedWorkOrders(requests);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requests, activeAccountId, propertyId]);

  // -----------------------------
  // Create request (tenant + members)
  // -----------------------------
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("normal");
  const [diagnosticIssueType, setDiagnosticIssueType] = useState("");
  const [diagnosticTemplate, setDiagnosticTemplate] = useState(null);
  const [diagnosticAnswers, setDiagnosticAnswers] = useState({});
  const [diagnosticLoading, setDiagnosticLoading] = useState(false);
  const diagnosticSteps = useMemo(
    () => diagnosticTemplate?.maintenance_diagnostic_steps ?? [],
    [diagnosticTemplate],
  );
  const diagnosticOutcome = useMemo(() => {
    if (!diagnosticsEnabled || !diagnosticIssueType || diagnosticSteps.length === 0) return null;
    return calculateDiagnosticOutcome({
      issueType: diagnosticIssueType,
      steps: diagnosticSteps,
      answers: diagnosticAnswers,
    });
  }, [diagnosticAnswers, diagnosticIssueType, diagnosticSteps, diagnosticsEnabled]);
  const diagnosticSummary = useMemo(() => {
    if (!diagnosticOutcome) return "";
    return formatDiagnosticSummary({
      issueType: diagnosticIssueType,
      steps: diagnosticSteps,
      answers: diagnosticAnswers,
      outcome: diagnosticOutcome,
    });
  }, [diagnosticAnswers, diagnosticIssueType, diagnosticOutcome, diagnosticSteps]);

  useEffect(() => {
    let cancelled = false;
    async function loadDiagnosticTemplate() {
      if (!diagnosticsEnabled || !diagnosticIssueType) {
        setDiagnosticTemplate(null);
        setDiagnosticAnswers({});
        return;
      }
      setDiagnosticLoading(true);
      try {
        const template = await getMaintenanceDiagnosticTemplate(diagnosticIssueType);
        if (!cancelled) {
          setDiagnosticTemplate(template);
          setDiagnosticAnswers({});
        }
      } catch (e) {
        if (!cancelled) {
          console.warn("Maintenance diagnostic template unavailable", e);
          setDiagnosticTemplate(null);
          setDiagnosticAnswers({});
        }
      } finally {
        if (!cancelled) setDiagnosticLoading(false);
      }
    }
    loadDiagnosticTemplate();
    return () => {
      cancelled = true;
    };
  }, [diagnosticIssueType, diagnosticsEnabled]);

  function setDiagnosticAnswer(step, value) {
    setDiagnosticAnswers((prev) => ({
      ...prev,
      [step.step_key]: normalizeDiagnosticAnswer(step, value),
    }));
  }

  async function handleCreate() {
    if (!activeAccountId || !propertyId) return;

    try {
      setCreating(true);
      let reportedByTenantId = null;
      if (isTenant) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user?.id) {
          reportedByTenantId = await resolveTenantReporterId({
            accountId: activeAccountId,
            propertyId,
            userId: user.id,
          });
        }
      }

      const requestPriority =
        diagnosticOutcome?.urgency === "urgent"
          ? "urgent"
          : diagnosticOutcome?.urgency === "high" && priority !== "urgent"
            ? "high"
            : priority;
      const requestDescription = diagnosticSummary
        ? buildMaintenanceRequestDiagnosticDescription(description, diagnosticSummary)
        : description;

      const createdRequest = await createMaintenanceRequest({
        accountId: activeAccountId,
        propertyId,
        reportedByTenantId,
        title,
        description: requestDescription,
        priority: requestPriority,
      });

      if (diagnosticsEnabled && diagnosticTemplate && diagnosticIssueType) {
        try {
          await createMaintenanceDiagnosticForRequest({
            accountId: activeAccountId,
            propertyId,
            tenantId: reportedByTenantId,
            maintenanceRequestId: createdRequest?.id,
            issueType: diagnosticIssueType,
            template: diagnosticTemplate,
            answers: diagnosticAnswers,
          });
        } catch (diagnosticError) {
          console.warn("Maintenance diagnostic session was not attached", diagnosticError);
        }
      }

      setTitle("");
      setDescription("");
      setPriority("normal");
      setDiagnosticIssueType("");
      setDiagnosticTemplate(null);
      setDiagnosticAnswers({});

      // ✅ ensure newest item appears immediately
      setPage(1);
      await reloadRequests();
    } catch (e) {
      console.error(e);
      alert(e?.message ?? t("maintenance.requests.createError"));
    } finally {
      setCreating(false);
    }
  }

  // -----------------------------
  // Member status change
  // -----------------------------
  async function setStatus(id, nextStatus) {
    try {
      await updateMaintenanceRequest(id, { status: nextStatus });

      // counts/totals can change across pages, safest is to refresh current page
      await reloadRequests();
    } catch (e) {
      console.error(e);
      alert(e?.message ?? t("maintenance.requests.statusChangeError"));
    }
  }

  function renderActions(r) {
    if (!canManage) return null;

    const s = String(r.status ?? "").toLowerCase();

    if (s === "resolved" || s === "closed") {
      return (
        <div className="flex flex-col gap-2 text-xs shrink-0">
          <button
            type="button"
            onClick={() => setStatus(r.id, "open")}
            className="text-slate-600 hover:underline text-right"
          >
            {t("maintenance.actions.reopen")}
          </button>
          {s !== "closed" && (
            <button
              type="button"
              onClick={() => setStatus(r.id, "closed")}
              className="text-slate-600 hover:underline text-right"
            >
              {t("maintenance.actions.close")}
            </button>
          )}
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-2 text-xs shrink-0">
        {s !== "open" && (
          <button
            type="button"
            onClick={() => setStatus(r.id, "open")}
            className="text-slate-600 hover:underline text-right"
          >
            {t("maintenance.actions.open")}
          </button>
        )}

        {s !== "in_progress" && (
          <button
            type="button"
            onClick={() => setStatus(r.id, "in_progress")}
            className="text-blue-600 hover:underline text-right"
          >
            {t("maintenance.actions.inProgress")}
          </button>
        )}

        {s !== "waiting" && (
          <button
            type="button"
            onClick={() => setStatus(r.id, "waiting")}
            className="text-slate-600 hover:underline text-right"
          >
            {t("maintenance.actions.waiting")}
          </button>
        )}

        <button
          type="button"
          onClick={() => setStatus(r.id, "resolved")}
          className="text-green-700 hover:underline text-right"
        >
          {t("maintenance.actions.resolve")}
        </button>

        <button
          type="button"
          onClick={() => setStatus(r.id, "closed")}
          className="text-slate-600 hover:underline text-right"
        >
          {t("maintenance.actions.close")}
        </button>
      </div>
    );
  }

  // -----------------------------
  // Option A: KEEP modal WO creation (authoritative)
  // -----------------------------
  const [woModalOpen, setWoModalOpen] = useState(false);
  const [woForRequest, setWoForRequest] = useState(null);

  const [woContractorName, setWoContractorName] = useState("");
  const [woContractorPhone, setWoContractorPhone] = useState("");
  const [woScheduledAt, setWoScheduledAt] = useState("");
  const [woNotes, setWoNotes] = useState("");
  const [woSaving, setWoSaving] = useState(false);

  function openCreateWO(requestRow) {
    setWoForRequest(requestRow);
    setWoContractorName("");
    setWoContractorPhone("");
    setWoScheduledAt("");
    setWoNotes(requestRow?.description ? `${t("maintenance.requestLabel")}: ${requestRow.description}` : "");
    setWoModalOpen(true);
  }

  function closeCreateWO() {
    setWoModalOpen(false);
    setWoForRequest(null);
  }

  async function handleCreateWorkOrderFromRequest() {
    if (!canManage) return;
    if (!activeAccountId || !propertyId || !woForRequest?.id) return;

    setWoSaving(true);
    try {
      await createWorkOrder({
        accountId: activeAccountId,
        propertyId,
        maintenanceRequestId: woForRequest.id,
        contractorName: woContractorName || null,
        contractorPhone: woContractorPhone || null,
        scheduledAt: woScheduledAt ? new Date(woScheduledAt).toISOString() : null,
        notes: woNotes || null,
        status: "assigned",
      });

      // UX sync: move ticket to in_progress if still open/waiting
      const current = String(woForRequest.status ?? "").toLowerCase();
      if (["open", "waiting"].includes(current)) {
        await updateMaintenanceRequest(woForRequest.id, { status: "in_progress" });
      }

      closeCreateWO();

      // ✅ show newest changes at top
      setPage(1);
      await reloadRequests();
    } catch (e) {
      alert(e?.message ?? t("maintenance.requests.createWorkOrderError"));
    } finally {
      setWoSaving(false);
    }
  }

  // -----------------------------
  // Option A: ALSO offer deep-link (suggested)
  // -----------------------------
  function goCreateWorkOrderForRequest(req) {
    if (!canManage) return;
    if (!propertyId || !req?.id) return;

    navigate(`/properties/${propertyId}?createWO=1&mrId=${req.id}&seedNotes=1`);
  }

  // -----------------------------
  // Request details modal (tenant-friendly)
  // -----------------------------
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedReq, setSelectedReq] = useState(null);

  function openDetails(req) {
    setSelectedReq(req);
    setDetailOpen(true);
  }

  function closeDetails() {
    setSelectedReq(null);
    setDetailOpen(false);
  }

  const selectedReqWorkOrders = useMemo(() => {
    const id = selectedReq?.id;
    if (!id) return [];
    return workOrdersByRequestId[id] ?? [];
  }, [selectedReq, workOrdersByRequestId]);

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">{t("maintenance.requests.title")}</h3>
          <p className="text-sm text-slate-500">{t("maintenance.requests.subtitle")}</p>
        </div>

        <div className="flex items-center gap-3 text-sm text-slate-600">
          <span>{t("maintenance.requests.count", { count: totalCount ?? requests?.length ?? 0 })}</span>

          {/* ✅ Page size selector (header convenience) */}
          <div className="hidden md:flex items-center gap-2">
            <label htmlFor="maintenance-requests-page-size" className="text-xs text-slate-500">{t("common.perPage")}</label>
              <select
                id="maintenance-requests-page-size"
                name="maintenance-requests-page-size"
                value={pageSize}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setPage(1);
                  setPageSize(Number.isFinite(n) && n > 0 ? n : 20);
                }}
                className="border rounded-lg px-2 py-2 text-sm bg-white"
                aria-label={t("common.perPage")}
              >
              {[10, 20, 30, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={reloadRequests}
            className="px-3 py-2 text-sm rounded-lg border hover:bg-slate-50"
          >
            {t("common.refresh")}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg border bg-white">
          <p className="text-sm text-rose-600">{t("common.error")}: {String(error.message ?? error)}</p>
        </div>
      )}

      {canCreate && (
        <div className="border rounded-xl bg-white p-4 space-y-3">
          <p className="text-sm font-medium">{isTenant ? t("maintenance.requests.reportIssue") : t("maintenance.requests.addRequest")}</p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label htmlFor="maintenance-request-title" className="text-xs text-slate-500">{t("common.title")}</label>
              <input
                id="maintenance-request-title"
                name="maintenance-request-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                placeholder={t("maintenance.requests.titleExample")}
              />
            </div>

            <div>
              <label htmlFor="maintenance-request-priority" className="text-xs text-slate-500">{t("common.priority")}</label>
              <select
                id="maintenance-request-priority"
                name="maintenance-request-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                aria-label={t("common.priority")}
              >
                <option value="low">{t("priority.low")}</option>
                <option value="normal">{t("priority.normal")}</option>
                <option value="high">{t("priority.high")}</option>
                <option value="urgent">{t("priority.urgent")}</option>
              </select>
            </div>
          </div>

          {diagnosticsEnabled && (
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="maintenance-diagnostic-issue" className="text-xs text-slate-500">
                    Possible issue category
                  </label>
                  <select
                    id="maintenance-diagnostic-issue"
                    name="maintenance-diagnostic-issue"
                    value={diagnosticIssueType}
                    onChange={(e) => setDiagnosticIssueType(e.target.value)}
                    className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white"
                  >
                    <option value="">Select possible issue category</option>
                    {MAINTENANCE_DIAGNOSTIC_ISSUES.map((issue) => (
                      <option key={issue.value} value={issue.value}>
                        {issue.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <p className="text-xs font-medium text-slate-700">Basic troubleshooting questions</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    These answers help your landlord review the issue. Landlord review required; this is not a substitute for professional advice.
                  </p>
                </div>
              </div>

              {diagnosticLoading ? (
                <Skeleton className="h-16" />
              ) : diagnosticTemplate ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {diagnosticSteps.map((step) => {
                    const answer = diagnosticAnswers[step.step_key]?.value ?? "";
                    if (step.answer_type === "info") {
                      return (
                        <div key={step.id || step.step_key} className="md:col-span-2 rounded-lg border bg-white px-3 py-2 text-sm text-slate-600">
                          {step.question}
                        </div>
                      );
                    }
                    if (step.answer_type === "yes_no") {
                      return (
                        <div key={step.id || step.step_key}>
                          <label className="text-xs text-slate-500">{step.question}</label>
                          <select
                            value={answer || "not_sure"}
                            onChange={(e) => setDiagnosticAnswer(step, e.target.value)}
                            className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white"
                          >
                            <option value="not_sure">Not sure</option>
                            <option value="yes">Yes</option>
                            <option value="no">No</option>
                          </select>
                          {step.help_text ? <p className="mt-1 text-[11px] text-slate-500">{step.help_text}</p> : null}
                        </div>
                      );
                    }
                    if (step.answer_type === "single_choice") {
                      const options = Array.isArray(step.options) ? step.options : [];
                      return (
                        <div key={step.id || step.step_key}>
                          <label className="text-xs text-slate-500">{step.question}</label>
                          <select
                            value={answer}
                            onChange={(e) => setDiagnosticAnswer(step, e.target.value)}
                            className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white"
                          >
                            <option value="">Select answer</option>
                            {options.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    }
                    return (
                      <div key={step.id || step.step_key} className={step.answer_type === "text" ? "md:col-span-2" : ""}>
                        <label className="text-xs text-slate-500">{step.question}</label>
                        <input
                          type={step.answer_type === "number" ? "number" : "text"}
                          value={answer}
                          onChange={(e) => setDiagnosticAnswer(step, e.target.value)}
                          className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                          placeholder={step.help_text || ""}
                        />
                      </div>
                    );
                  })}
                </div>
              ) : diagnosticIssueType ? (
                <p className="text-xs text-slate-500">No diagnostic template is available yet for this issue type.</p>
              ) : null}

              {diagnosticOutcome?.emergencyFlag ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">
                  {EMERGENCY_SAFETY_COPY}
                </div>
              ) : null}

              {diagnosticSummary ? (
                <div className="rounded-lg border bg-white px-3 py-2">
                  <p className="text-xs font-medium text-slate-700">Diagnostic summary before submit</p>
                  <p className="mt-1 text-[11px] font-medium text-indigo-700">Landlord review required</p>
                  <p className="mt-1 text-xs leading-5 text-slate-600 whitespace-pre-wrap line-clamp-6">
                    {diagnosticSummary}
                  </p>
                </div>
              ) : null}
            </div>
          )}

          <div>
            <label htmlFor="maintenance-request-description" className="text-xs text-slate-500">{t("common.description")}</label>
            <textarea
              id="maintenance-request-description"
              name="maintenance-request-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
              placeholder={t("maintenance.requests.descriptionOptional")}
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            {isTenant && (
              <p className="text-xs text-slate-500">
                {t("maintenance.requests.tenantCreateHint")}
              </p>
            )}
            <div className="flex justify-end">
              <button
                disabled={creating || !title.trim()}
                onClick={handleCreate}
                className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg disabled:opacity-60"
              >
                {creating ? t("common.adding") : t("common.add")}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      )}

      {!loading && requests.length === 0 && (
        <p className="text-sm text-slate-500">{t("maintenance.requests.empty")}</p>
      )}

      {!loading && requests.length > 0 && (
        <div className="divide-y border rounded-lg bg-white">
          {requests.map((r) => {
            const linked = workOrdersByRequestId[r.id] ?? [];
            const primaryWO = linked[0] ?? null;

            return (
              <div key={r.id} className="px-4 py-3 flex gap-4 justify-between">
                <button type="button" onClick={() => openDetails(r)} className="min-w-0 text-left">
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusPill status={r.status} t={t} />
                    <p className="font-medium truncate">{r.title}</p>

                    {primaryWO && (
                      <>
                        <WorkOrderPill wo={primaryWO} t={t} />
                        {primaryWO?.pending_cancel_request && (
                          <span className="text-xs px-2 py-0.5 rounded border bg-amber-50 border-amber-200 text-amber-800">
                            {t("workOrders.cancelRequestLabel")}
                          </span>
                        )}
                      </>
                    )}
                  </div>

                  {r.description && (
                    <p className="text-sm text-slate-600 mt-1 line-clamp-2">{r.description}</p>
                  )}

                  <div className="text-xs text-slate-500 mt-2 flex gap-3 flex-wrap">
                    <span>{t("maintenance.card.status")}: {statusLabel(r.status, t)}</span>
                    <span>{t("common.priority")}: {priorityLabel(r.priority, t)}</span>
                    <span>{t("common.createdAt")}: {formatDateTime(r.created_at)}</span>
                    {primaryWO?.scheduled_at && (
                      <span>{t("maintenance.requests.workOrderDue")}: {formatDateTime(primaryWO.scheduled_at)}</span>
                    )}
                    {linked.length > 1 && <span>{t("maintenance.card.workOrders")}: {linked.length}</span>}
                    {woLoading && <span>{t("maintenance.requests.loadingWorkOrders")}</span>}
                  </div>
                </button>

                <div className="flex flex-col items-end gap-2 shrink-0">
                  {/* ✅ Option A: modal is primary (keeps full functionality) */}
                  {canManage && (
                    <div className="flex flex-col items-end gap-1">
                      <button
                        type="button"
                        onClick={() => openCreateWO(r)}
                        className="text-sm text-blue-600 hover:underline"
                      >
                        {t("maintenance.actions.createWorkOrder")}
                      </button>

                      {/* ✅ Secondary: “suggest” deep link */}
                      <button
                        type="button"
                        onClick={() => goCreateWorkOrderForRequest(r)}
                        className="text-xs text-slate-600 hover:underline"
                      >
                        {t("maintenance.actions.suggestInWorkOrders")}
                      </button>
                    </div>
                  )}

                  {renderActions(r)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ✅ Pagination footer */}
      {!loading && totalPages > 1 && (
        <PaginationFooter
          page={page}
          totalPages={totalPages}
          totalCount={totalCount}
          pageSize={pageSize}
          onPrev={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
          onPageSizeChange={(n) => {
            const next = Number.isFinite(n) && n > 0 ? n : 20;
            setPage(1);
            setPageSize(next);
          }}
          t={t}
        />
      )}

      {/* Request details modal */}
      <Modal open={detailOpen} onClose={closeDetails} title={t("maintenance.requests.detailsTitle")}>
        {!selectedReq ? (
          <p className="text-sm text-slate-500">{t("common.noData")}</p>
        ) : (
          <div className="space-y-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <StatusPill status={selectedReq.status} t={t} />
                <div className="text-lg font-semibold text-slate-900">{selectedReq.title}</div>
              </div>

              <div className="text-xs text-slate-500 mt-2 flex gap-3 flex-wrap">
                <span>{t("common.priority")}: {priorityLabel(selectedReq.priority, t)}</span>
                <span>{t("common.createdAt")}: {formatDateTime(selectedReq.created_at)}</span>
                <span>{t("common.updatedAt")}: {formatDateTime(selectedReq.updated_at)}</span>
              </div>

              {selectedReq.description && (
                <div className="mt-3 bg-slate-50 border rounded-lg p-3 text-sm text-slate-700 whitespace-pre-wrap">
                  {selectedReq.description}
                </div>
              )}
            </div>

            <div>
              <h4 className="font-semibold text-slate-900">{t("maintenance.requests.executionWorkOrders")}</h4>

              {woLoading ? (
                <div className="mt-2 space-y-2">
                  <Skeleton className="h-12" />
                  <Skeleton className="h-12" />
                </div>
              ) : selectedReqWorkOrders.length === 0 ? (
                <p className="text-sm text-slate-500 mt-2">
                  {canManage
                    ? t("maintenance.requests.noWorkOrdersManage")
                    : t("maintenance.requests.noWorkOrdersTenant")}
                </p>
              ) : (
                <div className="mt-2 space-y-2">
                  {selectedReqWorkOrders.map((wo) => (
                    <div key={wo.id} className="border rounded-lg p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <WorkOrderPill wo={wo} t={t} />
                            {wo?.pending_cancel_request && (
                              <span className="text-xs px-2 py-0.5 rounded border bg-amber-50 border-amber-200 text-amber-800">
                                {t("workOrders.cancelRequestLabel")}
                              </span>
                            )}
                          </div>

                          <div className="text-xs text-slate-500 mt-2 flex gap-3 flex-wrap">
                            {wo.contractor_name && <span>{t("common.contractor")}: {wo.contractor_name}</span>}
                            {wo.contractor_phone && <span>{t("common.phone")}: {wo.contractor_phone}</span>}
                            {wo.scheduled_at && <span>{t("common.dueDate")}: {formatDateTime(wo.scheduled_at)}</span>}
                          </div>

                          {wo.last_cancel_resolution_action && (
                            <p className="text-xs text-slate-500 mt-2">
                              {t("workOrders.cancelDecision")}{" "}
                              {String(wo.last_cancel_resolution_action).replaceAll("_", " ")}
                              {wo.last_cancel_resolution_at
                                ? ` • ${formatDateTime(wo.last_cancel_resolution_at)}`
                                : ""}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ✅ Option A: modal primary + deep-link secondary */}
              {canManage && (
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => openCreateWO(selectedReq)}
                    className="px-3 py-2 text-sm rounded-lg bg-blue-600 text-white"
                  >
                    {t("maintenance.actions.createWorkOrderFromRequest")}
                  </button>
                  <button
                    type="button"
                    onClick={() => goCreateWorkOrderForRequest(selectedReq)}
                    className="px-3 py-2 text-sm rounded-lg border hover:bg-slate-50"
                  >
                    {t("maintenance.actions.suggestInWorkOrders")}
                  </button>
                </div>
              )}
            </div>

            <MaintenanceRequestAttachmentsPanel
              accountId={activeAccountId}
              maintenanceRequestId={selectedReq.id}
              canUpload={isTenant}
              allowDelete={isTenant}
              requestStatus={selectedReq.status}
            />
          </div>
        )}
      </Modal>

      {/* ✅ Option A: Create Work Order modal (members only) */}
      <Modal open={woModalOpen} onClose={closeCreateWO} title={t("maintenance.drawer.create")}>
        {!woForRequest ? (
          <p className="text-sm text-slate-500">{t("common.noData")}</p>
        ) : (
          <div className="space-y-4">
            <div className="bg-slate-50 border rounded-lg p-3">
              <div className="text-sm font-medium text-slate-900">
                {t("maintenance.requestLabel")}: {woForRequest.title}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {t("common.priority")}: {priorityLabel(woForRequest.priority, t)} • {t("common.status")}:{" "}
                {statusLabel(woForRequest.status, t)}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500">{t("maintenance.drawer.contractorName")}</label>
                <input
                  value={woContractorName}
                  onChange={(e) => setWoContractorName(e.target.value)}
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                  placeholder={t("maintenance.requests.contractorExample")}
                />
              </div>

              <div>
                <label className="text-xs text-slate-500">{t("common.phone")}</label>
                <input
                  value={woContractorPhone}
                  onChange={(e) => setWoContractorPhone(e.target.value)}
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                  placeholder={t("maintenance.requests.phoneExample")}
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-xs text-slate-500">{t("maintenance.drawer.scheduleOptional")}</label>
                <input
                  type="datetime-local"
                  value={woScheduledAt}
                  onChange={(e) => setWoScheduledAt(e.target.value)}
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-500">{t("maintenance.drawer.notes")}</label>
              <textarea
                value={woNotes}
                onChange={(e) => setWoNotes(e.target.value)}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm min-h-[100px]"
                placeholder={t("maintenance.requests.workNotesPlaceholder")}
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={closeCreateWO}
                className="px-3 py-2 text-sm rounded-lg border"
                disabled={woSaving}
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={handleCreateWorkOrderFromRequest}
                disabled={woSaving}
                className={`px-3 py-2 text-sm rounded-lg text-white ${
                  woSaving ? "bg-slate-400" : "bg-blue-600"
                }`}
              >
                {woSaving ? t("common.creating") : t("maintenance.actions.createWorkOrder")}
              </button>
            </div>

            <p className="text-xs text-slate-500">
              {t("maintenance.requests.autoStatusHint")}
            </p>
          </div>
        )}
      </Modal>
    </Card>
  );
}
