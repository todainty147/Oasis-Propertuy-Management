// src/components/WorkOrdersSection.jsx
import { useEffect, useMemo, useState } from "react";
import Card from "./Card";
import Skeleton from "./ui/Skeleton";
import { useAccount } from "../context/AccountContext";
import { createWorkOrder, deleteWorkOrder } from "../services/workOrderService";
import { supabase } from "../lib/supabase";

/* -----------------------------
   UI helpers
----------------------------- */

function StatusPill({ status }) {
  const base = "text-xs px-2 py-0.5 rounded border";
  const s = String(status ?? "").toLowerCase();

  if (s === "completed")
    return (
      <span className={`${base} bg-green-50 border-green-200 text-green-700`}>
        Zakończone
      </span>
    );

  if (s === "in_progress")
    return (
      <span className={`${base} bg-blue-50 border-blue-200 text-blue-700`}>
        W trakcie
      </span>
    );

  if (s === "cancelled")
    return (
      <span className={`${base} bg-slate-50 border-slate-200 text-slate-600`}>
        Anulowane
      </span>
    );

  if (s === "assigned")
    return (
      <span className={`${base} bg-amber-50 border-amber-200 text-amber-800`}>
        Przypisane
      </span>
    );

  return (
    <span className={`${base} bg-amber-50 border-amber-200 text-amber-800`}>
      {status || "assigned"}
    </span>
  );
}

