// src/components/MaintenanceRequestsSection.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Card from "./Card";
import Skeleton from "./ui/Skeleton";
import { useAccount } from "../context/AccountContext";
import { supabase } from "../lib/supabase";
import { createMaintenanceRequest, updateMaintenanceRequest } from "../services/maintenanceService";
import { createWorkOrder } from "../services/workOrderService";

/* -----------------------------
   Helpers
----------------------------- */

function statusLabel(status) {
  switch (String(status ?? "").toLowerCase()) {
    case "open":
      return "Otwarte";
    case "in_progress":
      return "W trakcie";
    case "waiting":
      return "Oczekuje";
    case "resolved":
      return "Rozwiązane";
    case "closed":
      return "Zamknięte";
    default:
      return status ?? "—";
  }
}

function priorityLabel(priority) {
  switch (String(priority ?? "").toLowerCase()) {
    case "low":
      return "Niski";
    case "normal":
      return "Normalny";
    case "high":
      return "Wysoki";
    case "urgent":
      return "Pilny";
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

function StatusPill({ status }) {
  const base = "text-xs px-2 py-0.5 rounded border";
  const s = String(status ?? "").toLowerCase();

  if (s === "resolved" || s === "closed") {
    return (
      <span className={`${base} bg-green-50 border-green-200 text-green-700`}>
        {statusLabel(s)}
      </span>
    );
  }
  if (s === "in_progress") {
    return (
      <span className={`${base} bg-blue-50 border-blue-200 text-blue-700`}>
        {statusLabel(s)}
      </span>
    );
  }
  if (s === "waiting") {
    return (
      <span className={`${base} bg-slate-50 border-slate-200 text-slate-600`}>
        {statusLabel(s)}
      </span>
    );
  }
  return (
    <span className={`${base} bg-amber-50 border-amber-200 text-amber-800`}>
      {statusLabel(s || "open")}
    </span>
  );
}

function WorkOrderPill({ wo }) {
  const base = "text-xs px-2 py-0.5 rounded border";
  const s = String(wo?.status ?? "").toLowerCase();

  if (s === "completed") {
    return (
      <span className={`${base} bg-green-50 border-green-200 text-green-700`}>
        Zlecenie: Zakończone
      </span>
    );
  }
  if (s === "in_progress") {
    return (
      <span className={`${base} bg-blue-50 border-blue-200 text-blue-700`}>
        Zlecenie: W trakcie
      </span>
    );
  }
  if (s === "cancelled") {
    return (
      <span className={`${base} bg-slate-50 border-slate-200 text-slate-600`}>
        Zlecenie: Anulowane
      </span>
    );
  }
  return (
    <span className={`${base} bg-amber-50 border-amber-200 text-amber-800`}>
      Zlecenie: Przypisane
    </span>
  );
}

function Modal({ open, onClose, title, children }) {
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
            Zamknij
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
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pt-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500">Na stronę</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="border rounded-lg px-2 py-1 text-sm bg-white"
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
          Prev
        </button>

        <div className="text-sm text-slate-600">
          Page <span className="font-medium text-slate-900">{page}</span> of{" "}
          <span className="font-medium text-slate-900">{totalPages}</span>
          {typeof totalCount === "number" ? (
            <span className="ml-2 text-xs text-slate-500">({totalCount} total)</span>
          ) : null}
        </div>

        <button
          className="px-3 py-2 rounded-lg border text-sm disabled:opacity-50"
          onClick={onNext}
          disabled={page >= totalPages}
        >
          Next
        </button>
      </div>
    </div>
  );
}

/* -----------------------------
   Component
----------------------------- */

export default function MaintenanceRequestsSection({ propertyId }) {
  const { activeAccountId, activeRole } = useAccount();
  const navigate = useNavigate();

  const isTenant = useMemo(
    () => String(activeRole ?? "").toLowerCase() === "tenant",
    [activeRole]
  );

  const canManage = useMemo(() => {
    const r = String(activeRole ?? "").toLowerCase();
    return ["owner", "admin", "staff"].includes(r);
  }, [activeRole]);

  const canCreate = canManage || isTenant;

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
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data, error, count } = await supabase
        .from("maintenance_requests")
        .select(
          "id, account_id, property_id, reported_by_tenant_id, title, description, priority, status, created_at, updated_at",
          { count: "exact" }
        )
        .eq("account_id", activeAccountId)
        .eq("property_id", propertyId)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) throw error;
      setRequests(data ?? []);
      setTotalCount(count ?? 0);
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
      const { data, error } = await supabase
        .from("work_orders_with_flags")
        .select(
          `
          id,
          account_id,
          property_id,
          maintenance_request_id,
          status,
          contractor_name,
          contractor_phone,
          scheduled_at,
          created_at,
          pending_cancel_request,
          last_cancel_request_at,
          last_cancel_resolution_action,
          last_cancel_resolution_at
        `
        )
        .eq("account_id", activeAccountId)
        .eq("property_id", propertyId)
        .in("maintenance_request_id", ids)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const grouped = {};
      for (const wo of data ?? []) {
        const k = wo.maintenance_request_id;
        if (!k) continue;
        if (!grouped[k]) grouped[k] = [];
        grouped[k].push(wo);
      }
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

  async function handleCreate() {
    if (!activeAccountId || !propertyId) return;

    try {
      setCreating(true);
      await createMaintenanceRequest({
        accountId: activeAccountId,
        propertyId,
        title,
        description,
        priority,
      });

      setTitle("");
      setDescription("");
      setPriority("normal");

      // ✅ ensure newest item appears immediately
      setPage(1);
      await reloadRequests();
    } catch (e) {
      console.error(e);
      alert(e?.message ?? "Nie udało się utworzyć zgłoszenia");
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
      alert(e?.message ?? "Nie udało się zmienić statusu");
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
            Otwórz ponownie
          </button>
          {s !== "closed" && (
            <button
              type="button"
              onClick={() => setStatus(r.id, "closed")}
              className="text-slate-600 hover:underline text-right"
            >
              Zamknij
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
            Otwórz
          </button>
        )}

        {s !== "in_progress" && (
          <button
            type="button"
            onClick={() => setStatus(r.id, "in_progress")}
            className="text-blue-600 hover:underline text-right"
          >
            W trakcie
          </button>
        )}

        {s !== "waiting" && (
          <button
            type="button"
            onClick={() => setStatus(r.id, "waiting")}
            className="text-slate-600 hover:underline text-right"
          >
            Oczekuje
          </button>
        )}

        <button
          type="button"
          onClick={() => setStatus(r.id, "resolved")}
          className="text-green-700 hover:underline text-right"
        >
          Rozwiąż
        </button>

        <button
          type="button"
          onClick={() => setStatus(r.id, "closed")}
          className="text-slate-600 hover:underline text-right"
        >
          Zamknij
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
    setWoNotes(requestRow?.description ? `Zgłoszenie: ${requestRow.description}` : "");
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
      alert(e?.message ?? "Nie udało się utworzyć zlecenia");
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
          <h3 className="text-lg font-semibold">Usterki / Zgłoszenia</h3>
          <p className="text-sm text-slate-500">Zgłoszenia serwisowe dla tej nieruchomości</p>
        </div>

        <div className="flex items-center gap-3 text-sm text-slate-600">
          <span>{totalCount ?? requests?.length ?? 0} zgłoszeń</span>

          {/* ✅ Page size selector (header convenience) */}
          <div className="hidden md:flex items-center gap-2">
            <span className="text-xs text-slate-500">Na stronę</span>
            <select
              value={pageSize}
              onChange={(e) => {
                const n = Number(e.target.value);
                setPage(1);
                setPageSize(Number.isFinite(n) && n > 0 ? n : 20);
              }}
              className="border rounded-lg px-2 py-2 text-sm bg-white"
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
            Odśwież
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg border bg-white">
          <p className="text-sm text-rose-600">Błąd: {String(error.message ?? error)}</p>
        </div>
      )}

      {canCreate && (
        <div className="border rounded-xl bg-white p-4 space-y-3">
          <p className="text-sm font-medium">{isTenant ? "Zgłoś usterkę" : "Dodaj zgłoszenie"}</p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className="text-xs text-slate-500">Tytuł</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                placeholder="np. Przeciek pod zlewem"
              />
            </div>

            <div>
              <label className="text-xs text-slate-500">Priorytet</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
              >
                <option value="low">Niski</option>
                <option value="normal">Normalny</option>
                <option value="high">Wysoki</option>
                <option value="urgent">Pilny</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-500">Opis</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
              placeholder="Dodaj szczegóły (opcjonalnie)"
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            {isTenant && (
              <p className="text-xs text-slate-500">
                Po zgłoszeniu właściciel utworzy zlecenie serwisowe, gdy zacznie realizację.
              </p>
            )}
            <div className="flex justify-end">
              <button
                disabled={creating || !title.trim()}
                onClick={handleCreate}
                className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg disabled:opacity-60"
              >
                {creating ? "Dodawanie..." : "Dodaj"}
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
        <p className="text-sm text-slate-500">Brak zgłoszeń dla tej nieruchomości.</p>
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
                    <StatusPill status={r.status} />
                    <p className="font-medium truncate">{r.title}</p>

                    {primaryWO && (
                      <>
                        <WorkOrderPill wo={primaryWO} />
                        {primaryWO?.pending_cancel_request && (
                          <span className="text-xs px-2 py-0.5 rounded border bg-amber-50 border-amber-200 text-amber-800">
                            Prośba o anulowanie
                          </span>
                        )}
                      </>
                    )}
                  </div>

                  {r.description && (
                    <p className="text-sm text-slate-600 mt-1 line-clamp-2">{r.description}</p>
                  )}

                  <div className="text-xs text-slate-500 mt-2 flex gap-3 flex-wrap">
                    <span>Status: {statusLabel(r.status)}</span>
                    <span>Priorytet: {priorityLabel(r.priority)}</span>
                    <span>Utworzono: {formatDateTime(r.created_at)}</span>
                    {primaryWO?.scheduled_at && (
                      <span>Termin zlecenia: {formatDateTime(primaryWO.scheduled_at)}</span>
                    )}
                    {linked.length > 1 && <span>Zlecenia: {linked.length}</span>}
                    {woLoading && <span>Ładowanie zleceń…</span>}
                  </div>
                </button>

                <div className="flex flex-col items-end gap-2 shrink-0">
                  {/* ✅ Option A: modal is primary (keeps full functionality) */}
                  {canManage && linked.length === 0 && (
                    <div className="flex flex-col items-end gap-1">
                      <button
                        type="button"
                        onClick={() => openCreateWO(r)}
                        className="text-sm text-blue-600 hover:underline"
                      >
                        Utwórz zlecenie
                      </button>

                      {/* ✅ Secondary: “suggest” deep link */}
                      <button
                        type="button"
                        onClick={() => goCreateWorkOrderForRequest(r)}
                        className="text-xs text-slate-600 hover:underline"
                      >
                        Sugeruj w „Zleceniach”
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
        />
      )}

      {/* Request details modal */}
      <Modal open={detailOpen} onClose={closeDetails} title="Szczegóły zgłoszenia">
        {!selectedReq ? (
          <p className="text-sm text-slate-500">Brak danych.</p>
        ) : (
          <div className="space-y-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <StatusPill status={selectedReq.status} />
                <div className="text-lg font-semibold text-slate-900">{selectedReq.title}</div>
              </div>

              <div className="text-xs text-slate-500 mt-2 flex gap-3 flex-wrap">
                <span>Priorytet: {priorityLabel(selectedReq.priority)}</span>
                <span>Utworzono: {formatDateTime(selectedReq.created_at)}</span>
                <span>Aktualizacja: {formatDateTime(selectedReq.updated_at)}</span>
              </div>

              {selectedReq.description && (
                <div className="mt-3 bg-slate-50 border rounded-lg p-3 text-sm text-slate-700 whitespace-pre-wrap">
                  {selectedReq.description}
                </div>
              )}
            </div>

            <div>
              <h4 className="font-semibold text-slate-900">Realizacja (zlecenia)</h4>

              {woLoading ? (
                <div className="mt-2 space-y-2">
                  <Skeleton className="h-12" />
                  <Skeleton className="h-12" />
                </div>
              ) : selectedReqWorkOrders.length === 0 ? (
                <p className="text-sm text-slate-500 mt-2">
                  {canManage
                    ? "Brak zleceń dla tego zgłoszenia. Możesz utworzyć zlecenie."
                    : "Właściciel jeszcze nie utworzył zlecenia dla tego zgłoszenia."}
                </p>
              ) : (
                <div className="mt-2 space-y-2">
                  {selectedReqWorkOrders.map((wo) => (
                    <div key={wo.id} className="border rounded-lg p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <WorkOrderPill wo={wo} />
                            {wo?.pending_cancel_request && (
                              <span className="text-xs px-2 py-0.5 rounded border bg-amber-50 border-amber-200 text-amber-800">
                                Prośba o anulowanie
                              </span>
                            )}
                          </div>

                          <div className="text-xs text-slate-500 mt-2 flex gap-3 flex-wrap">
                            {wo.contractor_name && <span>Wykonawca: {wo.contractor_name}</span>}
                            {wo.contractor_phone && <span>Tel: {wo.contractor_phone}</span>}
                            {wo.scheduled_at && <span>Termin: {formatDateTime(wo.scheduled_at)}</span>}
                          </div>

                          {wo.last_cancel_resolution_action && (
                            <p className="text-xs text-slate-500 mt-2">
                              Decyzja dot. anulowania:{" "}
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
              {canManage && selectedReqWorkOrders.length === 0 && (
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => openCreateWO(selectedReq)}
                    className="px-3 py-2 text-sm rounded-lg bg-blue-600 text-white"
                  >
                    Utwórz zlecenie z tego zgłoszenia
                  </button>
                  <button
                    type="button"
                    onClick={() => goCreateWorkOrderForRequest(selectedReq)}
                    className="px-3 py-2 text-sm rounded-lg border hover:bg-slate-50"
                  >
                    Sugeruj w „Zleceniach”
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* ✅ Option A: Create Work Order modal (members only) */}
      <Modal open={woModalOpen} onClose={closeCreateWO} title="Utwórz zlecenie (Work Order)">
        {!woForRequest ? (
          <p className="text-sm text-slate-500">Brak danych.</p>
        ) : (
          <div className="space-y-4">
            <div className="bg-slate-50 border rounded-lg p-3">
              <div className="text-sm font-medium text-slate-900">
                Zgłoszenie: {woForRequest.title}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Priorytet: {priorityLabel(woForRequest.priority)} • Status:{" "}
                {statusLabel(woForRequest.status)}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500">Wykonawca (nazwa)</label>
                <input
                  value={woContractorName}
                  onChange={(e) => setWoContractorName(e.target.value)}
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                  placeholder="Np. HydroFix"
                />
              </div>

              <div>
                <label className="text-xs text-slate-500">Telefon</label>
                <input
                  value={woContractorPhone}
                  onChange={(e) => setWoContractorPhone(e.target.value)}
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                  placeholder="+48…"
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-xs text-slate-500">Termin (opcjonalnie)</label>
                <input
                  type="datetime-local"
                  value={woScheduledAt}
                  onChange={(e) => setWoScheduledAt(e.target.value)}
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-500">Notatki</label>
              <textarea
                value={woNotes}
                onChange={(e) => setWoNotes(e.target.value)}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm min-h-[100px]"
                placeholder="Opis prac / instrukcje"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={closeCreateWO}
                className="px-3 py-2 text-sm rounded-lg border"
                disabled={woSaving}
              >
                Anuluj
              </button>
              <button
                type="button"
                onClick={handleCreateWorkOrderFromRequest}
                disabled={woSaving}
                className={`px-3 py-2 text-sm rounded-lg text-white ${
                  woSaving ? "bg-slate-400" : "bg-blue-600"
                }`}
              >
                {woSaving ? "Tworzenie…" : "Utwórz zlecenie"}
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Uwaga: status zgłoszenia zostanie ustawiony na „W trakcie”, jeśli było „Otwarte” lub
              „Oczekuje”.
            </p>
          </div>
        )}
      </Modal>
    </Card>
  );
}