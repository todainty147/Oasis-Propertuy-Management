// src/pages/WorkOrderDetails.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Card from "../components/Card";
import Skeleton from "../components/ui/Skeleton";
import { usePageTitle } from "../layout/PageTitleContext";
import { useAccount } from "../context/AccountContext";
import { supabase } from "../lib/supabase";

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
        const { data, error } = await supabase
          .from("work_order_status_definitions")
          .select("status, label");

        if (error) throw error;

        const map = {};
        for (const r of data ?? []) {
          map[String(r.status ?? "").toLowerCase()] = r.label;
        }
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

function StatusPill({ status, labels }) {
  const base = "text-xs px-2 py-0.5 rounded border";
  const s = String(status ?? "").toLowerCase();
  const label = labels?.[s] ?? s ?? "—";

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
  const role = useMemo(() => String(activeRole ?? "").toLowerCase(), [activeRole]);
  const canManage = useMemo(() => ["owner", "staff", "admin"].includes(role), [role]);

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

  useEffect(() => {
    setTitle("Zlecenie");
  }, [setTitle]);

  // -----------------------------
  // Load work order
  // -----------------------------
  async function loadWorkOrder() {
    if (!id) return;
    setLoading(true);
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
        .eq("id", id)
        .maybeSingle();

      if (error) throw error;

      // If RLS hides it, data can be null
      setWo(data ?? null);
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
      const { data, error } = await supabase
        .from("work_order_audit_log")
        .select("id, action, actor_user_id, old_value, new_value, created_at")
        .eq("work_order_id", id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setAudit(data ?? []);
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
      const { data, error } = await supabase.rpc("work_order_allowed_actions", {
        p_work_order_id: id,
      });
      if (error) throw error;
      setAllowedActions(Array.isArray(data) ? data : []);
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
      const { data, error } = await supabase
        .from("contractors")
        .select("id, name, phone, email, user_id, active")
        .eq("account_id", activeAccountId)
        .eq("active", true)
        .order("name", { ascending: true });

      if (error) throw error;
      setContractors(data ?? []);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, activeAccountId, canManage]);

  // Make title nicer when WO loaded
  useEffect(() => {
    if (!wo) return;
    const statusLabel = labels?.[String(wo.status ?? "").toLowerCase()] ?? wo.status ?? "Zlecenie";
    setTitle(`Zlecenie • ${statusLabel}`);
  }, [wo, labels, setTitle]);

  // -----------------------------
  // Actions
  // -----------------------------
  async function setStatus(nextStatus) {
    if (!id) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("work_order_set_status", {
        p_work_order_id: id,
        p_new_status: nextStatus,
        p_apply_if_tenant_allowed: false,
      });
      if (error) throw error;

      await loadWorkOrder();
      await loadAllowedActions();
      await loadAudit();
    } catch (e) {
      alert(e?.message ?? "Nie udało się zmienić statusu");
    } finally {
      setBusy(false);
    }
  }

  async function assignContractor() {
    if (!id || !assignContractorId) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("work_order_assign_contractor", {
        p_work_order_id: id,
        p_contractor_id: assignContractorId,
      });
      if (error) throw error;

      await loadWorkOrder();
      await loadAllowedActions();
      await loadAudit();
    } catch (e) {
      alert(e?.message ?? "Nie udało się przypisać wykonawcy");
    } finally {
      setBusy(false);
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
        <p className="font-medium text-slate-900">Nie znaleziono zlecenia</p>
        <p className="text-sm text-slate-600">
          Zlecenie nie istnieje albo nie masz dostępu (RLS).
        </p>
        <button
          type="button"
          onClick={() => navigate("/dashboard")}
          className="text-sm px-3 py-2 rounded-lg border hover:bg-slate-50 w-fit"
        >
          Wróć do pulpitu
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
              <StatusPill status={wo.status} labels={labels} />
              {wo.pending_cancel_request && (
                <span className="text-xs px-2 py-0.5 rounded border bg-amber-50 border-amber-200 text-amber-800">
                  Prośba o anulowanie
                </span>
              )}
            </div>

            {wo.maintenance_requests?.title && (
              <p className="text-sm text-slate-800 mt-2">
                Powiązane zgłoszenie: <b>{wo.maintenance_requests.title}</b>
              </p>
            )}

            <p className="text-xs text-slate-500 mt-2">
              Termin: {formatDateTime(wo.scheduled_at)} • Utworzono:{" "}
              {formatDateTime(wo.created_at)}
            </p>

            {wo.contractor_name && (
              <p className="text-sm text-slate-900 mt-3 font-medium">
                Wykonawca: {wo.contractor_name}
                {wo.contractor_phone ? (
                  <span className="text-xs text-slate-500"> • {wo.contractor_phone}</span>
                ) : null}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() => navigate(-1)}
            className="text-sm px-3 py-2 rounded-lg border hover:bg-slate-50 shrink-0"
          >
            Wróć
          </button>
        </div>

        {wo.notes && (
          <div className="mt-4 bg-slate-50 border rounded-lg p-3 text-sm text-slate-700 whitespace-pre-wrap">
            {wo.notes}
          </div>
        )}
      </Card>

      {/* Manager actions */}
      {canManage && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-slate-900">Akcje</p>
              <p className="text-xs text-slate-500">
                Przyciski są DB-driven (work_order_allowed_actions).
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
              Odśwież
            </button>
          </div>

          {/* Status transitions */}
          {actionsLoading ? (
            <Skeleton className="h-10" />
          ) : allowedActions.length === 0 ? (
            <p className="text-sm text-slate-500">Brak dostępnych akcji.</p>
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
                  W trakcie
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
                  Zablokowane
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
                  Zakończ
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
                  Anuluj
                </button>
              )}
            </div>
          )}

          {/* Assign contractor */}
          <div className="pt-2 border-t">
            <p className="text-xs text-slate-500 mb-2">Przypisz wykonawcę</p>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={assignContractorId}
                disabled={busy || contractorsLoading}
                onChange={(e) => setAssignContractorId(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm min-w-[280px] disabled:bg-slate-50"
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
                onClick={assignContractor}
                disabled={!assignContractorId || busy}
                className={`text-sm px-3 py-2 rounded-lg text-white ${
                  !assignContractorId || busy ? "bg-slate-400" : "bg-blue-600"
                }`}
              >
                {busy ? "Przetwarzanie…" : "Przypisz"}
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* Audit log */}
      <Card className="p-6">
        <div className="flex items-center justify-between gap-3">
          <p className="font-semibold text-slate-900">Aktywność</p>
          <button
            type="button"
            onClick={loadAudit}
            className="text-sm px-3 py-2 rounded-lg border hover:bg-slate-50"
            disabled={auditLoading}
          >
            Odśwież
          </button>
        </div>

        {auditLoading ? (
          <div className="mt-3 space-y-2">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : audit.length === 0 ? (
          <p className="text-sm text-slate-500 mt-3">Brak wpisów.</p>
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
