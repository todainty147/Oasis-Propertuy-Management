import { useEffect, useMemo, useState } from "react";
import { usePageTitle } from "../layout/PageTitleContext";
import { useAccount } from "../context/AccountContext";
import { supabase } from "../lib/supabase";
import Skeleton from "../components/ui/Skeleton";
import MaintenanceColumn from "../components/maintenance-inbox/MaintenanceColumn";
import CreateWorkOrderDrawer from "../components/maintenance-inbox/CreateWorkOrderDrawer";
import { updateMaintenanceRequest } from "../services/maintenanceService";
import { createWorkOrder } from "../services/workOrderService";

const STATUS_ORDER = ["open", "in_progress", "waiting", "resolved", "closed"];
const WAITING_REASON_OPTIONS = [
  { value: "tenant_response", label: "waiting for tenant" },
  { value: "contractor_schedule", label: "waiting for contractor" },
  { value: "parts_ordered", label: "waiting for materials" },
  { value: "landlord_approval", label: "waiting for decision" },
];

function timestampForNote() {
  return new Date().toLocaleString();
}

export default function MaintenanceInboxPage() {
  const { setTitle } = usePageTitle();
  const { activeAccountId, activeRole } = useAccount();

  const role = useMemo(() => String(activeRole ?? "").toLowerCase(), [activeRole]);
  const canManage = useMemo(() => ["owner", "admin", "staff"].includes(role), [role]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [totalCount, setTotalCount] = useState(0);

  const [requests, setRequests] = useState([]);
  const [statusTotals, setStatusTotals] = useState({
    open: 0,
    in_progress: 0,
    waiting: 0,
    resolved: 0,
    closed: 0,
  });
  const [workOrderByRequestId, setWorkOrderByRequestId] = useState({});
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
  const totalPages = useMemo(() => {
    const pages = STATUS_ORDER.map((s) => Math.ceil((statusTotals[s] || 0) / (pageSize || 1)));
    const maxPages = Math.max(1, ...pages);
    return maxPages;
  }, [statusTotals, pageSize]);

  useEffect(() => {
    setTitle("Maintenance Inbox");
  }, [setTitle]);

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

      const nextTotals = {
        open: 0,
        in_progress: 0,
        waiting: 0,
        resolved: 0,
        closed: 0,
      };
      for (const r of rows) {
        const s = String(r?.status || "").toLowerCase();
        if (Object.prototype.hasOwnProperty.call(nextTotals, s)) {
          nextTotals[s] += 1;
        }
      }
      setStatusTotals(nextTotals);

      const propMap = {};
      for (const p of propsRows ?? []) {
        const city = p.city ? `, ${p.city}` : "";
        propMap[p.id] = `${p.address || "Nieruchomość"}${city}`;
      }
      setPropertyLabelById(propMap);
      setContractors(contractorsRows ?? []);

      const requestIds = rows.map((r) => r.id).filter(Boolean);
      if (requestIds.length === 0) {
        setWorkOrderByRequestId({});
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
        if (!k || woMap[k]) continue;
        woMap[k] = wo;
      }
      setWorkOrderByRequestId(woMap);
    } catch (e) {
      setError(e?.message || "Nie udało się wczytać Maintenance Inbox.");
      setRequests([]);
      setTotalCount(0);
      setStatusTotals({
        open: 0,
        in_progress: 0,
        waiting: 0,
        resolved: 0,
        closed: 0,
      });
      setWorkOrderByRequestId({});
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

  async function handleCloseRequest(request, linkedWorkOrder = null) {
    if (!canManage || !request?.id) return;

    if (linkedWorkOrder && String(linkedWorkOrder.status || "").toLowerCase() !== "completed") {
      alert("Work order must be completed before closing.");
      return;
    }

    setBusyRequestId(request.id);
    try {
      await updateMaintenanceRequest(request.id, { status: "closed" });
      await loadAll();
    } catch (e) {
      alert(e?.message || "Nie udało się zamknąć zgłoszenia.");
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
      alert(e?.message || "Nie udało się dodać notatki.");
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
      alert(e?.message || "Nie udało się zapisać waiting_reason.");
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
      alert(e?.message || "Nie udało się utworzyć zlecenia.");
    } finally {
      setDrawerSaving(false);
    }
  }

  const grouped = useMemo(() => {
    const map = {};
    for (const s of STATUS_ORDER) map[s] = [];
    for (const r of requests ?? []) {
      const s = String(r.status || "").toLowerCase();
      if (!map[s]) map[s] = [];
      map[s].push(r);
    }
    return map;
  }, [requests]);

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
          Maintenance Inbox jest dostępny tylko dla ról owner/admin/staff.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-white p-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Maintenance Inbox / Triage Board</h2>
          <p className="text-sm text-slate-500 mt-1">Przegląd zgłoszeń serwisowych grupowanych po statusie.</p>
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
            title="Na stronę"
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
            Prev
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
            Next
          </button>
          <button
            type="button"
            onClick={loadAll}
            disabled={loading}
            className="px-3 py-2 text-sm rounded-lg border hover:bg-slate-50 disabled:opacity-50"
          >
            Odśwież
          </button>
        </div>
      </div>

      <div className="text-sm text-slate-600 px-1">
        Łącznie zgłoszeń: <span className="font-medium text-slate-900">{totalCount}</span>
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
          {STATUS_ORDER.map((status) => (
            <MaintenanceColumn
              key={status}
              accountId={activeAccountId}
              status={status}
              items={pagedGrouped[status] || []}
              totalForStatus={statusTotals[status] || 0}
              workOrderByRequestId={workOrderByRequestId}
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
              <div className="font-semibold text-slate-900">Dodaj notatkę</div>
              <button
                type="button"
                onClick={() => setNoteModalOpen(false)}
                className="text-sm px-2 py-1 rounded hover:bg-slate-100"
              >
                Zamknij
              </button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-sm text-slate-600">{noteRequest?.title || "Zgłoszenie"}</p>
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm min-h-[150px]"
                placeholder="Wpisz notatkę..."
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setNoteModalOpen(false)}
                  className="px-3 py-2 text-sm rounded-lg border hover:bg-slate-50"
                >
                  Anuluj
                </button>
                <button
                  type="button"
                  onClick={handleSaveNote}
                  disabled={!noteText.trim() || busyRequestId === noteRequest?.id}
                  className={`px-3 py-2 text-sm rounded-lg text-white ${
                    !noteText.trim() || busyRequestId === noteRequest?.id ? "bg-slate-400" : "bg-blue-600"
                  }`}
                >
                  {busyRequestId === noteRequest?.id ? "Zapisywanie…" : "Zapisz notatkę"}
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
              <div className="font-semibold text-slate-900">Ustaw powód oczekiwania</div>
              <button
                type="button"
                onClick={() => !waitingSaving && setWaitingModalOpen(false)}
                className="text-sm px-2 py-1 rounded hover:bg-slate-100"
              >
                Zamknij
              </button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-sm text-slate-600">{waitingRequest?.title || "Zgłoszenie"}</p>
              <select
                value={waitingReason}
                onChange={(e) => setWaitingReason(e.target.value)}
                disabled={waitingSaving}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-white disabled:bg-slate-50"
              >
                <option value="">Brak powodu</option>
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
                  Anuluj
                </button>
                <button
                  type="button"
                  onClick={handleSaveWaitingReason}
                  disabled={waitingSaving}
                  className={`px-3 py-2 text-sm rounded-lg text-white ${
                    waitingSaving ? "bg-slate-400" : "bg-blue-600"
                  }`}
                >
                  {waitingSaving ? "Zapisywanie…" : "Zapisz"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
