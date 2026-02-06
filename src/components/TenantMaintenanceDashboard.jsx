// src/components/TenantMaintenanceDashboard.jsx
import { useEffect, useMemo, useState } from "react";
import Card from "./Card";
import Skeleton from "./ui/Skeleton";
import { supabase } from "../lib/supabase";
import { useAccount } from "../context/AccountContext";

function pillClass(kind) {
  const base = "text-xs px-2 py-0.5 rounded border";
  if (kind === "ok") return `${base} bg-green-50 border-green-200 text-green-700`;
  if (kind === "warn") return `${base} bg-amber-50 border-amber-200 text-amber-800`;
  if (kind === "info") return `${base} bg-blue-50 border-blue-200 text-blue-700`;
  return `${base} bg-slate-50 border-slate-200 text-slate-600`;
}

function mrStatusLabel(status) {
  const s = String(status ?? "").toLowerCase();
  if (s === "open") return { text: "Otwarte", kind: "warn" };
  if (s === "in_progress") return { text: "W trakcie", kind: "info" };
  if (s === "waiting") return { text: "Oczekuje", kind: "muted" };
  if (s === "resolved") return { text: "Rozwiązane", kind: "ok" };
  if (s === "closed") return { text: "Zamknięte", kind: "ok" };
  return { text: status ?? "—", kind: "muted" };
}

function woStatusLabel(status) {
  const s = String(status ?? "").toLowerCase();
  if (s === "assigned") return { text: "Zlecenie: Przypisane", kind: "warn" };
  if (s === "in_progress") return { text: "Zlecenie: W trakcie", kind: "info" };
  if (s === "completed") return { text: "Zlecenie: Zakończone", kind: "ok" };
  if (s === "blocked") return { text: "Zlecenie: Zablokowane", kind: "muted" };
  if (s === "cancelled") return { text: "Zlecenie: Anulowane", kind: "muted" };
  return { text: `Zlecenie: ${status ?? "—"}`, kind: "muted" };
}

function formatDateTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

/**
 * TenantMaintenanceDashboard
 * - If propertyId is provided => scoped view for that property
 * - If propertyId is null/undefined => global view across tenant's properties (in active account)
 */
export default function TenantMaintenanceDashboard({
  propertyId = null,
  onOpenRequests,
  onOpenWorkOrders,
  limit = 5,
}) {
  const { activeAccountId, activeRole } = useAccount();

  const isTenant = useMemo(
    () => String(activeRole ?? "").toLowerCase() === "tenant",
    [activeRole]
  );

  const [loading, setLoading] = useState(false);
  const [requests, setRequests] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);

  useEffect(() => {
    if (!isTenant) return;
    if (!activeAccountId) return;

    let cancelled = false;

    async function load() {
      setLoading(true);

      try {
        // 1) Get current auth user
        const {
          data: { user },
          error: userErr,
        } = await supabase.auth.getUser();

        if (userErr) throw userErr;
        if (!user?.id) throw new Error("Brak użytkownika (auth)");

        // 2) Find tenant row for this user+account (assumes tenants.user_id exists)
        const tenantRes = await supabase
          .from("tenants")
          .select("id, property_id")
          .eq("account_id", activeAccountId)
          .eq("user_id", user.id);

        if (tenantRes.error) throw tenantRes.error;

        const tenantRows = tenantRes.data ?? [];
        const tenantIds = tenantRows.map((t) => t.id).filter(Boolean);

        // If the tenant is not linked yet, show empty (no crash)
        if (tenantIds.length === 0) {
          if (!cancelled) {
            setRequests([]);
            setWorkOrders([]);
          }
          return;
        }

        // Determine property scope
        const allowedPropertyIds = tenantRows.map((t) => t.property_id).filter(Boolean);
        const scopedPropertyIds = propertyId ? [propertyId] : allowedPropertyIds;

        if (scopedPropertyIds.length === 0) {
          if (!cancelled) {
            setRequests([]);
            setWorkOrders([]);
          }
          return;
        }

        // 3) Load MR + WO in parallel
        // - MR: by tenant id(s) + property scope (and account)
        // - WO: by property scope (and account) using the view
        const [mrRes, woRes] = await Promise.all([
          supabase
            .from("maintenance_requests")
            .select("id,title,status,priority,created_at,updated_at,property_id")
            .eq("account_id", activeAccountId)
            .in("property_id", scopedPropertyIds)
            // if you have reported_by_tenant_id, keep it tight:
            .in("reported_by_tenant_id", tenantIds)
            .order("created_at", { ascending: false })
            .limit(limit),

          supabase
            .from("work_orders_with_flags")
            .select(
              "id,maintenance_request_id,status,scheduled_at,created_at,pending_cancel_request,last_cancel_request_at,last_cancel_resolution_action,last_cancel_resolution_at,property_id"
            )
            .eq("account_id", activeAccountId)
            .in("property_id", scopedPropertyIds)
            .order("created_at", { ascending: false })
            .limit(limit),
        ]);

        if (mrRes.error) throw mrRes.error;
        if (woRes.error) throw woRes.error;

        if (!cancelled) {
          setRequests(mrRes.data ?? []);
          setWorkOrders(woRes.data ?? []);
        }
      } catch {
        if (!cancelled) {
          setRequests([]);
          setWorkOrders([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [isTenant, activeAccountId, propertyId, limit]);

  if (!isTenant) return null;

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">Twoje zgłoszenia i zlecenia</h3>
          <p className="text-sm text-slate-500">
            Szybki podgląd ostatnich zgłoszeń oraz statusów zleceń.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onOpenRequests}
            className="px-3 py-2 text-sm rounded-lg border hover:bg-slate-50"
          >
            Zgłoszenia
          </button>
          <button
            type="button"
            onClick={onOpenWorkOrders}
            className="px-3 py-2 text-sm rounded-lg border hover:bg-slate-50"
          >
            Zlecenia
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Requests */}
          <div className="border rounded-xl bg-white">
            <div className="p-3 border-b">
              <div className="font-semibold text-slate-900 text-sm">Ostatnie zgłoszenia</div>
            </div>
            <div className="p-3 space-y-3">
              {requests.length === 0 ? (
                <p className="text-sm text-slate-500">Brak zgłoszeń.</p>
              ) : (
                requests.map((r) => {
                  const st = mrStatusLabel(r.status);
                  return (
                    <div key={r.id} className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={pillClass(st.kind)}>{st.text}</span>
                          <span className="text-sm font-medium text-slate-900 truncate">
                            {r.title}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          Utworzono: {formatDateTime(r.created_at)}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Work orders */}
          <div className="border rounded-xl bg-white">
            <div className="p-3 border-b">
              <div className="font-semibold text-slate-900 text-sm">Ostatnie zlecenia</div>
            </div>
            <div className="p-3 space-y-3">
              {workOrders.length === 0 ? (
                <p className="text-sm text-slate-500">Brak zleceń.</p>
              ) : (
                workOrders.map((wo) => {
                  const st = woStatusLabel(wo.status);
                  return (
                    <div key={wo.id} className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={pillClass(st.kind)}>{st.text}</span>
                          {wo.pending_cancel_request && (
                            <span className={pillClass("warn")}>Prośba o anulowanie</span>
                          )}
                        </div>

                        <div className="text-xs text-slate-500 mt-1 flex gap-3 flex-wrap">
                          {wo.scheduled_at && <span>Termin: {formatDateTime(wo.scheduled_at)}</span>}
                          {wo.last_cancel_resolution_action && (
                            <span>
                              Decyzja:{" "}
                              {String(wo.last_cancel_resolution_action).replaceAll("_", " ")}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