function formatDateTime(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString();
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

/* -----------------------------
   Component
----------------------------- */

export default function WorkOrdersSection({ propertyId }) {
  const { activeAccountId, activeRole } = useAccount();

  const role = useMemo(() => String(activeRole ?? "").toLowerCase(), [activeRole]);

  const isTenant = useMemo(() => role === "tenant", [role]);

  const canManage = useMemo(() => {
    return ["owner", "admin", "staff"].includes(role);
  }, [role]);

  // ✅ per-row busy state (prevents double-click + shows feedback)
  const [actionBusyId, setActionBusyId] = useState(null);

  // -----------------------------
  // Work orders state (from view)
  // -----------------------------
  const [workOrders, setWorkOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // -----------------------------
  // Modal + Audit timeline
  // -----------------------------
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedWO, setSelectedWO] = useState(null);

  const [audit, setAudit] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);

  // ------------------------------
  // Allowed actions cache (performance)
  // ------------------------------
  const [allowedActionsById, setAllowedActionsById] = useState({});

  async function loadAllowedActionsForRows(rows) {
    // Only managers need member actions buttons
    if (!canManage) {
      setAllowedActionsById({});
      return;
    }

    try {
      const ids = (rows ?? []).map((r) => r.id).filter(Boolean);
      if (ids.length === 0) {
        setAllowedActionsById({});
        return;
      }

      const { data, error } = await supabase.rpc("work_order_allowed_actions_bulk", {
        p_work_order_ids: ids,
      });

      if (error) throw error;

      const map = {};
      for (const r of data ?? []) {
        map[r.work_order_id] = r.actions ?? [];
      }

      setAllowedActionsById(map);
    } catch {
      // Fail soft: show minimal UI, not a crash
      setAllowedActionsById({});
    }
  }

  // Optional fallback: fetch actions for ONE work order if needed (e.g. opened from inbox)
  async function ensureAllowedActionsLoaded(workOrderId) {
    if (!canManage) return;
    if (!workOrderId) return;
    if (allowedActionsById?.[workOrderId]) return;

    try {
      const { data, error } = await supabase.rpc("work_order_allowed_actions", {
        p_work_order_id: workOrderId,
      });
      if (error) throw error;

      const actions = Array.isArray(data) ? data : [];
      setAllowedActionsById((prev) => ({
        ...(prev || {}),
        [workOrderId]: actions,
      }));
    } catch {
      // ignore
    }
  }

  async function loadAudit(workOrderId) {
    setAuditLoading(true);
    try {
      const { data, error } = await supabase
        .from("work_order_audit_log")
        .select("id, action, actor_user_id, old_value, new_value, created_at")
        .eq("work_order_id", workOrderId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setAudit(data ?? []);
    } catch {
      setAudit([]);
    } finally {
      setAuditLoading(false);
    }
  }

  // -----------------------------------------
  // Contractors directory (manager-only)
  // -----------------------------------------
  const [contractors, setContractors] = useState([]);
  const [contractorsLoading, setContractorsLoading] = useState(false);

  async function loadContractors() {
    if (!activeAccountId || !canManage) {
      setContractors([]);
      return;
    }

    setContractorsLoading(true);
    try {
      const { data, error } = await supabase
        .from("contractors")
        .select("id, name, phone, email, user_id, active")
        .eq("account_id", activeAccountId)
        .eq("active", true)
        .order("name", { ascending: true });

      if (error) throw error;
      setContractors(data ?? []);
    } catch {
      setContractors([]);
    } finally {
      setContractorsLoading(false);
    }
  }

  function openDetails(wo) {
    setSelectedWO(wo);
    setDetailOpen(true);
    loadAudit(wo.id);
    ensureAllowedActionsLoaded(wo.id);
  }

  function closeDetails() {
    setDetailOpen(false);
    setSelectedWO(null);
    setAudit([]);
  }

  async function reload() {
    if (!activeAccountId || !propertyId) return;
    setLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase
        .from("work_orders_with_flags")
        .select(
          `
          id,
          account_id,
          property_id,
          maintenance_request_id,
          contractor_user_id,
          contractor_name,
          contractor_phone,
          status,
          scheduled_at,
          notes,
          quote_amount,
          invoice_amount,
          created_by,
          created_at,
          updated_at,
          pending_cancel_request,
          last_cancel_request_at,
          last_cancel_request_by,
          last_cancel_resolution_at,
          last_cancel_resolution_action,
          last_cancel_resolution_by,
          maintenance_requests:maintenance_request_id ( id, title, status, priority )
        `
        )
        .eq("account_id", activeAccountId)
        .eq("property_id", propertyId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const rows = data ?? [];
      setWorkOrders(rows);

      // ✅ ONE call for all actions (performance)
      await loadAllowedActionsForRows(rows);

      if (detailOpen && selectedWO?.id) {
        const refreshed = rows.find((r) => r.id === selectedWO.id);
        if (refreshed) setSelectedWO(refreshed);
      }
    } catch (e) {
      setWorkOrders([]);
      setError(e);
    } finally {
      setLoading(false);
    }
  }

  // -----------------------------------------
  // NEXT-2: refresh just ONE row + its actions
  // -----------------------------------------
  async function refreshWorkOrderRow(workOrderId) {
    if (!activeAccountId || !propertyId || !workOrderId) return null;

    const { data, error } = await supabase
      .from("work_orders_with_flags")
      .select(
        `
        id,
        account_id,
        property_id,
        maintenance_request_id,
        contractor_user_id,
        contractor_name,
        contractor_phone,
        status,
        scheduled_at,
        notes,
        quote_amount,
        invoice_amount,
        created_by,
        created_at,
        updated_at,
        pending_cancel_request,
        last_cancel_request_at,
        last_cancel_request_by,
        last_cancel_resolution_at,
        last_cancel_resolution_action,
        last_cancel_resolution_by,
        maintenance_requests:maintenance_request_id ( id, title, status, priority )
      `
      )
      .eq("id", workOrderId)
      .eq("account_id", activeAccountId)
      .eq("property_id", propertyId)
      .single();

    if (error) throw error;

    // upsert into list
    setWorkOrders((prev) => {
      const arr = prev ?? [];
      const idx = arr.findIndex((x) => x.id === workOrderId);
      if (idx === -1) return [data, ...arr];
      const copy = [...arr];
      copy[idx] = data;
      return copy;
    });

    // keep modal selection fresh if it's open
    setSelectedWO((prev) => (prev?.id === workOrderId ? data : prev));

    return data;
  }

  async function refreshAllowedActionsForOne(workOrderId) {
    if (!canManage || !workOrderId) return;

    const { data, error } = await supabase.rpc("work_order_allowed_actions", {
      p_work_order_id: workOrderId,
    });

    if (error) throw error;

    const actions = Array.isArray(data) ? data : [];
    setAllowedActionsById((prev) => ({
      ...(prev || {}),
      [workOrderId]: actions,
    }));
  }

  async function refreshAfterStatusAction(workOrderId, opts = {}) {
    const { refreshInbox = false, refreshAuditLog = false } = opts;

    await refreshWorkOrderRow(workOrderId);
    await refreshAllowedActionsForOne(workOrderId);

    if (refreshInbox && canManage) await loadPendingInbox();
    if (refreshAuditLog && detailOpen && selectedWO?.id === workOrderId) {
      await loadAudit(workOrderId);
    }
  }

  // -----------------------------------------
  // Pending cancellation inbox (Action Required)
  // -----------------------------------------
  const [pendingInbox, setPendingInbox] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(false);

  async function loadPendingInbox() {
    if (!activeAccountId || !canManage) return;
    setPendingLoading(true);

    try {
      let q = supabase
        .from("work_orders_pending_cancellation")
        .select(
          `
          id,
          account_id,
          property_id,
          status,
          contractor_name,
          contractor_phone,
          scheduled_at,
          last_cancel_request_at,
          last_cancel_request_by
        `
        )
        .eq("account_id", activeAccountId)
        .order("last_cancel_request_at", { ascending: false })
        .limit(20);

      if (propertyId) q = q.eq("property_id", propertyId);

      const { data, error } = await q;
      if (error) throw error;

      setPendingInbox(data ?? []);
    } catch {
      setPendingInbox([]);
    } finally {
      setPendingLoading(false);
    }
  }

  useEffect(() => {
    if (!activeAccountId || !propertyId) return;
    reload();
    if (canManage) {
      loadPendingInbox();
      loadContractors();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccountId, propertyId, canManage]);

  // -----------------------------------------
  // Load maintenance requests for dropdown
  // (only for managers)
  // -----------------------------------------
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requests, setRequests] = useState([]);

  useEffect(() => {
    if (!activeAccountId || !propertyId || !canManage) return;

    let cancelled = false;

    async function loadRequests() {
      setRequestsLoading(true);
      try {
        const { data, error } = await supabase
          .from("maintenance_requests")
          .select("id,title,status,priority,created_at")
          .eq("account_id", activeAccountId)
          .eq("property_id", propertyId)
          .order("created_at", { ascending: false })
          .limit(100);

        if (error) throw error;
        if (!cancelled) setRequests(data ?? []);
      } catch {
        if (!cancelled) setRequests([]);
      } finally {
        if (!cancelled) setRequestsLoading(false);
      }
    }

    loadRequests();
    return () => {
      cancelled = true;
    };
  }, [activeAccountId, propertyId, canManage]);

  const openRequests = useMemo(() => {
    return (requests ?? []).filter((r) =>
      ["open", "new"].includes(String(r.status ?? "").toLowerCase())
    );
  }, [requests]);

  // -----------------------------
  // Create form
  // -----------------------------
  const [open, setOpen] = useState(false);
  const [maintenanceRequestId, setMaintenanceRequestId] = useState("");
  const [contractorName, setContractorName] = useState("");
  const [contractorPhone, setContractorPhone] = useState("");
  const [selectedContractorId, setSelectedContractorId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  function onSelectContractor(contractorId) {
    setSelectedContractorId(contractorId);
    if (!contractorId) return;

    const c = contractors.find((x) => x.id === contractorId);
    if (!c) return;

    // ✅ keep current createWorkOrder flow: autofill the existing text fields
    setContractorName(c.name ?? "");
    setContractorPhone(c.phone ?? "");
  }

  async function handleCreate() {
    if (!activeAccountId || !propertyId) return;

    setSaving(true);
    try {
      await createWorkOrder({
        accountId: activeAccountId,
        propertyId,
        maintenanceRequestId: maintenanceRequestId || null,
        contractorName: contractorName || null,
        contractorPhone: contractorPhone || null,
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        notes: notes || null,
        status: "assigned",
      });

      setOpen(false);
      setMaintenanceRequestId("");
      setContractorName("");
      setContractorPhone("");
      setSelectedContractorId("");
      setScheduledAt("");
      setNotes("");

      await reload();
      if (canManage) await loadPendingInbox();
    } catch (e) {
      alert(e?.message ?? "Nie udało się utworzyć zlecenia");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm("Usunąć zlecenie?")) return;
    try {
      await deleteWorkOrder(id);
      await reload();
      if (canManage) await loadPendingInbox();
    } catch (e) {
      alert(e?.message ?? "Nie udało się usunąć zlecenia");
    }
  }

  // -----------------------------
  // Contractor assignment (RPC)
  // -----------------------------
  const [assigningContractor, setAssigningContractor] = useState(false);
  const [assignContractorId, setAssignContractorId] = useState("");

  async function assignContractorToWorkOrder(workOrderId, contractorId) {
    if (!canManage) return;
    if (!workOrderId || !contractorId) return;

    setAssigningContractor(true);
    try {
      const { error } = await supabase.rpc("work_order_assign_contractor", {
        p_work_order_id: workOrderId,
        p_contractor_id: contractorId,
      });
      if (error) throw error;

      // ✅ refresh this row + audit + actions
      await refreshAfterStatusAction(workOrderId, { refreshAuditLog: true });
    } catch (e) {
      alert(e?.message ?? "Nie udało się przypisać wykonawcy");
    } finally {
      setAssigningContractor(false);
    }
  }

  // -----------------------------
  // DB-driven actions
  // -----------------------------
  async function setStatus(id, nextStatus) {
    setActionBusyId(id);
    try {
      const { error } = await supabase.rpc("work_order_set_status", {
        p_work_order_id: id,
        p_new_status: nextStatus,
        p_apply_if_tenant_allowed: false,
      });

      if (error) throw error;

      // ✅ NEXT-2: refresh only this row + its allowed actions
      await refreshAfterStatusAction(id, { refreshAuditLog: true });
    } catch (e) {
      alert(e?.message ?? "Nie udało się zmienić statusu");
    } finally {
      setActionBusyId(null);
    }
  }

  async function requestCancellation(id) {
    setActionBusyId(id);
    try {
      const { error } = await supabase.rpc("work_order_set_status", {
        p_work_order_id: id,
        p_new_status: "cancelled",
        p_apply_if_tenant_allowed: true,
      });

      if (error) throw error;

      // ✅ no duplicate audit call here
      await refreshAfterStatusAction(id, {
        refreshAuditLog: true,
        refreshInbox: false, // tenant can't manage inbox anyway
      });
    } catch (e) {
      alert(e?.message ?? "Nie udało się wysłać prośby o anulowanie");
    } finally {
      setActionBusyId(null);
    }
  }

  const [denyReasonById, setDenyReasonById] = useState({});

  async function approveCancellation(id) {
    setActionBusyId(id);
    try {
      const { error } = await supabase.rpc("work_order_approve_tenant_cancellation", {
        p_work_order_id: id,
      });
      if (error) throw error;

      // ✅ refresh inbox+audit via helper (no extra calls)
      await refreshAfterStatusAction(id, {
        refreshAuditLog: true,
        refreshInbox: true,
      });
    } catch (e) {
      alert(e?.message ?? "Nie udało się zatwierdzić anulowania");
    } finally {
      setActionBusyId(null);
    }
  }

  async function denyCancellation(id) {
    setActionBusyId(id);
    try {
      const reason = denyReasonById[id] || null;

      const { error } = await supabase.rpc("work_order_deny_tenant_cancellation", {
        p_work_order_id: id,
        p_reason: reason,
      });
      if (error) throw error;

      setDenyReasonById((prev) => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });

      // ✅ refresh inbox+audit via helper (no extra calls)
      await refreshAfterStatusAction(id, {
        refreshAuditLog: true,
        refreshInbox: true,
      });
    } catch (e) {
      alert(e?.message ?? "Nie udało się odrzucić anulowania");
    } finally {
      setActionBusyId(null);
    }
  }

  // -----------------------------
  // UX helpers (DB still enforces)
  // -----------------------------
  function tenantCancelState(wo) {
    if (!isTenant) return { show: false, disabled: true, reason: "" };

    const s = String(wo?.status ?? "").toLowerCase();
    const pending = !!wo?.pending_cancel_request;

    if (["completed", "cancelled"].includes(s)) {
      return { show: false, disabled: true, reason: "" };
    }

    if (pending) {
      return {
        show: true,
        disabled: true,
        reason: "⏳ Oczekuje na decyzję właściciela",
      };
    }

    return { show: true, disabled: false, reason: "" };
  }

  // -----------------------------
  // Render
  // -----------------------------
  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">Zlecenia (Work Orders)</h3>
          <p className="text-xs text-slate-500 mt-1">
            Zlecenia dla tej nieruchomości. W przyszłości dodamy przypisanie do
            kontraktorów + portal wykonawcy.
          </p>
        </div>

        {canManage && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg"
          >
            {open ? "Zamknij" : "Dodaj zlecenie"}
          </button>
        )}
      </div>

      {canManage && (
        <div className="border rounded-xl bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="font-semibold text-slate-900">Wymaga działania</h4>
              <p className="text-xs text-slate-500">
                Prośby najemców o anulowanie zleceń.
              </p>
            </div>
            <button
              type="button"
              onClick={loadPendingInbox}
              className="text-sm px-3 py-2 rounded-lg border hover:bg-slate-50"
            >
              Odśwież
            </button>
          </div>

          {pendingLoading ? (
            <div className="mt-3 space-y-2">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : pendingInbox.length === 0 ? (
            <p className="text-sm text-slate-500 mt-3">Brak oczekujących próśb.</p>
          ) : (
            <div className="mt-3 divide-y border rounded-lg">
              {pendingInbox.map((wo) => {
                const isBusy = actionBusyId === wo.id;
                return (
                  <div key={wo.id} className="p-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <StatusPill status={wo.status} />
                        <span className="text-sm font-medium text-slate-900">
                          {wo.contractor_name || "Zlecenie"}
                        </span>
                        {wo.contractor_phone && (
                          <span className="text-xs text-slate-500">{wo.contractor_phone}</span>
                        )}
                      </div>

                      {wo.last_cancel_request_at && (
                        <p className="text-xs text-slate-500 mt-1">
                          Prośba: {formatDateTime(wo.last_cancel_request_at)}
                        </p>
                      )}

                      {wo.scheduled_at && (
                        <p className="text-xs text-slate-500 mt-1">
                          Termin: {formatDateTime(wo.scheduled_at)}
                        </p>
                      )}
                    </div>

                    <div className="flex gap-3 shrink-0">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => approveCancellation(wo.id)}
                        className={`hover:underline ${
                          isBusy ? "text-slate-400 cursor-not-allowed" : "text-emerald-700"
                        }`}
                      >
                        {isBusy ? "Przetwarzanie…" : "Zatwierdź"}
                      </button>

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => {
                          const full = workOrders.find((x) => x.id === wo.id) || wo;
                          openDetails(full);
                        }}
                        className={`hover:underline ${
                          isBusy ? "text-slate-400 cursor-not-allowed" : "text-slate-700"
                        }`}
                      >
                        Szczegóły
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {open && canManage && (
        <div className="bg-white border rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500">Powiązane zgłoszenie (opcjonalnie)</label>

              {requestsLoading ? (
                <div className="mt-2">
                  <Skeleton className="h-9" />
                </div>
              ) : (
                <select
                  value={maintenanceRequestId}
                  onChange={(e) => setMaintenanceRequestId(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">— brak (zlecenie ad-hoc) —</option>
                  {openRequests.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title} ({r.priority || "normal"})
                    </option>
                  ))}
                </select>
              )}

              {openRequests.length === 0 && !requestsLoading && (
                <p className="text-xs text-slate-500 mt-2">
                  Brak otwartych zgłoszeń dla tej nieruchomości.
                </p>
              )}
            </div>

            <div>
              <label className="text-xs text-slate-500">Termin (opcjonalnie)</label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>

            {/* ✅ NEW: Contractor picker */}
            <div>
              <label className="text-xs text-slate-500">Wykonawca (z listy)</label>

              {contractorsLoading ? (
                <div className="mt-2">
                  <Skeleton className="h-9" />
                </div>
              ) : (
                <select
                  value={selectedContractorId}
                  onChange={(e) => onSelectContractor(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">— wybierz (opcjonalnie) —</option>
                  {(contractors ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.phone ? ` • ${c.phone}` : ""}
                    </option>
                  ))}
                </select>
              )}

              {!contractorsLoading && (contractors?.length ?? 0) === 0 && (
                <p className="text-xs text-slate-500 mt-2">
                  Brak wykonawców na liście. Dodaj wykonawcę w tabeli contractors.
                </p>
              )}
            </div>

            {/* Keep your existing manual fields (still useful) */}
            <div>
              <label className="text-xs text-slate-500">Wykonawca (nazwa)</label>
              <input
                value={contractorName}
                onChange={(e) => setContractorName(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
                placeholder="Np. HydroFix"
              />
            </div>

            <div>
              <label className="text-xs text-slate-500">Telefon</label>
              <input
                value={contractorPhone}
                onChange={(e) => setContractorPhone(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
                placeholder="+48…"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-500">Notatki</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm min-h-[90px]"
              placeholder="Opis prac / instrukcje"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-3 py-2 text-sm rounded-lg border"
            >
              Anuluj
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={saving}
              className={`px-3 py-2 text-sm rounded-lg text-white ${
                saving ? "bg-slate-400" : "bg-blue-600"
              }`}
            >
              {saving ? "Zapisywanie…" : "Utwórz"}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">
          {String(error?.message ?? error)}
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      )}

      {!loading && workOrders.length === 0 && (
        <p className="text-sm text-slate-500">Brak zleceń dla tej nieruchomości.</p>
      )}

      {!loading && workOrders.length > 0 && (
        <div className="divide-y border rounded-lg bg-white">
          {workOrders.map((wo) => {
            const scheduled = formatDateTime(wo.scheduled_at);
            const pending = !!wo.pending_cancel_request;
            const lastReqAt = formatDateTime(wo.last_cancel_request_at);
            const allowedMemberActions = allowedActionsById[wo.id] ?? [];

            const tenantState = tenantCancelState(wo);
            const isBusy = actionBusyId === wo.id;

            return (
              <div key={wo.id} className="px-4 py-3 flex justify-between items-start gap-4">
                <button
                  type="button"
                  onClick={() => openDetails(wo)}
                  className="min-w-0 text-left"
                  disabled={isBusy}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusPill status={wo.status} />

                    {pending && (
                      <span className="text-xs px-2 py-0.5 rounded border bg-amber-50 border-amber-200 text-amber-800">
                        Prośba o anulowanie{lastReqAt ? ` • ${lastReqAt}` : ""}
                      </span>
                    )}

                    {wo.contractor_name && (
                      <span className="text-sm font-medium text-slate-900">{wo.contractor_name}</span>
                    )}
                    {wo.contractor_phone && (
                      <span className="text-xs text-slate-500">{wo.contractor_phone}</span>
                    )}
                  </div>

                  {wo.maintenance_requests?.title && (
                    <p className="text-sm text-slate-700 mt-1">
                      Powiązane zgłoszenie: <b>{wo.maintenance_requests.title}</b>
                    </p>
                  )}

                  {scheduled && <p className="text-xs text-slate-500 mt-1">Termin: {scheduled}</p>}

                  {wo.notes && (
                    <p className="text-xs text-slate-600 mt-2 whitespace-pre-wrap">{wo.notes}</p>
                  )}
                </button>

                <div className="flex flex-col gap-2 text-sm shrink-0 items-end">
                  {tenantState.show && (
                    <div className="flex flex-col items-end gap-1">
                      <button
                        type="button"
                        disabled={tenantState.disabled || isBusy}
                        onClick={() => requestCancellation(wo.id)}
                        className={`hover:underline ${
                          tenantState.disabled || isBusy
                            ? "text-slate-400 cursor-not-allowed"
                            : "text-amber-700"
                        }`}
                        title={tenantState.reason || ""}
                      >
                        {isBusy ? "Wysyłanie…" : "Poproś o anulowanie"}
                      </button>

                      {(tenantState.reason || wo?.pending_cancel_request) && (
                        <span className="text-xs text-slate-500">{tenantState.reason}</span>
                      )}
                    </div>
                  )}

                  {canManage && pending && (
                    <div className="flex flex-col items-end gap-2">
                      <div className="flex gap-3">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => approveCancellation(wo.id)}
                          className={`hover:underline ${
                            isBusy ? "text-slate-400 cursor-not-allowed" : "text-emerald-700"
                          }`}
                        >
                          {isBusy ? "Przetwarzanie…" : "Zatwierdź anulowanie"}
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => denyCancellation(wo.id)}
                          className={`hover:underline ${
                            isBusy ? "text-slate-400 cursor-not-allowed" : "text-rose-700"
                          }`}
                        >
                          {isBusy ? "Przetwarzanie…" : "Odrzuć"}
                        </button>
                      </div>

                      <input
                        disabled={isBusy}
                        value={denyReasonById[wo.id] ?? ""}
                        onChange={(e) =>
                          setDenyReasonById((prev) => ({ ...prev, [wo.id]: e.target.value }))
                        }
                        className="border rounded-lg px-2 py-1 text-xs w-56 disabled:bg-slate-50"
                        placeholder="Powód (opcjonalnie)"
                      />
                    </div>
                  )}

                  {canManage && !pending && (
                    <div className="flex gap-3">
                      {allowedMemberActions.includes("in_progress") && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => setStatus(wo.id, "in_progress")}
                          className={`hover:underline ${
                            isBusy ? "text-slate-400 cursor-not-allowed" : "text-blue-600"
                          }`}
                        >
                          W trakcie
                        </button>
                      )}

                      {allowedMemberActions.includes("cancelled") && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => setStatus(wo.id, "cancelled")}
                          className={`hover:underline ${
                            isBusy ? "text-slate-400 cursor-not-allowed" : "text-slate-600"
                          }`}
                        >
                          Anuluj
                        </button>
                      )}

                      {allowedMemberActions.includes("completed") && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => setStatus(wo.id, "completed")}
                          className={`hover:underline ${
                            isBusy ? "text-slate-400 cursor-not-allowed" : "text-green-700"
                          }`}
                        >
                          Zakończ
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleDelete(wo.id)}
                        className={`hover:underline ${
                          isBusy ? "text-slate-400 cursor-not-allowed" : "text-rose-600"
                        }`}
                      >
                        Usuń
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={detailOpen} onClose={closeDetails} title="Szczegóły zlecenia">
        {!selectedWO ? (
          <p className="text-sm text-slate-500">Brak danych.</p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <StatusPill status={selectedWO.status} />
                  {selectedWO.pending_cancel_request && (
                    <span className="text-xs px-2 py-0.5 rounded border bg-amber-50 border-amber-200 text-amber-800">
                      Prośba o anulowanie
                    </span>
                  )}
                </div>

                <p className="text-sm text-slate-900 mt-2 font-medium">
                  {selectedWO.contractor_name || "Zlecenie"}
                </p>

                {selectedWO.contractor_phone && (
                  <p className="text-xs text-slate-500 mt-1">
                    Telefon: {selectedWO.contractor_phone}
                  </p>
                )}

                {selectedWO.scheduled_at && (
                  <p className="text-xs text-slate-500 mt-1">
                    Termin: {formatDateTime(selectedWO.scheduled_at)}
                  </p>
                )}
              </div>

              <div className="text-right space-y-2 shrink-0">
                {canManage && selectedWO?.id && (
                  <div className="space-y-2">
                    <div className="text-xs text-slate-500">Przypisz wykonawcę</div>

                    <select
                      value={assignContractorId}
                      disabled={assigningContractor || contractorsLoading}
                      onChange={(e) => setAssignContractorId(e.target.value)}
                      className="w-64 border rounded-lg px-3 py-2 text-sm disabled:bg-slate-50"
                    >
                      <option value="">— wybierz —</option>
                      {(contractors ?? []).map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                          {c.phone ? ` • ${c.phone}` : ""}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      disabled={!assignContractorId || assigningContractor}
                      onClick={() => assignContractorToWorkOrder(selectedWO.id, assignContractorId)}
                      className={`px-3 py-2 text-sm rounded-lg text-white w-full ${
                        !assignContractorId || assigningContractor ? "bg-slate-400" : "bg-blue-600"
                      }`}
                    >
                      {assigningContractor ? "Przypisywanie…" : "Przypisz"}
                    </button>
                  </div>
                )}

                {canManage && selectedWO.pending_cancel_request && (
                  <>
                    <button
                      type="button"
                      disabled={actionBusyId === selectedWO.id}
                      onClick={() => approveCancellation(selectedWO.id)}
                      className={`px-3 py-2 text-sm rounded-lg text-white ${
                        actionBusyId === selectedWO.id ? "bg-slate-400" : "bg-emerald-600"
                      }`}
                    >
                      {actionBusyId === selectedWO.id ? "Przetwarzanie…" : "Zatwierdź anulowanie"}
                    </button>

                    <div className="space-y-2">
                      <input
                        disabled={actionBusyId === selectedWO.id}
                        value={denyReasonById[selectedWO.id] ?? ""}
                        onChange={(e) =>
                          setDenyReasonById((prev) => ({
                            ...prev,
                            [selectedWO.id]: e.target.value,
                          }))
                        }
                        className="border rounded-lg px-2 py-2 text-sm w-64 disabled:bg-slate-50"
                        placeholder="Powód (opcjonalnie)"
                      />
                      <button
                        type="button"
                        disabled={actionBusyId === selectedWO.id}
                        onClick={() => denyCancellation(selectedWO.id)}
                        className={`px-3 py-2 text-sm rounded-lg text-white w-full ${
                          actionBusyId === selectedWO.id ? "bg-slate-400" : "bg-rose-600"
                        }`}
                      >
                        {actionBusyId === selectedWO.id ? "Przetwarzanie…" : "Odrzuć anulowanie"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>

            {selectedWO.notes && (
              <div className="bg-slate-50 border rounded-lg p-3 text-sm text-slate-700 whitespace-pre-wrap">
                {selectedWO.notes}
              </div>
            )}

            <div>
              <h4 className="font-semibold text-slate-900">Aktywność</h4>

              {auditLoading ? (
                <div className="mt-2 space-y-2">
                  <Skeleton className="h-10" />
                  <Skeleton className="h-10" />
                </div>
              ) : audit.length === 0 ? (
                <p className="text-sm text-slate-500 mt-2">Brak wpisów.</p>
              ) : (
                <div className="mt-2 space-y-2">
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
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
}
