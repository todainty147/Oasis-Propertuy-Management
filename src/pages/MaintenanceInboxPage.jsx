import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { usePageTitle } from "../layout/PageTitleContext";
import { useAccount } from "../context/AccountContext";
import { supabase } from "../lib/supabase";
import Skeleton from "../components/ui/Skeleton";
import MaintenanceColumn from "../components/maintenance-inbox/MaintenanceColumn";
import CreateWorkOrderDrawer from "../components/maintenance-inbox/CreateWorkOrderDrawer";
import { updateMaintenanceRequest } from "../services/maintenanceService";
import { createWorkOrder } from "../services/workOrderService";
import { useI18n } from "../context/I18nContext";

const STATUS_ORDER = ["open", "in_progress", "waiting", "resolved", "closed"];
const AGE_BUCKETS = new Set(["0_24", "24_48", "48_72", "72_plus"]);

function timestampForNote() {
  return new Date().toLocaleString();
}

function ageHours(ts) {
  if (!ts) return 0;
  const t = new Date(ts).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 3600000));
}

export default function MaintenanceInboxPage() {
  const { setTitle } = usePageTitle();
  const { activeAccountId, activeRole } = useAccount();
  const { t } = useI18n();
  const [searchParams] = useSearchParams();

  const role = useMemo(() => String(activeRole ?? "").toLowerCase(), [activeRole]);
  const canManage = useMemo(() => ["owner", "admin", "staff"].includes(role), [role]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [totalCount, setTotalCount] = useState(0);

  const [requests, setRequests] = useState([]);
  const [workOrdersByRequestId, setWorkOrdersByRequestId] = useState({});
  const [propertyLabelById, setPropertyLabelById] = useState({});
  const [contractors, setContractors] = useState([]);

  const [busyRequestId, setBusyRequestId] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [drawerSaving, setDrawerSaving] = useState(false);
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [noteRequest, setNoteRequest] = useState(null);
  const [noteText, setNoteText] = useState("");
  const [waitingModalOpen, setWaitingModalOpen] = useState(false);
  const [waitingRequest, setWaitingRequest] = useState(null);
  const [waitingReason, setWaitingReason] = useState("");
  const [waitingSaving, setWaitingSaving] = useState(false);

  const statusFilterValues = useMemo(() => {
    const raw = String(searchParams.get("status") || "").toLowerCase().trim();
    if (!raw) return [];
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => STATUS_ORDER.includes(s));
  }, [searchParams]);

  const ageFilter = useMemo(() => {
    const s = String(searchParams.get("age") || "").toLowerCase();
    return AGE_BUCKETS.has(s) ? s : "";
  }, [searchParams]);

  const agingFilter = useMemo(() => String(searchParams.get("aging") || "").toLowerCase(), [searchParams]);

  const woStatusFilter = useMemo(() => {
    const s = String(searchParams.get("woStatus") || "").toLowerCase();
    return s || "";
  }, [searchParams]);

  const priorityFilterValues = useMemo(() => {
    const raw = String(searchParams.get("priority") || "").toLowerCase().trim();
    if (!raw) return [];
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }, [searchParams]);

  const visibleStatuses = useMemo(() => {
    if (statusFilterValues.length === 0) return STATUS_ORDER;
    return statusFilterValues;
  }, [statusFilterValues]);

  const filteredRequests = useMemo(() => {
    return (requests || []).filter((r) => {
      const priority = String(r?.priority || "").toLowerCase();
      if (priorityFilterValues.length > 0 && !priorityFilterValues.includes(priority)) return false;

      const h = ageHours(r?.created_at);
      if (agingFilter === "48h" && h < 48) return false;
      if (ageFilter === "0_24") return h < 24;
      if (ageFilter === "24_48") return h >= 24 && h < 48;
      if (ageFilter === "48_72") return h >= 48 && h < 72;
      if (ageFilter === "72_plus") return h >= 72;
      return true;
    });
  }, [requests, ageFilter, agingFilter, priorityFilterValues]);

  const requestsAfterWoFilter = useMemo(() => {
    if (!woStatusFilter) return filteredRequests;
    return filteredRequests.filter((r) => {
      const linked = workOrdersByRequestId[r.id] || [];
      return linked.some((wo) => String(wo?.status || "").toLowerCase() === woStatusFilter);
    });
  }, [filteredRequests, workOrdersByRequestId, woStatusFilter]);

  const statusTotalsView = useMemo(() => {
    const next = { open: 0, in_progress: 0, waiting: 0, resolved: 0, closed: 0 };
    const source = ageFilter || agingFilter || woStatusFilter || priorityFilterValues.length > 0 ? requestsAfterWoFilter : requests;
    for (const r of source || []) {
      const s = String(r?.status || "").toLowerCase();
      if (Object.prototype.hasOwnProperty.call(next, s)) next[s] += 1;
    }
    return next;
  }, [ageFilter, agingFilter, woStatusFilter, priorityFilterValues.length, requestsAfterWoFilter, requests]);

  const totalPages = useMemo(() => {
    const pages = visibleStatuses.map((s) => Math.ceil((statusTotalsView[s] || 0) / (pageSize || 1)));
    const maxPages = Math.max(1, ...pages);
    return maxPages;
  }, [statusTotalsView, pageSize, visibleStatuses]);

  const WAITING_REASON_OPTIONS = useMemo(
    () => [
      { value: "tenant_response", label: t("maintenance.inbox.waiting.tenant_response") },
      { value: "contractor_schedule", label: t("maintenance.inbox.waiting.contractor_schedule") },
      { value: "parts_ordered", label: t("maintenance.inbox.waiting.parts_ordered") },
      { value: "landlord_approval", label: t("maintenance.inbox.waiting.landlord_approval") },
    ],
    [t]
  );

  useEffect(() => {
    setTitle(t("maintenance.inbox.pageTitle"));
  }, [setTitle, t]);

  async function loadAll() {
    if (!activeAccountId) return;

    setLoading(true);
    setError("");

    try {
      const [{ data: reqRows, error: reqErr }, { data: propsRows, error: propErr }, { data: contractorsRows, error: cErr }] =
        await Promise.all([
          supabase
            .from("maintenance_requests")
            .select(
              "id, account_id, property_id, reported_by_tenant_id, title, description, priority, status, waiting_reason, created_at, updated_at"
            )
            .eq("account_id", activeAccountId)
            .order("created_at", { ascending: false }),
          supabase.from("properties").select("id, address, city").eq("account_id", activeAccountId),
          supabase.from("contractors").select("id, name, phone, active").eq("account_id", activeAccountId).eq("active", true),
        ]);

      if (reqErr) throw reqErr;
      if (propErr) throw propErr;
      if (cErr) throw cErr;

      const rows = reqRows ?? [];
      setRequests(rows);
      setTotalCount(rows.length);

      const propMap = {};
      for (const p of propsRows ?? []) {
        const city = p.city ? `, ${p.city}` : "";
        propMap[p.id] = `${p.address || t("common.property")}${city}`;
      }
      setPropertyLabelById(propMap);
      setContractors(contractorsRows ?? []);

      const requestIds = rows.map((r) => r.id).filter(Boolean);
      if (requestIds.length === 0) {
        setWorkOrdersByRequestId({});
        return;
      }

      const { data: woRows, error: woErr } = await supabase
        .from("work_orders_with_flags")
        .select("id, maintenance_request_id, status, contractor_user_id, contractor_name, contractor_phone, created_at")
        .eq("account_id", activeAccountId)
        .in("maintenance_request_id", requestIds)
        .order("created_at", { ascending: false });

      if (woErr) throw woErr;

      const woMap = {};
      for (const wo of woRows ?? []) {
        const k = wo.maintenance_request_id;
        if (!k) continue;
        if (!woMap[k]) woMap[k] = [];
        woMap[k].push(wo);
      }
      setWorkOrdersByRequestId(woMap);
    } catch (e) {
      setError(e?.message || t("maintenance.inbox.loadError"));
      setRequests([]);
      setTotalCount(0);
      setWorkOrdersByRequestId({});
      setPropertyLabelById({});
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!activeAccountId) return;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccountId]);

  useEffect(() => {
    setPage(1);
  }, [activeAccountId]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  async function handleCloseRequest(request, linkedWorkOrders = []) {
    if (!canManage || !request?.id) return;

    const finalStatuses = new Set(["completed", "cancelled"]);
    const hasOpenWorkOrders = (linkedWorkOrders || []).some(
      (wo) => !finalStatuses.has(String(wo?.status || "").toLowerCase())
    );
    if (hasOpenWorkOrders) {
      alert(t("maintenance.inbox.closeGuard"));
      return;
    }

    setBusyRequestId(request.id);
    try {
      await updateMaintenanceRequest(request.id, { status: "closed" });
      await loadAll();
    } catch (e) {
      alert(e?.message || t("maintenance.inbox.closeError"));
    } finally {
      setBusyRequestId("");
    }
  }

  async function handleAddNote(request) {
    if (!canManage || !request?.id) return;
    setNoteRequest(request);
    setNoteText("");
    setNoteModalOpen(true);
  }

  async function handleSaveNote() {
    if (!canManage || !noteRequest?.id) return;
    if (!noteText?.trim()) return;

    const current = noteRequest.description ? `${noteRequest.description}\n\n` : "";
    const merged = `${current}[Notatka ${timestampForNote()}]\n${noteText.trim()}`;

    setBusyRequestId(noteRequest.id);
    try {
      await updateMaintenanceRequest(noteRequest.id, { description: merged });
      setNoteModalOpen(false);
      setNoteRequest(null);
      setNoteText("");
      await loadAll();
    } catch (e) {
      alert(e?.message || t("maintenance.inbox.noteSaveError"));
    } finally {
      setBusyRequestId("");
    }
  }

  function handleOpenWaitingReason(request) {
    if (!canManage || !request?.id) return;
    setWaitingRequest(request);
    setWaitingReason(request.waiting_reason || "");
    setWaitingModalOpen(true);
  }

  async function handleSaveWaitingReason() {
    if (!canManage || !waitingRequest?.id) return;
    setWaitingSaving(true);
    try {
      await updateMaintenanceRequest(waitingRequest.id, {
        status: "waiting",
        waiting_reason: waitingReason || null,
      });
      setWaitingModalOpen(false);
      setWaitingRequest(null);
      setWaitingReason("");
      await loadAll();
    } catch (e) {
      alert(e?.message || t("maintenance.inbox.waiting.saveError"));
    } finally {
      setWaitingSaving(false);
    }
  }

  function openCreateWorkOrder(request) {
    if (!canManage || !request?.id) return;
    setSelectedRequest(request);
    setDrawerOpen(true);
  }

  async function handleCreateWorkOrder(payload) {
    if (!canManage || !selectedRequest?.id) return;

    setDrawerSaving(true);
    try {
      await createWorkOrder({
        accountId: activeAccountId,
        propertyId: selectedRequest.property_id,
        maintenanceRequestId: selectedRequest.id,
        contractorId: payload.contractorId || null,
        contractorName: payload.contractorName || null,
        contractorPhone: payload.contractorPhone || null,
        scheduledAt: payload.scheduledAt || null,
        notes: payload.notes || null,
      });

      const current = String(selectedRequest.status || "").toLowerCase();
      if (current === "open" || current === "waiting") {
        await updateMaintenanceRequest(selectedRequest.id, { status: "in_progress" });
      }

      setDrawerOpen(false);
      setSelectedRequest(null);
      await loadAll();
    } catch (e) {
      alert(e?.message || t("maintenance.inbox.createWorkOrderError"));
    } finally {
      setDrawerSaving(false);
    }
  }

  const grouped = useMemo(() => {
    const map = {};
    for (const s of STATUS_ORDER) map[s] = [];
    const source = ageFilter || agingFilter || woStatusFilter || priorityFilterValues.length > 0 ? requestsAfterWoFilter : requests;
    for (const r of source ?? []) {
      const s = String(r.status || "").toLowerCase();
      if (!map[s]) map[s] = [];
      map[s].push(r);
    }
    return map;
  }, [ageFilter, agingFilter, woStatusFilter, priorityFilterValues.length, requestsAfterWoFilter, requests]);

  const pagedGrouped = useMemo(() => {
    const from = (page - 1) * pageSize;
    const to = from + pageSize;
    const map = {};
    for (const s of STATUS_ORDER) {
      map[s] = (grouped[s] || []).slice(from, to);
    }
    return map;
  }, [grouped, page, pageSize]);

  if (!canManage) {
    return (
      <div className="rounded-xl border bg-white p-6">
        <p className="text-sm text-slate-600">
          {t("maintenance.inbox.accessDenied")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-white p-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{t("maintenance.inbox.title")}</h2>
          <p className="text-sm text-slate-500 mt-1">{t("maintenance.inbox.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={pageSize}
            onChange={(e) => {
              const n = Number(e.target.value);
              setPage(1);
              setPageSize(Number.isFinite(n) && n > 0 ? n : 5);
            }}
            className="px-2 py-2 text-sm rounded-lg border bg-white"
            disabled={loading}
            title={t("maintenance.inbox.perPage")}
          >
            {[5].map((n) => (
              <option key={n} value={n}>
                {n}/str
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={loading || page <= 1}
            className="px-3 py-2 text-sm rounded-lg border hover:bg-slate-50 disabled:opacity-50"
          >
            {t("common.prev")}
          </button>
          <div className="text-xs text-slate-600 min-w-[84px] text-center">
            {page}/{totalPages}
          </div>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={loading || page >= totalPages}
            className="px-3 py-2 text-sm rounded-lg border hover:bg-slate-50 disabled:opacity-50"
          >
            {t("common.next")}
          </button>
          <button
            type="button"
            onClick={loadAll}
            disabled={loading}
            className="px-3 py-2 text-sm rounded-lg border hover:bg-slate-50 disabled:opacity-50"
          >
            {t("common.refresh")}
          </button>
        </div>
      </div>

      <div className="text-sm text-slate-600 px-1">
        {t("maintenance.inbox.total")}: <span className="font-medium text-slate-900">{ageFilter || woStatusFilter ? requestsAfterWoFilter.length : totalCount}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2 px-1">
        <span className="text-xs text-slate-500">{t("maintenance.sla.legend")}:</span>
        <span className="text-[11px] px-2 py-0.5 rounded border bg-emerald-50 border-emerald-200 text-emerald-700">
          {t("maintenance.sla.green")} (0-24h)
        </span>
        <span className="text-[11px] px-2 py-0.5 rounded border bg-amber-50 border-amber-200 text-amber-700">
          {t("maintenance.sla.yellow")} (24-48h)
        </span>
        <span className="text-[11px] px-2 py-0.5 rounded border bg-rose-50 border-rose-200 text-rose-700">
          {t("maintenance.sla.red")} ({">"}48h)
        </span>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, idx) => (
            <Skeleton key={idx} className="h-[320px]" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5 gap-3">
          {visibleStatuses.map((status) => (
            <MaintenanceColumn
              key={status}
              accountId={activeAccountId}
              status={status}
              items={pagedGrouped[status] || []}
              totalForStatus={statusTotalsView[status] || 0}
              workOrdersByRequestId={workOrdersByRequestId}
              propertyLabelById={propertyLabelById}
              canManage={canManage}
              busyRequestId={busyRequestId}
              onCreateWorkOrder={openCreateWorkOrder}
              onCloseRequest={handleCloseRequest}
              onAddNote={handleAddNote}
              onSetWaitingReason={handleOpenWaitingReason}
            />
          ))}
        </div>
      )}

      <CreateWorkOrderDrawer
        open={drawerOpen}
        request={selectedRequest}
        contractors={contractors}
        saving={drawerSaving}
        onClose={() => {
          if (drawerSaving) return;
          setDrawerOpen(false);
          setSelectedRequest(null);
        }}
        onSubmit={handleCreateWorkOrder}
      />

      {noteModalOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={() => setNoteModalOpen(false)} />
          <div className="absolute left-1/2 top-1/2 w-[95vw] max-w-xl -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-xl border">
            <div className="p-4 border-b flex items-center justify-between">
              <div className="font-semibold text-slate-900">{t("maintenance.card.addNote")}</div>
              <button
                type="button"
                onClick={() => setNoteModalOpen(false)}
                className="text-sm px-2 py-1 rounded hover:bg-slate-100"
              >
                {t("common.close")}
              </button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-sm text-slate-600">{noteRequest?.title || t("maintenance.requestFallbackTitle")}</p>
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm min-h-[150px]"
                placeholder={t("maintenance.notePlaceholder")}
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setNoteModalOpen(false)}
                  className="px-3 py-2 text-sm rounded-lg border hover:bg-slate-50"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  onClick={handleSaveNote}
                  disabled={!noteText.trim() || busyRequestId === noteRequest?.id}
                  className={`px-3 py-2 text-sm rounded-lg text-white ${
                    !noteText.trim() || busyRequestId === noteRequest?.id ? "bg-slate-400" : "bg-blue-600"
                  }`}
                >
                  {busyRequestId === noteRequest?.id ? t("common.saving") : t("maintenance.card.saveNote")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {waitingModalOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={() => !waitingSaving && setWaitingModalOpen(false)} />
          <div className="absolute left-1/2 top-1/2 w-[95vw] max-w-lg -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-xl border">
            <div className="p-4 border-b flex items-center justify-between">
              <div className="font-semibold text-slate-900">{t("maintenance.card.setWaiting")}</div>
              <button
                type="button"
                onClick={() => !waitingSaving && setWaitingModalOpen(false)}
                className="text-sm px-2 py-1 rounded hover:bg-slate-100"
              >
                {t("common.close")}
              </button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-sm text-slate-600">{waitingRequest?.title || t("maintenance.requestFallbackTitle")}</p>
              <select
                value={waitingReason}
                onChange={(e) => setWaitingReason(e.target.value)}
                disabled={waitingSaving}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-white disabled:bg-slate-50"
              >
                <option value="">{t("maintenance.inbox.waiting.none")}</option>
                {WAITING_REASON_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setWaitingModalOpen(false)}
                  disabled={waitingSaving}
                  className="px-3 py-2 text-sm rounded-lg border hover:bg-slate-50 disabled:opacity-50"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  onClick={handleSaveWaitingReason}
                  disabled={waitingSaving}
                  className={`px-3 py-2 text-sm rounded-lg text-white ${
                    waitingSaving ? "bg-slate-400" : "bg-blue-600"
                  }`}
                >
                  {waitingSaving ? t("common.saving") : t("common.save")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
