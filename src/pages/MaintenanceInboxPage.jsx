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

  const [requests, setRequests] = useState([]);
  const [workOrderByRequestId, setWorkOrderByRequestId] = useState({});
  const [propertyLabelById, setPropertyLabelById] = useState({});
  const [contractors, setContractors] = useState([]);

  const [busyRequestId, setBusyRequestId] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [drawerSaving, setDrawerSaving] = useState(false);

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
              "id, account_id, property_id, reported_by_tenant_id, title, description, priority, status, created_at, updated_at"
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
        .select("id, maintenance_request_id, status, contractor_name, contractor_phone, created_at")
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

  async function handleCloseRequest(request) {
    if (!canManage || !request?.id) return;
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
    const note = window.prompt("Dodaj notatkę do zgłoszenia:");
    if (!note || !note.trim()) return;

    const current = request.description ? `${request.description}\n\n` : "";
    const merged = `${current}[Notatka ${timestampForNote()}]\n${note.trim()}`;

    setBusyRequestId(request.id);
    try {
      await updateMaintenanceRequest(request.id, { description: merged });
      await loadAll();
    } catch (e) {
      alert(e?.message || "Nie udało się dodać notatki.");
    } finally {
      setBusyRequestId("");
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
        <button
          type="button"
          onClick={loadAll}
          disabled={loading}
          className="px-3 py-2 text-sm rounded-lg border hover:bg-slate-50 disabled:opacity-50"
        >
          Odśwież
        </button>
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
              status={status}
              items={grouped[status] || []}
              workOrderByRequestId={workOrderByRequestId}
              propertyLabelById={propertyLabelById}
              canManage={canManage}
              busyRequestId={busyRequestId}
              onCreateWorkOrder={openCreateWorkOrder}
              onCloseRequest={handleCloseRequest}
              onAddNote={handleAddNote}
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
    </div>
  );
}
